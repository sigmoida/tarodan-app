/**
 * SendGrid Email Provider
 * GAP-014: Real Notification Providers (Expo, SendGrid, SMS)
 *
 * Requirement: Email notifications (project.md)
 */
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";

export interface SendGridEmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  templateId?: string;
  dynamicTemplateData?: Record<string, any>;
  from?: string;
  replyTo?: string;
  attachments?: Array<{
    content: string;
    filename: string;
    type: string;
    disposition?: "attachment" | "inline";
  }>;
}

export interface SendGridResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

@Injectable()
export class SendGridProvider {
  private readonly logger = new Logger(SendGridProvider.name);
  private readonly apiKey: string;
  private readonly fromEmail: string;
  private readonly fromName: string;
  private readonly enabled: boolean;
  private readonly transporter: nodemailer.Transporter | null;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>("SENDGRID_API_KEY", "");
    this.fromEmail = this.configService.get<string>(
      "SENDGRID_FROM_EMAIL",
      "noreply@tarodan.com.tr",
    );
    this.fromName = this.configService.get<string>(
      "SENDGRID_FROM_NAME",
      "Tarodan",
    );
    this.enabled = !!this.apiKey && this.apiKey.startsWith("SG.");

    // SMTP transport (test→Mailhog, prod→gerçek SMTP). SMTP_HOST set ise SendGrid yerine bu kullanılır.
    const smtpHost = this.configService.get<string>("SMTP_HOST", "");
    if (smtpHost) {
      const smtpUser = this.configService.get<string>("SMTP_USER", "");
      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(this.configService.get<string>("SMTP_PORT", "1025"), 10),
        secure:
          this.configService.get<string>("SMTP_SECURE", "false") === "true",
        auth: smtpUser
          ? {
              user: smtpUser,
              pass: this.configService.get<string>("SMTP_PASS", ""),
            }
          : undefined,
      });
      this.logger.log(
        `SMTP transport aktif (${smtpHost}) — mailler SMTP ile gönderilecek.`,
      );
    } else {
      this.transporter = null;
      if (!this.enabled) {
        this.logger.warn(
          "SendGrid is not configured. Email notifications will be logged only.",
        );
      }
    }
  }

  /**
   * Send email via SendGrid API
   */
  async sendEmail(options: SendGridEmailOptions): Promise<SendGridResponse> {
    // SMTP öncelikli (test→Mailhog / prod SMTP)
    if (this.transporter) {
      try {
        const info = await this.transporter.sendMail({
          from: `"${this.fromName}" <${options.from || this.fromEmail}>`,
          to: options.to,
          subject: options.subject,
          html: options.html,
          text: options.text,
        });
        this.logger.log(
          `Email sent via SMTP to ${options.to}, ID: ${info.messageId}`,
        );
        return { success: true, messageId: info.messageId };
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        this.logger.error(`SMTP send failed to ${options.to}: ${msg}`);
        return { success: false, error: msg };
      }
    }

    if (!this.enabled) {
      this.logger.log(
        `[EMAIL-MOCK] To: ${options.to}, Subject: ${options.subject}`,
      );
      return { success: true, messageId: `mock-${Date.now()}` };
    }

    try {
      const payload = {
        personalizations: [
          {
            to: [{ email: options.to }],
            dynamic_template_data: options.dynamicTemplateData,
          },
        ],
        from: {
          email: options.from || this.fromEmail,
          name: this.fromName,
        },
        subject: options.subject,
        content: options.html
          ? [{ type: "text/html", value: options.html }]
          : options.text
            ? [{ type: "text/plain", value: options.text }]
            : undefined,
        template_id: options.templateId,
        attachments: options.attachments?.map((att) => ({
          content: att.content,
          filename: att.filename,
          type: att.type,
          disposition: att.disposition || "attachment",
        })),
      };

      const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`SendGrid error: ${response.status} - ${error}`);
        return {
          success: false,
          error: `SendGrid API error: ${response.status}`,
        };
      }

      const messageId =
        response.headers.get("x-message-id") || `sg-${Date.now()}`;
      this.logger.log(
        `Email sent via SendGrid to ${options.to}, ID: ${messageId}`,
      );

      return { success: true, messageId };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error(`Failed to send email via SendGrid: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Check if SendGrid is properly configured
   */
  isConfigured(): boolean {
    return this.enabled;
  }
}
