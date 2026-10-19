/**
 * Notification Account Notifiers
 * Welcome / password-reset / email-verification / guest-checkout template
 * senders. Delegates delivery to the shared NotificationDispatchService. (The
 * guest contact staff notice moved to Mail Routing: MailInternalNotifier.)
 */
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma";
import { SmtpProvider } from "../mail/smtp.provider";
import { renderManagedEmailTemplate } from "../../common/helpers/email-template-renderer";
import { NotificationDispatchService } from "./notification-dispatch.service";
import { frontendUrlForEnvironment } from "../../config/app-urls";
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
    const frontendUrl = frontendUrlForEnvironment();
    await this.dispatch.sendTemplateEmailToAddress(user.email, "welcome", {
      name: user.displayName || "",
      verifyUrl: `${frontendUrl}/listings`,
    });
    return { success: true };
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

    const frontendUrl = frontendUrlForEnvironment();
    const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;
    const displayName = user.displayName || "";
    // displayName: alias of name; legacy admin templates use {{displayName}}.
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

    const smtpConfigured = this.smtpProvider.isConfigured();
    let result;
    if (smtpConfigured) {
      result = await this.smtpProvider.sendEmail({
        to: user.email,
        subject: email.subject,
        html: email.html,
        // Lets the EmailLog row record the template (filtering/audit). Only
        // the address and name are carried here; the user id is out of scope.
        template: "password-reset",
      });
    } else {
      // The caller still answers 200 (no account enumeration), so the dropped
      // reset must surface here: error-level lines are forwarded to Sentry.
      this.logger.error(
        `Password reset email dropped, SMTP is not configured (userId=${userId})`,
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
      this.logger.log(`Password reset email sent (userId=${userId})`);
    } else if (smtpConfigured) {
      this.logger.error(
        `Failed to send password reset email (userId=${userId}): ${result.error}`,
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
      this.logger.log(`Email verification sent (userId=${userId})`);
    } else {
      this.logger.error(
        `Failed to send email verification (userId=${userId}): ${result.error}`,
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
