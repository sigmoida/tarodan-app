/**
 * Notification Account Notifiers
 * Welcome / password-reset / email-verification / guest-checkout template
 * senders. Delegates delivery to the shared NotificationDispatchService. (The
 * guest contact staff notice moved to Mail Routing: MailInternalNotifier.)
 */
import { InjectQueue } from "@nestjs/bull";
import { Injectable, Logger } from "@nestjs/common";
import { Queue } from "bull";
import { ConfigService } from "@nestjs/config";
import { redactString } from "@tarodan/logger";
import { PrismaService } from "../../prisma";
import { SmtpProvider } from "../mail/smtp.provider";
import { renderManagedEmailTemplate } from "../../common/helpers/email-template-renderer";
import { NotificationDispatchService } from "./notification-dispatch.service";
import { QUEUE_NAMES } from "../../workers/constants";
import {
  ACCOUNT_SECURITY_NOTICE_TEMPLATE,
  buildAccountSecurityNoticeData,
  type AccountSecurityNoticeDetails,
  type AccountSecurityNoticeEvent,
} from "../../common/helpers/account-security-notice-mail";
import { getEmailTemplateSubject } from "../../common/helpers/email-template-renderer";
import {
  buildGuestOrdersClaimedMailData,
  GUEST_ORDERS_CLAIMED_TEMPLATE,
} from "../../common/helpers/guest-orders-claimed-mail";
import { defaultLocale, isLocale } from "@tarodan/i18n";
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
    @InjectQueue(QUEUE_NAMES.EMAIL) private readonly emailQueue: Queue,
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
        // Lets the EmailLog row record the template and the user, so support
        // can check per user whether a reset mail went out.
        template: "password-reset",
        userId,
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
        // SMTP rejections often quote the recipient address; this line
        // reaches Sentry, so the provider text is scrubbed first.
        `Failed to send password reset email (userId=${userId}): ${redactString(result.error ?? "")}`,
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

    // The link and the expiry text come from the SAME helper as the queued
    // path, so the two can never point at different hosts.
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
        userId,
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
        `Failed to send email verification (userId=${userId}): ${redactString(result.error ?? "")}`,
      );
    }

    return result;
  }

  /**
   * Tells the account owner that a sign-in method changed (provider linked or
   * unlinked, password set). Queued on the e-mail queue; it never throws and
   * never waits for delivery, so a mail failure cannot fail or slow the
   * security action that triggered it. Logs and Sentry get the user id only.
   * The payload is kept out of `EmailLog.metadata` (`redactTemplateData`).
   */
  async sendAccountSecurityNotice(
    userId: string,
    event: AccountSecurityNoticeEvent,
    details: AccountSecurityNoticeDetails = {},
  ): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, displayName: true },
      });
      if (!user) return;

      const templateData = buildAccountSecurityNoticeData({
        event,
        name: user.displayName,
        ...details,
      });
      await this.emailQueue.add("send-template", {
        to: user.email,
        subject: getEmailTemplateSubject(
          ACCOUNT_SECURITY_NOTICE_TEMPLATE,
          templateData,
        ),
        template: ACCOUNT_SECURITY_NOTICE_TEMPLATE,
        templateData: { ...templateData, userId },
        redactTemplateData: true,
      });
    } catch (error) {
      this.logger.error(
        `Failed to queue account security notice (userId=${userId}, event=${event}): ${redactString(error instanceof Error ? error.message : String(error))}`,
      );
    }
  }

  /**
   * Tells the account owner that guest orders bought with their e-mail were
   * added to the account, with the password reset as the way out if they
   * did not create it. Transactional (no marketing consent, no preference
   * gate), in the recipient's language. Queued on the e-mail queue after the
   * claim committed; the payload holds the count and links only and stays
   * out of `EmailLog.metadata`. Throws when the mail could not be queued so
   * the caller decides; a missing user sends nothing.
   */
  async sendGuestOrdersClaimedNotice(
    userId: string,
    orderCount: number,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, preferredLanguage: true },
    });
    if (!user) return;
    const locale = isLocale(user.preferredLanguage)
      ? user.preferredLanguage
      : defaultLocale;
    const templateData = buildGuestOrdersClaimedMailData(locale, orderCount);
    await this.emailQueue.add("send-template", {
      to: user.email,
      subject: templateData.subject,
      template: GUEST_ORDERS_CLAIMED_TEMPLATE,
      templateData: { ...templateData, userId },
      redactTemplateData: true,
    });
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
