import {
  Injectable,
  Logger,
  UnauthorizedException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import { PrismaService } from "../../prisma";
import { TokensDto } from "./dto";
import { JwtPayload } from "./interfaces";
import { SecurityService } from "../security/security.service";
import { i18nMessage } from "../i18n";
import { assertNotStaffAccount } from "./utils/staff-account";
import { errorMessage } from "../../common/helpers/error-message";

/**
 * Rotasyonla iptal edilmiş refresh token'ın hâlâ kabul edildiği pencere.
 * Yarış senaryosu için yeterince uzun, çalıntı-token replay'i için anlamsız
 * kılacak kadar kısa (token zaten hash'li saklanıyor, cookie httpOnly).
 */
const REFRESH_ROTATION_GRACE_MS = 60 * 1000;

/**
 * Oturum ömrü: access/refresh token üretimi, refresh token'ın DB'deki
 * hash'li kaydı, rotasyon ve çıkış. AuthService'ten birebir taşındı.
 *
 * Üretim ve doğrulama tek serviste duruyor çünkü ikisi aynı iki kararı
 * paylaşıyor — token'ın hangi özetle saklandığı ve rotasyon sonrası eski
 * token'ın ne kadar süre kabul edildiği. Ayrı yerlerde yaşasalardı biri
 * değişip diğeri değişmediğinde sonuç sessizce ya çalışan bir replay'e ya da
 * kullanıcıyı yarışta atan bir 401'e dönerdi.
 */
@Injectable()
export class AuthTokenService {
  private readonly logger = new Logger(AuthTokenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly securityService: SecurityService,
  ) {}

  /**
   * Refresh tokens
   * POST /auth/refresh
   *
   * Admin refresh token'ı ile gelindiyse admin token (isAdmin claim'li) üretilir;
   * aksi halde admin-jwt strategy yenilenen token'ı reddederdi (eski bug).
   */
  async refreshTokens(
    userId: string,
    refreshToken: string,
    opts?: { isAdmin?: boolean; adminSessionToken?: string },
  ): Promise<TokensDto> {
    // Find user (admin için adminUser ilişkisiyle güncel rol/aktiflik)
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { adminUser: true },
    });

    if (!user) {
      throw new UnauthorizedException(i18nMessage("server.auth.userNotFound"));
    }
    if (user.deletedAt || user.isBanned) {
      throw new UnauthorizedException(
        i18nMessage("server.auth.accountSuspended"),
      );
    }

    // E-posta doğrulaması oturumun ÖNKOŞULUDUR: `login` bunu zorunlu tutuyordu ama
    // refresh etmiyordu, dolayısıyla doğrulanmamış bir hesap refresh ömrü boyunca
    // (~7 gün) tam yetkiyle çalışmaya devam edebiliyordu. Admin oturumları hariç —
    // onlar ayrı davet/aktivasyon akışıyla yönetilir.
    if (!opts?.isAdmin && !user.isEmailVerified) {
      throw new UnauthorizedException({
        ...i18nMessage("server.auth.emailNotVerifiedLogin"),
        errorCode: "EMAIL_NOT_VERIFIED",
      });
    }
    // Personel hesabının web/mobil (kullanıcı) oturumu yenilenmez — panel
    // dışında oturum açamaz; eldeki eski refresh token da burada ölür.
    if (!opts?.isAdmin) assertNotStaffAccount(user);

    // Sunulan refresh token'ı persist edilmiş duruma karşı doğrula + rotasyon için
    // iptal et. Logout/önceki rotation ile iptal edilmiş ya da süresi dolmuş token
    // burada reddedilir (eskiden yalnız JWT imzasına bakılıyordu → iptal yoktu).
    await this.assertAndRotateRefreshToken(user.id, refreshToken);

    // Admin refresh: hesabın hâlâ aktif admin olduğunu doğrula, admin token üret.
    if (opts?.isAdmin) {
      if (!user.adminUser?.isActive) {
        throw new UnauthorizedException(
          i18nMessage("server.auth.adminAccountNotFoundOrInactive"),
        );
      }
      // Taşınan AdminSession token'ı DOĞRULANMADAN yeni token üretmek, ölü
      // (30 dk hareketsizlik) session'lı "başarılı" refresh'ler doğuruyordu:
      // üretilen access her istekte 401 yiyor, panel login'e atıyordu.
      // validateAdminSession aynı zamanda süreyi uzatır — aktif panelde sessiz
      // refresh de oturumu canlı tutar. Ölü session = 401 → tek, temiz eject.
      if (opts.adminSessionToken) {
        const sessionAdminId = await this.securityService.validateAdminSession(
          opts.adminSessionToken,
        );
        if (!sessionAdminId) {
          throw new UnauthorizedException(
            i18nMessage("server.auth.invalidAdminToken"),
          );
        }
      }
      return this.generateAdminTokens(
        user.id,
        user.email,
        user.adminUser.role,
        user.adminUser.id,
        opts.adminSessionToken,
      );
    }

    // Generate new tokens (token rotation)
    return this.generateTokens(user.id, user.email, user.isSeller);
  }

  /**
   * Logout (client-side token removal)
   * POST /auth/logout
   *
   * Note: With JWT, logout is typically handled client-side by removing the token.
   * For enhanced security, we could implement a token blacklist using Redis.
   */
  async logout(
    refreshToken?: string,
    opts?: { admin?: boolean },
  ): Promise<void> {
    // Refresh token'ı DB'de iptal et → çalınan/logout sonrası token bir daha
    // /auth/refresh'te kullanılamaz. (Eskiden no-op'tu; token, JWT süresi dolana
    // dek — varsayılan 7 gün — geçerli kalıyordu.)
    if (refreshToken) {
      if (opts?.admin) {
        try {
          const payload = await this.jwtService.verifyAsync<JwtPayload>(
            refreshToken,
            {
              secret:
                this.configService.getOrThrow<string>("JWT_REFRESH_SECRET"),
              ignoreExpiration: true,
            },
          );
          if (payload.isAdmin && payload.sessionToken) {
            await this.securityService.terminateAdminSessionByToken(
              payload.sessionToken,
            );
          }
        } catch {
          // Cookie yine temizlenir; doğrulanamayan token DB oturumunu silemez.
        }
      }
      await this.prisma.refreshToken
        .updateMany({
          where: { tokenHash: this.hashToken(refreshToken) },
          data: { revokedAt: new Date() },
        })
        .catch(() => {
          /* iptal best-effort; cookie zaten temizleniyor */
        });
    }
    // #224: "Çıkış yapıldı" mesajı artık AuthController/AdminAuthController'da
    // locale'e göre kuruluyor (server.auth.loggedOut).
  }

  /**
   * Generate access and refresh tokens for regular users
   */
  async generateTokens(
    userId: string,
    email: string,
    isSeller: boolean,
  ): Promise<TokensDto> {
    const jwtSecret = this.configService.get<string>("JWT_SECRET");
    const jwtRefreshSecret =
      this.configService.get<string>("JWT_REFRESH_SECRET");

    if (!jwtSecret) {
      throw new Error("JWT_SECRET is not configured in environment variables");
    }

    if (!jwtRefreshSecret) {
      throw new Error(
        "JWT_REFRESH_SECRET is not configured in environment variables",
      );
    }

    const accessPayload: JwtPayload = {
      sub: userId,
      email,
      isSeller,
      type: "access",
    };

    const refreshPayload: JwtPayload = {
      sub: userId,
      email,
      isSeller,
      type: "refresh",
      // Aynı saniyedeki rotasyonda iat çakışsa bile token tekil kalsın (rotasyon/geçersizleştirme
      // tokenHash üzerinden çalışır; iki özdeş token hash'i çakışıp rotasyonu bozardı).
      jti: crypto.randomUUID(),
    };

    try {
      const [accessToken, refreshToken] = await Promise.all([
        this.jwtService.signAsync(accessPayload, {
          secret: jwtSecret,
          expiresIn: this.configService.get<string>("JWT_EXPIRES_IN") || "15m",
        }),
        this.jwtService.signAsync(refreshPayload, {
          secret: jwtRefreshSecret,
          expiresIn:
            this.configService.get<string>("JWT_REFRESH_EXPIRES_IN") || "7d",
        }),
      ]);

      await this.persistRefreshToken(userId, refreshToken);
      return { accessToken, refreshToken };
    } catch (error) {
      this.logger.error("Token generation failed");
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw new Error(`Failed to generate tokens: ${errorMessage(error)}`);
    }
  }

  /**
   * Generate access and refresh tokens for admin users (separate secrets)
   */
  async generateAdminTokens(
    userId: string,
    email: string,
    role: string,
    adminUserId: string,
    existingSessionToken?: string,
    sessionContext?: { ipAddress?: string; userAgent?: string },
  ): Promise<TokensDto> {
    const sessionToken =
      existingSessionToken ||
      (await this.securityService.createAdminSession(
        adminUserId,
        sessionContext?.ipAddress,
        sessionContext?.userAgent,
      ));
    const accessPayload: JwtPayload = {
      sub: userId,
      email,
      isSeller: false,
      isAdmin: true,
      role,
      sessionToken,
      type: "access",
    };

    const refreshPayload: JwtPayload = {
      sub: userId,
      email,
      isSeller: false,
      isAdmin: true,
      role,
      sessionToken,
      type: "refresh",
      // Aynı saniyedeki rotasyonda bile tekil token (bkz. generateTokens).
      jti: crypto.randomUUID(),
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        secret: this.configService.getOrThrow<string>("ADMIN_JWT_SECRET"),
        expiresIn:
          this.configService.get<string>("ADMIN_JWT_EXPIRES_IN") || "15m",
      }),

      this.jwtService.signAsync(refreshPayload, {
        secret: this.configService.get<string>("JWT_REFRESH_SECRET"),
        expiresIn:
          this.configService.get<string>("ADMIN_JWT_REFRESH_EXPIRES_IN") ||
          "7d",
      }),
    ]);

    await this.persistRefreshToken(userId, refreshToken);
    return { accessToken, refreshToken };
  }

  // ==========================================================================
  // REFRESH TOKEN PERSISTENCE & ROTATION (GAP-009 — artık auth akışına bağlı)
  // ==========================================================================
  // Refresh token'lar refresh_tokens tablosunda hash'li saklanır; logout iptal eder,
  // refresh eskiyi iptal edip yenisini üretir (rotation). Böylece çalınan ya da
  // logout sonrası bir refresh token, JWT süresi dolmadan da geçersiz kılınabilir.

  /** Refresh token'ın deterministik SHA-256 özeti (tabloda @unique tokenHash). */
  private hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  /** Üretilen refresh token'ı hash'leyip DB'ye yazar. Persist edilemeyen token
   *  iptal/rotasyon garantisinin dışında kalacağı için istemciye dağıtılmaz. */
  private async persistRefreshToken(
    userId: string,
    refreshToken: string,
  ): Promise<void> {
    try {
      const decoded = this.jwtService.decode(refreshToken) as {
        exp?: number;
      } | null;
      const expiresAt = decoded?.exp
        ? new Date(decoded.exp * 1000)
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await this.prisma.refreshToken.create({
        data: { userId, tokenHash: this.hashToken(refreshToken), expiresAt },
      });
    } catch (error) {
      this.logger.error(
        `Refresh token persist edilemedi: ${errorMessage(error)}`,
      );
      throw new ServiceUnavailableException(
        i18nMessage("server.auth.sessionNotCreated"),
      );
    }
  }

  /** Sunulan refresh token'ı persist edilmiş duruma karşı doğrular ve rotasyon için
   *  iptal eder. Bilinen (kayıtlı) token revoked/expired ya da başka kullanıcıya aitse
   *  reddeder. Kaydı olmayan "legacy" token (persistans öncesi üretilmiş) tek seferlik
   *  kabul edilir; tekrar kullanımı engellensin diye anında revoked işaretlenir
   *  (adopt-and-retire). Geçersizse UnauthorizedException fırlatır. */
  private async assertAndRotateRefreshToken(
    userId: string,
    refreshToken: string,
  ): Promise<void> {
    if (!refreshToken) {
      throw new UnauthorizedException(
        i18nMessage("server.auth.invalidRefreshToken"),
      );
    }
    const tokenHash = this.hashToken(refreshToken);
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (existing) {
      if (existing.userId !== userId) {
        throw new UnauthorizedException(
          i18nMessage("server.auth.invalidRefreshToken"),
        );
      }
      if (existing.expiresAt < new Date()) {
        throw new UnauthorizedException(
          i18nMessage("server.auth.refreshTokenExpired"),
        );
      }
      if (existing.revokedAt) {
        // Rotasyon yarışı penceresi: çok-sekmeli/paralel istemcide (tek sekme
        // bile onlarca eşzamanlı istek atar) yeni cookie tarayıcıya ulaşmadan
        // ESKİ token'la yola çıkmış bir refresh kaçınılmaz; RSC render'ı da
        // cookie yazamadığı için rotasyonu "yakabiliyor". İptalden sonraki kısa
        // pencerede eski token hâlâ kabul edilir (yeni çift üretilir, tekrar
        // tüketim yok); pencere dışı kullanım gerçek replay'dir → red.
        const withinGrace =
          Date.now() - existing.revokedAt.getTime() < REFRESH_ROTATION_GRACE_MS;
        if (!withinGrace) {
          throw new UnauthorizedException(
            i18nMessage("server.auth.refreshTokenRevoked"),
          );
        }
        return;
      }
      // Atomik tüketim: iki eşzamanlı refresh isteğinden yalnız biri revokedAt:null
      // koşulunu sağlayabilir.
      const revoked = await this.prisma.refreshToken.updateMany({
        where: {
          tokenHash,
          userId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { revokedAt: new Date() },
      });
      if (revoked.count !== 1) {
        throw new UnauthorizedException(
          i18nMessage("server.auth.refreshTokenRevoked"),
        );
      }
      return;
    }

    // Kaydı yok → persistans öncesi üretilmiş legacy token (deploy geçiş penceresi).
    // Mevcut tüm oturumları topluca düşürmemek için tek seferlik kabul et; ama hemen
    // "revoked" satır oluştur ki aynı legacy token ikinci kez kullanılamasın.
    const decoded = this.jwtService.decode(refreshToken) as {
      exp?: number;
    } | null;
    const expiresAt = decoded?.exp
      ? new Date(decoded.exp * 1000)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    try {
      await this.prisma.refreshToken.create({
        data: { userId, tokenHash, expiresAt, revokedAt: new Date() },
      });
    } catch {
      // Aynı legacy tokenı eşzamanlı kullanan ikinci istek unique constraint'te
      // kaybeder ve token üretemez.
      throw new UnauthorizedException(
        i18nMessage("server.auth.refreshTokenRevoked"),
      );
    }
  }
}
