import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../../prisma";
import { LoginDto, AuthResponseDto, TwoFactorChallengeDto } from "./dto";
import { CacheService } from "../cache/cache.service";
import { StorageService } from "../storage/storage.service";
import { SecurityService } from "../security/security.service";
import { AuthTokenService } from "./auth-token.service";
import { resolveAvatarUrl } from "./utils/avatar-url.util";
import { DUMMY_BCRYPT_HASH } from "./utils/timing-pad";
import { i18nMessage } from "../i18n";
import { errorMessage, errorStack } from "../../common/helpers/error-message";

/**
 * Şifreyle giriş: mağaza girişi, yönetim paneli girişi, ikinci faktör kontrolü
 * ve başarısız denemelerin güvenlik günlüğü. AuthService'ten birebir taşındı.
 *
 * İki giriş yolu tek serviste duruyor çünkü aynı reddetme sırasını paylaşmak
 * zorundalar — silinmiş hesap, sosyal-only hesap, yanlış şifre, ban, doğrulanmamış
 * e-posta, sonra ikinci faktör. Sıra bir yolda kayarsa yönetim paneli mağazanın
 * reddettiği bir hesabı kabul eder; bu, günlüğe düşen ama kimsenin bakmadığı
 * türden bir fark olur.
 */
@Injectable()
export class AuthLoginService {
  private readonly logger = new Logger(AuthLoginService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly storageService: StorageService,
    private readonly securityService: SecurityService,
    private readonly tokens: AuthTokenService,
  ) {}

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
        // Dummy compare so this path takes the same time as a real
        // wrong-password rejection (timing-based email enumeration).
        await bcrypt.compare(dto.password, DUMMY_BCRYPT_HASH);
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
        // Same timing-safety reasoning as the "user not found" branch above.
        await bcrypt.compare(dto.password, DUMMY_BCRYPT_HASH);
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
        // Same timing-safety reasoning as the "user not found" branch above.
        await bcrypt.compare(dto.password, DUMMY_BCRYPT_HASH);
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
      // Dummy compare so this path takes the same time as a real
      // wrong-password rejection (timing-based email enumeration).
      await bcrypt.compare(dto.password, DUMMY_BCRYPT_HASH);
      this.logger.warn("Admin login failed: user not found or no admin user");
      throw new UnauthorizedException(
        i18nMessage("server.auth.invalidCredentials"),
      );
    }

    // Always run bcrypt (dummy hash when there's no real passwordHash) so
    // this branch takes the same time regardless of account state —
    // matching the "user not found" dummy compare above.
    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash ?? DUMMY_BCRYPT_HASH,
    );
    if (!user.passwordHash || !isPasswordValid) {
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
