import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../../../prisma";
import { AuthResponseDto } from "../dto";
import { AuthTokenService } from "../auth-token.service";
import { StorageService } from "../../storage/storage.service";
import { GoogleAuthService } from "./google-auth.service";
import { AppleAuthService } from "./apple-auth.service";
import { allocateUsernameFromEmail } from "../utils/username.util";
import { resolveAvatarUrl } from "../utils/avatar-url.util";
import { i18nMessage } from "../../i18n";
import {
  assertNotStaffAccount,
  STAFF_ACCOUNT_SELECT,
} from "../utils/staff-account";
import { stampUserLogin } from "../utils/login-stamp";

/**
 * Google ve Apple ile giriş. AuthService'ten birebir taşındı.
 *
 * İki sağlayıcı aynı üç adımı yürütüyor — sağlayıcı kimliğini doğrula, var
 * olan bir hesaba bağla ya da yenisini aç, sonra normal giriş yanıtını üret.
 * Son adım (`buildUserAuthResponse`) buraya ait: sağlayıcı girişinin şifreyle
 * girişten farklı bir yanıt üretmesi ya da ikinci faktörü atlaması, tam olarak
 * bu gövdenin kopyalanmasıyla olur.
 */
@Injectable()
export class SocialLoginService {
  private readonly logger = new Logger(SocialLoginService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: AuthTokenService,
    private readonly storageService: StorageService,
    private readonly googleAuthService: GoogleAuthService,
    private readonly appleAuthService: AppleAuthService,
  ) {}

