import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BusinessStatus, OrderStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma";
import { i18nMessage } from "../i18n";
import { StorageService } from "../storage/storage.service";
import { SmtpProvider } from "../mail/smtp.provider";
import { renderManagedEmailTemplate } from "../../common/helpers/email-template-renderer";
import { isBusinessMembershipEntitled } from "../membership/membership.util";

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

  /** Yalnız efektif Business üyeliği ve onaylı şirket kimliği fatura yükleyebilir. */
  private async isCorporateSeller(userId: string): Promise<boolean> {
    const u = await this.prisma.user
      .findUnique({
        where: { id: userId },
        select: {
          companyName: true,
          taxId: true,
          businessStatus: true,
          membership: {
            select: {
              status: true,
              currentPeriodEnd: true,
              tier: { select: { type: true, isActive: true } },
            },
          },
        },
      })
      .catch(() => null);
    return isBusinessMembershipEntitled(u?.membership, u);
  }

  async uploadForOrder(
    orderId: string,
    sellerId: string,
    file: Express.Multer.File | undefined,
  ): Promise<{ success: boolean; replaced: boolean; fileName: string }> {
    if (!file)
      throw new BadRequestException(
        i18nMessage("server.order.invoicePdfRequired"),
      );
    if (file.mimetype !== "application/pdf")
      throw new BadRequestException(
        i18nMessage("server.order.invoiceOnlyPdfAllowed"),
      );
    if (file.size > 10 * 1024 * 1024)
      throw new BadRequestException(
        i18nMessage("server.order.invoicePdfTooLarge"),
      );

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
    if (!order)
      throw new NotFoundException(i18nMessage("server.order.notFound"));
    if (order.sellerId !== sellerId)
      throw new ForbiddenException(i18nMessage("server.order.notOrderSeller"));
    if (!(await this.isCorporateSeller(sellerId))) {
      throw new ForbiddenException(
        i18nMessage("server.order.invoiceOnlyCorporateSeller"),
      );
    }
    if (!SellerInvoiceService.POST_PAYMENT.includes(order.status)) {
      throw new BadRequestException(
        i18nMessage("server.order.invoiceOnlyAfterPayment"),
      );
    }

    const up = await this.storage.uploadFile(
      file.buffer,
      {
        bucket: "documents",
        folder: "seller-invoices",
        filename: `order-${order.orderNumber}-${Date.now()}.pdf`,
        mimeType: "application/pdf",
        isPublic: false,
        entityType: "seller_invoice",
        entityId: orderId,
      } as any,
      sellerId,
    );

    const existing = await this.prisma.sellerUploadedInvoice.findUnique({
      where: { orderId },
    });
    const now = new Date();
    const rec = await this.prisma.sellerUploadedInvoice.upsert({
      where: { orderId },
      create: {
        orderId,
        sellerId,
        buyerId: order.buyerId,
        pdfKey: up.key,
        fileName: file.originalname || "fatura.pdf",
        fileSize: file.size,
        uploadedAt: now,
      },
      update: {
        pdfKey: up.key,
        fileName: file.originalname || "fatura.pdf",
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
        buyerName: order.buyer.displayName || "Değerli Müşterimiz",
        sellerName:
          order.seller?.companyName || order.seller?.displayName || "Satıcı",
        orderNumber: order.orderNumber,
        productTitle: order.product?.title || "",
      };
      const frontendUrl = this.config.get<string>(
        "FRONTEND_URL",
        "https://tarodan.com.tr",
      );
      const dbTpl = await this.prisma.emailTemplate
        .findUnique({ where: { key: "seller-invoice" } })
        .catch(() => null);
      const email = renderManagedEmailTemplate(
        "seller-invoice",
        { ...data, to: order.buyer.email },
        dbTpl,
        frontendUrl,
      );
      await this.smtp.sendEmail({
        to: order.buyer.email,
        subject: email.subject,
        html: email.html,
        attachments: [
          { filename: `fatura-${order.orderNumber}.pdf`, content: pdf },
        ],
      } as any);
      await this.prisma.sellerUploadedInvoice
        .update({ where: { id: recId }, data: { emailSentAt: new Date() } })
        .catch(() => undefined);
    } catch (e: any) {
      this.logger.warn(
        `satıcı faturası mail hatası (order ${order.orderNumber}): ${e?.message}`,
      );
    }
  }

  /**
   * Teslim edilmiş ama satıcı ürün faturası HÂLÂ yüklenmemiş siparişler:
   * sayılır (alarm) ve satıcıya sipariş başına TEK hatırlatma gönderilir.
   *
   * Kapsam mükellefiyet testiyle belirlenir (onaylı işletme + vergi no) —
   * üyelikle DEĞİL: fatura kesme yükümlülüğü mükelleflikten doğar, satıcı
   * üyeliğini düşürse bile geçmiş siparişin faturası kesilmek zorundadır.
   *
   * İşaret yalnız e-posta GERÇEKTEN gittiyse konur; aksi halde sonraki tur
   * yeniden dener.
   */
  async remindMissing(opts: {
    deadlineDays: number;
    batch?: number;
    now?: Date;
  }): Promise<{ missing: number; reminded: number }> {
    const now = opts.now ?? new Date();
    const deliveredBefore = new Date(
      now.getTime() - opts.deadlineDays * 24 * 60 * 60 * 1000,
    );
    const scope: Prisma.OrderWhereInput = {
      status: {
        in: [
          OrderStatus.delivered,
          OrderStatus.awaiting_buyer_confirmation,
          OrderStatus.completed,
        ],
      },
      deliveredAt: { lt: deliveredBefore },
      sellerUploadedInvoice: { is: null },
      seller: {
        businessStatus: BusinessStatus.approved,
        taxId: { not: null },
      },
    };

    const missing = await this.prisma.order.count({ where: scope });
    if (missing === 0) return { missing: 0, reminded: 0 };

    const pending = await this.prisma.order.findMany({
      where: { ...scope, sellerInvoiceReminderAt: null },
      orderBy: { deliveredAt: "asc" },
      take: opts.batch ?? 100,
      select: {
        id: true,
        orderNumber: true,
        deliveredAt: true,
        product: { select: { title: true } },
        seller: {
          select: {
            id: true,
            email: true,
            displayName: true,
            companyName: true,
          },
        },
      },
    });

    let reminded = 0;
    for (const order of pending) {
      const sent = await this.emailSellerReminder(order);
      if (!sent) continue;
      await this.prisma.order
        .update({
          where: { id: order.id },
          data: { sellerInvoiceReminderAt: now },
        })
        .catch((e: any) =>
          this.logger.warn(
            `satıcı fatura hatırlatma işareti yazılamadı ${order.id}: ${e?.message}`,
          ),
        );
      reminded++;
    }
    return { missing, reminded };
  }

  /** Hatırlatma maili. Gönderilemezse `false` — çağıran işareti KOYMAZ. */
  private async emailSellerReminder(order: {
    orderNumber: string;
    deliveredAt?: Date | null;
    product?: { title: string | null } | null;
    seller?: {
      email: string | null;
      displayName: string | null;
      companyName: string | null;
    } | null;
  }): Promise<boolean> {
    if (!order.seller?.email) return false;
    try {
      const frontendUrl = this.config.get<string>(
        "FRONTEND_URL",
        "https://tarodan.com.tr",
      );
      const dbTpl = await this.prisma.emailTemplate
        .findUnique({ where: { key: "seller-invoice-reminder" } })
        .catch(() => null);
      const email = renderManagedEmailTemplate(
        "seller-invoice-reminder",
        {
          to: order.seller.email,
          sellerName:
            order.seller.companyName || order.seller.displayName || "Satıcı",
          orderNumber: order.orderNumber,
          productTitle: order.product?.title || "",
          deliveredAt: order.deliveredAt?.toISOString() ?? null,
        },
        dbTpl,
        frontendUrl,
      );
      await this.smtp.sendEmail({
        to: order.seller.email,
        subject: email.subject,
        html: email.html,
      } as any);
      return true;
    } catch (e: any) {
      this.logger.warn(
        `satıcı fatura hatırlatma maili hatası (order ${order.orderNumber}): ${e?.message}`,
      );
      return false;
    }
  }

  /** Sipariş detayı için: fatura var mı + geçerli kullanıcı yükleyebilir mi. */
  async getForOrder(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        sellerId: true,
        buyerId: true,
        status: true,
        seller: { select: { businessStatus: true, taxId: true } },
      },
    });
    if (!order)
      throw new NotFoundException(i18nMessage("server.order.notFound"));
    if (order.sellerId !== userId && order.buyerId !== userId) {
      throw new ForbiddenException(
        i18nMessage("server.order.orderAccessForbidden"),
      );
    }
    const inv = await this.prisma.sellerUploadedInvoice.findUnique({
      where: { orderId },
      select: {
        id: true,
        fileName: true,
        uploadedAt: true,
        replacedAt: true,
        emailSentAt: true,
      },
    });
    const isSeller = order.sellerId === userId;
    const canUpload =
      isSeller &&
      SellerInvoiceService.POST_PAYMENT.includes(order.status) &&
      (await this.isCorporateSeller(userId));
    return {
      invoice: inv,
      canUpload,
      isSeller,
      isBuyer: order.buyerId === userId,
      /**
       * Bu satıcı ÜRÜN faturası düzenler mi (mükellef mi)?
       *
       * Alıcı için "fatura yok" iki farklı şey demek: bireysel satıcıda ürün
       * faturası HİÇ gelmez, kurumsalda ise gelecektir ama gecikebilir. Ekran
       * ikisini ayırt edemeden alıcı ne bekleyeceğini bilemiyordu.
       */
      sellerIssuesInvoice:
        order.seller?.businessStatus === BusinessStatus.approved &&
        !!order.seller?.taxId,
    };
  }

  /** PDF indirme (satıcı veya alıcı) — S3 presigned URL. */
  async getDownloadUrl(
    orderId: string,
    userId: string,
  ): Promise<{ url: string; fileName: string }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { sellerId: true, buyerId: true },
    });
    if (!order)
      throw new NotFoundException(i18nMessage("server.order.notFound"));
    if (order.sellerId !== userId && order.buyerId !== userId) {
      throw new ForbiddenException(
        i18nMessage("server.order.invoiceAccessForbidden"),
      );
    }
    const inv = await this.prisma.sellerUploadedInvoice.findUnique({
      where: { orderId },
      select: { pdfKey: true, fileName: true },
    });
    if (!inv)
      throw new NotFoundException(
        i18nMessage("server.order.invoiceNotUploaded"),
      );
    const url = await this.storage.getPresignedDownloadUrl(
      "documents",
      inv.pdfKey,
      3600,
    );
    return { url, fileName: inv.fileName };
  }
}
