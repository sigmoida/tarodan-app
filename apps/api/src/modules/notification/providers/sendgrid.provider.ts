/**
 * SendGrid Email Provider
 * GAP-014: Real Notification Providers (Expo, SendGrid, SMS)
 *
 * Requirement: Email notifications (project.md)
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

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
    disposition?: 'attachment' | 'inline';
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
    this.apiKey = this.configService.get<string>('SENDGRID_API_KEY', '');
    this.fromEmail = this.configService.get<string>('SENDGRID_FROM_EMAIL', 'noreply@tarodan.com');
    this.fromName = this.configService.get<string>('SENDGRID_FROM_NAME', 'Tarodan');
    this.enabled = !!this.apiKey && this.apiKey.startsWith('SG.');

    // SMTP transport (test→Mailhog, prod→gerçek SMTP). SMTP_HOST set ise SendGrid yerine bu kullanılır.
    const smtpHost = this.configService.get<string>('SMTP_HOST', '');
    if (smtpHost) {
      const smtpUser = this.configService.get<string>('SMTP_USER', '');
      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(this.configService.get<string>('SMTP_PORT', '1025'), 10),
        secure: this.configService.get<string>('SMTP_SECURE', 'false') === 'true',
        auth: smtpUser ? { user: smtpUser, pass: this.configService.get<string>('SMTP_PASS', '') } : undefined,
      });
      this.logger.log(`SMTP transport aktif (${smtpHost}) — mailler SMTP ile gönderilecek.`);
    } else {
      this.transporter = null;
      if (!this.enabled) {
        this.logger.warn('SendGrid is not configured. Email notifications will be logged only.');
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
        this.logger.log(`Email sent via SMTP to ${options.to}, ID: ${info.messageId}`);
        return { success: true, messageId: info.messageId };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`SMTP send failed to ${options.to}: ${msg}`);
        return { success: false, error: msg };
      }
    }

    if (!this.enabled) {
      this.logger.log(`[EMAIL-MOCK] To: ${options.to}, Subject: ${options.subject}`);
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
          ? [{ type: 'text/html', value: options.html }]
          : options.text
          ? [{ type: 'text/plain', value: options.text }]
          : undefined,
        template_id: options.templateId,
        attachments: options.attachments?.map((att) => ({
          content: att.content,
          filename: att.filename,
          type: att.type,
          disposition: att.disposition || 'attachment',
        })),
      };

      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`SendGrid error: ${response.status} - ${error}`);
        return { success: false, error: `SendGrid API error: ${response.status}` };
      }

      const messageId = response.headers.get('x-message-id') || `sg-${Date.now()}`;
      this.logger.log(`Email sent via SendGrid to ${options.to}, ID: ${messageId}`);

      return { success: true, messageId };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to send email via SendGrid: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Send transactional email using SendGrid template
   */
  async sendTemplateEmail(
    to: string,
    templateId: string,
    dynamicData: Record<string, any>,
  ): Promise<SendGridResponse> {
    return this.sendEmail({
      to,
      subject: '', // Subject comes from template
      templateId,
      dynamicTemplateData: dynamicData,
    });
  }

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(email: string, displayName: string): Promise<SendGridResponse> {
    const welcomeTemplateId = this.configService.get<string>('SENDGRID_WELCOME_TEMPLATE_ID');

    if (welcomeTemplateId) {
      return this.sendTemplateEmail(email, welcomeTemplateId, { displayName });
    }

    return this.sendEmail({
      to: email,
      subject: 'Tarodan\'a Hoş Geldiniz!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333;">Tarodan'a Hoş Geldiniz!</h1>
          <p>Merhaba ${displayName},</p>
          <p>Diecast model araba koleksiyoncuları platformuna hoş geldiniz.</p>
          <p>Platformumuzda:</p>
          <ul>
            <li>Binlerce model araba arasından seçim yapabilir</li>
            <li>Koleksiyonunuzu sergileyebilir</li>
            <li>Diğer koleksiyoncularla takas yapabilirsiniz</li>
          </ul>
          <p>Hemen keşfetmeye başlayın!</p>
          <a href="${this.configService.get('FRONTEND_URL')}" 
             style="display: inline-block; background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
            Platformu Keşfet
          </a>
          <p style="color: #666; font-size: 12px; margin-top: 30px;">
            © ${new Date().getFullYear()} Tarodan. Tüm hakları saklıdır.
          </p>
        </div>
      `,
    });
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(email: string, resetUrl: string): Promise<SendGridResponse> {
    const resetTemplateId = this.configService.get<string>('SENDGRID_PASSWORD_RESET_TEMPLATE_ID');

    if (resetTemplateId) {
      return this.sendTemplateEmail(email, resetTemplateId, { resetUrl });
    }

    return this.sendEmail({
      to: email,
      subject: 'Şifre Sıfırlama - Tarodan',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333;">Şifre Sıfırlama</h1>
          <p>Şifrenizi sıfırlamak için aşağıdaki bağlantıya tıklayın:</p>
          <a href="${resetUrl}" 
             style="display: inline-block; background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
            Şifremi Sıfırla
          </a>
          <p style="color: #666; margin-top: 20px;">
            Bu bağlantı 1 saat içinde geçerliliğini yitirecektir.
          </p>
          <p style="color: #666;">
            Eğer bu isteği siz yapmadıysanız, bu e-postayı görmezden gelebilirsiniz.
          </p>
        </div>
      `,
    });
  }

  /**
   * Send email verification
   */
  async sendEmailVerification(email: string, verifyUrl: string): Promise<SendGridResponse> {
    const verifyTemplateId = this.configService.get<string>('SENDGRID_VERIFY_EMAIL_TEMPLATE_ID');

    if (verifyTemplateId) {
      return this.sendTemplateEmail(email, verifyTemplateId, { verifyUrl });
    }

    return this.sendEmail({
      to: email,
      subject: 'E-posta Doğrulama - Tarodan',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333;">E-posta Doğrulama</h1>
          <p>E-posta adresinizi doğrulamak için aşağıdaki bağlantıya tıklayın:</p>
          <a href="${verifyUrl}" 
             style="display: inline-block; background: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
            E-postamı Doğrula
          </a>
          <p style="color: #666; margin-top: 20px;">
            Bu bağlantı 24 saat içinde geçerliliğini yitirecektir.
          </p>
        </div>
      `,
    });
  }

  /**
   * Send order confirmation email
   */
  async sendOrderConfirmation(
    email: string,
    orderData: {
      orderId: string;
      items: Array<{ name: string; price: number; quantity: number }>;
      total: number;
      shippingAddress: string;
    },
  ): Promise<SendGridResponse> {
    const itemsHtml = orderData.items
      .map(
        (item) =>
          `<tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.name}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.quantity}</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.price.toFixed(2)} TL</td>
          </tr>`,
      )
      .join('');

    return this.sendEmail({
      to: email,
      subject: `Sipariş Onayı #${orderData.orderId} - Tarodan`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333;">Siparişiniz Onaylandı!</h1>
          <p>Sipariş No: <strong>#${orderData.orderId}</strong></p>
          
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <thead>
              <tr style="background: #f5f5f5;">
                <th style="padding: 8px; text-align: left;">Ürün</th>
                <th style="padding: 8px; text-align: left;">Adet</th>
                <th style="padding: 8px; text-align: left;">Fiyat</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
            <tfoot>
              <tr style="background: #f5f5f5;">
                <td colspan="2" style="padding: 8px;"><strong>Toplam</strong></td>
                <td style="padding: 8px;"><strong>${orderData.total.toFixed(2)} TL</strong></td>
              </tr>
            </tfoot>
          </table>
          
          <p><strong>Teslimat Adresi:</strong></p>
          <p style="background: #f5f5f5; padding: 12px; border-radius: 4px;">
            ${orderData.shippingAddress}
          </p>
          
          <a href="${this.configService.get('FRONTEND_URL')}/orders/${orderData.orderId}" 
             style="display: inline-block; background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin-top: 20px;">
            Siparişi Görüntüle
          </a>
        </div>
      `,
    });
  }

  /**
   * Check if SendGrid is properly configured
   */
  isConfigured(): boolean {
    return this.enabled;
  }
}
