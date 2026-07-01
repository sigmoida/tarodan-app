import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../../prisma';
import { StorageService } from '../storage/storage.service';
import { SmtpProvider } from '../notification/providers/smtp.provider';
import {
  renderEmailTemplate,
  substituteEmailVariables,
  getEmailTemplateSubject,
} from '../../common/helpers/email-template-renderer';

/**
 * Kurumsal (şirket) satıcının siparişe ELLE yüklediği ÜRÜN faturası (PDF).
 * Tarodan'ın eLogo gelir e-Arşivlerinden AYRI. Sipariş başına tek; değiştirilebilir.
 * Yüklenince alıcıya PDF ekli mail gider. Yalnız ödeme alındıktan sonra.
 */
@Injectable()
export class SellerInvoiceService {
  private readonly logger = new Logger(SellerInvoiceService.name);

  // Ödeme alınmış (ve iptal/refund olmayan) durumlar — bu aşamalarda fatura yüklenebilir.
  private static readonly POST_PAYMENT: OrderStatus[] = [
    OrderStatus.paid,
    OrderStatus.preparing,
    OrderStatus.shipped,
    OrderStatus.delivered,
    OrderStatus.awaiting_buyer_confirmation,
    OrderStatus.completed,
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly smtp: SmtpProvider,
    private readonly config: ConfigService,
  ) {}

  /**
   * Kullanıcı kurumsal (şirket) hesap mı? Yalnız bunlar fatura yükleyebilir.
   * Kanonik tanım (bkz. UserService.isBusinessAccount): aktif "iş üyeliği"
   * (business üyelik katmanı) + companyName. businessStatus'a bakmayız — o
   * ayrı bir KYC alanıdır ve iş üyeliği olan hesaplarda dahi boş olabilir.
   */
  private async isCorporateSeller(userId: string): Promise<boolean> {
    const u = await this.prisma.user
      .findUnique({
        where: { id: userId },
        select: { companyName: true, membership: { select: { tier: { select: { type: true } } } } },
      })
      .catch(() => null);
    return !!u?.companyName && u.membership?.tier?.type === 'business';
  }

