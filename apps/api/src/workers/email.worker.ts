/**
 * Email Worker
 * Processes email sending jobs from the `email` queue.
 *
 * Delivery is delegated to the shared SmtpProvider — this worker deliberately
 * owns no transport of its own, so queued mail cannot drift away from the rest
 * of the app's sender identity or TLS settings.
 */
import {
  Processor,
  Process,
  OnQueueFailed,
  OnQueueCompleted,
} from "@nestjs/bull";
import { Logger } from "@nestjs/common";
import { Job } from "bull";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma";
import { SmtpProvider } from "../modules/mail/smtp.provider";
import {
  renderEmailTemplate,
  getEmailTemplateSubject,
  extractEmailTemplateVariables,
  renderStoredEmailTemplate,
} from "../common/helpers/email-template-renderer";

export interface EmailJobData {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  template?: string;
  templateData?: Record<string, any>;
  overrideHtml?: string;
  overrideSubject?: string;
  from?: string;
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

@Processor("email")
export class EmailWorker {
  private readonly logger = new Logger(EmailWorker.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly smtp: SmtpProvider,
  ) {}

  @Process("send")
  async handleSend(job: Job<EmailJobData>) {
    this.logger.log(`Processing email job ${job.id} to ${job.data.to}`);

    const {
      to,
      subject,
      html,
      text,
      from,
      replyTo,
      attachments,
      template,
      templateData,
    } = job.data;
    if (!html) throw new Error("Email HTML content is required");
    const fromEmail = from || this.smtp.defaultFrom;

    // EmailLog kaydı ARTIK BURADA YAZILMAZ: tek yazar SmtpProvider.sendEmail
    // (her gönderim oradan geçer). Burada da yazsaydık kuyruktan giden
    // e-postalar iki satır üretirdi. Şablon/kullanıcı bağlamı yalnız burada
    // bilindiği için sendEmail'e parametre olarak geçirilir.
    //
    // SmtpProvider handles the unconfigured case itself (logs and reports a
    // mock message id), so there is no separate mock branch here.
    const result = await this.smtp.sendEmail({
      from: fromEmail,
      to,
      subject,
      html,
      text: text || this.stripHtml(html),
      replyTo,
      attachments,
      template: template || undefined,
      userId: (templateData as Record<string, any>)?.userId || undefined,
      metadata: templateData
        ? (templateData as Record<string, unknown>)
        : undefined,
    });

    if (result.success) {
      this.logger.log(
        `Email sent successfully to ${to}, messageId: ${result.messageId}`,
      );
      return { success: true, messageId: result.messageId };
    }

    const errorMessage = result.error || "Unknown SMTP error";
    this.logger.error(`Failed to send email to ${to}: ${errorMessage}`);

    // Rethrow so Bull records the failure and applies its retry policy —
    // SmtpProvider swallows transport errors into a result object.
    throw new Error(errorMessage);
  }

  @Process("send-template")
  async handleSendTemplate(job: Job<EmailJobData>) {
    this.logger.log(`Processing template email job ${job.id}`);

    const { to, template, templateData, overrideHtml, overrideSubject } =
      job.data;
    // Some producers pass the payload under `data` instead of `templateData` — accept both
    // so the template always receives its variables (otherwise it renders empty/blank).
    const data = templateData || (job.data as any).data || {};

    if (!template) {
      throw new Error("Template name is required");
    }

    const frontendUrl =
      this.configService.get<string>("FRONTEND_URL") ||
      (this.configService.get("NODE_ENV") === "production"
        ? "https://tarodan.com.tr"
        : "http://localhost:3000");
    const brand = {
      frontendUrl,
      logoUrl:
        this.configService.get<string>("EMAIL_LOGO_URL") ||
        `${frontendUrl.replace(/\/+$/, "")}/tarodan-logo.jpg`,
      supportEmail:
        this.configService.get<string>("SUPPORT_EMAIL") ||
        "destek@tarodan.com.tr",
    };
    const renderData = { ...data, to };

    // Check DB for custom template first
    const dbTemplate = await this.prisma.emailTemplate.findUnique({
      where: { key: template },
    });
    let html: string;
    let subject: string;
    const customBody = overrideHtml?.trim() || dbTemplate?.bodyHtml?.trim();
    if (customBody) {
      const rendered = renderStoredEmailTemplate(
        customBody,
        overrideSubject?.trim() ||
          dbTemplate?.subject?.trim() ||
          job.data.subject?.trim() ||
          getEmailTemplateSubject(template, renderData),
        renderData,
        brand,
      );
      html = rendered.html;
      subject = rendered.subject;
    } else {
      html = renderEmailTemplate(template, renderData, brand);
      subject =
        overrideSubject?.trim() ||
        job.data.subject ||
        getEmailTemplateSubject(template, renderData);
    }

    const unresolved = extractEmailTemplateVariables(`${subject}\n${html}`);
    if (unresolved.length > 0) {
      this.logger.warn(
        `Email template "${template}" has unresolved variables: ${unresolved.join(", ")}`,
      );
    }

    return this.handleSend({
      ...job,
      data: { ...job.data, html, subject },
    } as Job<EmailJobData>);
  }

  @OnQueueCompleted()
  onCompleted(job: Job) {
    this.logger.log(`Email job ${job.id} completed`);
  }

  @OnQueueFailed()
  onFailed(job: Job, error: Error) {
    this.logger.error(`Email job ${job.id} failed: ${error.message}`);
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, "");
  }
}
