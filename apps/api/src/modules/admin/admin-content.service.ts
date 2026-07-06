import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { AdminAuditService } from './admin-audit.service';
import { renderEmailTemplate, getEmailTemplateSubject } from '../../common/helpers/email-template-renderer';
import {
  CreateStaticPageDto,
  UpdateStaticPageDto,
  UpdateEmailTemplateDto,
} from './dto';
import { EventService } from '../events/event.service';

/**
 * İçerik yönetimi admin operasyonları (statik sayfalar + e-posta şablonları) —
 * AdminService'in STATIC PAGES ve EMAIL TEMPLATES bölümlerinden birebir taşındı.
 * AdminService aynı imzalarla buraya delege eder.
 */
@Injectable()
export class AdminContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    private readonly eventService: EventService,
  ) {}

  // ==================== STATIC PAGES ====================

  async getPages() {
    const pages = await this.prisma.staticPage.findMany({
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
    });
    return {
      data: pages.map((p) => ({
        id: p.id,
        slug: p.slug,
        title: p.title,
        metaTitle: p.metaTitle,
        metaDescription: p.metaDescription ? p.metaDescription.slice(0, 100) : null,
        isPublished: p.isPublished,
        sortOrder: p.sortOrder,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
    };
  }

  async getPageById(id: string) {
    const page = await this.prisma.staticPage.findUnique({ where: { id } });
    if (!page) throw new NotFoundException('Sayfa bulunamadı');
    return page;
  }

  async getPageBySlug(slug: string) {
    const page = await this.prisma.staticPage.findUnique({ where: { slug } });
    if (!page) throw new NotFoundException('Sayfa bulunamadı');
    return page;
  }

  async createPage(adminId: string, dto: CreateStaticPageDto) {
    const existing = await this.prisma.staticPage.findUnique({ where: { slug: dto.slug } });
    if (existing) throw new BadRequestException('Bu slug zaten kullanılıyor');
    const page = await this.prisma.staticPage.create({
      data: {
        slug: dto.slug.trim().toLowerCase().replace(/\s+/g, '-'),
        title: dto.title,
        content: dto.content,
        metaTitle: dto.metaTitle ?? null,
        metaDescription: dto.metaDescription ?? null,
        metaKeywords: dto.metaKeywords ?? null,
        isPublished: dto.isPublished ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    await this.audit.createAuditLog(adminId, 'static_page_create', 'StaticPage', page.id, null, page);
    return page;
  }

  async updatePage(adminId: string, id: string, dto: UpdateStaticPageDto) {
    const existing = await this.prisma.staticPage.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Sayfa bulunamadı');
    if (dto.slug && dto.slug !== existing.slug) {
      const duplicate = await this.prisma.staticPage.findUnique({ where: { slug: dto.slug } });
      if (duplicate) throw new BadRequestException('Bu slug zaten kullanılıyor');
    }
    const page = await this.prisma.staticPage.update({
      where: { id },
      data: {
        ...(dto.slug != null && { slug: dto.slug.trim().toLowerCase().replace(/\s+/g, '-') }),
        ...(dto.title != null && { title: dto.title }),
        ...(dto.content != null && { content: dto.content }),
        ...(dto.metaTitle !== undefined && { metaTitle: dto.metaTitle || null }),
        ...(dto.metaDescription !== undefined && { metaDescription: dto.metaDescription || null }),
        ...(dto.metaKeywords !== undefined && { metaKeywords: dto.metaKeywords || null }),
        ...(dto.isPublished != null && { isPublished: dto.isPublished }),
        ...(dto.sortOrder != null && { sortOrder: dto.sortOrder }),
      },
    });
    await this.audit.createAuditLog(adminId, 'static_page_update', 'StaticPage', id, existing, page);
    return page;
  }

  async deletePage(adminId: string, id: string) {
    const page = await this.prisma.staticPage.findUnique({ where: { id } });
    if (!page) throw new NotFoundException('Sayfa bulunamadı');
    await this.prisma.staticPage.delete({ where: { id } });
    await this.audit.createAuditLog(adminId, 'static_page_delete', 'StaticPage', id, page, null);
    return { success: true };
  }

  // ==================== EMAIL TEMPLATES ====================

  private readonly EMAIL_TEMPLATE_KEYS: Array<{ key: string; name: string; group: string }> = [
    // Hesap
    { key: 'welcome',                    name: 'Hoş geldin',                          group: 'Hesap' },
    { key: 'email-verification',         name: 'E-posta doğrulama',                   group: 'Hesap' },
    { key: 'password-reset',             name: 'Şifre sıfırlama',                     group: 'Hesap' },
    // Sipariş
    { key: 'order-confirmation',         name: 'Sipariş onayı (alıcı)',               group: 'Sipariş' },
    { key: 'order-created-buyer',        name: 'Sipariş oluşturuldu (alıcı)',         group: 'Sipariş' },
    { key: 'order-created-seller',       name: 'Yeni sipariş (satıcı)',               group: 'Sipariş' },
    { key: 'order-paid',                 name: 'Ödeme alındı (alıcı)',                group: 'Sipariş' },
    { key: 'order-paid-group',           name: 'Ödeme alındı - sepet (alıcı)',        group: 'Sipariş' },
    { key: 'order-paid-seller',          name: 'Ödeme alındı (satıcı)',               group: 'Sipariş' },
    { key: 'order-shipped',              name: 'Kargoya verildi',                     group: 'Sipariş' },
    { key: 'order-delivered',            name: 'Teslim edildi',                       group: 'Sipariş' },
    // Ödeme
    { key: 'payment-received',           name: 'Ödeme alındı',                        group: 'Ödeme' },
    { key: 'payment-failed',             name: 'Ödeme başarısız',                     group: 'Ödeme' },
    { key: 'payment-refunded',           name: 'İade tamamlandı (alıcı)',             group: 'Ödeme' },
    { key: 'payment-refunded-seller',    name: 'İade bildirimi (satıcı)',             group: 'Ödeme' },
    // Teklif
    { key: 'offer-received',             name: 'Yeni teklif (satıcı)',                group: 'Teklif' },
    { key: 'offer-accepted',             name: 'Teklif kabul edildi (alıcı)',         group: 'Teklif' },
    // Ürün
    { key: 'product-approved',           name: 'Ürün onaylandı',                      group: 'Ürün' },
    { key: 'wishlist-price-change',      name: 'Fiyat değişimi (istek listesi)',      group: 'Ürün' },
    // Üyelik
    { key: 'premium-offer',              name: 'Premium üyelik teklifi',              group: 'Üyelik' },
    { key: 'membership-expiring',        name: 'Üyelik bitiyor (7 gün)',              group: 'Üyelik' },
    { key: 'membership-expiring-urgent', name: 'Üyelik bitiyor (yarın)',              group: 'Üyelik' },
    // Pazarlama
    { key: 'marketing-newsletter',       name: 'Haftalık bülten',                     group: 'Pazarlama' },
    { key: 'marketing-monthly',          name: 'Aylık fırsatlar',                     group: 'Pazarlama' },
    // İş Başvurusu
    { key: 'seller-application-approved', name: 'Kurumsal başvuru onaylandı',          group: 'İş Başvurusu' },
    { key: 'seller-application-rejected', name: 'Kurumsal başvuru reddedildi',         group: 'İş Başvurusu' },
    // Sipariş / İade
    { key: 'seller-did-not-ship-refunded', name: 'Satıcı kargoya vermedi (iade)',      group: 'İade' },
    // Takas
    { key: 'trade-received',              name: 'Yeni takas teklifi (alıcı)',           group: 'Takas' },
    { key: 'trade-accepted',              name: 'Takas kabul edildi',                   group: 'Takas' },
    { key: 'trade-shipped',               name: 'Takas kargoya verildi',                group: 'Takas' },
    { key: 'trade-completed',             name: 'Takas tamamlandı',                     group: 'Takas' },
    // Misafir
    { key: 'guest-checkout-otp',          name: 'Misafir sipariş OTP kodu',             group: 'Misafir' },
    // Fatura
    { key: 'invoice-buyer',               name: 'Fatura (alıcı)',                       group: 'Fatura' },
    { key: 'invoice-seller',              name: 'Satış faturası (satıcı)',               group: 'Fatura' },
    // Sipariş iptali
    { key: 'order-cancelled-buyer',       name: 'Sipariş iptal edildi (alıcı)',         group: 'Sipariş' },
    { key: 'order-cancelled-seller',      name: 'Sipariş iptal edildi (satıcı)',        group: 'Sipariş' },
    // İade akışı
    { key: 'refund-requested-seller',     name: 'İade talebi alındı (satıcı)',          group: 'İade' },
    { key: 'refund-approved-buyer',       name: 'İade onaylandı (alıcı)',               group: 'İade' },
    { key: 'refund-rejected-buyer',       name: 'İade reddedildi (alıcı)',              group: 'İade' },
    { key: 'refund-return-label-buyer',   name: 'İade kargo bilgileri (alıcı)',         group: 'İade' },
    // Değerlendirme
    { key: 'review-received-seller',      name: 'Değerlendirme alındı (satıcı)',        group: 'Değerlendirme' },
    // İlan & Stok
    { key: 'listing-expiring',            name: 'İlan süresi doluyor',                  group: 'İlan' },
    { key: 'listing-expired',             name: 'İlan süresi doldu',                    group: 'İlan' },
    { key: 'back-in-stock',               name: 'Stoğa geri geldi',                     group: 'İlan' },
    // Sosyal
    { key: 'new-follower',                name: 'Yeni takipçi',                         group: 'Sosyal' },
    // Ödeme aktarımı
    { key: 'payout-released-seller',      name: 'Ödeme aktarıldı (satıcı)',             group: 'Ödeme' },
  ];

  substituteVariables(text: string, data: Record<string, any>): string {
    if (!text) return text;
    return text.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const val = data[key];
      return val != null ? String(val) : `{{${key}}}`;
    });
  }

  async getEmailTemplates() {
    const dbTemplates = await this.prisma.emailTemplate.findMany();
    const dbMap = new Map(dbTemplates.map((t) => [t.key, t]));
    const list = this.EMAIL_TEMPLATE_KEYS.map(({ key, name, group }) => {
      const db = dbMap.get(key);
      return {
        key,
        name: db?.name ?? name,
        group,
        subject: db?.subject ?? null,
        hasCustomBody: !!db?.bodyHtml,
        variablesJson: db?.variablesJson,
        updatedAt: db?.updatedAt ?? null,
      };
    });
    return { data: list };
  }

  async getEmailTemplate(key: string) {
    const db = await this.prisma.emailTemplate.findUnique({ where: { key } });
    const meta = this.EMAIL_TEMPLATE_KEYS.find((m) => m.key === key);
    if (!meta && !db) throw new NotFoundException('Şablon bulunamadı');
    return {
      key,
      name: db?.name ?? meta?.name ?? key,
      subject: db?.subject ?? null,
      bodyHtml: db?.bodyHtml ?? null,
      variablesJson: db?.variablesJson ?? null,
      isCustom: !!db,
    };
  }

  async updateEmailTemplate(adminId: string, key: string, dto: UpdateEmailTemplateDto) {
    const meta = this.EMAIL_TEMPLATE_KEYS.find((m) => m.key === key);
    if (!meta) throw new NotFoundException('Geçersiz şablon anahtarı');
    const existing = await this.prisma.emailTemplate.findUnique({ where: { key } });
    const data = {
      name: dto.name ?? meta.name,
      subject: dto.subject ?? existing?.subject ?? '',
      bodyHtml: dto.bodyHtml ?? existing?.bodyHtml ?? '',
      variablesJson: dto.variablesJson ?? existing?.variablesJson ?? null,
    };
    const template = await this.prisma.emailTemplate.upsert({
      where: { key },
      create: { key, ...data },
      update: data,
    });
    await this.audit.createAuditLog(adminId, 'email_template_update', 'EmailTemplate', template.id, existing, template);
    return template;
  }

  async resetEmailTemplate(adminId: string, key: string) {
    const meta = this.EMAIL_TEMPLATE_KEYS.find((m) => m.key === key);
    if (!meta) throw new NotFoundException('Geçersiz şablon anahtarı');
    const existing = await this.prisma.emailTemplate.findUnique({ where: { key } });
    if (existing) {
      await this.prisma.emailTemplate.delete({ where: { key } });
      await this.audit.createAuditLog(adminId, 'email_template_reset', 'EmailTemplate', existing.id, existing, null);
    }
    return { success: true };
  }

  async previewEmailTemplate(
    key: string,
    templateData?: Record<string, any>,
    overrideHtml?: string,
    overrideSubject?: string,
  ) {
    const sample = templateData || {
      name: 'Örnek Kullanıcı',
      buyerName: 'Alıcı',
      sellerName: 'Satıcı',
      orderNumber: 'TRD-12345',
      orderId: 'sample-order-id',
      productTitle: 'Örnek Ürün',
      totalAmount: 199.99,
      verifyUrl: 'https://tarodan.com/verify?token=sample',
      resetUrl: 'https://tarodan.com/reset?token=sample',
      trackingNumber: '1234567890',
      provider: 'Sürat Kargo',
    };

    // Draft preview — admin is editing but hasn't saved yet
    if (overrideHtml !== undefined || overrideSubject !== undefined) {
      const html = overrideHtml
        ? this.substituteVariables(overrideHtml, sample)
        : renderEmailTemplate(key, sample, 'https://tarodan.com');
      const subject = overrideSubject
        ? this.substituteVariables(overrideSubject, sample)
        : getEmailTemplateSubject(key, sample);
      return { subject, html };
    }

    const db = await this.prisma.emailTemplate.findUnique({ where: { key } });
    if (db?.bodyHtml) {
      return {
        subject: this.substituteVariables(db.subject || getEmailTemplateSubject(key, sample), sample),
        html: this.substituteVariables(db.bodyHtml, sample),
      };
    }

    // No custom template — return the actual default so admin can see what's being sent
    return {
      subject: getEmailTemplateSubject(key, sample),
      html: renderEmailTemplate(key, sample, 'https://tarodan.com'),
    };
  }

  async sendTestEmail(key: string, dto: { to: string; templateData?: Record<string, any> }) {
    await this.eventService.queueEmail({
      to: dto.to,
      template: key,
      subject: '',
      templateData: dto.templateData || {},
    });
    return { success: true, message: 'Test e-postası kuyruğa eklendi' };
  }

}
