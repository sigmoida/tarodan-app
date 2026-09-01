import {
  Injectable,
  Logger,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import * as bcrypt from "bcrypt";
import * as crypto from "crypto";
import { PrismaService } from "../../prisma";
import {
  RegisterDto,
  BusinessRegisterDto,
  CorporateInvitationDto,
  RegisterResponseDto,
} from "./dto";
import { SellerType, OrderStatus, PaymentStatus, Prisma } from "@prisma/client";
import { NotificationService } from "../notification/notification.service";
import { NewsletterService } from "../marketing/newsletter.service";
import { PaymentService } from "../payment/payment.service";
import { i18nMessage } from "../i18n";
import { isUsernameAllowed, normalizeUsername } from "./utils/username.util";
import { ENTITY_PREFIX } from "../../common/helpers/code-prefixes";
import { errorMessage } from "../../common/helpers/error-message";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { QUEUE_NAMES } from "../../workers/constants";
import { getEmailTemplateSubject } from "../../common/helpers/email-template-renderer";
import {
  buildEmailVerificationTemplateData,
  EMAIL_VERIFICATION_TEMPLATE,
  EMAIL_VERIFICATION_TTL_MS,
} from "../../common/helpers/email-verification-mail";

/** Aktivasyon mailinin gönderim sonucu (NotificationAccountService sözleşmesi). */
export interface EmailVerificationSendResult {
  success: boolean;
  error?: string;
}

/** Hesap tipi öneki — yalnızca bireysel (B) veya kurumsal (K). */
type EntityUserPrefix =
  typeof ENTITY_PREFIX.individualUser | typeof ENTITY_PREFIX.corporateUser;

/**
 * Hesap açılışı: bireysel ve kurumsal kayıt, kurumsal davet aktivasyonu,
 * e-posta doğrulaması ve misafir siparişlerinin yeni hesaba devri.
 * AuthService'ten birebir taşındı.
 *
 * Hepsi aynı anı paylaşıyor — kullanıcı satırının ilk kez yazıldığı an. O
 * satır tek yerde kurulmazsa kullanıcı adı ayırma, entity kodu (B/K) ve
 * benzersizlik çakışmasının hangi hataya dönüştüğü yollara göre ayrışır;
 * kurumsal kayıt bireyselden farklı bir kod şeması üretmeye başlar.
 */
@Injectable()
export class AuthRegistrationService {
  private readonly logger = new Logger(AuthRegistrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly newsletterService: NewsletterService,
    private readonly moduleRef: ModuleRef,
    @InjectQueue(QUEUE_NAMES.EMAIL) private readonly emailQueue: Queue,
  ) {}

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
    }
    // birthDate YOKSA hata YOK — alan opsiyonel (App Store Review 5.1.1(v)).
    // 18+ kontrolü yalnız değer geldiğinde uygulanır; yaş gerçekten gerektiğinde
    // (satıcı olma / ödeme-KYC) orada zorunlu istenir.

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
          birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
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
   * Send email verification link.
   *
   * Gönderim sonucunu döndürür: kayıt akışı bunu görmezden gelir (kullanıcı
   * yine de kaydolur), admin "yeniden gönder" yolu ise başarısızlığı hata
   * olarak yüzeye çıkarır.
   */
  async sendEmailVerification(
    userId: string,
    email: string,
  ): Promise<EmailVerificationSendResult> {
    const verificationToken = await this.issueEmailVerificationToken(
      userId,
      email,
    );
    return this.notificationService.sendEmailVerification(
      userId,
      verificationToken,
    );
  }

  /**
   * Yeni doğrulama token'ı üretir (kullanıcının eskileri silinir) ve HAM
   * token'ı döndürür. DB'de yalnız sha256 özeti durur: DB okuma yetkisi tek
   * başına bekleyen bir e-postayı doğrulamaya yetmesin.
   *
   * Private: ham token bir kimlik bilgisidir, onu üreten modülün dışına
   * çıkmaz — senkron ve kuyruklu gönderim yollarının ikisi de buradan geçer.
   */
  private async issueEmailVerificationToken(
    userId: string,
    email: string,
  ): Promise<string> {
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto
      .createHash("sha256")
      .update(verificationToken)
      .digest("hex");
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS);

    await this.prisma.emailVerificationToken.deleteMany({ where: { userId } });
    await this.prisma.emailVerificationToken.create({
      data: { userId, token: hashedToken, email, expiresAt },
    });

    return verificationToken;
  }

  /**
   * Aktivasyon mailini KUYRUĞA alır (gönderim değil).
   *
   * Admin toplu gönderiminin yolu: 500 kullanıcıya sırayla SMTP beklemek
   * isteği dakikalarca tutardı. Karşılığı, başarısızlığın anında görünmemesi —
   * sonuç Loglar → E-postalar'dan izlenir. Tekil gönderim bilinçli olarak
   * senkron kalır.
   *
   * Kuyruğa `send-template` işi yazılır; worker şablonu kendisi çözer ve
   * `renderManagedEmailTemplate` ile aynı çıktıyı üretir (override geçilmez).
   */
  async queueEmailVerification(userId: string): Promise<void> {
    const user = await this.loadUnverifiedUser(userId);
    const verificationToken = await this.issueEmailVerificationToken(
      userId,
      user.email,
    );
    const templateData = buildEmailVerificationTemplateData(
      user.displayName,
      verificationToken,
    );

    await this.emailQueue.add("send-template", {
      to: user.email,
      // Konu, senkron yolun `renderManagedEmailTemplate` içindeki varsayılanıyla
      // birebir aynı kaynaktan gelsin.
      subject: getEmailTemplateSubject(
        EMAIL_VERIFICATION_TEMPLATE,
        templateData,
      ),
      template: EMAIL_VERIFICATION_TEMPLATE,
      templateData: { ...templateData, userId },
      // Senkron yol her gönderimde bir notification_log satırı yazıyor; worker
      // hiç yazmıyordu. İki yol aynı denetim izini bıraksın.
      notificationLog: {
        userId,
        type: "email_verification",
        title: "E-posta Doğrulama",
      },
      // templateData CANLI token'lı linki taşıyor; EmailLog.metadata'ya
      // yazılsaydı token kalıcı olarak düz metin saklanırdı.
      redactTemplateData: true,
    });
  }

  /** Aktivasyon gönderiminin ortak ön koşulu: hesap var ve henüz doğrulanmamış. */
  private async loadUnverifiedUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        isEmailVerified: true,
      },
    });

    if (!user) {
      throw new NotFoundException(i18nMessage("server.auth.userNotFound"));
    }
    if (user.isEmailVerified) {
      throw new BadRequestException(
        i18nMessage("server.auth.emailAlreadyVerified"),
      );
    }
    return user;
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
  async resendEmailVerification(
    userId: string,
  ): Promise<EmailVerificationSendResult> {
    const user = await this.loadUnverifiedUser(userId);
    return this.sendEmailVerification(userId, user.email);
  }
}
