import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { ModuleRef } from "@nestjs/core";
import * as bcrypt from "bcrypt";
import * as crypto from "crypto";
import { PrismaService } from "../../prisma";
import {
  RegisterDto,
  BusinessRegisterDto,
  CorporateInvitationDto,
  LoginDto,
  AuthResponseDto,
  RegisterResponseDto,
  TwoFactorChallengeDto,
  TokensDto,
} from "./dto";
import { JwtPayload } from "./interfaces";
import { SellerType, OrderStatus, PaymentStatus, Prisma } from "@prisma/client";
import { NotificationService } from "../notification/notification.service";
import { CacheService } from "../cache/cache.service";
import { StorageService } from "../storage/storage.service";
import { NewsletterService } from "../marketing/newsletter.service";
import { AuthTokenService } from "./auth-token.service";
import { AuthRegistrationService } from "./auth-registration.service";
import { AuthPasswordService } from "./auth-password.service";
import { GoogleAuthService } from "./social/google-auth.service";
import { AppleAuthService } from "./social/apple-auth.service";
import { PaymentService } from "../payment/payment.service";
import { i18nMessage } from "../i18n";
import { SecurityService } from "../security/security.service";
import {
  allocateUsernameFromEmail,
  isUsernameAllowed,
  normalizeUsername,
} from "./utils/username.util";
import { ENTITY_PREFIX } from "../../common/helpers/code-prefixes";
import { errorMessage, errorStack } from "../../common/helpers/error-message";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly notificationService: NotificationService,
    private readonly cacheService: CacheService,
    private readonly storageService: StorageService,
    private readonly googleAuthService: GoogleAuthService,
    private readonly appleAuthService: AppleAuthService,
    private readonly securityService: SecurityService,
    private readonly newsletterService: NewsletterService,
    private readonly tokens: AuthTokenService,
    private readonly registration: AuthRegistrationService,
    private readonly passwords: AuthPasswordService,
    private readonly moduleRef: ModuleRef,
  ) {}

  // ────────────────────────── oturum jetonları ──────────────────────────
  // Controller ve admin oturumu bu servisi adresliyor; gövde
  // AuthTokenService'te.

  refreshTokens(...args: Parameters<AuthTokenService["refreshTokens"]>) {
    return this.tokens.refreshTokens(...args);
  }

  logout(...args: Parameters<AuthTokenService["logout"]>) {
    return this.tokens.logout(...args);
  }

  // ───────────────────────────── hesap açılışı ─────────────────────────────
  // Controller ve kurumsal davet akışı bu servisi adresliyor; gövde
  // AuthRegistrationService'te.

  isUsernameAvailable(value: string): Promise<boolean> {
    return this.registration.isUsernameAvailable(value);
  }

  register(dto: RegisterDto): Promise<RegisterResponseDto> {
    return this.registration.register(dto);
  }

  sendEmailVerification(userId: string, email: string): Promise<void> {
    return this.registration.sendEmailVerification(userId, email);
  }

  verifyEmail(token: string): Promise<{ alreadyVerified: boolean }> {
    return this.registration.verifyEmail(token);
  }

  resendEmailVerification(userId: string): Promise<void> {
    return this.registration.resendEmailVerification(userId);
  }

  registerBusiness(dto: BusinessRegisterDto) {
    return this.registration.registerBusiness(dto);
  }

  getCorporateInvitation(token: string) {
    return this.registration.getCorporateInvitation(token);
  }

  activateCorporateInvitation(dto: CorporateInvitationDto) {
    return this.registration.activateCorporateInvitation(dto);
  }

  private async resolveAvatarUrl(
    avatarUrl: string | null | undefined,
  ): Promise<string | null> {
    if (!avatarUrl) return null;
    if (avatarUrl.startsWith("http://") || avatarUrl.startsWith("https://"))
      return avatarUrl;
    if (this.storageService) {
      try {
        return await this.storageService.getPresignedDownloadUrl(
          "avatars",
          avatarUrl,
          86400,
        );
      } catch {
        return null;
      }
    }
    return null;
  }

  /**
   * Login user
   * POST /auth/login
   */
  async login(dto: LoginDto): Promise<AuthResponseDto | TwoFactorChallengeDto> {
    try {
      // Find user by email with membership info
      const user = await this.prisma.user.findUnique({
        where: { email: dto.email },
        include: {
          membership: {
            include: {
              tier: true,
            },
          },
          twoFactorSecret: {
            select: { isEnabled: true },
          },
        },
      });

      if (!user) {
        // Log failed login attempt - user not found
        await this.logSecurityEvent("failed_login", "medium", {
          email: dto.email,
          reason: "user_not_found",
        });
        throw new UnauthorizedException(
          i18nMessage("server.auth.invalidCredentials"),
        );
      }

      // Silinmiş (anonimleştirilmiş) hesap: kaynakta reddet, token üretme.
      if (user.deletedAt) {
        await this.logSecurityEvent("failed_login", "medium", {
          email: dto.email,
          userId: user.id,
          reason: "deleted_account",
        });
        throw new UnauthorizedException(
          i18nMessage("server.auth.invalidCredentials"),
        );
      }

      // Guard: OAuth-only accounts have no passwordHash — avoid bcrypt throwing on null
      if (!user.passwordHash) {
        await this.logSecurityEvent("failed_login", "medium", {
          email: dto.email,
          userId: user.id,
          reason: "oauth_only_account",
        });
        throw new UnauthorizedException(
          i18nMessage("server.auth.invalidCredentials"),
        );
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(
        dto.password,
        user.passwordHash,
      );

      if (!isPasswordValid) {
        // Log failed login attempt - wrong password
        await this.logSecurityEvent("failed_login", "medium", {
          email: dto.email,
          userId: user.id,
          reason: "invalid_password",
        });
        throw new UnauthorizedException(
          i18nMessage("server.auth.invalidCredentials"),
        );
      }

      if (user.isBanned) {
        await this.logSecurityEvent("failed_login", "high", {
          email: dto.email,
          userId: user.id,
          reason: "banned_account",
        });
        throw new UnauthorizedException(
          i18nMessage("server.auth.accountSuspended"),
        );
      }

      // Check if email is verified - require email verification before login
      if (!user.isEmailVerified) {
        throw new UnauthorizedException({
          ...i18nMessage("server.auth.emailNotVerifiedLogin"),
          errorCode: "EMAIL_NOT_VERIFIED",
        });
      }

      const twoFactorChallenge = await this.verifyLoginSecondFactor(
        user.id,
        user.twoFactorSecret?.isEnabled === true,
        dto.twoFactorCode,
      );
      if (twoFactorChallenge) return twoFactorChallenge;

      // Update lastLoginAt immediately so it's persisted before any other async work
      const now = new Date();
      try {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: now, lastActivityAt: now },
        });
      } catch (err) {
        this.logger.warn(
          `Failed to update lastLoginAt for user ${user.id}: ${err}`,
        );
      }

      // Generate tokens
      const tokens = await this.tokens.generateTokens(
        user.id,
        user.email,
        user.isSeller,
      );

      // Cache invalidation: Clear any guest session cache and set up user cache
      await this.invalidateGuestCacheOnLogin(user.id);

      // Format membership data safely
      let membershipData = undefined;
      if (user.membership && user.membership.tier) {
        try {
          const tier = user.membership.tier;
          // Ensure tier has required fields
          if (tier && tier.type && tier.name) {
            membershipData = {
              tier: {
                type: String(tier.type),
                name: String(tier.name),
              },
              expiresAt: user.membership.currentPeriodEnd
                ? new Date(user.membership.currentPeriodEnd).toISOString()
                : undefined,
            };
          }
        } catch (membershipError) {
          this.logger.warn(
            "Error formatting membership data for login response",
          );
          // Continue without membership data if there's an error
        }
      }

      const resolvedAvatarUrl = await this.resolveAvatarUrl(user.avatarUrl);

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
          isSeller: user.isSeller,
          sellerType: user.sellerType ?? undefined,
          createdAt: user.createdAt,
          membership: membershipData,
        },
        tokens,
      };
    } catch (error) {
      // Re-throw known exceptions
      if (
        error instanceof UnauthorizedException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }
      this.logger.error("Login failed", errorStack(error));
      throw new BadRequestException(i18nMessage("server.auth.loginFailed"));
    }
  }

  /**
   * Admin login (separate authentication)
   * POST /auth/admin/login
   */
  async adminLogin(
    dto: LoginDto,
    sessionContext?: { ipAddress?: string; userAgent?: string },
  ) {
    // Find user by email – select only columns that exist in DB (avoids schema/DB drift)
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: {
        id: true,
        adminCode: true,
        username: true,
        usernameClaimedAt: true,
        email: true,
        passwordHash: true,
        displayName: true,
        isVerified: true,
        isSeller: true,
        isBanned: true,
        deletedAt: true,
        createdAt: true,
        adminUser: true,
        twoFactorSecret: {
          select: { isEnabled: true },
        },
      },
    });

    if (!user || !user.adminUser) {
      this.logger.warn("Admin login failed: user not found or no admin user");
      throw new UnauthorizedException(
        i18nMessage("server.auth.invalidCredentials"),
      );
    }

    const isPasswordValid =
      !!user.passwordHash &&
      (await bcrypt.compare(dto.password, user.passwordHash));
    if (!isPasswordValid) {
      this.logger.warn("Admin login failed: invalid password");
      throw new UnauthorizedException(
        i18nMessage("server.auth.invalidCredentials"),
      );
    }

    if (user.deletedAt || user.isBanned) {
      this.logger.warn("Admin login failed: user account inactive");
      throw new UnauthorizedException(
        i18nMessage("server.auth.adminAccountNotFoundOrInactive"),
      );
    }

    if (!user.adminUser.isActive) {
      this.logger.warn("Admin login failed: admin account inactive");
      throw new UnauthorizedException(
        i18nMessage("server.auth.adminAccountDeactivated"),
      );
    }

    const twoFactorChallenge = await this.verifyLoginSecondFactor(
      user.id,
      user.twoFactorSecret?.isEnabled === true,
      dto.twoFactorCode,
    );
    if (twoFactorChallenge) return twoFactorChallenge;

    // Generate admin tokens (using separate secret)
    const tokens = await this.tokens.generateAdminTokens(
      user.id,
      user.email,
      user.adminUser.role,
      user.adminUser.id,
      undefined,
      sessionContext,
    );

    await Promise.all([
      this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      }),
      this.prisma.adminUser.update({
        where: { id: user.adminUser.id },
        data: { lastLoginAt: new Date() },
      }),
    ]);

    this.logger.log("Admin login success");

    return {
      user: {
        id: user.id,
        adminCode: user.adminCode,
        username: user.username,
        usernameClaimed: user.usernameClaimedAt != null,
        email: user.email,
        displayName: user.displayName,
        isVerified: user.isVerified,
        isSeller: user.isSeller,
        role: user.adminUser.role,
        permissions: user.adminUser.permissions,
        createdAt: user.createdAt,
      },
      tokens,
    };
  }

  /**
   * Find user by email (for resend verification)
   */
  async findUserByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      select: { id: true, isEmailVerified: true },
    });
  }

  /**
   * Get current user profile
   */
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { adminUser: true },
    });

    if (!user) {
      throw new BadRequestException(i18nMessage("server.auth.userNotFound"));
    }

    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      displayName: user.displayName,
      isVerified: user.isVerified,
      isPhoneVerified: user.isPhoneVerified,
      isSeller: user.isSeller,
      sellerType: user.sellerType,
      isAdmin: !!user.adminUser?.isActive,
      role: user.adminUser?.role,
      createdAt: user.createdAt,
      preferredLanguage: user.preferredLanguage,
      homeTourVersion: user.homeTourVersion,
      listingTourVersion: user.listingTourVersion,
    };
  }

  /**
   * Invalidate guest cache when user logs in
   * This ensures clean state transition from guest to authenticated
   */
  private async invalidateGuestCacheOnLogin(userId: string): Promise<void> {
    try {
      // Clear any guest-related cache that might exist
      // Clear user-specific caches - NOT global guest caches
      // Note: We only clear the logged-in user's cache, not all guest sessions
      await Promise.all([
        // Clear any stale user cache and refresh
        this.cacheService.del(this.cacheService.userKey(userId)),
        // Clear user's cart cache if exists
        this.cacheService.del(`cart:${userId}`),
        // Clear user's recently viewed cache if exists
        this.cacheService.del(`recently_viewed:${userId}`),
      ]);

      this.logger.debug(`Cache invalidated for user login: ${userId}`);
    } catch (error) {
      // Log but don't fail login if cache invalidation fails
      this.logger.warn(`Cache invalidation error on login: ${error}`);
    }
  }

  /**
   * Verilen userId için AuthResponseDto üretir (login response ile aynı şekil).
   */
  // ────────────────────────── şifre sıfırlama ──────────────────────────
  // Controller bu servisi adresliyor; gövde AuthPasswordService'te.

  requestPasswordReset(email: string): Promise<void> {
    return this.passwords.requestPasswordReset(email);
  }

  resetPassword(token: string, newPassword: string): Promise<void> {
    return this.passwords.resetPassword(token, newPassword);
  }

  private async buildUserAuthResponse(
    userId: string,
  ): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        membership: { include: { tier: true } },
        twoFactorSecret: { select: { isEnabled: true } },
      },
    });
    if (!user) {
      throw new UnauthorizedException(i18nMessage("server.auth.userNotFound"));
    }
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

    const resolvedAvatarUrl = await this.resolveAvatarUrl(user.avatarUrl);

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

  private async verifyLoginSecondFactor(
    userId: string,
    enabled: boolean,
    code?: string,
  ): Promise<TwoFactorChallengeDto | null> {
    if (!enabled) return null;
    if (!code) return { requires2FA: true };

    const valid = await this.securityService.validateTOTP(userId, code);
    if (!valid) {
      await this.logSecurityEvent("failed_login", "high", {
        userId,
        reason: "invalid_two_factor_code",
      });
      throw new UnauthorizedException(
        i18nMessage("server.auth.invalidCredentials"),
      );
    }

    return null;
  }

  /**
   * Identifier-first login: bir e-postanın aktif bir hesaba ait olup olmadığını
   * ve o hesabın parolası olup olmadığını (OAuth-only mu) döndürür.
   *   - exists=false            → kayıtlı değil (UI: "kayıt olun")
   *   - exists, hasPassword     → normal parola girişi (UI: parola iste)
   *   - exists, !hasPassword    → Google-only hesap (UI: Google / şifre belirle)
   * Not: identifier-first akışı doğası gereği hesap varlığını ifşa eder
   * (user enumeration). Uç @Throttle ile sınırlıdır; bilinçli bir tercihtir.
   */
  async checkEmail(
    email: string,
  ): Promise<{ exists: boolean; hasPassword: boolean }> {
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      select: { passwordHash: true },
    });
    return { exists: !!user, hasPassword: !!user?.passwordHash };
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

  /**
   * Log security events for monitoring and compliance
   */
  private async logSecurityEvent(
    eventType: string,
    severity: "low" | "medium" | "high" | "critical",
    details: Record<string, any>,
  ): Promise<void> {
    try {
      await this.prisma.securityLog.create({
        data: {
          eventType,
          severity,
          userId: details.userId || null,
          email: details.email || null,
          ipAddress: details.ipAddress || null,
          userAgent: details.userAgent || null,
          details,
        },
      });
    } catch (error) {
      // Don't let logging failures affect the main flow
      this.logger.warn(`Failed to log security event: ${errorMessage(error)}`);
    }
  }
}
