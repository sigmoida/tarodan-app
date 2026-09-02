/**
 * Invoice Service (facade)
 * Generates PDF invoices for orders and stores them in AWS S3
 *
 * Requirement: "After payment, invoices will be sent to users automatically" (requirements.txt)
 *
 * İnce facade: her public imza aynen korunur. PDF işleri
 * InvoicePdfService'e (this.pdf.*) delege edilir; e-posta gövdesi ortak
 * e-posta şablonu renderer'ından gelir. Dış çağıranlar
 * (payment.service, payment-reconciliation.service) etkilenmez.
 */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { StorageService } from "../storage/storage.service";
import { TaxService } from "../tax";
import { InvoicePdfService, InvoiceData } from "./invoice-pdf.service";
import { storedProductBaseOf } from "../order/helpers/order-charged-base.helper";
import { i18nMessage } from "../i18n";

/**
 * NOT: Bu modülün ürettiği belge "Sipariş Özeti"dir (SPR- numarası) — mali
 * belge (fatura) DEĞİLDİR; şablonun altında bu açıkça yazar. Tarodan'ın resmî
 * gelir belgeleri `ElogoInvoice` (eLogo e-Arşiv/e-Fatura), satıcının ürün
 * faturası ise `SellerUploadedInvoice`'tır. Uçlar (`/invoices/*`) mobil
 * uygulama sözleşmesinde olduğu için korunur; eski "alıcı+satıcıya fatura
 * maili" yolu kaldırıldı (hiçbir yerden çağrılmıyordu).
 */
