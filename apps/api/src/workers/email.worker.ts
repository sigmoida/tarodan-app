/**
 * Email Worker
 * Processes email sending jobs via SendGrid
 */
import { Processor, Process, OnQueueFailed, OnQueueCompleted } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma';
import * as nodemailer from 'nodemailer';
import { renderEmailTemplate, getEmailTemplateSubject } from '../common/helpers/email-template-renderer';

export interface EmailJobData {
  to: string;
  subject: string;
  html: string;
  text?: string;
  template?: string;
  templateData?: Record<string, any>;
  from?: string;
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

@Processor('email')
export class EmailWorker {
  private readonly logger = new Logger(EmailWorker.name);
  private transporter: nodemailer.Transporter | null;
  private readonly enabled: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    // Initialize SMTP transporter (Gmail or other SMTP provider)
    const host = this.configService.get<string>('SMTP_HOST', '');
    const port = this.configService.get<number>('SMTP_PORT', 587);
    const user = this.configService.get<string>('SMTP_USER', '');
    const pass = this.configService.get<string>('SMTP_PASS', '');
    const secure = this.configService.get<string>('SMTP_SECURE', 'false') === 'true';

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
          rejectUnauthorized: false,
        },
      });
      this.logger.log(`Email worker initialized with SMTP: ${host}:${port}`);
    } else {
      this.logger.warn('SMTP not configured - emails will be logged only');
      // Create a mock transporter that just logs
      this.transporter = null;
    }
  }

  @Process('send')
  async handleSend(job: Job<EmailJobData>) {
    this.logger.log(`Processing email job ${job.id} to ${job.data.to}`);

    const { to, subject, html, text, from, replyTo, attachments, template, templateData } = job.data;
    const fromEmail = from || this.configService.get<string>('MAIL_FROM') || 'noreply@tarodan.com';

    // Create EmailLog entry with 'queued' status
    let emailLog: any = null;
    try {
      emailLog = await this.prisma.emailLog.create({
        data: {
          to,
          from: fromEmail,
          subject,
          template: template || null,
          status: 'queued',
          provider: this.enabled ? 'smtp' : 'mock',
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
        await this.prisma.emailLog.update({
          where: { id: emailLog.id },
          data: { status: 'sent', sentAt: new Date(), messageId: `mock-${Date.now()}` },
        }).catch(() => { });
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
      this.logger.log(`Email sent successfully to ${to}, messageId: ${result.messageId}`);

      // Update log status to sent
      if (emailLog) {
        await this.prisma.emailLog.update({
          where: { id: emailLog.id },
          data: {
            status: 'sent',
            sentAt: new Date(),
            messageId: result.messageId,
          },
        }).catch(() => { });
      }

      return { success: true, messageId: result.messageId };
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}: ${error.message}`);

      // Update log status to failed
      if (emailLog) {
        await this.prisma.emailLog.update({
          where: { id: emailLog.id },
          data: { status: 'failed', errorMessage: error.message },
        }).catch(() => { });
      }

      throw error;
    }
  }


  @Process('send-template')
  async handleSendTemplate(job: Job<EmailJobData>) {
    this.logger.log(`Processing template email job ${job.id}`);

    const { to, template, templateData } = job.data;
    // Some producers pass the payload under `data` instead of `templateData` — accept both
    // so the template always receives its variables (otherwise it renders empty/blank).
    const data = templateData || (job.data as any).data || {};

    if (!template) {
      throw new Error('Template name is required');
    }

    const frontendUrl = this.configService.get<string>('FRONTEND_URL') ||
      (this.configService.get('NODE_ENV') === 'production' ? 'https://tarodan.com' : 'http://localhost:3000');

    // Check DB for custom template first
    const dbTemplate = await this.prisma.emailTemplate.findUnique({ where: { key: template } });
    let html: string;
    let subject: string;
    if (dbTemplate?.bodyHtml) {
      html = this.substituteVariables(dbTemplate.bodyHtml, data);
      // Use DB subject if set, otherwise fall back to producer-supplied or default
      subject = dbTemplate.subject
        ? this.substituteVariables(dbTemplate.subject, data)
        : job.data.subject || getEmailTemplateSubject(template, data);
    } else {
      html = renderEmailTemplate(template, data, frontendUrl);
      subject = job.data.subject || getEmailTemplateSubject(template, data);
    }

    return this.handleSend({
      ...job,
      data: { ...job.data, html, subject },
    } as Job<EmailJobData>);
  }

  private substituteVariables(text: string, data: Record<string, any>): string {
    if (!text) return text;
    return text.replace(/\{\{([\w.]+)\}\}/g, (_, key) => {
      const val = key.includes('.')
        ? key.split('.').reduce((o: any, k: string) => (o != null ? o[k] : undefined), data)
        : data[key];
      return val != null ? String(val) : `{{${key}}}`;
    });
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
    return html.replace(/<[^>]*>/g, '');
  }

  private getTemplateSubject(template: string, data: Record<string, any>): string {
    const subjects: Record<string, string> = {
      welcome: "Tarodan'a Hoş Geldiniz!",
      'order-confirmation': `Sipariş Onayı - #${data?.orderNumber || data?.orderId || ''}`,
      'order-created-buyer': `Siparişiniz alındı - ${data?.orderNumber || ''}`,
      'order-created-seller': `Yeni sipariş - ${data?.orderNumber || ''}`,
      'order-paid': `Ödeme alındı - ${data?.orderNumber || ''}`,
      'order-paid-seller': `Yeni sipariş - ${data?.orderNumber || ''}`,
      'order-shipped': 'Siparişiniz Kargoya Verildi',
      'order-delivered': 'Siparişiniz Teslim Edildi',
      'password-reset': 'Şifre Sıfırlama Talebi',
      'email-verification': 'E-posta Adresinizi Doğrulayın',
      'offer-received': 'Yeni Teklif Aldınız',
      'offer-accepted': 'Teklifiniz Kabul Edildi',
      'payment-received': 'Ödeme Alındı',
      'payment-failed': `Ödeme Tamamlanamadı - ${data?.orderNumber || ''}`,
      'payment-refunded': `İade İşleminiz Tamamlandı - ${data?.orderNumber || ''}`,
      'payment-refunded-seller': `İade İşlemi Bildirimi - ${data?.orderNumber || ''}`,
      'premium-offer': '🌟 Premium Üyelik ile Daha Fazla Fırsat!',
      'membership-expiring': `${data?.tierName || 'Üyeliğiniz'} Sona Eriyor`,
      'membership-expiring-urgent': `${data?.tierName || 'Üyeliğiniz'} Yarın Sona Eriyor!`,
      'product-approved': 'Ürününüz Onaylandı',
      'wishlist-price-change': data?.isPriceDrop
        ? `🎉 Fiyat Düştü: ${data?.productTitle || ''}`
        : `📈 Fiyat Değişti: ${data?.productTitle || ''}`,
      'marketing-newsletter': '📰 Tarodan Haftalık Bülteni',
      'marketing-monthly': '🎁 Tarodan Aylık Özel Fırsatlar',
    };
    return data?.subject || subjects[template] || 'Tarodan Bildirim';
  }

  private renderTemplate(template: string, data: Record<string, any>): string {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || (this.configService.get('NODE_ENV') === 'production' ? 'https://tarodan.com' : 'http://localhost:3000');

    // Guest: link with orderNumber + email so one click opens track page with order details
    const isGuest = data?.isGuestOrder === true || data?.buyerSystemEmail === 'guest@tarodan.system';
    const guestEmail = (data?.buyerEmail || '').trim().toLowerCase();
    const orderPaidTrackUrl = isGuest && data?.orderNumber
      ? `${frontendUrl}/track-order?orderNumber=${encodeURIComponent(data.orderNumber)}${guestEmail ? `&email=${encodeURIComponent(guestEmail)}` : ''}`
      : `${frontendUrl}/orders/${data?.orderId || ''}`;

    // Professional email wrapper with logo and footer
    const wrapEmail = (content: string, title: string) => `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f3f4f6;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; width: 100%;">
          
          <!-- Header with Logo -->
          <tr>
            <td style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); padding: 30px 40px; border-radius: 16px 16px 0 0; text-align: center;">
              <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">
                🚗 TARODAN
              </h1>
              <p style="margin: 8px 0 0 0; font-size: 13px; color: rgba(255,255,255,0.85);">
                Türkiye'nin En Büyük Diecast Pazaryeri
              </p>
            </td>
          </tr>
          
          <!-- Main Content -->
          <tr>
            <td style="background-color: #ffffff; padding: 40px; border-left: 1px solid #e5e7eb; border-right: 1px solid #e5e7eb;">
              ${content}
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #1f2937; padding: 30px 40px; border-radius: 0 0 16px 16px; text-align: center;">
              <p style="margin: 0 0 16px 0; font-size: 14px; color: #9ca3af;">
                Sorularınız mı var? <a href="mailto:destek@tarodan.com" style="color: #f97316; text-decoration: none;">destek@tarodan.com</a>
              </p>
              <div style="margin-bottom: 16px;">
                <a href="${frontendUrl}" style="display: inline-block; margin: 0 8px; color: #9ca3af; text-decoration: none; font-size: 13px;">Ana Sayfa</a>
                <a href="${frontendUrl}/listings" style="display: inline-block; margin: 0 8px; color: #9ca3af; text-decoration: none; font-size: 13px;">İlanlar</a>
                <a href="${frontendUrl}/help" style="display: inline-block; margin: 0 8px; color: #9ca3af; text-decoration: none; font-size: 13px;">Yardım</a>
                <a href="${frontendUrl}/legal/privacy" style="display: inline-block; margin: 0 8px; color: #9ca3af; text-decoration: none; font-size: 13px;">Gizlilik</a>
              </div>
              <p style="margin: 0; font-size: 12px; color: #6b7280;">
                © ${new Date().getFullYear()} Tarodan. Tüm hakları saklıdır.
              </p>
              <p style="margin: 8px 0 0 0; font-size: 11px; color: #4b5563;">
                Bu e-posta ${data?.to || 'size'} gönderilmiştir. 
                <a href="${frontendUrl}/profile/settings" style="color: #f97316; text-decoration: none;">Bildirim tercihlerini yönet</a>
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    // Styled components
    const primaryButton = (text: string, href: string) => `
      <a href="${href}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); color: #ffffff; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 15px; text-align: center; box-shadow: 0 4px 14px rgba(249, 115, 22, 0.35);">
        ${text}
      </a>`;

    const secondaryButton = (text: string, href: string) => `
      <a href="${href}" style="display: inline-block; padding: 12px 24px; background-color: #f3f4f6; color: #374151; text-decoration: none; border-radius: 8px; font-weight: 500; font-size: 14px; border: 1px solid #d1d5db;">
        ${text}
      </a>`;

    const infoBox = (content: string) => `
      <div style="background: linear-gradient(135deg, #fef3c7 0%, #fef9c3 100%); padding: 20px 24px; border-radius: 12px; margin: 24px 0; border-left: 4px solid #f59e0b;">
        ${content}
      </div>`;

    const detailsBox = (content: string) => `
      <div style="background-color: #f8fafc; padding: 24px; border-radius: 12px; margin: 24px 0; border: 1px solid #e2e8f0;">
        ${content}
      </div>`;

    const successBox = (content: string) => `
      <div style="background: linear-gradient(135deg, #dcfce7 0%, #d1fae5 100%); padding: 20px 24px; border-radius: 12px; margin: 24px 0; border-left: 4px solid #22c55e;">
        ${content}
      </div>`;

    const warningBox = (content: string) => `
      <div style="background: linear-gradient(135deg, #fef3c7 0%, #fef9c3 100%); padding: 20px 24px; border-radius: 12px; margin: 24px 0; border-left: 4px solid #f59e0b;">
        ${content}
      </div>`;

    const detailRow = (label: string, value: string, highlight?: boolean) => `
      <tr>
        <td style="padding: 8px 0; color: #6b7280; font-size: 14px; width: 40%;">${label}</td>
        <td style="padding: 8px 0; color: ${highlight ? '#f97316' : '#111827'}; font-size: 14px; font-weight: ${highlight ? '700' : '500'}; text-align: right;">${value}</td>
      </tr>`;

    const greeting = (name: string) => `
      <p style="font-size: 16px; color: #374151; margin: 0 0 20px 0;">
        Merhaba <strong style="color: #111827;">${name || 'Değerli Üyemiz'}</strong>,
      </p>`;

    const title = (text: string, emoji?: string) => `
      <h2 style="font-size: 24px; font-weight: 700; color: #111827; margin: 0 0 16px 0; line-height: 1.3;">
        ${emoji ? `${emoji} ` : ''}${text}
      </h2>`;


    // Email templates (Turkish) - Professional versions with wrapper
    const templates: Record<string, string> = {
      welcome: wrapEmail(`
        ${title('Tarodan\'a Hoş Geldiniz!', '🎉')}
        ${greeting(data?.name)}
        <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">
          Türkiye'nin en büyük diecast pazaryerine katıldığınız için teşekkür ederiz! 
          Artık binlerce koleksiyon ürüne göz atabilir, alım satım yapabilir ve diğer koleksiyonerlerle güvenle takas yapabilirsiniz.
        </p>
        ${successBox(`
          <p style="margin: 0; font-size: 14px; color: #166534;">
            ✓ Hesabınız başarıyla oluşturuldu<br/>
            ✓ E-postanızı doğrulayarak tüm özelliklere erişebilirsiniz
          </p>
        `)}
        <div style="text-align: center; margin: 32px 0;">
          ${primaryButton('E-postamı Doğrula', data?.verifyUrl || frontendUrl)}
        </div>
        <p style="font-size: 14px; color: #6b7280; margin: 24px 0 0 0;">
          İyi alışverişler dileriz!<br/>
          <strong style="color: #f97316;">Tarodan Ekibi</strong>
        </p>
      `, "Tarodan'a Hoş Geldiniz!"),

      'order-confirmation': wrapEmail(`
        ${title('Sipariş Onayı', '✅')}
        ${greeting(data?.buyerName)}
        <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">
          Siparişiniz başarıyla oluşturuldu! Aşağıda sipariş detaylarınızı bulabilirsiniz.
        </p>
        ${detailsBox(`
          <table width="100%" cellspacing="0" cellpadding="0">
            ${detailRow('Sipariş No', '#' + (data?.orderNumber || data?.orderId || ''))}
            ${detailRow('Toplam Tutar', this.formatPrice(data?.total || data?.totalAmount || 0) + ' TL', true)}
          </table>
        `)}
        <div style="text-align: center; margin: 32px 0;">
          ${primaryButton('Siparişi Görüntüle', `${frontendUrl}/orders/${data?.orderId || ''}`)}
        </div>
      `, 'Sipariş Onayı'),

      'order-created-buyer': wrapEmail(`
        ${title('Siparişiniz Alındı', '🛒')}
        ${greeting(data?.buyerName)}
        <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">
          Siparişiniz başarıyla oluşturuldu ve ödemeniz alındı. Satıcı siparişinizi hazırlamaya başlayacak.
        </p>
        ${detailsBox(`
          <table width="100%" cellspacing="0" cellpadding="0">
            ${detailRow('Sipariş No', '#' + (data?.orderNumber || ''))}
            ${detailRow('Ürün', data?.productTitle || '')}
            ${detailRow('Tutar', this.formatPrice(data?.totalAmount || 0) + ' TL', true)}
          </table>
        `)}
        <div style="text-align: center; margin: 32px 0;">
          ${primaryButton('Siparişi Görüntüle', `${frontendUrl}/orders/${data?.orderId || ''}`)}
        </div>
        ${infoBox(`
          <p style="margin: 0; font-size: 14px; color: #92400e;">
            📦 Siparişiniz hazırlandığında ve kargoya verildiğinde size e-posta ile bilgi vereceğiz.
          </p>
        `)}
      `, 'Siparişiniz Alındı'),

      'order-created-seller': wrapEmail(`
        ${title('Yeni Sipariş!', '🎉')}
        ${greeting(data?.sellerName)}
        <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">
          Tebrikler! Ürününüz için yeni bir sipariş aldınız.
        </p>
        ${successBox(`
          <p style="margin: 0; font-size: 16px; color: #166534; font-weight: 600;">
            💰 Yeni satış bildirimi
          </p>
        `)}
        ${detailsBox(`
          <table width="100%" cellspacing="0" cellpadding="0">
            ${detailRow('Sipariş No', '#' + (data?.orderNumber || ''))}
            ${detailRow('Ürün', data?.productTitle || '')}
            ${detailRow('Tutar', this.formatPrice(data?.totalAmount || 0) + ' TL', true)}
          </table>
        `)}
        <p style="font-size: 14px; color: #6b7280; margin: 20px 0;">
          Ödeme onaylandıktan sonra ürünü kargoya hazırlamanız için bilgilendirileceksiniz.
        </p>
        <div style="text-align: center; margin: 32px 0;">
          ${primaryButton('Siparişi Görüntüle', `${frontendUrl}/seller/orders/${data?.orderId || ''}`)}
        </div>
      `, 'Yeni Sipariş!'),

      'order-paid': wrapEmail(`
        ${title('Ödeme Alındı', '✅')}
        ${greeting(data?.buyerName)}
        <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">
          Siparişiniz için ödeme başarıyla alındı. Satıcı siparişinizi hazırlamaya başladı.
        </p>
        ${successBox(`
          <p style="margin: 0; font-size: 16px; color: #166534; font-weight: 600;">
            ✓ Ödeme başarıyla tamamlandı
          </p>
        `)}
        ${detailsBox(`
          <table width="100%" cellspacing="0" cellpadding="0">
            ${detailRow('Sipariş No', '#' + (data?.orderNumber || ''))}
            ${detailRow('Ürün', data?.productTitle || '')}
            ${detailRow('Ödenen Tutar', this.formatPrice(data?.totalAmount || 0) + ' TL', true)}
            ${detailRow('İşlem No', data?.transactionId || '')}
            ${detailRow('Ödeme Yöntemi', data?.paymentMethod || 'Kredi Kartı')}
          </table>
        `)}
        ${data?.shippingAddress ? `
        ${detailsBox(`
          <p style="margin: 0 0 12px 0; font-weight: 600; color: #111827;">📍 Teslimat Adresi</p>
          <p style="margin: 4px 0; color: #4b5563; font-size: 14px;">${data.shippingAddress.fullName || ''}</p>
          <p style="margin: 4px 0; color: #4b5563; font-size: 14px;">${data.shippingAddress.address || ''}</p>
          <p style="margin: 4px 0; color: #4b5563; font-size: 14px;">${data.shippingAddress.district || ''}, ${data.shippingAddress.city || ''}</p>
          <p style="margin: 4px 0; color: #4b5563; font-size: 14px;">${data.shippingAddress.zipCode || ''}</p>
          <p style="margin: 4px 0; color: #4b5563; font-size: 14px;">Tel: ${data.shippingAddress.phone || ''}</p>
        `)}` : ''}
        <div style="text-align: center; margin: 32px 0;">
          ${primaryButton('Siparişi Takip Et', orderPaidTrackUrl)}
        </div>
      `, 'Ödeme Alındı'),

      'order-paid-seller': wrapEmail(`
        ${title('Yeni Sipariş!', '🎉')}
        ${greeting(data?.sellerName)}
        <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">
          Tebrikler! Ürününüz satıldı ve ödemesi alındı. Lütfen ürünü <strong style="color: #dc2626;">en geç 3 iş günü</strong> içinde kargoya veriniz.
        </p>
        ${successBox(`
          <p style="margin: 0; font-size: 16px; color: #166534; font-weight: 600;">
            ✓ Ödeme hesabınıza yansıyacak
          </p>
        `)}
        ${detailsBox(`
          <table width="100%" cellspacing="0" cellpadding="0">
            ${detailRow('Sipariş No', '#' + (data?.orderNumber || ''))}
            ${detailRow('Ürün', data?.productTitle || '')}
            ${detailRow('Satış Tutarı', this.formatPrice(data?.totalAmount || 0) + ' TL')}
            ${detailRow('Komisyon', '-' + this.formatPrice(data?.commissionAmount || 0) + ' TL')}
            ${detailRow('Net Kazancınız', this.formatPrice(data?.netAmount || (data?.totalAmount - data?.commissionAmount) || 0) + ' TL', true)}
          </table>
        `)}
        ${data?.shippingAddress ? `
        ${detailsBox(`
          <p style="margin: 0 0 12px 0; font-weight: 600; color: #111827;">📦 Gönderilecek Adres</p>
          <p style="margin: 4px 0; color: #4b5563; font-size: 14px;">${data.shippingAddress.fullName || ''}</p>
          <p style="margin: 4px 0; color: #4b5563; font-size: 14px;">${data.shippingAddress.address || ''}</p>
          <p style="margin: 4px 0; color: #4b5563; font-size: 14px;">${data.shippingAddress.district || ''}, ${data.shippingAddress.city || ''}</p>
          <p style="margin: 4px 0; color: #4b5563; font-size: 14px;">${data.shippingAddress.zipCode || ''}</p>
          <p style="margin: 4px 0; color: #4b5563; font-size: 14px;">Tel: ${data.shippingAddress.phone || ''}</p>
        `)}` : ''}
        <div style="text-align: center; margin: 32px 0;">
          ${primaryButton('Kargo Bilgisi Gir', `${frontendUrl}/seller/orders/${data?.orderId || ''}`)}
        </div>
        ${infoBox(`
          <p style="margin: 0; font-size: 14px; color: #92400e;">
            ℹ️ Not: Ödemeniz, alıcı ürünü teslim aldıktan 7 gün sonra hesabınıza aktarılacaktır.
          </p>
        `)}
      `, 'Yeni Sipariş!'),

      'order-shipped': wrapEmail(`
        ${title('Siparişiniz Kargoya Verildi', '📦')}
        ${greeting(data?.buyerName)}
        <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">
          Harika haber! Siparişiniz kargoya verildi ve yolda. Kargo takip bilgileri aşağıdadır:
        </p>
        ${detailsBox(`
          <table width="100%" cellspacing="0" cellpadding="0">
            ${detailRow('Sipariş No', '#' + (data?.orderNumber || ''))}
            ${detailRow('Kargo Firması', data?.provider || '')}
            ${detailRow('Takip No', data?.trackingNumber || '', true)}
            ${data?.estimatedDelivery ? detailRow('Tahmini Teslimat', data.estimatedDelivery) : ''}
          </table>
        `)}
        ${data?.trackingUrl ? `
        <div style="text-align: center; margin: 32px 0;">
          ${primaryButton('Kargoyu Takip Et', data.trackingUrl)}
        </div>` : ''}
      `, 'Siparişiniz Kargoya Verildi'),

      'order-delivered': wrapEmail(`
        ${title('Siparişiniz Teslim Edildi', '🎁')}
        ${greeting(data?.buyerName)}
        <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">
          Siparişiniz başarıyla teslim edildi! Ürününüzü beğeneceğinizi umuyoruz.
        </p>
        ${successBox(`
          <p style="margin: 0; font-size: 16px; color: #166534; font-weight: 600;">
            ✓ Teslimat tamamlandı
          </p>
        `)}
        ${detailsBox(`
          <table width="100%" cellspacing="0" cellpadding="0">
            ${detailRow('Sipariş No', '#' + (data?.orderNumber || ''))}
          </table>
        `)}
        <p style="font-size: 14px; color: #4b5563; margin: 20px 0;">
          Lütfen ürünü kontrol edin ve sipariş durumunu onaylayın. Onaylamanızın ardından satıcıya ödeme aktarılacaktır.
        </p>
        <div style="text-align: center; margin: 32px 0;">
          ${primaryButton('Teslimatı Onayla', `${frontendUrl}/orders/${data?.orderId || ''}`)}
        </div>
        ${infoBox(`
          <p style="margin: 0; font-size: 14px; color: #92400e;">
            ⏰ Not: 7 gün içinde onay vermezseniz, teslimat otomatik olarak onaylanacaktır.
          </p>
        `)}
      `, 'Siparişiniz Teslim Edildi'),

      'password-reset': wrapEmail(`
        ${title('Şifre Sıfırlama Talebi', '🔐')}
        ${greeting(data?.name)}
        <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">
          Hesabınız için şifre sıfırlama talebinde bulundunuz. Şifrenizi sıfırlamak için aşağıdaki butona tıklayın.
        </p>
        <div style="text-align: center; margin: 32px 0;">
          ${primaryButton('Şifremi Sıfırla', data?.resetUrl || '')}
        </div>
        ${warningBox(`
          <p style="margin: 0; font-size: 14px; color: #92400e;">
            ⚠️ Bu bağlantı 1 saat geçerlidir. Eğer bu talebi siz yapmadıysanız, bu e-postayı görmezden gelebilirsiniz.
          </p>
        `)}
      `, 'Şifre Sıfırlama'),

      'offer-received': wrapEmail(`
        ${title('Yeni Teklif Aldınız!', '💰')}
        ${greeting(data?.sellerName)}
        <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">
          Ürününüz için yeni bir teklif aldınız!
        </p>
        ${detailsBox(`
          <table width="100%" cellspacing="0" cellpadding="0">
            ${detailRow('Ürün', data?.productTitle || '')}
            ${detailRow('Ürün Fiyatı', this.formatPrice(data?.productPrice || 0) + ' TL')}
            ${detailRow('Teklif Tutarı', this.formatPrice(data?.offerAmount || 0) + ' TL', true)}
            ${detailRow('Teklif Veren', data?.buyerName || '')}
          </table>
        `)}
        ${warningBox(`
          <p style="margin: 0; font-size: 14px; color: #92400e;">
            ⏰ Bu teklifin süresi ${data?.expiresAt ? new Date(data.expiresAt).toLocaleString('tr-TR') : '24 saat içinde'} dolacak.
          </p>
        `)}
        <div style="text-align: center; margin: 32px 0;">
          ${primaryButton('Teklifi İncele', `${frontendUrl}/seller/offers/${data?.offerId || ''}`)}
        </div>
        <p style="font-size: 14px; color: #6b7280; text-align: center;">
          Teklifi kabul etmek, reddetmek veya karşı teklif vermek için yukarıdaki butona tıklayın.
        </p>
      `, 'Yeni Teklif Aldınız!'),

      'offer-accepted': wrapEmail(`
        ${title('Teklifiniz Kabul Edildi!', '🎉')}
        ${greeting(data?.buyerName)}
        <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">
          Tebrikler! <strong>${data?.productTitle || ''}</strong> ürünü için verdiğiniz teklif satıcı tarafından kabul edildi.
        </p>
        ${successBox(`
          <p style="margin: 0; font-size: 16px; color: #166534; font-weight: 600;">
            ✓ Teklifiniz onaylandı
          </p>
        `)}
        ${detailsBox(`
          <table width="100%" cellspacing="0" cellpadding="0">
            ${detailRow('Ürün', data?.productTitle || '')}
            ${detailRow('Kabul Edilen Tutar', this.formatPrice(data?.offerAmount || 0) + ' TL', true)}
            ${detailRow('Satıcı', data?.sellerName || '')}
            ${detailRow('Sipariş No', '#' + (data?.orderNumber || ''))}
          </table>
        `)}
        ${warningBox(`
          <p style="margin: 0; font-size: 14px; color: #92400e;">
            ⚠️ Siparişinizi tamamlamak için ödeme yapmanız gerekmektedir.
          </p>
        `)}
        <div style="text-align: center; margin: 32px 0;">
          ${primaryButton('Ödeme Yap', `${frontendUrl}/orders/${data?.orderId || ''}/payment`)}
        </div>
        ${infoBox(`
          <p style="margin: 0; font-size: 14px; color: #92400e;">
            ℹ️ Not: Ödeme işlemi 30 dakika içinde tamamlanmazsa sipariş iptal edilebilir.
          </p>
        `)}
      `, 'Teklifiniz Kabul Edildi!'),

      'wishlist-price-change': wrapEmail(`
        ${title(data?.isPriceDrop ? 'Fiyat Düştü!' : 'Fiyat Değişti!', data?.isPriceDrop ? '🎉' : '📈')}
        ${greeting(data?.userName)}
        <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">
          İstek listenizdeki bir ürünün fiyatı değişti:
        </p>
        ${detailsBox(`
          <p style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600; color: #111827;">${data?.productTitle || ''}</p>
          <table width="100%" cellspacing="0" cellpadding="0">
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Eski Fiyat</td>
              <td style="padding: 8px 0; color: #9ca3af; font-size: 14px; text-decoration: line-through; text-align: right;">${this.formatPrice(data?.oldPrice || 0)} TL</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Yeni Fiyat</td>
              <td style="padding: 8px 0; color: ${data?.isPriceDrop ? '#16a34a' : '#dc2626'}; font-size: 18px; font-weight: 700; text-align: right;">${this.formatPrice(data?.newPrice || 0)} TL</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">${data?.isPriceDrop ? 'İndirim' : 'Artış'}</td>
              <td style="padding: 8px 0; color: ${data?.isPriceDrop ? '#16a34a' : '#dc2626'}; font-size: 14px; font-weight: 600; text-align: right;">${data?.priceChange || 0} TL (%${data?.priceChangePercent || 0})</td>
            </tr>
          </table>
        `)}
        ${data?.isPriceDrop ? successBox(`
          <p style="margin: 0; font-size: 14px; color: #166534;">
            🎉 Bu ürünün fiyatı düştü! Hemen almak için aşağıdaki butona tıklayın.
          </p>
        `) : ''}
        <div style="text-align: center; margin: 32px 0;">
          ${primaryButton('Ürünü Görüntüle', data?.productUrl || frontendUrl)}
        </div>
      `, data?.isPriceDrop ? 'Fiyat Düştü!' : 'Fiyat Değişti!'),

      'marketing-newsletter': wrapEmail(`
        ${title('Tarodan Haftalık Bülteni', '📰')}
        ${greeting(data?.userName)}
        <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">
          Bu hafta en çok ilgi gören ürünler:
        </p>
        ${data?.trendingProducts?.length > 0 ? `
        <div style="margin: 24px 0;">
          ${data.trendingProducts.map((product: any) => `
            <div style="background-color: #f8fafc; padding: 16px; border-radius: 12px; margin-bottom: 12px; border: 1px solid #e2e8f0;">
              <p style="font-weight: 600; margin: 0 0 8px 0; color: #111827;">${product.title}</p>
              <p style="color: #f97316; font-size: 18px; font-weight: 700; margin: 0 0 12px 0;">${this.formatPrice(product.price)} TL</p>
              <a href="${product.productUrl}" style="color: #f97316; text-decoration: none; font-weight: 500; font-size: 14px;">İncele →</a>
            </div>
          `).join('')}
        </div>` : '<p>Bu hafta öne çıkan ürün bulunmamaktadır.</p>'}
      `, 'Tarodan Haftalık Bülteni'),

      'marketing-monthly': wrapEmail(`
        ${title('Tarodan Aylık Özel Fırsatlar', '🎁')}
        ${greeting(data?.userName)}
        <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">
          Bu ay sizin için özel olarak seçtiğimiz ürünler:
        </p>
        ${data?.featuredProducts?.length > 0 ? `
        <div style="margin: 24px 0;">
          ${data.featuredProducts.map((product: any) => `
            <div style="background-color: #f8fafc; padding: 16px; border-radius: 12px; margin-bottom: 12px; border: 1px solid #e2e8f0;">
              <p style="font-weight: 600; margin: 0 0 8px 0; color: #111827;">${product.title}</p>
              <p style="color: #f97316; font-size: 18px; font-weight: 700; margin: 0 0 12px 0;">${this.formatPrice(product.price)} TL</p>
              <a href="${product.productUrl}" style="color: #f97316; text-decoration: none; font-weight: 500; font-size: 14px;">İncele →</a>
            </div>
          `).join('')}
        </div>` : '<p>Bu ay öne çıkan ürün bulunmamaktadır.</p>'}
      `, 'Tarodan Aylık Özel Fırsatlar'),

      'payment-failed': wrapEmail(`
        ${title('Ödemeniz Tamamlanamadı', '⚠️')}
        ${greeting(data?.buyerName)}
        <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">
          Siparişiniz için ödeme işlemi tamamlanamadı ve sipariş iptal edildi. Üzgünüz! Dilerseniz ürünü tekrar inceleyip yeniden sipariş verebilirsiniz.
        </p>
        ${detailsBox(`
          <table width="100%" cellspacing="0" cellpadding="0">
            ${detailRow('Sipariş No', '#' + (data?.orderNumber || ''))}
            ${detailRow('Tutar', this.formatPrice(data?.amount || 0) + ' TL', true)}
          </table>
        `)}
        ${warningBox(`
          <p style="margin: 0; font-size: 14px; color: #92400e;">
            ${data?.failureReason || 'Ödeme işlemi tamamlanamadığı için siparişiniz iptal edildi.'}
          </p>
        `)}
        <div style="text-align: center; margin: 32px 0;">
          ${primaryButton('Alışverişe Devam Et', `${frontendUrl}/listings`)}
        </div>
        <p style="font-size: 14px; color: #6b7280; text-align: center; margin: 0;">
          Sorun yaşadıysanız <a href="mailto:destek@tarodan.com" style="color: #f97316; text-decoration: none;">destek@tarodan.com</a> üzerinden bize ulaşabilirsiniz.
        </p>
      `, 'Ödemeniz Tamamlanamadı'),

      'payment-refunded': wrapEmail(`
        ${title('İade İşleminiz Tamamlandı', '💰')}
        ${greeting(data?.buyerName)}
        <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">
          Siparişiniz için iade işlemi başarıyla gerçekleştirildi. İade tutarı, bankanıza bağlı olarak birkaç iş günü içinde hesabınıza yansıyacaktır.
        </p>
        ${successBox(`
          <p style="margin: 0; font-size: 16px; color: #166534; font-weight: 600;">
            ✓ İade işlemi onaylandı
          </p>
        `)}
        ${detailsBox(`
          <table width="100%" cellspacing="0" cellpadding="0">
            ${detailRow('Sipariş No', '#' + (data?.orderNumber || ''))}
            ${detailRow('İade Tutarı', this.formatPrice(data?.refundAmount || 0) + ' TL', true)}
          </table>
        `)}
        <div style="text-align: center; margin: 32px 0;">
          ${primaryButton('Siparişi Görüntüle', `${frontendUrl}/orders/${data?.orderId || ''}`)}
        </div>
      `, 'İade İşleminiz Tamamlandı'),

      'payment-refunded-seller': wrapEmail(`
        ${title('İade İşlemi Bildirimi', '🔄')}
        ${greeting(data?.sellerName)}
        <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">
          Bir siparişiniz için iade işlemi gerçekleştirildi. Detaylar aşağıda yer almaktadır.
        </p>
        ${detailsBox(`
          <table width="100%" cellspacing="0" cellpadding="0">
            ${detailRow('Sipariş No', '#' + (data?.orderNumber || ''))}
            ${detailRow('İade Tutarı', this.formatPrice(data?.refundAmount || 0) + ' TL', true)}
          </table>
        `)}
        ${infoBox(`
          <p style="margin: 0; font-size: 14px; color: #92400e;">
            ℹ️ İade tutarı alıcıya aktarılmıştır. Herhangi bir işlem yapmanıza gerek yoktur.
          </p>
        `)}
        <div style="text-align: center; margin: 32px 0;">
          ${primaryButton('Siparişi Görüntüle', `${frontendUrl}/seller/orders/${data?.orderId || ''}`)}
        </div>
      `, 'İade İşlemi Bildirimi'),

      'premium-offer': wrapEmail(`
        ${title('Premium ile Daha Fazlası Sizi Bekliyor', '🌟')}
        ${greeting(data?.userName)}
        <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">
          Tarodan'da daha fazla satış, daha fazla görünürlük ve özel ayrıcalıklar için Premium üyeliğe geçin!
        </p>
        ${detailsBox(`
          <p style="margin: 0 0 12px 0; font-weight: 600; color: #111827;">Premium üyelik avantajları</p>
          ${Array.isArray(data?.benefits) && data.benefits.length > 0
            ? `<ul style="margin: 0; padding-left: 20px; color: #4b5563; font-size: 14px; line-height: 1.9;">
                ${data.benefits.map((b: string) => `<li>${b}</li>`).join('')}
              </ul>`
            : `<p style="margin: 0; color: #4b5563; font-size: 14px;">Sınırsız ilan, takas, Digital Garage ve daha fazlası.</p>`}
        `)}
        <div style="text-align: center; margin: 32px 0;">
          ${primaryButton(data?.ctaText || 'Premium Üye Ol', data?.ctaUrl || `${frontendUrl}/membership`)}
        </div>
      `, 'Premium Üyelik'),

      'membership-expiring': wrapEmail(`
        ${title('Üyeliğiniz Sona Eriyor', '⏰')}
        ${greeting(data?.userName)}
        <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">
          <strong style="color: #111827;">${data?.tierName || 'Üyeliğiniz'}</strong> üyeliğinizin süresi
          ${data?.daysRemaining ? `${data.daysRemaining} gün içinde ` : ''}sona erecek. Kesintisiz devam etmek için üyeliğinizi yenileyin.
        </p>
        ${detailsBox(`
          <table width="100%" cellspacing="0" cellpadding="0">
            ${detailRow('Üyelik', data?.tierName || '')}
            ${data?.expirationDate ? detailRow('Bitiş Tarihi', String(data.expirationDate), true) : ''}
          </table>
        `)}
        <div style="text-align: center; margin: 32px 0;">
          ${primaryButton('Üyeliğimi Yenile', data?.renewUrl || `${frontendUrl}/membership`)}
        </div>
      `, 'Üyeliğiniz Sona Eriyor'),

      'membership-expiring-urgent': wrapEmail(`
        ${title('Üyeliğiniz Yarın Sona Eriyor!', '🚨')}
        ${greeting(data?.userName)}
        <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">
          <strong style="color: #111827;">${data?.tierName || 'Üyeliğiniz'}</strong> üyeliğinizin süresi
          <strong style="color: #dc2626;">yarın (${data?.expirationDate || ''})</strong> sona eriyor.
          Avantajlarınızı kaybetmemek için hemen yenileyin.
        </p>
        ${warningBox(`
          <p style="margin: 0; font-size: 14px; color: #92400e;">
            ⚠️ Üyeliğiniz sona erdiğinde Premium özelliklere erişiminiz kısıtlanacaktır.
          </p>
        `)}
        <div style="text-align: center; margin: 32px 0;">
          ${primaryButton('Hemen Yenile', data?.renewUrl || `${frontendUrl}/membership`)}
        </div>
      `, 'Üyeliğiniz Yarın Sona Eriyor!'),
    };

    const rendered = templates[template];
    if (rendered) return rendered;

    // No matching template — send a clean generic notification instead of leaking raw JSON to the user.
    this.logger.warn(`No email template found for "${template}" — using generic fallback`);
    return wrapEmail(`
      ${title('Tarodan Bildirimi', '🔔')}
      ${greeting(data?.buyerName || data?.sellerName || data?.userName || data?.name)}
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">
        Hesabınızla ilgili yeni bir bildiriminiz var. Ayrıntılar için Tarodan hesabınıza giriş yapabilirsiniz.
      </p>
      <div style="text-align: center; margin: 32px 0;">
        ${primaryButton('Hesabıma Git', frontendUrl)}
      </div>
    `, 'Tarodan Bildirim');
  }

  /**
   * Format price with Turkish locale
   */
  private formatPrice(amount: number): string {
    return new Intl.NumberFormat('tr-TR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }
}

