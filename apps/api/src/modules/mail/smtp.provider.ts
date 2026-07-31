/**
 * SMTP Email Provider using Nodemailer.
 *
 * The single outbound mail transport for the whole API — notification dispatch,
 * the `email` queue worker, invoices and marketing all send through this class.
 * Do not stand up another `nodemailer.createTransport()` elsewhere: each one is
 * a separate connection pool with its own (drifting) From address and TLS
 * policy, which is exactly how the old SendGrid provider ended up mailing from
 * a different sender than the rest of the app.
 *
 * Sender identity comes from MAIL_FROM and nothing else. Most shared hosts
 * (including mail.akilliticaret.com) require the From address to match the
 * authenticated SMTP_USER, so overriding `from` per-call will usually be
 * rejected by the server.
 */
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";

export interface SmtpEmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  from?: string;
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

export interface SmtpResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

@Injectable()
export class SmtpProvider {
  private readonly logger = new Logger(SmtpProvider.name);
  private transporter: nodemailer.Transporter | null = null;
  private readonly fromEmail: string;
  private readonly enabled: boolean;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>("SMTP_HOST", "");
    // .env values arrive as strings; nodemailer wants a number for `port`.
    const port = Number.parseInt(
      this.configService.get<string>("SMTP_PORT", "587"),
      10,
    );
    const user = this.configService.get<string>("SMTP_USER", "");
    const pass = this.configService.get<string>("SMTP_PASS", "");
    const secure =
      this.configService.get<string>("SMTP_SECURE", "false") === "true";
    // Shared hosting often serves a certificate that does not match the mail
    // hostname, which would abort STARTTLS. Default stays permissive to keep
    // delivery working; set SMTP_TLS_REJECT_UNAUTHORIZED=true once the host is
    // known to present a valid certificate.
    const rejectUnauthorized =
      this.configService.get<string>(
        "SMTP_TLS_REJECT_UNAUTHORIZED",
        "false",
      ) === "true";

    this.fromEmail = this.configService.get<string>(
      "MAIL_FROM",
      "info@tarodan.com.tr",
    );
    // Host yeterli (Mailhog/dev auth istemez); user+pass varsa auth uygulanır (prod).
    this.enabled = !!host;

    if (this.enabled) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: user && pass ? { user, pass } : undefined,
        tls: {
          rejectUnauthorized,
        },
      });

      // Verify connection
      this.transporter.verify((error) => {
        if (error) {
          this.logger.error(`SMTP connection failed: ${error.message}`);
        } else {
          this.logger.log(`SMTP connected to ${host}:${port} as ${user}`);
        }
      });
    } else {
      this.logger.warn(
        "SMTP is not configured. Email notifications will be logged only.",
      );
    }
  }

  /**
   * Send email via SMTP
   */
  async sendEmail(options: SmtpEmailOptions): Promise<SmtpResponse> {
    if (!this.enabled || !this.transporter) {
      this.logger.log(
        `[EMAIL-MOCK] To: ${options.to}, Subject: ${options.subject}`,
      );
      if (options.html) {
        this.logger.debug(
          `[EMAIL-MOCK] HTML content length: ${options.html.length}`,
        );
      }
      return { success: true, messageId: `mock-${Date.now()}` };
    }

    try {
      const mailOptions: nodemailer.SendMailOptions = {
        from: options.from || this.fromEmail,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        replyTo: options.replyTo,
        attachments: options.attachments?.map((att) => ({
          filename: att.filename,
          content: att.content,
          contentType: att.contentType,
        })),
      };

      const info = await this.transporter.sendMail(mailOptions);

      this.logger.log(
        `Email sent via SMTP to ${options.to}, ID: ${info.messageId}`,
      );

      return { success: true, messageId: info.messageId };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error(`Failed to send email via SMTP: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Check if SMTP is properly configured
   */
  isConfigured(): boolean {
    return this.enabled;
  }

  /**
   * The configured MAIL_FROM identity. Exposed so callers that persist an audit
   * trail (EmailLog) can record the same sender the transport will actually use,
   * instead of re-deriving it from config and drifting.
   */
  get defaultFrom(): string {
    return this.fromEmail;
  }
}