@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly taxService: TaxService,
    private readonly pdf: InvoicePdfService,
  ) {}

  /**
   * Generate invoice for an order
   */
  async generateForOrder(orderId: string): Promise<{
    invoiceNumber: string;
    pdfUrl: string;
    htmlContent: string;
  }> {
    const existingInvoice = await this.prisma.invoice.findUnique({
      where: { orderId },
    });
    if (existingInvoice) {
      return this.toGenerationResponse(existingInvoice);
    }

    // Get order with all related data (product includes categoryId for tax rules)
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        buyer: true,
        seller: true,
        product: { select: { title: true, categoryId: true } },
        payment: true,
        checkoutGroup: { include: { payment: true } },
      },
    });

    if (!order) {
      throw new NotFoundException(i18nMessage("server.order.notFound"));
    }

    if (!order.buyer || !order.seller) {
      throw new BadRequestException(i18nMessage("server.invoice.partyMissing"));
    }

    const pay = order.payment ?? (order as any).checkoutGroup?.payment ?? null;
    if (!pay || String(pay.status) !== "completed") {
      throw new BadRequestException(i18nMessage("server.invoice.orderNotPaid"));
    }

    // Generate invoice number
    const invoiceNumber = await this.pdf.generateInvoiceNumber();

    // Parse shipping address (it's stored as JSON); country default TR (addresses don't store country yet)
    const shippingAddr = order.shippingAddress as Record<string, string> | null;
    const buyerAddress = shippingAddr
      ? `${shippingAddr.addressLine1 || ""}, ${shippingAddr.district || ""}, ${shippingAddr.city || ""}`
      : "Türkiye";

    // Ürün mal bedeli ORTAK helper'dan — alıcı hizmet KDV'sini de düşer; burada
    // elle türetildiğinde o kalem unutuluyor ve mal bedeli olduğundan yüksek çıkıyordu.
    const taxAmount = Number(order.taxAmount || 0);
    const subtotal = storedProductBaseOf(order);

    // Gösterim için vergi oranı: taxAmount > 0 ise oranı çek, yoksa 0 göster
    let taxRate = 0;
    if (taxAmount > 0) {
      const regionCode =
        (shippingAddr?.regionCode as string) ||
        (shippingAddr?.district as string) ||
        null;
      const resolvedTax = await this.taxService.resolveTaxRate(
        "TR",
        regionCode,
        order.product?.categoryId ?? null,
      );
      taxRate = resolvedTax ? resolvedTax.rate : 0;
    }

    // Build invoice data
    // Ödeme tek üründe bile checkout group üzerinden bağlanır (order.payment genelde null).
    const invoiceData: InvoiceData = {
      invoiceNumber,
      invoiceDate: new Date(),

      seller: {
        name: order.seller.displayName || "Satıcı",
        email: order.seller.email,
        phone: order.seller.phone || undefined,
        address: "Türkiye",
        taxId: order.seller.taxId || undefined,
      },

      buyer: {
        name: order.buyer.displayName || "Alıcı",
        email: order.buyer.email,
        phone: order.buyer.phone || undefined,
        address: buyerAddress,
        taxId: order.buyer.taxId || undefined,
      },

      orderId: order.id,
      orderNumber: order.orderNumber,

      // Adet bazlı: faturada satır adedi + birim fiyat order'dan (1 değil). subtotal
      // satır toplamıdır (birim * adet); birim fiyat order.unitPrice, yoksa subtotal/adet.
      items: [
        {
          description: order.product?.title || "Ürün",
          quantity: (order as any).quantity ?? 1,
          unitPrice:
            (order as any).unitPrice != null
              ? Number((order as any).unitPrice)
              : (order as any).quantity > 1
                ? subtotal / (order as any).quantity
                : subtotal,
          total: subtotal,
        },
      ],

      subtotal,
      taxRate,
      taxAmount,
      shippingCost: Number(order.shippingCost || 0),
      commission: Number(order.commissionAmount || 0),
      total: Number(order.totalAmount),

      paymentMethod: pay?.provider ?? "paytr",
      paymentDate: pay?.paidAt ?? pay?.createdAt,

      currency: "TRY",
    };

    // Generate HTML invoice (for email body)
    const htmlContent = this.pdf.generateInvoiceHtml(invoiceData);

    // Generate PDF buffer from data
    const pdfBuffer = await this.pdf.generatePdfFromData(invoiceData);

    // Fatura kaydı, kalıcı PDF olmadan "issued" sayılamaz. Production readiness
    // storage erişimini ayrıca kontrol eder; burada da çağrı fail-closed davranır.
    if (!this.storageService.isStorageAvailable()) {
      throw new ServiceUnavailableException(
        i18nMessage("server.invoice.storageUnavailable"),
      );
    }
    const uploadResult = await this.storageService.uploadFile(pdfBuffer, {
      bucket: "documents",
      folder: "invoices",
      filename: `${invoiceNumber}.pdf`,
      mimeType: "application/pdf",
      isPublic: false,
      entityType: "invoice",
      entityId: orderId,
    });
    const pdfUrl = uploadResult.key;

    try {
      await this.prisma.invoice.create({
        data: {
          invoiceNumber,
          orderId,
          buyerId: order.buyerId,
          sellerId: order.sellerId,
          subtotal: invoiceData.subtotal,
          taxAmount: invoiceData.taxAmount,
          shippingCost: invoiceData.shippingCost,
          total: invoiceData.total,
          pdfUrl,
          status: "issued",
          issuedAt: new Date(),
        },
      });
    } catch (error) {
      await this.cleanupUncommittedPdf(pdfUrl);

      // The orderId unique constraint is the final concurrency guard. If another
      // request won the race, converge on that committed invoice instead of 409/500.
      if (this.isUniqueConstraintError(error)) {
        const winner = await this.prisma.invoice.findUnique({
          where: { orderId },
        });
        if (winner) return this.toGenerationResponse(winner);
      }
      throw error;
    }

    this.logger.log(
      `Invoice ${invoiceNumber} generated for order ${order.orderNumber}`,
    );

    // Resolve S3 key to presigned URL for the response
    const resolvedPdfUrl = await this.pdf.resolveInvoicePdfUrl(pdfUrl);

    return {
      invoiceNumber,
      pdfUrl: resolvedPdfUrl || "",
      htmlContent,
    };
  }

  private async toGenerationResponse(invoice: {
    invoiceNumber: string;
    pdfUrl: string | null;
  }): Promise<{
    invoiceNumber: string;
    pdfUrl: string;
    htmlContent: string;
  }> {
    return {
      invoiceNumber: invoice.invoiceNumber,
      pdfUrl: (await this.pdf.resolveInvoicePdfUrl(invoice.pdfUrl ?? "")) || "",
      htmlContent: "",
    };
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    );
  }

  private async cleanupUncommittedPdf(key: string): Promise<void> {
    try {
      await this.storageService.deleteFile("documents", key);
    } catch (cleanupError) {
      this.logger.warn(
        `Failed to clean up uncommitted invoice PDF ${key}: ${String(cleanupError)}`,
      );
    }
  }

  /**
   * Güvenlik (#63): Fatura oluşturmanın sahiplik-korumalı HTTP giriş noktası.
   * `generateForOrder` paylaşılan executor olarak sahiplik kontrolü YAPMAZ (iç çağıranlar:
   * lazy-gen getByOrderId); bu yüzden IDOR
   * guard'ı burada, uçta durur — yalnız siparişin tarafı (alıcı/satıcı) fatura üretebilir.
   * Sahipler faturayı zaten GET /invoices/order/:orderId üzerinden (lazy üretimle) alır;
   * bu uç sahip/idari elle üretim içindir. Yetkisiz kullanıcı → 403.
   */
  async generateForOrderAsUser(orderId: string, requesterId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { buyerId: true, sellerId: true },
    });
    if (!order) {
      throw new NotFoundException(i18nMessage("server.order.notFound"));
    }
    if (order.buyerId !== requesterId && order.sellerId !== requesterId) {
      throw new ForbiddenException(
        i18nMessage("server.invoice.issueForbidden"),
      );
    }
    return this.generateForOrder(orderId);
  }

  /**
   * Get invoice by order ID
   * Optionally verify with paymentId (useful for guest checkouts or user ID mismatches on success page)
   * If no invoice exists but order is paid and user is buyer/seller, generates the invoice (lazy creation).
   */
  async getByOrderId(
    orderId: string,
    userId: string | null,
    paymentId?: string,
    capabilityAuthorized = false,
  ) {
    let invoice = await this.prisma.invoice.findFirst({
      where: { orderId },
      include: {
        order: {
          include: {
            buyer: { select: { id: true, displayName: true, email: true } },
            seller: { select: { id: true, displayName: true, email: true } },
            product: { select: { id: true, title: true } },
            payment: { select: { id: true } },
            checkoutGroup: {
              select: { payment: { select: { id: true } } },
            },
          },
        },
      },
    });

    if (!invoice) {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          buyerId: true,
          sellerId: true,
          status: true,
          payment: { select: { id: true } },
          checkoutGroup: {
            select: { payment: { select: { id: true } } },
          },
        },
      });

      if (!order) {
        throw new NotFoundException(i18nMessage("server.order.notFound"));
      }

      const statusStr = order.status ? String(order.status) : "";
      const skipStatuses = ["cancelled", "pending_payment"];
      const isBuyer = userId && order.buyerId === userId;
      const isSeller = userId && order.sellerId === userId;
      const isPaymentVerified =
        capabilityAuthorized &&
        !!paymentId &&
        (order.payment?.id === paymentId ||
          order.checkoutGroup?.payment?.id === paymentId);

      if (!isBuyer && !isSeller && !isPaymentVerified) {
        throw new NotFoundException(i18nMessage("server.invoice.notFound"));
      }

      if (skipStatuses.includes(statusStr)) {
        throw new BadRequestException(
          i18nMessage("server.invoice.orderUnpaidOrCancelled"),
        );
      }

      try {
        await this.generateForOrder(orderId);
        invoice = await this.prisma.invoice.findFirst({
          where: { orderId },
          include: {
            order: {
              include: {
                buyer: { select: { id: true, displayName: true, email: true } },
                seller: {
                  select: { id: true, displayName: true, email: true },
                },
                product: { select: { id: true, title: true } },
                payment: { select: { id: true } },
                checkoutGroup: {
                  select: { payment: { select: { id: true } } },
                },
              },
            },
          },
        });
      } catch (err) {
        this.logger.warn(
          `Lazy invoice generation failed for order ${orderId}:`,
          err,
        );
        const message =
          err instanceof BadRequestException
            ? err.message
            : "Fatura oluşturulamadı. Sipariş ödenmiş olsa bile fatura kaydı eksik olabilir.";
        throw new NotFoundException(message);
      }

      if (!invoice) {
        throw new NotFoundException(i18nMessage("server.invoice.notFound"));
      }
    } else {
      // Check authorization: buyer, seller, or someone with a valid paymentId for this order
      const isBuyer = userId && invoice.buyerId === userId;
      const isSeller = userId && invoice.sellerId === userId;
      const isPaymentVerified =
        capabilityAuthorized &&
        !!paymentId &&
        (invoice.order.payment?.id === paymentId ||
          invoice.order.checkoutGroup?.payment?.id === paymentId);

      if (!isBuyer && !isSeller && !isPaymentVerified) {
        throw new NotFoundException(i18nMessage("server.invoice.notFound"));
      }
    }

    // Resolve pdfUrl (S3 key -> presigned URL)
    return {
      ...invoice,
      pdfUrl: (await this.pdf.resolveInvoicePdfUrl(invoice.pdfUrl)) || "",
    };
  }

  /**
   * Get all invoices for a user
   */
  async getUserInvoices(userId: string, type: "buyer" | "seller" = "buyer") {
    const where = type === "buyer" ? { buyerId: userId } : { sellerId: userId };

    const invoices = await this.prisma.invoice.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        order: {
          include: {
            product: { select: { id: true, title: true } },
          },
        },
      },
    });

    // Resolve pdfUrl (S3 key -> presigned URL) for each invoice
    return Promise.all(
      invoices.map(async (invoice) => ({
        ...invoice,
        pdfUrl: (await this.pdf.resolveInvoicePdfUrl(invoice.pdfUrl)) || "",
      })),
    );
  }

  /**
   * Download invoice PDF
   */
  async downloadInvoice(
    invoiceId: string,
    userId: string | null,
    paymentId?: string,
    capabilityAuthorized = false,
  ): Promise<Buffer> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        order: {
          include: {
            buyer: true,
            seller: true,
            product: true,
            payment: true,
            checkoutGroup: { include: { payment: true } },
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException(i18nMessage("server.invoice.notFound"));
    }

    // Check authorization: buyer, seller, or someone with a valid paymentId for this order
    const isBuyer = userId && invoice.buyerId === userId;
    const isSeller = userId && invoice.sellerId === userId;
    const isPaymentVerified =
      capabilityAuthorized &&
      !!paymentId &&
      (invoice.order.payment?.id === paymentId ||
        invoice.order.checkoutGroup?.payment?.id === paymentId);

    if (!isBuyer && !isSeller && !isPaymentVerified) {
      throw new NotFoundException(i18nMessage("server.invoice.notFound"));
    }

    // Parse shipping address (it's stored as JSON)
    const shippingAddr = invoice.order.shippingAddress as Record<
      string,
      string
    > | null;
    const buyerAddress = shippingAddr
      ? `${shippingAddr.addressLine1 || ""}, ${shippingAddr.district || ""}, ${shippingAddr.city || ""}`
      : "Türkiye";

    // Regenerate PDF
    const invoiceData: InvoiceData = {
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.issuedAt,

      seller: {
        name: invoice.order.seller.displayName || "Satıcı",
        email: invoice.order.seller.email,
        taxId: invoice.order.seller.taxId || undefined,
      },

      buyer: {
        name: invoice.order.buyer.displayName || "Alıcı",
        email: invoice.order.buyer.email,
        address: buyerAddress,
      },

      orderId: invoice.orderId,
      orderNumber: invoice.order.orderNumber,

      items: [
        {
          description: invoice.order.product.title,
          quantity: 1,
          unitPrice: Number(invoice.subtotal),
          total: Number(invoice.subtotal),
        },
      ],

      subtotal: Number(invoice.subtotal),
      taxRate:
        Number(invoice.taxAmount) > 0 && Number(invoice.subtotal) > 0
          ? Math.round(
              (Number(invoice.taxAmount) / Number(invoice.subtotal)) * 100,
            )
          : 0,
      taxAmount: Number(invoice.taxAmount),
      shippingCost: Number(invoice.shippingCost),
      commission: Number(invoice.order.commissionAmount ?? 0),
      total: Number(invoice.total),

      paymentMethod: "Online Ödeme",
      currency: "TRY",
    };

    return this.pdf.generatePdfFromData(invoiceData);
  }

  /**
   * Cancel invoice
   */
  async cancelInvoice(invoiceId: string, reason: string): Promise<void> {
    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
        cancelReason: reason,
      },
    });

    this.logger.log(`Invoice ${invoiceId} cancelled: ${reason}`);
  }

  /**
   * Legacy receipt-table credit note entry point.
   *
   * Real return documents are issued by ElogoInvoicingService as a
   * `return_invoice` with a billing reference. The local Invoice model is one
   * immutable receipt per order; writing a second negative receipt would break
   * that invariant and bypass the eLogo retry/idempotency flow.
   */
  async generateRefundInvoice(orderId: string, amount: number): Promise<never> {
    this.logger.error(
      `Rejected legacy refund receipt generation for order=${orderId} amount=${amount}`,
    );
    throw new BadRequestException(
      i18nMessage("server.invoice.returnViaElogoOnly"),
    );
  }
}