  /**
   * Verilen userId için AuthResponseDto üretir (login response ile aynı şekil).
   */
  private async buildUserAuthResponse(
    userId: string,
  ): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        membership: { include: { tier: true } },
        twoFactorSecret: { select: { isEnabled: true } },
        ...STAFF_ACCOUNT_SELECT,
      },
    });
    if (!user) {
      throw new UnauthorizedException(i18nMessage("server.auth.userNotFound"));
    }
    // Personel hesabı sosyal girişle de web/mobil oturumu açamaz (bkz. login).
    assertNotStaffAccount(user);
    // Silinmiş/banlı satıra token verme: aksi halde login "başarılı" olur ama
    // ilk korumalı istekte guard reddeder → kafa karıştırıcı "askıya alındı" ekranı.
    if (user.deletedAt) {
      throw new UnauthorizedException(
        i18nMessage("server.auth.accountDeleted"),
      );
    }
    if (user.isBanned) {
      throw new UnauthorizedException(
        i18nMessage("server.auth.accountSuspended"),
      );
    }
    if (user.twoFactorSecret?.isEnabled) {
      throw new UnauthorizedException({
        message:
          "İki faktörlü doğrulama etkin hesaplar sağlayıcı girişi yerine şifre ile giriş yapmalıdır",
        errorCode: "TWO_FACTOR_PASSWORD_REQUIRED",
      });
    }

    // Sosyal giriş de giriş damgası basar; aksi halde yalnız Google/Apple ile
    // giren hesap "hiç giriş yapmamış" sayılır (admin silme uygunluğu buna bakar).
    await stampUserLogin(this.prisma, this.logger, user.id);

    const tokens = await this.tokens.generateTokens(
      user.id,
      user.email,
      user.isSeller,
    );

    let membershipData = undefined;
    if (user.membership && user.membership.tier) {
      const tier = user.membership.tier;
      if (tier?.type && tier?.name) {
        membershipData = {
          tier: { type: String(tier.type), name: String(tier.name) },
          expiresAt: user.membership.currentPeriodEnd
            ? new Date(user.membership.currentPeriodEnd).toISOString()
            : undefined,
        };
      }
    }

    const resolvedAvatarUrl = await resolveAvatarUrl(
      this.storageService,
      user.avatarUrl,
    );

    return {
      user: {
        id: user.id,
        adminCode: user.adminCode,
        username: user.username,
        usernameClaimed: user.usernameClaimedAt != null,
        email: user.email,
        phone: user.phone ?? undefined,
        displayName: user.displayName,
        avatarUrl: resolvedAvatarUrl,
        isVerified: user.isVerified,
        isPhoneVerified: user.isPhoneVerified,
        isSeller: user.isSeller,
        sellerType: user.sellerType ?? undefined,
        createdAt: user.createdAt,
        membership: membershipData,
      },
      tokens,
    };
  }

  /**
   * Google id_token ile giriş: doğrula → OAuthAccount bul → email ile oto-bağla
   * → yoksa yeni kullanıcı. Mevcut JWT akışını kullanır.
   */
  async loginWithGoogle(
    input: string | { idToken?: string; code?: string },
  ): Promise<AuthResponseDto> {
    // Geriye uyumlu: mobil/native doğrudan id_token string'i gönderir; web
    // { code } gönderir (backend Google ile takas eder → id_token).
    const opts = typeof input === "string" ? { idToken: input } : input;
    const idToken = opts.code
      ? await this.googleAuthService.exchangeCodeForIdToken(opts.code)
      : opts.idToken;
    if (!idToken) {
      throw new UnauthorizedException(
        i18nMessage("server.auth.googleSessionInvalid"),
      );
    }
    const profile = await this.googleAuthService.verifyIdToken(idToken);

    // 1) Mevcut OAuthAccount?
    const existing = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider: "google",
          providerUserId: profile.sub,
        },
      },
    });
    if (existing) {
      return this.buildUserAuthResponse(existing.userId);
    }

    // 2) Aynı e-postalı kullanıcı? → oto-bağla
    //    Silinmiş (anonimleştirilmiş) satıra ASLA bağlanma; o satırın email'i zaten
    //    deleted_<id>@deleted.local'a çevrildiği için normalde eşleşmez, ama eski
    //    bozuk silme kalıntılarına karşı deletedAt:null ile savunma yapıyoruz.
    const byEmail = await this.prisma.user.findFirst({
      where: { email: profile.email, deletedAt: null },
    });
    if (byEmail) {
      await this.prisma.oAuthAccount.create({
        data: {
          provider: "google",
          providerUserId: profile.sub,
          email: profile.email,
          userId: byEmail.id,
        },
      });
      // Google e-postayı zaten doğruladı (email_verified === true zorunlu). Hesap
      // henüz doğrulanmamışsa artık doğrulanmış say — böylece normal parola girişi
      // de açılır ve Google-login'in bypass ettiği e-posta doğrulama kapısıyla
      // tutarlı hale gelir.
      if (!byEmail.isEmailVerified) {
        await this.prisma.user.update({
          where: { id: byEmail.id },
          data: { isEmailVerified: true },
        });
      }
      return this.buildUserAuthResponse(byEmail.id);
    }

    // 3) Yeni kullanıcı. Sosyal girişte kullanıcı adı SORULMAZ; e-postadan
    //    türetilir (bkz. allocateUsernameFromEmail). `usernameClaimedAt` boş
    //    kalır: adı kullanıcı seçmediği için bir kereliğine değiştirebilir.
    const displayName = profile.name?.trim() || profile.email.split("@")[0];
    const username = await allocateUsernameFromEmail(
      this.prisma,
      profile.email,
    );
    const created = await this.prisma.user.create({
      data: {
        email: profile.email,
        passwordHash: null,
        username,
        displayName,
        avatarUrl: profile.picture ?? null,
        isEmailVerified: true,
        isSeller: false,
      },
    });
    await this.prisma.oAuthAccount.create({
      data: {
        provider: "google",
        providerUserId: profile.sub,
        email: profile.email,
        userId: created.id,
      },
    });
    return this.buildUserAuthResponse(created.id);
  }

  /**
   * Apple identity token ile giriş: doğrula → OAuthAccount bul → email ile oto-bağla
   * → yoksa yeni kullanıcı. Relay email olduğu gibi kaydedilir; kimlik anahtarı sub.
   * fullName yalnız ilk yetkilendirmede (yeni kullanıcı) gelir.
   */
  async loginWithApple(
    identityToken: string,
    fullName?: string,
  ): Promise<AuthResponseDto> {
    const profile =
      await this.appleAuthService.verifyIdentityToken(identityToken);

    // 1) Mevcut OAuthAccount?
    const existing = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider: "apple",
          providerUserId: profile.sub,
        },
      },
    });
    if (existing) {
      return this.buildUserAuthResponse(existing.userId);
    }

    // 2) Aynı e-postalı (silinmemiş) kullanıcı? → oto-bağla.
    const byEmail = await this.prisma.user.findFirst({
      where: { email: profile.email, deletedAt: null },
    });
    if (byEmail) {
      await this.prisma.oAuthAccount.create({
        data: {
          provider: "apple",
          providerUserId: profile.sub,
          email: profile.email,
          userId: byEmail.id,
        },
      });
      return this.buildUserAuthResponse(byEmail.id);
    }

    // 3) Yeni kullanıcı (Google ile aynı kural: kullanıcı adı e-postadan türer)
    const displayName = fullName?.trim() || profile.email.split("@")[0];
    const username = await allocateUsernameFromEmail(
      this.prisma,
      profile.email,
    );
    const created = await this.prisma.user.create({
      data: {
        email: profile.email,
        passwordHash: null,
        username,
        displayName,
        isEmailVerified: true,
        isSeller: false,
      },
    });
    await this.prisma.oAuthAccount.create({
      data: {
        provider: "apple",
        providerUserId: profile.sub,
        email: profile.email,
        userId: created.id,
      },
    });
    return this.buildUserAuthResponse(created.id);
  }
}
