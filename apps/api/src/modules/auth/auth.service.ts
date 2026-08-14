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

/** Hesap tipi öneki — yalnızca bireysel (B) veya kurumsal (K). */
type EntityUserPrefix =
  typeof ENTITY_PREFIX.individualUser | typeof ENTITY_PREFIX.corporateUser;

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
   * Hesap tipi kodu: B (bireysel) veya K (kurumsal). Satıcılık ayrı bir
   * bayraktır, önek değildir — bireysel satıcı da B taşır.
   */
  private async nextAdminCode(prefix: EntityUserPrefix): Promise<string> {
    const [row] = await this.prisma.$queryRaw<Array<{ code: string }>>`
      SELECT generate_user_admin_code(${prefix}) AS code
    `;
    return row.code;
  }

  private rethrowUserUniqueConstraint(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const rawTarget = error.meta?.target;
      const target = (
        Array.isArray(rawTarget) ? rawTarget.join(",") : String(rawTarget ?? "")
      ).toLowerCase();
      if (target.includes("username")) {
        throw new ConflictException(i18nMessage("server.auth.usernameTaken"));
      }
      if (target.includes("phone")) {
        throw new ConflictException(
          i18nMessage("server.auth.phoneAlreadyRegistered"),
        );
      }
      if (target.includes("email")) {
        throw new ConflictException(
          i18nMessage("server.auth.emailAlreadyRegistered"),
        );
      }
      throw new ConflictException(
        i18nMessage("server.auth.accountAlreadyUsed"),
      );
    }
    throw error;
  }

  async isUsernameAvailable(value: string): Promise<boolean> {
    const username = normalizeUsername(value);
    if (!isUsernameAllowed(username)) return false;
    const existing = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    return !existing;
  }

  /**
   * Register a new user
   * POST /auth/register
   */
  async register(dto: RegisterDto): Promise<RegisterResponseDto> {
    const username = normalizeUsername(dto.username);
    if (!isUsernameAllowed(username)) {
      throw new BadRequestException(i18nMessage("server.auth.usernameFormat"));
    }
    if (!(await this.isUsernameAvailable(username))) {
      throw new ConflictException(i18nMessage("server.auth.usernameTaken"));
    }

    // Check if email already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException(
        i18nMessage("server.auth.emailAlreadyRegistered"),
      );
    }

    // Check if phone already exists (if provided)
    if (dto.phone) {
      const existingPhone = await this.prisma.user.findUnique({
        where: { phone: dto.phone },
      });

      if (existingPhone) {
        throw new ConflictException(
          i18nMessage("server.auth.phoneAlreadyRegistered"),
        );
      }
    }

    // Validate age (18+) - double check at server level
    if (dto.birthDate) {
      const birth = new Date(dto.birthDate);
      const today = new Date();
      let age = today.getFullYear() - birth.getFullYear();
      const monthDiff = today.getMonth() - birth.getMonth();

      if (
        monthDiff < 0 ||
        (monthDiff === 0 && today.getDate() < birth.getDate())
      ) {
        age--;
      }

      if (age < 18) {
        throw new BadRequestException(i18nMessage("server.auth.minAge18"));
      }
    } else {
      throw new BadRequestException(
        i18nMessage("server.auth.birthDateRequired"),
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(dto.password, 12);
    // Tek okuma noktası: hem user satırına hem bülten listesine aynı değer gider.
    const marketingConsent = Boolean(
      dto.marketingConsent || dto.acceptsMarketingEmails,
    );
    // Bireysel satıcı da bireysel hesaptır: önek satıcılığa göre değişmez.
    const adminCode = await this.nextAdminCode(ENTITY_PREFIX.individualUser);

    // Create user
    let user;
    try {
      user = await this.prisma.user.create({
        data: {
          adminCode,
          username,
          usernameClaimedAt: new Date(),
          email: dto.email,
          phone: dto.phone,
          passwordHash,
          displayName: dto.displayName,
          birthDate: new Date(dto.birthDate),
          isSeller: dto.isSeller ?? false,
          sellerType: dto.isSeller ? SellerType.individual : null,
          isVerified: false, // Email verification required
          isEmailVerified: false, // Will be true after email verification
          acceptsMarketingEmails: marketingConsent,
        },
      });
    } catch (error) {
      this.rethrowUserUniqueConstraint(error);
    }

    // Pazarlama izni verildiyse üyeyi bülten listesine de yaz. Gönderimler
    // `newsletter_subscribers`'ı TEK alıcı listesi olarak okur; buraya
    // yazılmayan üye hiç bülten almaz (bkz. NewsletterService).
    if (marketingConsent) {
      await this.newsletterService.syncUserConsent(user.email, true);
    }

    // Check if there are guest orders with this email and link them to the new user
    try {
      // Get system guest user
      const systemGuestUser = await this.prisma.user.findUnique({
        where: { email: "guest@tarodan.system" },
      });

      if (systemGuestUser) {
        // Get all orders from system guest user
        const guestOrders = await this.prisma.order.findMany({
          where: {
            buyerId: systemGuestUser.id,
          },
        });

        // Filter orders where guestEmail in shippingAddress matches the new user's email
        const matchingOrders = guestOrders.filter((order: any) => {
          try {
            const shippingAddress = order.shippingAddress as any;
            const guestEmail = shippingAddress?.guestEmail
              ?.toLowerCase()
              ?.trim();
            const userEmail = dto.email.toLowerCase().trim();
            return guestEmail === userEmail;
          } catch {
            return false;
          }
        });

        if (matchingOrders.length > 0) {
          // Link guest orders to the new user
          await this.prisma.order.updateMany({
            where: {
              id: { in: matchingOrders.map((o: any) => o.id) },
            },
            data: {
              buyerId: user.id,
            },
          });

          this.logger.log(
            `Linked ${matchingOrders.length} guest order(s) to new user ${user.id} (${user.email})`,
          );

          // Misafir, ödeme sonrası success sayfasına ulaşamadıysa (eski guest
          // redirect bug'ı) ödeme yakalanmamış olabilir → sahiplenilen pending
          // siparişleri PayTR'da DOĞRULA. Bloklamadan, arka planda; PayTR'da
          // gerçekten ödenmişse sipariş tamamlanır.
          const pendingOrders = matchingOrders.filter(
            (o: any) => o.status === OrderStatus.pending_payment,
          );
          if (pendingOrders.length > 0) {
            void this.verifyClaimedGuestPayments(pendingOrders).catch(
              () => undefined,
            );
          }
        }
      }
    } catch (error) {
      // Don't fail registration if linking guest orders fails
      this.logger.error(
        `Failed to link guest orders for ${user.email}: ${errorMessage(error)}`,
      );
    }

    // Send email verification
    await this.sendEmailVerification(user.id, user.email);

    // Send welcome email if user accepted marketing emails
    if (marketingConsent) {
      try {
        await this.notificationService.sendWelcomeEmail(user.id);
      } catch (error) {
        this.logger.error(
          `Failed to send welcome email to ${user.email}: ${errorMessage(error)}`,
        );
      }
    }

    // Kayıt oturum AÇMAZ: doğrulanmamış hesaba çalışan access/refresh token vermek,
    // "girişte doğrulama şart" kuralını refresh ömrü boyunca bypass edilebilir
    // kılıyordu (sahibi olmadığı e-postayla kayıt olan biri ilan açıp ödeme
    // başlatabiliyordu). İstemciler zaten kayıt sonrası doğrulama ekranını gösterip
    // token kullanmıyor.

    return {
      user: {
        id: user.id,
        adminCode: user.adminCode,
        username: user.username,
        usernameClaimed: user.usernameClaimedAt != null,
        email: user.email,
        phone: user.phone ?? undefined,
        displayName: user.displayName,
        isVerified: user.isVerified,
        isSeller: user.isSeller,
        sellerType: user.sellerType ?? undefined,
        createdAt: user.createdAt,
      },
      // #224: mesaj artık AuthController.register() tarafından locale'e göre kuruluyor
      // (server.auth.registerSuccess) — servis burada sabit metin döndürmüyor.
    };
  }

  /**
   * Sahiplenilen pending misafir siparişlerinin ödemesini PayTR'da doğrula.
   * Misafir, ödeme sonrası success sayfasına ulaşamamış (verify çağrısı hiç
   * çalışmamış) ve callback de gelmemişse sipariş pending kalır; burada PayTR
   * durum-sorgusuyla gerçekten ödenmişse sipariş tamamlanır. ModuleRef ile tembel
   * çözüm (Auth↔Payment modül döngüsünü önler). Asla register'ı bloklamaz/patlatmaz.
   */
  private async verifyClaimedGuestPayments(
    orders: { id: string; checkoutGroupId: string | null }[],
  ): Promise<void> {
    let paymentService: PaymentService;
    try {
      paymentService = this.moduleRef.get(PaymentService, { strict: false });
    } catch {
      return;
    }
    for (const order of orders) {
      try {
        const payment = await this.prisma.payment.findFirst({
          where: {
            status: PaymentStatus.pending,
            OR: [
              { orderId: order.id },
              ...(order.checkoutGroupId
                ? [{ checkoutGroupId: order.checkoutGroupId }]
                : []),
            ],
          },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        });
        if (!payment) continue;
        const res = await paymentService.verifyPaymentFromClient(payment.id, {
          internal: true,
        });
        if (res.completed) {
          this.logger.log(
            `Recovered guest payment ${payment.id} for claimed order ${order.id}`,
          );
        }
      } catch (e: any) {
        this.logger.warn(
          `verifyClaimedGuestPayments failed for order ${order.id}: ${e?.message}`,
        );
      }
    }
  }

  /**
   * Send email verification link
   */
  async sendEmailVerification(userId: string, email: string): Promise<void> {
    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto
      .createHash("sha256")
      .update(verificationToken)
      .digest("hex");
    const expiresAt = new Date(Date.now() + 24 * 3600000); // 24 hours

    // Delete existing tokens for this user
    await this.prisma.emailVerificationToken.deleteMany({
      where: { userId },
    });

    // Create new token
    await this.prisma.emailVerificationToken.create({
      data: {
        userId,
        token: hashedToken,
        email,
        expiresAt,
      },
    });

    // Send verification email
    await this.notificationService.sendEmailVerification(
      userId,
      verificationToken,
    );
  }

  /**
   * Verify email with token
   * POST /auth/verify-email
   */
  async verifyEmail(token: string): Promise<{ alreadyVerified: boolean }> {
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const verificationToken =
      await this.prisma.emailVerificationToken.findUnique({
        where: { token: hashedToken },
        include: { user: true },
      });

    if (!verificationToken) {
      throw new BadRequestException(
        i18nMessage("server.auth.emailVerificationLinkInvalid"),
      );
    }

    if (verificationToken.usedAt) {
      // İdempotent: link zaten kullanılmış (çift tıklama / e-posta istemcisinin
      // link ön-yüklemesi). Kullanıcı zaten doğrulanmışsa bu bir HATA değildir —
      // başarı dön. Aksi halde ilk çağrı doğrularken ikinci çağrı kullanıcıya
      // yanlışlıkla "Doğrulama Başarısız" gösteriyordu.
      if (verificationToken.user?.isEmailVerified) {
        // #224: başarı mesajı AuthController.verifyEmail() tarafından locale'e göre
        // kuruluyor (server.auth.emailVerificationAlreadyDone).
        return { alreadyVerified: true };
      }
      throw new BadRequestException(
        i18nMessage("server.auth.emailVerificationLinkUsed"),
      );
    }

    if (verificationToken.expiresAt < new Date()) {
      throw new BadRequestException(
        i18nMessage("server.auth.emailVerificationLinkExpired"),
      );
    }

    // Mark email as verified
    await this.prisma.user.update({
      where: { id: verificationToken.userId },
      data: { isEmailVerified: true },
    });

    // Mark token as used
    await this.prisma.emailVerificationToken.update({
      where: { id: verificationToken.id },
      data: { usedAt: new Date() },
    });

    // #224: başarı mesajı AuthController.verifyEmail() tarafından locale'e göre
    // kuruluyor (server.auth.emailVerificationSuccess).
    return { alreadyVerified: false };
  }

  /**
   * Register a new business account
   * POST /auth/register/business
   */
  async registerBusiness(dto: BusinessRegisterDto) {
    const companyEmail = dto.companyEmail.trim().toLowerCase();
    const existingUser = await this.prisma.user.findUnique({
      where: { email: companyEmail },
    });
    if (existingUser) {
      throw new ConflictException(
        i18nMessage("server.auth.emailAlreadyRegistered"),
      );
    }
    const existingPhone = await this.prisma.user.findFirst({
      where: { OR: [{ phone: dto.phone }, { email: companyEmail }] },
    });
    if (existingPhone) {
      throw new ConflictException(
        i18nMessage("server.auth.phoneAlreadyRegistered"),
      );
    }
    const openApplication = await this.prisma.corporateApplication.findFirst({
      where: {
        OR: [{ companyEmail }, { phone: dto.phone }],
        status: { not: "rejected" },
      },
    });
    if (openApplication) {
      throw new ConflictException(
        i18nMessage("server.auth.applicationAlreadyOpen"),
      );
    }

    const application = await this.prisma.corporateApplication.create({
      data: {
        authorizedFullName: dto.authorizedFullName.trim(),
        companyLegalName: dto.companyLegalName.trim(),
        companyTitle: dto.companyTitle.trim(),
        companyAddress: dto.companyAddress.trim(),
        companyEmail,
        kepAddress: dto.kepAddress?.trim().toLowerCase() || null,
        phone: dto.phone,
        contactPhone: dto.contactPhone || null,
        events: {
          create: {
            action: "application_submitted",
            metadata: { source: "web" },
          },
        },
      },
      select: { id: true, status: true, companyEmail: true },
    });

    return {
      applicationId: application.id,
      status: application.status,
      email: application.companyEmail,
    };
  }

  async getCorporateInvitation(token: string) {
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const application = await this.prisma.corporateApplication.findUnique({
      where: { invitationTokenHash: tokenHash },
      select: {
        id: true,
        companyTitle: true,
        companyEmail: true,
        status: true,
        invitationExpiresAt: true,
      },
    });
    if (
      !application ||
      application.status !== "invited" ||
      !application.invitationExpiresAt ||
      application.invitationExpiresAt <= new Date()
    ) {
      throw new BadRequestException(
        i18nMessage("server.auth.invitationInvalid"),
      );
    }
    return {
      companyTitle: application.companyTitle,
      companyEmail: application.companyEmail,
      expiresAt: application.invitationExpiresAt,
    };
  }

  async activateCorporateInvitation(dto: CorporateInvitationDto) {
    const tokenHash = crypto
      .createHash("sha256")
      .update(dto.token)
      .digest("hex");
    const username = normalizeUsername(dto.username);
    if (!isUsernameAllowed(username)) {
      throw new BadRequestException(i18nMessage("server.auth.usernameInvalid"));
    }

    const application = await this.prisma.corporateApplication.findUnique({
      where: { invitationTokenHash: tokenHash },
    });
    if (
      !application ||
      application.status !== "invited" ||
      !application.invitationExpiresAt ||
      application.invitationExpiresAt <= new Date()
    ) {
      throw new BadRequestException(
        i18nMessage("server.auth.invitationInvalid"),
      );
    }
    const usernameExists = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    if (usernameExists) {
      throw new ConflictException(
        i18nMessage("server.auth.usernameAlreadyTaken"),
      );
    }

    const [passwordHash, adminCode] = await Promise.all([
      bcrypt.hash(dto.password, 12),
      this.nextAdminCode(ENTITY_PREFIX.corporateUser),
    ]);
    const now = new Date();
    let user;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            adminCode,
            username,
            usernameClaimedAt: now,
            email: application.companyEmail,
            phone: application.phone,
            passwordHash,
            displayName: application.companyTitle,
            companyName: application.companyLegalName,
            companyType: application.companyType,
            companyCity: application.companyCity,
            companyDistrict: application.companyDistrict,
            taxId: application.taxId,
            isEmailVerified: true,
            isVerified: false,
            isSeller: false,
            sellerType: "verified",
            businessStatus: "pending",
          },
        });
        await tx.corporateApplication.update({
          where: { id: application.id },
          data: {
            userId: created.id,
            status: "completing",
            activatedAt: now,
            invitationTokenHash: null,
            invitationExpiresAt: null,
            events: {
              create: {
                action: "invitation_activated",
                actorUserId: created.id,
              },
            },
          },
        });
        return created;
      });
    } catch (error) {
      this.rethrowUserUniqueConstraint(error);
    }

    return {
      userId: user.id,
      adminCode: user.adminCode,
      username: user.username,
      status: "completing",
    };
  }

  /**
   * Resend email verification
   * POST /auth/resend-verification
   */
  async resendEmailVerification(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(i18nMessage("server.auth.userNotFound"));
    }

    if (user.isEmailVerified) {
      throw new BadRequestException(
        i18nMessage("server.auth.emailAlreadyVerified"),
      );
    }

    await this.sendEmailVerification(userId, user.email);
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
   * Request password reset
   * POST /auth/forgot-password
   */
  async requestPasswordReset(email: string): Promise<void> {
    // Silinmiş (anonimleştirilmiş) ya da banlı hesaba reset linki gönderme:
    // findUnique yerine deletedAt:null + banlı filtresi. Yanıt her durumda aynı
    // (enumeration'a karşı) — sadece link üretimini/gönderimini atlarız.
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null, isBanned: false },
    });

    // Don't reveal if user exists for security
    // #224: yanıt mesajı AuthController.forgotPassword() tarafından locale'e göre
    // kuruluyor (server.auth.passwordResetLinkSent) — kullanıcı bulunsun bulunmasın aynı.
    if (!user) {
      return;
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");
    const expiresAt = new Date(Date.now() + 3600000); // 1 hour

    // Delete existing tokens for this user
    await this.prisma.passwordResetToken.deleteMany({
      where: { userId: user.id },
    });

    // Create new token
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token: hashedToken,
        expiresAt,
      },
    });

    // Send email with reset link using NotificationService
    await this.notificationService.sendPasswordResetEmail(user.id, resetToken);
  }

  /**
   * Reset password with token
   * POST /auth/reset-password
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    // Hash the token to compare
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    // Find token
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { token: hashedToken },
      include: { user: true },
    });

    if (!resetToken) {
      throw new BadRequestException(
        i18nMessage("server.auth.resetTokenInvalidOrExpired"),
      );
    }

    if (resetToken.usedAt) {
      throw new BadRequestException(
        i18nMessage("server.auth.resetTokenAlreadyUsed"),
      );
    }

    if (resetToken.expiresAt < new Date()) {
      throw new BadRequestException(
        i18nMessage("server.auth.resetTokenExpired"),
      );
    }

    // Silinmiş/banlı hesap için token geçerli olsa bile parola set etme.
    if (resetToken.user.deletedAt || resetToken.user.isBanned) {
      throw new BadRequestException(
        i18nMessage("server.auth.resetTokenInvalidOrExpired"),
      );
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Update user password
    await this.prisma.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash },
    });

    // Mark token as used
    await this.prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    });

    // Parola değişti → mevcut tüm refresh token'ları (session'ları) iptal et.
    // Bir hesap kurtarma/ele geçirme savunmasının parçasıysa, eski oturumlar
    // (ör. saldırgan) anında düşer; kullanıcı yeniden giriş yapar.
    await this.prisma.refreshToken.updateMany({
      where: { userId: resetToken.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    // #224: başarı mesajı AuthController.resetPassword() tarafından locale'e göre
    // kuruluyor (server.auth.passwordResetSuccess).
  }

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
