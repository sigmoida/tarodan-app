import {
  Injectable,
  Logger,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import * as bcrypt from "bcrypt";
import * as crypto from "crypto";
import { PrismaService } from "../../prisma";
import {
  RegisterDto,
  BusinessRegisterDto,
  CorporateInvitationDto,
  RegisterResponseDto,
} from "./dto";
import { ConsentSource, SellerType, Prisma } from "@prisma/client";
import { NotificationService } from "../notification/notification.service";
import { NewsletterService } from "../marketing/newsletter.service";
import { ConsentService } from "../consent/consent.service";
import { LegalIdentityService } from "../legal-identity/legal-identity.service";
import {
  isNationalIdUniqueViolation,
  nationalIdUnavailable,
  normalizeLegalIdentityInput,
} from "../legal-identity/helpers/legal-identity-status";
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
import { GuestOrderClaimRequestService } from "./verification/guest-order-claim-request.service";

/** Aktivasyon mailinin gönderim sonucu (NotificationAccountService sözleşmesi). */
export interface EmailVerificationSendResult {
  success: boolean;
  error?: string;
}

/** Hesap tipi öneki — yalnızca bireysel (B) veya kurumsal (K). */
type EntityUserPrefix =
  typeof ENTITY_PREFIX.individualUser | typeof ENTITY_PREFIX.corporateUser;

/**
 * Account opening: individual and corporate registration, corporate
 * invitation activation and e-mail verification. Moved from AuthService as
 * is. Guest orders are claimed when the e-mail becomes verified (link,
 * corporate activation, admin), never at registration: an unproven
 * registrant must not hold another person's orders.
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
    @InjectQueue(QUEUE_NAMES.EMAIL) private readonly emailQueue: Queue,
    private readonly consents: ConsentService,
    private readonly legalIdentity: LegalIdentityService,
    private readonly guestOrderClaims: GuestOrderClaimRequestService,
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
    // TCKN yarışı: ön-kontrolle AYNI yanıt (başka hesap hakkında bilgi yok).
    if (isNationalIdUniqueViolation(error)) throw nationalIdUnavailable();
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

    // Yasal kimlik: gönderildiyse yazılır (DTO doğruladı), gönderilmediyse
    // (eski mobil) hesap açılır ve kimlik kapısı ilk girişte ister. TCKN
    // gönderildiyse kayıt ucu da bir "numara kayıtlı mı" kahinidir: kapıyla
    // aynı IP bütçesinden harcar ve aynı genel yanıtı verir.
    const legalIdentity = normalizeLegalIdentityInput(dto);
    if (legalIdentity.nationalId) {
      await this.legalIdentity.consumeLookupBudget(null);
      await this.legalIdentity.assertNationalIdAvailable(
        legalIdentity.nationalId,
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

    // Kullanıcı ve formdaki onaylar TEK transaction'da: onay kaydı yazılamazsa
    // hesap da açılmaz — "kayıt oldu ama onayı yok" ara durumu oluşmaz.
    let user;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            adminCode,
            username,
            usernameClaimedAt: new Date(),
            email: dto.email,
            phone: dto.phone,
            passwordHash,
            displayName: dto.displayName,
            ...legalIdentity,
            birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
            isSeller: dto.isSeller ?? false,
            sellerType: dto.isSeller ? SellerType.individual : null,
            isVerified: false, // Email verification required
            isEmailVerified: false, // Will be true after email verification
            acceptsMarketingEmails: marketingConsent,
          },
        });
        // Terms, privacy ve KVKK ayrı satırlar. Göndermeyen (eski mobil)
        // istemcide satır yok; yeniden-onay kapısı ilk girişte ister.
        await this.consents.recordAccountConsents(
          created.id,
          dto.acceptedConsents,
          ConsentSource.registration,
          tx,
        );
        if (marketingConsent) {
          await this.consents.recordMarketingChange(
            {
              userId: created.id,
              granted: true,
              source: ConsentSource.registration,
            },
            tx,
          );
        }
        return created;
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

    // Send email verification
    await this.sendEmailVerification(user.id, user.email);

    // Send welcome email if user accepted marketing emails
    if (marketingConsent) {
      try {
        await this.notificationService.sendWelcomeEmail(user.id);
      } catch (error) {
        this.logger.error(
          `Failed to send welcome email to user ${user.id}: ${errorMessage(error)}`,
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

    // One transaction: the token is spent (compare-and-set, so a double
    // click or a mail client's link preview verifies once), the e-mail is
    // verified and the guest order claim is requested.
    const claimKey = await this.prisma.$transaction(async (tx) => {
      const spent = await tx.emailVerificationToken.updateMany({
        where: { id: verificationToken.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (spent.count === 0) return null;
      await tx.user.update({
        where: { id: verificationToken.userId },
        data: { isEmailVerified: true },
      });
      return this.guestOrderClaims.request(tx, verificationToken.userId);
    });
    // A concurrent request spent the link first and verified the e-mail.
    if (claimKey === null) return { alreadyVerified: true };
    await this.guestOrderClaims.flush(claimKey);

    // #224: the success message is built per locale by
    // AuthController.verifyEmail() (server.auth.emailVerificationSuccess).
    return { alreadyVerified: false };
  }

  /**
   * Admin "verify e-mail": as if the user had clicked the link (decision D2
   * of the guest claim plan). The e-mail is verified, open links are spent
   * and the guest order claim is requested, in one transaction; the claim
   * runs after commit. The admin caller checks the account and writes the
   * audit log.
   */
  async markEmailVerifiedByAdmin(
    userId: string,
  ): Promise<{ isEmailVerified: boolean }> {
    const { updated, claimKey } = await this.prisma.$transaction(async (tx) => {
      const row = await tx.user.update({
        where: { id: userId },
        data: { isEmailVerified: true },
        select: { isEmailVerified: true },
      });
      await tx.emailVerificationToken.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: new Date() },
      });
      return {
        updated: row,
        claimKey: await this.guestOrderClaims.request(tx, userId),
      };
    });
    await this.guestOrderClaims.flush(claimKey);
    return { isEmailVerified: updated.isEmailVerified };
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
    let claimKey: string;
    try {
      ({ user, claimKey } = await this.prisma.$transaction(async (tx) => {
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
        // The invitation went to the company e-mail, so it is verified here.
        return {
          user: created,
          claimKey: await this.guestOrderClaims.request(tx, created.id),
        };
      }));
    } catch (error) {
      this.rethrowUserUniqueConstraint(error);
    }
    await this.guestOrderClaims.flush(claimKey);

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
