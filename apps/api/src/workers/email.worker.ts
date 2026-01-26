/**
 * Email Worker
 * Processes email sending jobs via SendGrid
 */
import { Processor, Process, OnQueueFailed, OnQueueCompleted } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

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

  constructor(private readonly configService: ConfigService) {
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

    const { to, subject, html, text, from, replyTo, attachments } = job.data;

    // If SMTP not configured, just log and return success
    if (!this.enabled || !this.transporter) {
      this.logger.log(`[EMAIL-MOCK] To: ${to}, Subject: ${subject}`);
      return { success: true, messageId: `mock-${Date.now()}` };
    }

    try {
      const mailOptions: nodemailer.SendMailOptions = {
        from: from || this.configService.get('MAIL_FROM', 'noreply@tarodan.com'),
        to,
        subject,
        html,
        text: text || this.stripHtml(html),
        replyTo,
        attachments,
      };

      const result = await this.transporter.sendMail(mailOptions);
      this.logger.log(`Email sent successfully to ${to}, messageId: ${result.messageId}`);

      return { success: true, messageId: result.messageId };
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}: ${error.message}`);
      throw error;
    }
  }

  @Process('send-template')
  async handleSendTemplate(job: Job<EmailJobData>) {
    this.logger.log(`Processing template email job ${job.id}`);

    const { to, template, templateData } = job.data;

    if (!template) {
      throw new Error('Template name is required');
    }

    // Get template HTML
    const html = this.renderTemplate(template, templateData || {});
    const subject = this.getTemplateSubject(template, templateData || {});

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
    return html.replace(/<[^>]*>/g, '');
  }

  private getTemplateSubject(template: string, data: Record<string, any>): string {
    const subjects: Record<string, string> = {
      welcome: "Tarodan'a Hoş Geldiniz!",
      'order-confirmation': `Sipariş Onayı - #${data?.orderNumber || data?.orderId || ''}`,
      'order-created-buyer': `Siparişiniz alındı - ${data?.orderNumber || ''}`,
      'order-created-seller': `Yeni sipariş - ${data?.orderNumber || ''}`,
      'order-paid': `Ödeme alındı - ${data?.orderNumber || ''}`,
      'order-paid-seller': `Ödeme alındı, kargoya hazırlayın - ${data?.orderNumber || ''}`,
      'order-shipped': 'Siparişiniz Kargoya Verildi',
      'order-delivered': 'Siparişiniz Teslim Edildi',
      'password-reset': 'Şifre Sıfırlama Talebi',
      'email-verification': 'E-posta Adresinizi Doğrulayın',
      'offer-received': 'Yeni Teklif Aldınız',
      'offer-accepted': 'Teklifiniz Kabul Edildi',
      'payment-received': 'Ödeme Alındı',
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
    const baseStyle = `
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      max-width: 600px;
      margin: 0 auto;
      background: #ffffff;
      padding: 32px;
    `;
    const headerStyle = `color: #1a1a2e; margin-bottom: 24px;`;
    const buttonStyle = `
      display: inline-block;
      padding: 14px 28px;
      background-color: #4f46e5;
      color: white;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
    `;
    const boxStyle = `
      background: #f8fafc;
      padding: 20px;
      border-radius: 12px;
      margin: 20px 0;
      border: 1px solid #e2e8f0;
    `;

    // Email templates (Turkish)
    const templates: Record<string, string> = {
      welcome: `
        <div style="${baseStyle}">
          <h1 style="${headerStyle}">Tarodan'a Hoş Geldiniz!</h1>
          <p>Merhaba ${data?.name || 'Değerli Üye'},</p>
          <p>Tarodan koleksiyoner oyuncak platformuna hoş geldiniz. Artık binlerce koleksiyoner ürüne göz atabilir, alım satım yapabilirsiniz.</p>
          <a href="${data?.verifyUrl || 'https://tarodan.com'}" style="${buttonStyle}">E-postamı Doğrula</a>
          <p style="margin-top: 20px;">İyi alışverişler dileriz!</p>
          <p>Tarodan Ekibi</p>
        </div>
      `,
      'order-confirmation': `
        <div style="${baseStyle}">
          <h1 style="${headerStyle}">Sipariş Onayı</h1>
          <p>Merhaba ${data?.buyerName || ''},</p>
          <p>Siparişiniz başarıyla oluşturuldu.</p>
          <div style="${boxStyle}">
            <p><strong>Sipariş No:</strong> ${data?.orderNumber || data?.orderId || ''}</p>
            <p><strong>Toplam:</strong> ${this.formatPrice(data?.total || data?.totalAmount || 0)} TL</p>
          </div>
          <a href="https://tarodan.com/orders/${data?.orderId || ''}" style="${buttonStyle}">Siparişi Görüntüle</a>
        </div>
      `,
      'order-created-buyer': `
        <div style="${baseStyle}">
          <h1 style="${headerStyle}">🛒 Siparişiniz Alındı</h1>
          <p>Merhaba ${data?.buyerName || ''},</p>
          <p>Siparişiniz başarıyla oluşturuldu. Ödeme işlemini tamamladıktan sonra satıcı siparişinizi hazırlamaya başlayacak.</p>
          <div style="${boxStyle}">
            <p style="margin: 8px 0;"><strong>Sipariş No:</strong> ${data?.orderNumber || ''}</p>
            <p style="margin: 8px 0;"><strong>Ürün:</strong> ${data?.productTitle || ''}</p>
            <p style="margin: 8px 0;"><strong>Tutar:</strong> ${this.formatPrice(data?.totalAmount || 0)} TL</p>
          </div>
          <a href="https://tarodan.com/orders/${data?.orderId || ''}" style="${buttonStyle}">Ödeme Yap</a>
          <p style="margin-top: 24px; color: #64748b; font-size: 14px;">
            Ödeme için siparişinizin 30 dakika içinde tamamlanması gerekmektedir.
          </p>
        </div>
      `,
      'order-created-seller': `
        <div style="${baseStyle}">
          <h1 style="${headerStyle}">🎉 Yeni Sipariş!</h1>
          <p>Merhaba ${data?.sellerName || ''},</p>
          <p>Tebrikler! Ürününüz için yeni bir sipariş aldınız.</p>
          <div style="${boxStyle}">
            <p style="margin: 8px 0;"><strong>Sipariş No:</strong> ${data?.orderNumber || ''}</p>
            <p style="margin: 8px 0;"><strong>Ürün:</strong> ${data?.productTitle || ''}</p>
            <p style="margin: 8px 0;"><strong>Tutar:</strong> ${this.formatPrice(data?.totalAmount || 0)} TL</p>
          </div>
          <p>Ödeme onaylandıktan sonra ürünü kargoya hazırlamanız için bilgilendirileceksiniz.</p>
          <a href="https://tarodan.com/seller/orders/${data?.orderId || ''}" style="${buttonStyle}">Siparişi Görüntüle</a>
        </div>
      `,
      'order-paid': `
        <div style="${baseStyle}">
          <h1 style="${headerStyle}">✅ Ödeme Alındı</h1>
          <p>Merhaba ${data?.buyerName || ''},</p>
          <p>Siparişiniz için ödeme başarıyla alındı. Satıcı siparişinizi hazırlamaya başladı.</p>
          <div style="${boxStyle}">
            <p style="margin: 8px 0;"><strong>Sipariş No:</strong> ${data?.orderNumber || ''}</p>
            <p style="margin: 8px 0;"><strong>Ürün:</strong> ${data?.productTitle || ''}</p>
            <p style="margin: 8px 0;"><strong>Ödenen Tutar:</strong> ${this.formatPrice(data?.totalAmount || 0)} TL</p>
            <p style="margin: 8px 0;"><strong>İşlem No:</strong> ${data?.transactionId || ''}</p>
            <p style="margin: 8px 0;"><strong>Ödeme Yöntemi:</strong> ${data?.paymentMethod || 'Kredi Kartı'}</p>
          </div>
          ${data?.shippingAddress ? `
          <div style="${boxStyle}">
            <p style="margin: 0 0 8px 0; font-weight: 600;">Teslimat Adresi:</p>
            <p style="margin: 4px 0;">${data.shippingAddress.fullName || ''}</p>
            <p style="margin: 4px 0;">${data.shippingAddress.address || ''}</p>
            <p style="margin: 4px 0;">${data.shippingAddress.district || ''}, ${data.shippingAddress.city || ''}</p>
            <p style="margin: 4px 0;">${data.shippingAddress.zipCode || ''}</p>
            <p style="margin: 4px 0;">Tel: ${data.shippingAddress.phone || ''}</p>
          </div>
          ` : ''}
          <a href="https://tarodan.com/orders/${data?.orderId || ''}" style="${buttonStyle}">Siparişi Takip Et</a>
        </div>
      `,
      'order-paid-seller': `
        <div style="${baseStyle}">
          <h1 style="${headerStyle}">💰 Ödeme Alındı - Kargoya Hazırlayın</h1>
          <p>Merhaba ${data?.sellerName || ''},</p>
          <p>Siparişiniz için ödeme alındı. Lütfen ürünü <strong>en geç 3 iş günü</strong> içinde kargoya veriniz.</p>
          <div style="${boxStyle}">
            <p style="margin: 8px 0;"><strong>Sipariş No:</strong> ${data?.orderNumber || ''}</p>
            <p style="margin: 8px 0;"><strong>Ürün:</strong> ${data?.productTitle || ''}</p>
            <p style="margin: 8px 0;"><strong>Satış Tutarı:</strong> ${this.formatPrice(data?.totalAmount || 0)} TL</p>
            <p style="margin: 8px 0;"><strong>Komisyon:</strong> ${this.formatPrice(data?.commissionAmount || 0)} TL</p>
            <p style="margin: 8px 0; font-weight: 600; color: #059669;"><strong>Net Kazancınız:</strong> ${this.formatPrice(data?.netAmount || (data?.totalAmount - data?.commissionAmount) || 0)} TL</p>
          </div>
          ${data?.shippingAddress ? `
          <div style="${boxStyle}">
            <p style="margin: 0 0 8px 0; font-weight: 600;">Gönderilecek Adres:</p>
            <p style="margin: 4px 0;">${data.shippingAddress.fullName || ''}</p>
            <p style="margin: 4px 0;">${data.shippingAddress.address || ''}</p>
            <p style="margin: 4px 0;">${data.shippingAddress.district || ''}, ${data.shippingAddress.city || ''}</p>
            <p style="margin: 4px 0;">${data.shippingAddress.zipCode || ''}</p>
            <p style="margin: 4px 0;">Tel: ${data.shippingAddress.phone || ''}</p>
          </div>
          ` : ''}
          <a href="https://tarodan.com/seller/orders/${data?.orderId || ''}" style="${buttonStyle}">Kargo Bilgisi Gir</a>
          <p style="margin-top: 24px; color: #64748b; font-size: 14px;">
            Not: Ödemeniz, alıcı ürünü teslim aldıktan 7 gün sonra hesabınıza aktarılacaktır.
          </p>
        </div>
      `,
      'order-shipped': `
        <div style="${baseStyle}">
          <h1 style="${headerStyle}">📦 Siparişiniz Kargoya Verildi</h1>
          <p>Merhaba ${data?.buyerName || ''},</p>
          <p>Siparişiniz kargoya verildi ve yolda! Kargo takip bilgileri aşağıdadır:</p>
          <div style="${boxStyle}">
            <p style="margin: 8px 0;"><strong>Sipariş No:</strong> ${data?.orderNumber || ''}</p>
            <p style="margin: 8px 0;"><strong>Kargo Firması:</strong> ${data?.provider || ''}</p>
            <p style="margin: 8px 0;"><strong>Takip No:</strong> ${data?.trackingNumber || ''}</p>
            ${data?.estimatedDelivery ? `<p style="margin: 8px 0;"><strong>Tahmini Teslimat:</strong> ${data.estimatedDelivery}</p>` : ''}
          </div>
          ${data?.trackingUrl ? `
          <a href="${data.trackingUrl}" style="${buttonStyle}">Kargoyu Takip Et</a>
          ` : ''}
        </div>
      `,
      'order-delivered': `
        <div style="${baseStyle}">
          <h1 style="${headerStyle}">🎁 Siparişiniz Teslim Edildi</h1>
          <p>Merhaba ${data?.buyerName || ''},</p>
          <p>Siparişiniz başarıyla teslim edildi! Ürününüzü beğeneceğinizi umuyoruz.</p>
          <div style="${boxStyle}">
            <p style="margin: 8px 0;"><strong>Sipariş No:</strong> ${data?.orderNumber || ''}</p>
          </div>
          <p>Lütfen ürünü kontrol edin ve sipariş durumunu onaylayın. Onaylamanızın ardından satıcıya ödeme aktarılacaktır.</p>
          <a href="https://tarodan.com/orders/${data?.orderId || ''}" style="${buttonStyle}">Teslimatı Onayla</a>
          <p style="margin-top: 24px; color: #64748b; font-size: 14px;">
            Not: 7 gün içinde onay vermezseniz, teslimat otomatik olarak onaylanacaktır.
          </p>
        </div>
      `,
      'password-reset': `
        <div style="${baseStyle}">
          <h1 style="${headerStyle}">Şifre Sıfırlama</h1>
          <p>Şifrenizi sıfırlamak için aşağıdaki bağlantıya tıklayın:</p>
          <a href="${data?.resetUrl || ''}" style="${buttonStyle}">Şifremi Sıfırla</a>
          <p style="margin-top: 20px; color: #666;">Bu bağlantı 1 saat geçerlidir.</p>
          <p style="color: #666;">Bu talebi siz yapmadıysanız, bu e-postayı görmezden gelebilirsiniz.</p>
        </div>
      `,
      'offer-received': `
        <div style="${baseStyle}">
          <h1 style="${headerStyle}">💰 Yeni Teklif Aldınız!</h1>
          <p>Merhaba ${data?.sellerName || ''},</p>
          <p>Ürününüz için yeni bir teklif aldınız.</p>
          <div style="${boxStyle}">
            <p style="margin: 8px 0;"><strong>Ürün:</strong> ${data?.productTitle || ''}</p>
            <p style="margin: 8px 0;"><strong>Ürün Fiyatı:</strong> ${this.formatPrice(data?.productPrice || 0)} TL</p>
            <p style="margin: 8px 0; font-size: 18px; color: #059669;"><strong>Teklif Tutarı:</strong> ${this.formatPrice(data?.offerAmount || 0)} TL</p>
            <p style="margin: 8px 0;"><strong>Teklif Veren:</strong> ${data?.buyerName || ''}</p>
          </div>
          <p style="color: #dc2626; font-weight: 500;">
            ⏰ Bu teklifin süresi ${data?.expiresAt ? new Date(data.expiresAt).toLocaleString('tr-TR') : '24 saat içinde'} dolacak.
          </p>
          <div style="margin-top: 20px;">
            <a href="https://tarodan.com/seller/offers/${data?.offerId || ''}" style="${buttonStyle}">Teklifi İncele</a>
          </div>
          <p style="margin-top: 24px; color: #64748b; font-size: 14px;">
            Teklifi kabul etmek, reddetmek veya karşı teklif vermek için yukarıdaki butona tıklayın.
          </p>
        </div>
      `,
      'offer-accepted': `
        <div style="${baseStyle}">
          <h1 style="${headerStyle}">🎉 Teklifiniz Kabul Edildi!</h1>
          <p>Merhaba ${data?.buyerName || ''},</p>
          <p>Tebrikler! <strong>${data?.productTitle || ''}</strong> ürünü için verdiğiniz teklif satıcı tarafından kabul edildi.</p>
          <div style="${boxStyle}">
            <p style="margin: 8px 0;"><strong>Ürün:</strong> ${data?.productTitle || ''}</p>
            <p style="margin: 8px 0;"><strong>Kabul Edilen Tutar:</strong> ${this.formatPrice(data?.offerAmount || 0)} TL</p>
            <p style="margin: 8px 0;"><strong>Satıcı:</strong> ${data?.sellerName || ''}</p>
            <p style="margin: 8px 0;"><strong>Sipariş No:</strong> ${data?.orderNumber || ''}</p>
          </div>
          <p style="color: #dc2626; font-weight: 500;">
            ⚠️ Siparişinizi tamamlamak için ödeme yapmanız gerekmektedir.
          </p>
          <div style="margin-top: 20px;">
            <a href="https://tarodan.com/orders/${data?.orderId || ''}/payment" style="${buttonStyle}">Ödeme Yap</a>
          </div>
          <p style="margin-top: 24px; color: #64748b; font-size: 14px;">
            Not: Ödeme işlemi 30 dakika içinde tamamlanmazsa sipariş iptal edilebilir ve ürün tekrar satışa çıkarılabilir.
          </p>
        </div>
      `,
      'wishlist-price-change': `
        <div style="${baseStyle}">
          <h1 style="${headerStyle}">${data?.isPriceDrop ? '🎉 Fiyat Düştü!' : '📈 Fiyat Değişti!'}</h1>
          <p>Merhaba ${data?.userName || 'Değerli Üye'},</p>
          <p>İstek listenizdeki bir ürünün fiyatı değişti:</p>
          <div style="${boxStyle}">
            <p style="margin: 8px 0; font-size: 18px; font-weight: 600;"><strong>${data?.productTitle || ''}</strong></p>
            <p style="margin: 8px 0;"><strong>Eski Fiyat:</strong> <span style="text-decoration: line-through; color: #64748b;">${this.formatPrice(data?.oldPrice || 0)} TL</span></p>
            <p style="margin: 8px 0; font-size: 20px; color: ${data?.isPriceDrop ? '#059669' : '#dc2626'}; font-weight: 600;">
              <strong>Yeni Fiyat:</strong> ${this.formatPrice(data?.newPrice || 0)} TL
            </p>
            <p style="margin: 8px 0; color: ${data?.isPriceDrop ? '#059669' : '#dc2626'};">
              <strong>${data?.isPriceDrop ? 'İndirim:' : 'Artış:'}</strong> ${data?.priceChange || 0} TL (${data?.priceChangePercent || 0}%)
            </p>
          </div>
          ${data?.isPriceDrop ? `
          <p style="color: #059669; font-weight: 500; margin: 20px 0;">
            🎉 Bu ürünün fiyatı düştü! Hemen almak için aşağıdaki butona tıklayın.
          </p>
          ` : `
          <p style="color: #dc2626; font-weight: 500; margin: 20px 0;">
            ⚠️ Bu ürünün fiyatı arttı. Hala ilginizi çekiyorsa hemen alabilirsiniz.
          </p>
          `}
          <a href="${data?.productUrl || 'https://tarodan.com'}" style="${buttonStyle}">Ürünü Görüntüle</a>
          <p style="margin-top: 24px; color: #64748b; font-size: 14px;">
            Bu ürünü istek listenizden kaldırmak için ürün sayfasına gidip "İstek Listesinden Çıkar" butonuna tıklayabilirsiniz.
          </p>
        </div>
      `,
      'marketing-newsletter': `
        <div style="${baseStyle}">
          <h1 style="${headerStyle}">📰 Tarodan Haftalık Bülteni</h1>
          <p>Merhaba ${data?.userName || 'Değerli Üye'},</p>
          <p>Bu hafta en çok ilgi gören ürünler:</p>
          ${data?.trendingProducts?.length > 0 ? `
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 24px 0;">
            ${data.trendingProducts.map((product: any) => `
              <div style="${boxStyle}">
                ${product.imageUrl ? `<img src="${product.imageUrl}" alt="${product.title}" style="width: 100%; border-radius: 8px; margin-bottom: 12px;" />` : ''}
                <p style="font-weight: 600; margin: 8px 0;">${product.title}</p>
                <p style="color: #4f46e5; font-size: 18px; font-weight: 600; margin: 8px 0;">${this.formatPrice(product.price)} TL</p>
                <a href="${product.productUrl}" style="${buttonStyle}">İncele</a>
              </div>
            `).join('')}
          </div>
          ` : '<p>Bu hafta öne çıkan ürün bulunmamaktadır.</p>'}
          <p style="margin-top: 24px; color: #64748b; font-size: 14px;">
            <a href="${data?.unsubscribeUrl || 'https://tarodan.com/profile/settings'}" style="color: #64748b;">Bildirim tercihlerinizi değiştirmek için tıklayın</a>
          </p>
        </div>
      `,
      'marketing-monthly': `
        <div style="${baseStyle}">
          <h1 style="${headerStyle}">🎁 Tarodan Aylık Özel Fırsatlar</h1>
          <p>Merhaba ${data?.userName || 'Değerli Üye'},</p>
          <p>Bu ay sizin için özel olarak seçtiğimiz ürünler:</p>
          ${data?.featuredProducts?.length > 0 ? `
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 24px 0;">
            ${data.featuredProducts.map((product: any) => `
              <div style="${boxStyle}">
                ${product.imageUrl ? `<img src="${product.imageUrl}" alt="${product.title}" style="width: 100%; border-radius: 8px; margin-bottom: 12px;" />` : ''}
                <p style="font-weight: 600; margin: 8px 0;">${product.title}</p>
                <p style="color: #4f46e5; font-size: 18px; font-weight: 600; margin: 8px 0;">${this.formatPrice(product.price)} TL</p>
                <a href="${product.productUrl}" style="${buttonStyle}">İncele</a>
              </div>
            `).join('')}
          </div>
          ` : '<p>Bu ay öne çıkan ürün bulunmamaktadır.</p>'}
          <p style="margin-top: 24px; color: #64748b; font-size: 14px;">
            <a href="${data?.unsubscribeUrl || 'https://tarodan.com/profile/settings'}" style="color: #64748b;">Bildirim tercihlerinizi değiştirmek için tıklayın</a>
          </p>
        </div>
      `,
    };

    return templates[template] || `<p>${JSON.stringify(data)}</p>`;
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