  async uploadForOrder(
    orderId: string,
    sellerId: string,
    file: Express.Multer.File | undefined,
  ): Promise<{ success: boolean; replaced: boolean; fileName: string }> {
    if (!file) throw new BadRequestException('Fatura PDF dosyası gerekli');
    if (file.mimetype !== 'application/pdf') throw new BadRequestException('Yalnız PDF yüklenebilir');
    if (file.size > 10 * 1024 * 1024) throw new BadRequestException('PDF en fazla 10 MB olabilir');

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        sellerId: true,
        buyerId: true,
        status: true,
        orderNumber: true,
        product: { select: { title: true } },
        buyer: { select: { email: true, displayName: true } },
        seller: { select: { displayName: true, companyName: true } },
      },
    });
    if (!order) throw new NotFoundException('Sipariş bulunamadı');
    if (order.sellerId !== sellerId) throw new ForbiddenException('Bu siparişin satıcısı değilsiniz');
    if (!(await this.isCorporateSeller(sellerId))) {
      throw new ForbiddenException('Yalnız iş üyeliği olan kurumsal (şirket) satıcılar fatura yükleyebilir');
    }
    if (!SellerInvoiceService.POST_PAYMENT.includes(order.status)) {
      throw new BadRequestException('Fatura yalnız ödeme alındıktan sonra yüklenebilir');
    }

    const up = await this.storage.uploadFile(
      file.buffer,
      {
        bucket: 'documents',
        folder: 'seller-invoices',
        filename: `order-${order.orderNumber}-${Date.now()}.pdf`,
        mimeType: 'application/pdf',
        isPublic: false,
        entityType: 'seller_invoice',
        entityId: orderId,
      } as any,
      sellerId,
    );

    const existing = await this.prisma.sellerUploadedInvoice.findUnique({ where: { orderId } });
    const now = new Date();
    const rec = await this.prisma.sellerUploadedInvoice.upsert({
      where: { orderId },
      create: {
        orderId,
        sellerId,
        buyerId: order.buyerId,
        pdfKey: up.key,
        fileName: file.originalname || 'fatura.pdf',
        fileSize: file.size,
        uploadedAt: now,
      },
      update: {
        pdfKey: up.key,
        fileName: file.originalname || 'fatura.pdf',
        fileSize: file.size,
        replacedAt: now,
        emailSentAt: null,
      },
    });

    // Alıcıya PDF ekli mail (şablon admin'den düzenlenebilir: 'seller-invoice').
    await this.emailBuyer(order, file.buffer, rec.id);

    return { success: true, replaced: !!existing, fileName: rec.fileName };
  }

  private async emailBuyer(
    order: {
      orderNumber: string;
      buyer: { email: string | null; displayName: string | null } | null;
      seller: { displayName: string | null; companyName: string | null } | null;
      product: { title: string | null } | null;
    },
    pdf: Buffer,
    recId: string,
  ): Promise<void> {
    if (!order.buyer?.email) return;
    try {
      const data = {
        buyerName: order.buyer.displayName || 'Değerli Müşterimiz',
        sellerName: order.seller?.companyName || order.seller?.displayName || 'Satıcı',
        orderNumber: order.orderNumber,
        productTitle: order.product?.title || '',
      };
      const frontendUrl = this.config.get<string>('FRONTEND_URL', 'https://tarodan.com');
      const dbTpl = await this.prisma.emailTemplate
        .findUnique({ where: { key: 'seller-invoice' } })
        .catch(() => null);
      const html = dbTpl?.bodyHtml
        ? substituteEmailVariables(dbTpl.bodyHtml, data)
        : renderEmailTemplate('seller-invoice', data, frontendUrl);
      const subject = dbTpl?.subject
        ? substituteEmailVariables(dbTpl.subject, data)
        : getEmailTemplateSubject('seller-invoice', data);
      await this.smtp.sendEmail({
        to: order.buyer.email,
        subject,
        html,
        attachments: [{ filename: `fatura-${order.orderNumber}.pdf`, content: pdf }],
      } as any);
      await this.prisma.sellerUploadedInvoice
        .update({ where: { id: recId }, data: { emailSentAt: new Date() } })
        .catch(() => undefined);
    } catch (e: any) {
      this.logger.warn(`satıcı faturası mail hatası (order ${order.orderNumber}): ${e?.message}`);
    }
  }

  /** Sipariş detayı için: fatura var mı + geçerli kullanıcı yükleyebilir mi. */
  async getForOrder(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { sellerId: true, buyerId: true, status: true },
    });
    if (!order) throw new NotFoundException('Sipariş bulunamadı');
    if (order.sellerId !== userId && order.buyerId !== userId) {
      throw new ForbiddenException('Bu siparişe erişim yetkiniz yok');
    }
    const inv = await this.prisma.sellerUploadedInvoice.findUnique({
      where: { orderId },
      select: { id: true, fileName: true, uploadedAt: true, replacedAt: true, emailSentAt: true },
    });
    const isSeller = order.sellerId === userId;
    const canUpload =
      isSeller &&
      SellerInvoiceService.POST_PAYMENT.includes(order.status) &&
      (await this.isCorporateSeller(userId));
    return { invoice: inv, canUpload, isSeller, isBuyer: order.buyerId === userId };
  }

  /** PDF indirme (satıcı veya alıcı) — S3 presigned URL. */
  async getDownloadUrl(orderId: string, userId: string): Promise<{ url: string; fileName: string }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { sellerId: true, buyerId: true },
    });
    if (!order) throw new NotFoundException('Sipariş bulunamadı');
    if (order.sellerId !== userId && order.buyerId !== userId) {
      throw new ForbiddenException('Bu faturaya erişim yetkiniz yok');
    }
    const inv = await this.prisma.sellerUploadedInvoice.findUnique({
      where: { orderId },
      select: { pdfKey: true, fileName: true },
    });
    if (!inv) throw new NotFoundException('Bu siparişe yüklenmiş fatura yok');
    const url = await this.storage.getPresignedDownloadUrl('documents', inv.pdfKey, 3600);
    return { url, fileName: inv.fileName };
  }
}
