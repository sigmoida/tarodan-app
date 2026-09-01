/**
 * Notification Account Notifiers
 * Welcome / password-reset / email-verification / guest-checkout / guest-contact
 * template senders. Delegates delivery to the shared NotificationDispatchService.
 */
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma";
import { SmtpProvider } from "../mail/smtp.provider";
import {
  escapeEmailHtml,
  renderManagedEmailTemplate,
  wrapEmailTemplateLayout,
} from "../../common/helpers/email-template-renderer";
import { NotificationDispatchService } from "./notification-dispatch.service";
import {
  frontendUrl as resolveFrontendUrl,
  frontendUrlForEnvironment,
  LOCAL_FRONTEND_URL,
} from "../../config/app-urls";
import {
  buildEmailVerificationTemplateData,
  EMAIL_VERIFICATION_TEMPLATE,
} from "../../common/helpers/email-verification-mail";

@Injectable()
export class NotificationAccountService {
  private readonly logger = new Logger(NotificationAccountService.name);

  constructor(
    private readonly dispatch: NotificationDispatchService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly smtpProvider: SmtpProvider,
  ) {}

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, displayName: true },
    });
    if (!user) return { success: false, error: "User not found" };
    const frontendUrl = resolveFrontendUrl();
    await this.dispatch.sendTemplateEmailToAddress(user.email, "welcome", {
      name: user.displayName || "",
      verifyUrl: `${frontendUrl}/listings`,
    });
    return { success: true };
  }

  /**
   * Yeni misafir (guest) iletişim formu mesajı geldiğinde destek ekibine bildirim
   * maili gönderir. Hedef adres SUPPORT_NOTIFICATION_EMAIL env'inden, yoksa
   * uygulama genelinde standart olan destek@tarodan.com.tr'ye gider. Provider seçimi
   * şifre sıfırlama akışıyla aynı (SendGrid → SMTP fallback). Çağrı fire-and-forget
   * yapılmalı: mail hatası iletişim mesajının kaydını bozmamalı.
   */
  async sendGuestContactAdminEmail(data: {
    referenceNumber: string;
    name: string;
    email: string;
    subject: string;
    message: string;
  }) {
    const adminEmail =
      this.configService.get<string>("SUPPORT_NOTIFICATION_EMAIL") ||
      "destek@tarodan.com.tr";
    // Subject bir mail başlığıdır: guest girdisindeki CR/LF header injection'a
    // yol açabilir. Satır sonlarını boşluğa çevirip kırp (defense-in-depth).
    const safeSubject = String(data.subject ?? "")
      .replace(/[\r\n]+/g, " ")
      .trim();
    const subject = `Yeni İletişim Mesajı: ${safeSubject} (${data.referenceNumber})`;
    const content = `
      <h2>Yeni iletişim formu mesajı</h2>
      <p><strong>Referans:</strong> ${escapeEmailHtml(data.referenceNumber)}</p>
      <p><strong>Ad:</strong> ${escapeEmailHtml(data.name)}</p>
      <p><strong>E-posta:</strong> ${escapeEmailHtml(data.email)}</p>
      <p><strong>Konu:</strong> ${escapeEmailHtml(data.subject)}</p>
      <p><strong>Mesaj:</strong></p>
      <p style="white-space:pre-wrap">${escapeEmailHtml(data.message)}</p>
    `;
    const frontendUrl = resolveFrontendUrl();
    const html = wrapEmailTemplateLayout(
      content,
      subject,
      { to: adminEmail },
      {
        frontendUrl,
        logoUrl:
          this.configService.get<string>("EMAIL_LOGO_URL") ||
          `${frontendUrl.replace(/\/+$/, "")}/tarodan-logo.jpg`,
        supportEmail: adminEmail,
      },
    );

    if (!this.smtpProvider.isConfigured()) {
      this.logger.warn("Guest contact bildirimi için SMTP yapılandırılmamış");
      return { success: false, error: "No email provider configured" };
    }
    const result = await this.smtpProvider.sendEmail({
      to: adminEmail,
      subject,
      html,
      template: "guest-contact-admin",
      // Destek kutusunda "Yanıtla" doğrudan müşteriye gitsin. Gönderen kimliği
      // MAIL_FROM olmak zorunda (SMTP sağlayıcısı eşleşme istiyor), o yüzden
      // müşteri adresi from'a değil replyTo'ya konur. CRLF header injection'a
      // karşı satır sonları temizlenir — subject ile aynı savunma.
      replyTo: String(data.email ?? "")
        .replace(/[\r\n]+/g, " ")
        .trim(),
    });

    if (result.success) {
      this.logger.log(
        `Guest contact bildirim maili gönderildi: ${data.referenceNumber} → ${adminEmail}`,
      );
    } else {
      this.logger.error(
        `Guest contact bildirim maili başarısız (${data.referenceNumber}): ${result.error}`,
      );
    }
    return result;
  }

  /**
   * Send password reset email using SendGrid or SMTP
   */
  async sendPasswordResetEmail(userId: string, resetToken: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, displayName: true },
    });

    if (!user) return { success: false, error: "User not found" };

    const frontendUrl = resolveFrontendUrl(LOCAL_FRONTEND_URL);
    const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;
    const displayName = user.displayName || "";
    // displayName: name'in takma adı — legacy admin şablonları {{displayName}} kullanıyor.
    const templateData = { name: displayName, displayName, resetUrl };

    const dbTemplate = await this.prisma.emailTemplate.findUnique({
      where: { key: "password-reset" },
    });
    const email = renderManagedEmailTemplate(
      "password-reset",
      { ...templateData, to: user.email },
      dbTemplate,
      frontendUrl,
    );

    let result;
    if (this.smtpProvider.isConfigured()) {
      result = await this.smtpProvider.sendEmail({
        to: user.email,
        subject: email.subject,
        html: email.html,
        // EmailLog satırı şablonu bilsin (filtre/denetim için). Bu noktada
        // yalnız e-posta+ad taşınıyor; kullanıcı kimliği kapsamda değil.
        template: "password-reset",
      });
    } else {
      this.logger.warn("SMTP is not configured for password reset email");
      result = { success: false, error: "No email provider configured" };
    }

    await this.dispatch.logNotification(
      userId,
      "email",
      "password_reset",
      "Şifre Sıfırlama",
      "",
      result.success,
    );

    if (result.success) {
      this.logger.log(`Password reset email sent to ${user.email}`);
    } else {
      this.logger.error(
        `Failed to send password reset email to ${user.email}: ${result.error}`,
      );
    }

    return result;
  }

  /**
   * Send email verification using SendGrid or SMTP
   */
  async sendEmailVerification(userId: string, verificationToken: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, displayName: true },
    });

    if (!user) return { success: false, error: "User not found" };

    // Link ve süre metni kuyruklu yolla ORTAK helper'dan gelir; iki yolun
    // farklı host'a işaret etmesi mümkün olmasın.
    const frontendUrl = frontendUrlForEnvironment();
    const templateData = buildEmailVerificationTemplateData(
      user.displayName,
      verificationToken,
    );

    const dbTemplate = await this.prisma.emailTemplate.findUnique({
      where: { key: EMAIL_VERIFICATION_TEMPLATE },
    });
    const email = renderManagedEmailTemplate(
      EMAIL_VERIFICATION_TEMPLATE,
      { ...templateData, to: user.email },
      dbTemplate,
      frontendUrl,
    );

    let result;
    if (this.smtpProvider.isConfigured()) {
      result = await this.smtpProvider.sendEmail({
        to: user.email,
        subject: email.subject,
        html: email.html,
        template: "email-verification",
      });
    } else {
      this.logger.warn("SMTP is not configured for email verification");
      result = { success: false, error: "No email provider configured" };
    }

    await this.dispatch.logNotification(
      userId,
      "email",
      "email_verification",
      "E-posta Doğrulama",
      "",
      result.success,
    );

    if (result.success) {
      this.logger.log(`Email verification sent to ${user.email}`);
    } else {
      this.logger.error(
        `Failed to send email verification to ${user.email}: ${result.error}`,
      );
    }

    return result;
  }

  /**
   * Misafir checkout — 6 haneli OTP e-postası (kayıtlı hesap doğrulamasından bağımsız)
   */
  async sendGuestCheckoutVerificationCode(
    email: string,
    code: string,
    ttlSeconds: number,
  ) {
    return this.dispatch.sendTemplateEmailToAddress(
      email,
      "guest-checkout-otp",
      {
        code,
        expiresInMinutes: Math.ceil(ttlSeconds / 60),
      },
    );
  }

  /**
   * E-posta değişikliği — 6 haneli aktivasyon kodunu YENİ adrese gönderir.
   */
  async sendEmailChangeCode(email: string, code: string, ttlSeconds: number) {
    return this.dispatch.sendTemplateEmailToAddress(email, "email-change-otp", {
      code,
      expiresInMinutes: Math.ceil(ttlSeconds / 60),
    });
  }
}
