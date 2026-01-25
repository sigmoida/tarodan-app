/**
 * SMTP Email Provider using Nodemailer
 * Sends emails via configured SMTP server
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

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
    const host = this.configService.get<string>('SMTP_HOST', '');
    const port = this.configService.get<number>('SMTP_PORT', 587);
    const user = this.configService.get<string>('SMTP_USER', '');
    const pass = this.configService.get<string>('SMTP_PASS', '');
    const secure = this.configService.get<string>('SMTP_SECURE', 'false') === 'true';
    
    this.fromEmail = this.configService.get<string>('MAIL_FROM', 'noreply@tarodan.com');
    this.enabled = !!(host && user && pass);

    if (this.enabled) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: {
          user,
          pass,
        },
        tls: {
          // For Office 365, we need to allow less secure TLS
          rejectUnauthorized: false,
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
      this.logger.warn('SMTP is not configured. Email notifications will be logged only.');
    }
  }

  /**
   * Send email via SMTP
   */
  async sendEmail(options: SmtpEmailOptions): Promise<SmtpResponse> {
    if (!this.enabled || !this.transporter) {
      this.logger.log(`[EMAIL-MOCK] To: ${options.to}, Subject: ${options.subject}`);
      if (options.html) {
        this.logger.debug(`[EMAIL-MOCK] HTML content length: ${options.html.length}`);
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

      this.logger.log(`Email sent via SMTP to ${options.to}, ID: ${info.messageId}`);

      return { success: true, messageId: info.messageId };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
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
}
