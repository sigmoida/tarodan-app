/**
 * Email Worker
 * Processes email sending jobs via SendGrid
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
import * as nodemailer from "nodemailer";
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
  private transporter: nodemailer.Transporter | null;
  private readonly enabled: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    // Initialize SMTP transporter (Gmail or other SMTP provider)
    const host = this.configService.get<string>("SMTP_HOST", "");
    const port = this.configService.get<number>("SMTP_PORT", 587);
    const user = this.configService.get<string>("SMTP_USER", "");
    const pass = this.configService.get<string>("SMTP_PASS", "");
    const secure =
      this.configService.get<string>("SMTP_SECURE", "false") === "true";

    this.enabled = Boolean(host);

    if (this.enabled) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        ...(user && pass ? { auth: { user, pass } } : {}),
        tls: {
          rejectUnauthorized: false,
        },
      });
      this.logger.log(`Email worker initialized with SMTP: ${host}:${port}`);
    } else {
      this.logger.warn("SMTP not configured - emails will be logged only");
      // Create a mock transporter that just logs
      this.transporter = null;
    }
  }

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
    const fromEmail =
      from ||
      this.configService.get<string>("MAIL_FROM") ||
      "noreply@tarodan.com.tr";

    // Create EmailLog entry with 'queued' status
    let emailLog: any = null;
    try {
      emailLog = await this.prisma.emailLog.create({
        data: {
          to,
          from: fromEmail,
          subject,
          template: template || null,
          status: "queued",
          provider: this.enabled ? "smtp" : "mock",
          userId: (templateData as Record<string, any>)?.userId || null,
          metadata: templateData ? (templateData as any) : undefined,
        },
      });
    } catch (logError) {
      this.logger.warn(`Failed to create email log: ${logError.message}`);
    }

    // If SMTP not configured, just log and return success
    if (!this.enabled || !this.transporter) {
      this.logger.log(`[EMAIL-MOCK] To: ${to}, Subject: ${subject}`);

      // Update log status to sent (mock)
      if (emailLog) {
        await this.prisma.emailLog
          .update({
            where: { id: emailLog.id },
            data: {
              status: "sent",
              sentAt: new Date(),
              messageId: `mock-${Date.now()}`,
            },
          })
          .catch(() => {});
      }

      return { success: true, messageId: `mock-${Date.now()}` };
    }

    try {
      const mailOptions: nodemailer.SendMailOptions = {
        from: fromEmail,
        to,
        subject,
        html,
        text: text || this.stripHtml(html),
        replyTo,
        attachments,
      };

      const result = await this.transporter.sendMail(mailOptions);
      this.logger.log(
        `Email sent successfully to ${to}, messageId: ${result.messageId}`,
      );

      // Update log status to sent
      if (emailLog) {
        await this.prisma.emailLog
          .update({
            where: { id: emailLog.id },
            data: {
              status: "sent",
              sentAt: new Date(),
              messageId: result.messageId,
            },
          })
          .catch(() => {});
      }

      return { success: true, messageId: result.messageId };
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}: ${error.message}`);

      // Update log status to failed
      if (emailLog) {
        await this.prisma.emailLog
          .update({
            where: { id: emailLog.id },
            data: { status: "failed", errorMessage: error.message },
          })
          .catch(() => {});
      }

      throw error;
    }
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
