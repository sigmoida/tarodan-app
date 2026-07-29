/**
 * Notification Account Notifiers
 * Welcome / password-reset / email-verification / guest-checkout / guest-contact
 * template senders. Delegates delivery to the shared NotificationDispatchService.
 */
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma";
import { SendGridProvider } from "./providers/sendgrid.provider";
import { SmtpProvider } from "./providers/smtp.provider";
import {
  escapeEmailHtml,
  renderManagedEmailTemplate,
  wrapEmailTemplateLayout,
} from "../../common/helpers/email-template-renderer";
import { NotificationDispatchService } from "./notification-dispatch.service";

@Injectable()
export class NotificationAccountService {
  private readonly logger = new Logger(NotificationAccountService.name);

  constructor(
    private readonly dispatch: NotificationDispatchService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly sendGridProvider: SendGridProvider,
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
    const frontendUrl =
      this.configService.get("FRONTEND_URL") || "https://tarodan.com.tr";
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
    const frontendUrl =
      this.configService.get<string>("FRONTEND_URL") ||
      "https://tarodan.com.tr";
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

    let result;
    if (this.sendGridProvider.isConfigured()) {
      result = await this.sendGridProvider.sendEmail({
        to: adminEmail,
        subject,
        html,
      });
    } else if (this.smtpProvider.isConfigured()) {
      result = await this.smtpProvider.sendEmail({
        to: adminEmail,
        subject,
        html,
      });
    } else {
      this.logger.warn(
        "Guest contact bildirimi için mail sağlayıcı (SendGrid/SMTP) yapılandırılmamış",
      );
      return { success: false, error: "No email provider configured" };
    }

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

    const frontendUrl =
      this.configService.get("FRONTEND_URL") || "http://localhost:3000";
    const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;
    const templateData = { name: user.displayName || "", resetUrl };

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
    if (this.sendGridProvider.isConfigured()) {
      result = await this.sendGridProvider.sendEmail({
        to: user.email,
        subject: email.subject,
        html: email.html,
      });
    } else if (this.smtpProvider.isConfigured()) {
      result = await this.smtpProvider.sendEmail({
        to: user.email,
        subject: email.subject,
        html: email.html,
      });
    } else {
      this.logger.warn(
        "Neither SendGrid nor SMTP is configured for password reset email",
      );
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

    const frontendUrl =
      this.configService.get("FRONTEND_URL") || "http://localhost:3000";
    const verifyUrl = `${frontendUrl}/verify-email?token=${verificationToken}`;
    const displayName = user.displayName || "";
    const templateData = {
      name: displayName,
      displayName,
      verificationUrl: verifyUrl,
      expiresIn: "24 saat",
    };

    const dbTemplate = await this.prisma.emailTemplate.findUnique({
      where: { key: "email-verification" },
    });
    const email = renderManagedEmailTemplate(
      "email-verification",
      { ...templateData, to: user.email },
      dbTemplate,
      frontendUrl,
    );

    let result;
    if (this.sendGridProvider.isConfigured()) {
      result = await this.sendGridProvider.sendEmail({
        to: user.email,
        subject: email.subject,
        html: email.html,
      });
    } else if (this.smtpProvider.isConfigured()) {
      result = await this.smtpProvider.sendEmail({
        to: user.email,
        subject: email.subject,
        html: email.html,
      });
    } else {
      this.logger.warn(
        "Neither SendGrid nor SMTP is configured for email verification",
      );
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
