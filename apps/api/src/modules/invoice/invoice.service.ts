/**
 * Invoice Service
 * Generates PDF invoices for orders and stores them in AWS S3
 * 
 * Requirement: "After payment, invoices will be sent to users automatically" (requirements.txt)
 */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma';
import { StorageService } from '../storage/storage.service';
import { NotificationService } from '../notification/notification.service';
import { SmtpProvider } from '../notification/providers/smtp.provider';
import { NotificationType, NotificationChannel } from '../notification/dto';
import { TaxService } from '../tax';
import PDFDocument from 'pdfkit';

// Invoice generation service using pdfkit for reliable PDF creation
// Turkish character support via system font fallbacks or embedded fonts

export interface InvoiceData {
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate?: Date;

  // Seller info
  seller: {
    name: string;
    email: string;
    phone?: string;
    address?: string;
    taxId?: string;
  };

  // Buyer info
  buyer: {
    name: string;
    email: string;
    phone?: string;
    address?: string;
    taxId?: string;
  };

  // Order info
  orderId: string;
  orderNumber: string;

  // Line items
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;

  // Totals
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  shippingCost: number;
  commission: number;
  total: number;

  // Payment info
  paymentMethod: string;
  paymentDate?: Date;

  // Currency
  currency: string;
}

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);
  private readonly companyInfo = {
    name: 'Tarodan Marketplace',
    address: 'İstanbul, Türkiye',
    taxId: '0000000000',
    email: 'info@tarodan.com',
    phone: '+90 212 000 0000',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly storageService: StorageService,
    private readonly notificationService: NotificationService,
    private readonly smtpProvider: SmtpProvider,
    private readonly taxService: TaxService,
  ) { }

  /**
   * Generate invoice for an order
   */
  async generateForOrder(orderId: string): Promise<{
    invoiceNumber: string;
    pdfUrl: string;
    htmlContent: string;
  }> {
    // Get order with all related data (product includes categoryId for tax rules)
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        buyer: true,
        seller: true,
        product: { select: { title: true, categoryId: true } },
        payment: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Sipariş bulunamadı');
    }

    // Generate invoice number
    const invoiceNumber = await this.generateInvoiceNumber();

    // Parse shipping address (it's stored as JSON); country default TR (addresses don't store country yet)
    const shippingAddr = order.shippingAddress as Record<string, string> | null;
    const buyerAddress = shippingAddr
      ? `${shippingAddr.addressLine1 || ''}, ${shippingAddr.district || ''}, ${shippingAddr.city || ''}`
      : 'Türkiye';
    const countryCode = (shippingAddr?.country as string) || 'TR';
    const regionCode = (shippingAddr?.regionCode as string) || (shippingAddr?.district as string) || null;

    // Resolve tax from admin-configured rules (region + category)
    const subtotal = Number(order.totalAmount) - Number(order.shippingCost || 0);
    const resolvedTax = await this.taxService.resolveTaxRate(
      countryCode,
      regionCode,
      order.product?.categoryId ?? null,
    );
    const taxRate = resolvedTax ? resolvedTax.rate : 18;
    const taxAmount = resolvedTax
      ? this.taxService.calculateTaxAmount(subtotal, resolvedTax)
      : 0;

    // Build invoice data
    const invoiceData: InvoiceData = {
      invoiceNumber,
      invoiceDate: new Date(),

      seller: {
        name: order.seller.displayName || 'Satıcı',
        email: order.seller.email,
        phone: order.seller.phone || undefined,
        address: 'Türkiye',
        taxId: order.seller.taxId || undefined,
      },

      buyer: {
        name: order.buyer.displayName || 'Alıcı',
        email: order.buyer.email,
        phone: order.buyer.phone || undefined,
        address: buyerAddress,
        taxId: order.buyer.taxId || undefined,
      },

      orderId: order.id,
      orderNumber: order.orderNumber,

      items: [{
        description: order.product.title,
        quantity: 1,
        unitPrice: subtotal,
        total: subtotal,
      }],

      subtotal,
      taxRate,
      taxAmount,
      shippingCost: Number(order.shippingCost || 0),
      commission: Number(order.commissionAmount || 0),
      total: Number(order.totalAmount),

      paymentMethod: order.payment?.provider || 'iyzico',
      paymentDate: order.payment?.createdAt,

      currency: 'TRY',
    };

    // Generate HTML invoice (for email body)
    const htmlContent = this.generateInvoiceHtml(invoiceData);

    // Generate PDF buffer from data
    const pdfBuffer = await this.generatePdfFromData(invoiceData);

    // Store in S3
    let pdfUrl = '';
    try {
      if (this.storageService.isStorageAvailable()) {
        const uploadResult = await this.storageService.uploadFile(
          pdfBuffer,
          {
            bucket: 'documents',
            folder: 'invoices',
            filename: `${invoiceNumber}.pdf`,
            mimeType: 'application/pdf',
            isPublic: false,
            entityType: 'invoice',
            entityId: orderId,
          },
        );
        // Generate presigned URL for invoice (valid for 7 days)
        pdfUrl = await this.storageService.getPresignedDownloadUrl(
          'documents',
          uploadResult.key,
          3600 * 24 * 7 // 7 days
        );
      }
    } catch (error) {
      this.logger.error('Failed to upload invoice PDF:', error);
    }

    // Store invoice record in database
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
        status: 'issued',
        issuedAt: new Date(),
      },
    });

    this.logger.log(`Invoice ${invoiceNumber} generated for order ${order.orderNumber}`);

    return {
      invoiceNumber,
      pdfUrl,
      htmlContent,
    };
  }

  /**
   * Generate and send invoice to buyer and seller via email
   * Sends professional invoice emails to both parties when a product is sold
   */
  async generateAndSendInvoice(orderId: string): Promise<boolean> {
    try {
      const { invoiceNumber } = await this.generateForOrder(orderId);

      // Get order with full details
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: {
          buyer: true,
          seller: true,
          product: true,
        },
      });

      if (!order) return false;

      // Check if this is a guest order - get actual email from shippingAddress
      const shippingAddressData = order.shippingAddress as any;
      const buyerIsSystemGuest = !order.buyer.email || order.buyer.email === 'guest@tarodan.system' || (order.buyer.email && order.buyer.email.toLowerCase().includes('guest@tarodan'));
      const isGuestOrder = buyerIsSystemGuest || shippingAddressData?.isGuestOrder === true;

      // Get actual buyer email and name for guest orders
      const buyerEmail = isGuestOrder
        ? (shippingAddressData?.guestEmail || shippingAddressData?.email || order.buyer.email)
        : order.buyer.email;
      const buyerName = isGuestOrder
        ? (shippingAddressData?.guestName || shippingAddressData?.fullName || 'Misafir Müşteri')
        : (order.buyer.displayName || order.buyer.email.split('@')[0]);

      const sellerName = order.seller.displayName || order.seller.email.split('@')[0];

      this.logger.log(`Invoice will be sent to buyer: ${buyerEmail} (isGuest: ${isGuestOrder})`);
      const frontendUrl = this.configService.get('FRONTEND_URL') || (this.configService.get('NODE_ENV') === 'production' ? 'https://tarodan.com' : 'http://localhost:3000');
      // Guest: track-order (no login). Member: orders/[id] (login → redirect back to order)
      const buyerOrderUrl = isGuestOrder && (buyerEmail || order.buyer.email)
        ? `${frontendUrl}/track-order?orderNumber=${encodeURIComponent(order.orderNumber)}&email=${encodeURIComponent((buyerEmail || order.buyer.email || '').trim().toLowerCase())}`
        : `${frontendUrl}/orders/${orderId}`;

      // Send invoice email to BUYER
      const buyerEmailHtml = this.generateInvoiceEmailHtml({
        buyerName,
        invoiceNumber,
        orderNumber: order.orderNumber,
        productTitle: order.product.title,
        totalAmount: Number(order.totalAmount),
        sellerName,
        invoiceUrl: buyerOrderUrl,
        orderId,
        frontendUrl,
      });

      const buyerResult = await this.smtpProvider.sendEmail({
        to: buyerEmail,
        subject: `Faturanız - ${invoiceNumber} | Tarodan`,
        html: buyerEmailHtml,
      });

      if (buyerResult.success) {
        this.logger.log(`Invoice ${invoiceNumber} sent to buyer: ${buyerEmail}`);
      } else {
        this.logger.error(`Failed to send invoice to buyer ${buyerEmail}: ${buyerResult.error}`);
      }

      // Send invoice email to SELLER
      const sellerEmailHtml = this.generateSellerInvoiceEmailHtml({
        sellerName,
        invoiceNumber,
        orderNumber: order.orderNumber,
        productTitle: order.product.title,
        totalAmount: Number(order.totalAmount),
        commissionAmount: Number(order.commissionAmount || 0),
        buyerName,
        frontendUrl,
        orderId,
      });

      const sellerResult = await this.smtpProvider.sendEmail({
        to: order.seller.email,
        subject: `Satış Faturası - ${invoiceNumber} | Tarodan`,
        html: sellerEmailHtml,
      });

      if (sellerResult.success) {
        this.logger.log(`Invoice ${invoiceNumber} sent to seller: ${order.seller.email}`);
      } else {
        this.logger.error(`Failed to send invoice to seller: ${sellerResult.error}`);
      }

      return buyerResult.success && sellerResult.success;
    } catch (error) {
      this.logger.error('Failed to generate and send invoice:', error);
      return false;
    }
  }

  /**
   * Generate invoice email HTML for buyer
   */
  private generateInvoiceEmailHtml(data: {
    buyerName: string;
    invoiceNumber: string;
    orderNumber: string;
    productTitle: string;
    totalAmount: number;
    sellerName: string;
    invoiceUrl: string;
    orderId: string;
    frontendUrl: string;
  }): string {
    const formatPrice = (amount: number) =>
      new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);

    return `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #e63946 0%, #1d3557 100%); padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Taro<span style="color: #f1faee;">dan</span></h1>
              <p style="color: #f1faee; margin: 10px 0 0 0; font-size: 14px;">Diecast Koleksiyoncuları Platformu</p>
            </td>
          </tr>

          <!-- Invoice Icon -->
          <tr>
            <td style="padding: 30px 40px 20px 40px; text-align: center;">
              <div style="background-color: #e8f5e9; border-radius: 50%; width: 80px; height: 80px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 20px;">
                <span style="font-size: 40px;">📄</span>
              </div>
              <h2 style="color: #1d3557; margin: 0; font-size: 24px;">Faturanız Hazır!</h2>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 0 40px 30px 40px;">
              <p style="color: #333; font-size: 16px; line-height: 1.6;">
                Merhaba <strong>${data.buyerName}</strong>,
              </p>
              <p style="color: #666; font-size: 15px; line-height: 1.6;">
                Siparişiniz için faturanız oluşturuldu. Fatura detayları aşağıda yer almaktadır.
              </p>

              <!-- Invoice Details Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; border-radius: 8px; margin: 25px 0;">
                <tr>
                  <td style="padding: 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef;">
                          <span style="color: #666; font-size: 14px;">Fatura No:</span>
                        </td>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef; text-align: right;">
                          <strong style="color: #1d3557; font-size: 14px;">${data.invoiceNumber}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef;">
                          <span style="color: #666; font-size: 14px;">Sipariş No:</span>
                        </td>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef; text-align: right;">
                          <strong style="color: #1d3557; font-size: 14px;">${data.orderNumber}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef;">
                          <span style="color: #666; font-size: 14px;">Ürün:</span>
                        </td>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef; text-align: right;">
                          <strong style="color: #1d3557; font-size: 14px;">${data.productTitle}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef;">
                          <span style="color: #666; font-size: 14px;">Satıcı:</span>
                        </td>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef; text-align: right;">
                          <strong style="color: #1d3557; font-size: 14px;">${data.sellerName}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 12px 0 0 0;">
                          <span style="color: #333; font-size: 16px; font-weight: bold;">Toplam Tutar:</span>
                        </td>
                        <td style="padding: 12px 0 0 0; text-align: right;">
                          <strong style="color: #28a745; font-size: 20px;">${formatPrice(data.totalAmount)} ₺</strong>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Info Note -->
              <div style="background-color: #e3f2fd; border-left: 4px solid #2196f3; padding: 15px; border-radius: 4px; margin-bottom: 25px;">
                <p style="color: #1565c0; margin: 0; font-size: 14px;">
                  📋 <strong>Bilgi:</strong> Fatura detaylarınız yukarıda yer almaktadır. Siparişinizi takip etmek için aşağıdaki butona tıklayabilirsiniz.
                </p>
              </div>

              <!-- CTA Button (invoiceUrl is track page for guest, orders/[id] for member) -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 10px 0;">
                    <a href="${data.invoiceUrl}" 
                       style="display: inline-block; background-color: #e63946; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                      Siparişi Takip Et
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #1d3557; padding: 25px 40px; text-align: center;">
              <p style="color: #f1faee; margin: 0 0 10px 0; font-size: 14px;">
                <strong>Tarodan Marketplace</strong>
              </p>
              <p style="color: #a8dadc; margin: 0; font-size: 12px;">
                İstanbul, Türkiye | info@tarodan.com
              </p>
              <p style="color: #457b9d; margin: 15px 0 0 0; font-size: 11px;">
                Bu e-posta otomatik olarak oluşturulmuştur. Lütfen yanıtlamayınız.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;
  }

  /**
   * Generate invoice email HTML for seller
   */
  private generateSellerInvoiceEmailHtml(data: {
    sellerName: string;
    invoiceNumber: string;
    orderNumber: string;
    productTitle: string;
    totalAmount: number;
    commissionAmount: number;
    buyerName: string;
    frontendUrl: string;
    orderId: string;
  }): string {
    const formatPrice = (amount: number) =>
      new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);

    const netAmount = data.totalAmount - data.commissionAmount;

    return `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #e63946 0%, #1d3557 100%); padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Taro<span style="color: #f1faee;">dan</span></h1>
              <p style="color: #f1faee; margin: 10px 0 0 0; font-size: 14px;">Satıcı Faturası</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 30px 40px;">
              <p style="color: #333; font-size: 16px; line-height: 1.6;">
                Merhaba <strong>${data.sellerName}</strong>,
              </p>
              <p style="color: #666; font-size: 15px; line-height: 1.6;">
                Satışınız için fatura oluşturuldu. Kayıtlarınız için saklayabilirsiniz.
              </p>

              <!-- Invoice Details Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; border-radius: 8px; margin: 25px 0;">
                <tr>
                  <td style="padding: 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef;">
                          <span style="color: #666; font-size: 14px;">Fatura No:</span>
                        </td>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef; text-align: right;">
                          <strong style="color: #1d3557; font-size: 14px;">${data.invoiceNumber}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef;">
                          <span style="color: #666; font-size: 14px;">Sipariş No:</span>
                        </td>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef; text-align: right;">
                          <strong style="color: #1d3557; font-size: 14px;">${data.orderNumber}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef;">
                          <span style="color: #666; font-size: 14px;">Ürün:</span>
                        </td>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef; text-align: right;">
                          <strong style="color: #1d3557; font-size: 14px;">${data.productTitle}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef;">
                          <span style="color: #666; font-size: 14px;">Alıcı:</span>
                        </td>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef; text-align: right;">
                          <strong style="color: #1d3557; font-size: 14px;">${data.buyerName}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef;">
                          <span style="color: #666; font-size: 14px;">Satış Tutarı:</span>
                        </td>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef; text-align: right;">
                          <strong style="color: #1d3557; font-size: 14px;">${formatPrice(data.totalAmount)} ₺</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef;">
                          <span style="color: #666; font-size: 14px;">Platform Komisyonu:</span>
                        </td>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e9ecef; text-align: right;">
                          <strong style="color: #dc3545; font-size: 14px;">-${formatPrice(data.commissionAmount)} ₺</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 12px 0 0 0;">
                          <span style="color: #333; font-size: 16px; font-weight: bold;">Net Kazancınız:</span>
                        </td>
                        <td style="padding: 12px 0 0 0; text-align: right;">
                          <strong style="color: #28a745; font-size: 20px;">${formatPrice(netAmount)} ₺</strong>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Info Note -->
              <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; border-radius: 4px; margin-bottom: 25px;">
                <p style="color: #856404; margin: 0; font-size: 14px;">
                  ⏰ <strong>Hatırlatma:</strong> Ödemeniz, alıcı ürünü teslim aldıktan 7 gün sonra hesabınıza aktarılacaktır.
                </p>
              </div>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 10px 0;">
                    <a href="${data.frontendUrl}/seller/orders/${data.orderId}" 
                       style="display: inline-block; background-color: #1d3557; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                      Siparişi Görüntüle
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #1d3557; padding: 25px 40px; text-align: center;">
              <p style="color: #f1faee; margin: 0 0 10px 0; font-size: 14px;">
                <strong>Tarodan Marketplace</strong>
              </p>
              <p style="color: #a8dadc; margin: 0; font-size: 12px;">
                İstanbul, Türkiye | info@tarodan.com
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;
  }

  /**
   * Get invoice by order ID
   * Optionally verify with paymentId (useful for guest checkouts or user ID mismatches on success page)
   * If no invoice exists but order is paid and user is buyer/seller, generates the invoice (lazy creation).
   */
  async getByOrderId(orderId: string, userId: string | null, paymentId?: string) {
    let invoice = await this.prisma.invoice.findFirst({
      where: { orderId },
      include: {
        order: {
          include: {
            buyer: { select: { id: true, displayName: true, email: true } },
            seller: { select: { id: true, displayName: true, email: true } },
            product: { select: { id: true, title: true } },
            payment: { select: { id: true } },
          },
        },
      },
    });

    if (!invoice) {
      // Lazy create: if order exists, user is buyer/seller, and order is not cancelled/pending → try to generate
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: { id: true, buyerId: true, sellerId: true, status: true, payment: { select: { id: true } } },
      });
      const statusStr = order?.status ? String(order.status) : '';
      const skipStatuses = ['cancelled', 'pending_payment'];
      const canGenerateByStatus = order && !skipStatuses.includes(statusStr);
      const isBuyer = userId && order?.buyerId === userId;
      const isSeller = userId && order?.sellerId === userId;
      const isPaymentVerified = paymentId && order?.payment?.id === paymentId;
      const mayCreate = canGenerateByStatus && (isBuyer || isSeller || isPaymentVerified);
      if (!order) {
        this.logger.debug(`Invoice getByOrderId: order ${orderId} not found`);
      } else if (!mayCreate) {
        this.logger.debug(
          `Invoice getByOrderId: order ${orderId} status=${statusStr} isBuyer=${isBuyer} isSeller=${isSeller} buyerId=${order.buyerId} sellerId=${order.sellerId} userId=${userId}`,
        );
      }
      if (mayCreate) {
        try {
          await this.generateForOrder(orderId);
          invoice = await this.prisma.invoice.findFirst({
            where: { orderId },
            include: {
              order: {
                include: {
                  buyer: { select: { id: true, displayName: true, email: true } },
                  seller: { select: { id: true, displayName: true, email: true } },
                  product: { select: { id: true, title: true } },
                  payment: { select: { id: true } },
                },
              },
            },
          });
        } catch (err) {
          this.logger.warn(`Lazy invoice generation failed for order ${orderId}:`, err);
          throw new NotFoundException(
            'Fatura oluşturulamadı. Sipariş ödenmiş olsa bile fatura kaydı eksik olabilir.',
          );
        }
      }
      if (!invoice) {
        throw new NotFoundException('Fatura bulunamadı');
      }
    } else {
      // Check authorization: buyer, seller, or someone with a valid paymentId for this order
      const isBuyer = userId && invoice.buyerId === userId;
      const isSeller = userId && invoice.sellerId === userId;
      const isPaymentVerified = paymentId && invoice.order.payment?.id === paymentId;

      if (!isBuyer && !isSeller && !isPaymentVerified) {
        throw new NotFoundException('Fatura bulunamadı');
      }
    }

    return invoice;
  }

  /**
   * Get all invoices for a user
   */
  async getUserInvoices(userId: string, type: 'buyer' | 'seller' = 'buyer') {
    const where = type === 'buyer' ? { buyerId: userId } : { sellerId: userId };

    return this.prisma.invoice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        order: {
          include: {
            product: { select: { id: true, title: true } },
          },
        },
      },
    });
  }

  /**
   * Download invoice PDF
   */
  async downloadInvoice(invoiceId: string, userId: string | null, paymentId?: string): Promise<Buffer> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        order: {
          include: {
            buyer: true,
            seller: true,
            product: true,
            payment: true,
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Fatura bulunamadı');
    }

    // Check authorization: buyer, seller, or someone with a valid paymentId for this order
    const isBuyer = userId && invoice.buyerId === userId;
    const isSeller = userId && invoice.sellerId === userId;
    const isPaymentVerified = paymentId && invoice.order.payment?.id === paymentId;

    if (!isBuyer && !isSeller && !isPaymentVerified) {
      throw new NotFoundException('Fatura bulunamadı');
    }

    // Parse shipping address (it's stored as JSON)
    const shippingAddr = invoice.order.shippingAddress as Record<string, string> | null;
    const buyerAddress = shippingAddr
      ? `${shippingAddr.addressLine1 || ''}, ${shippingAddr.district || ''}, ${shippingAddr.city || ''}`
      : 'Türkiye';

    // Regenerate PDF
    const invoiceData: InvoiceData = {
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.issuedAt,

      seller: {
        name: invoice.order.seller.displayName || 'Satıcı',
        email: invoice.order.seller.email,
        taxId: invoice.order.seller.taxId || undefined,
      },

      buyer: {
        name: invoice.order.buyer.displayName || 'Alıcı',
        email: invoice.order.buyer.email,
        address: buyerAddress,
      },

      orderId: invoice.orderId,
      orderNumber: invoice.order.orderNumber,

      items: [{
        description: invoice.order.product.title,
        quantity: 1,
        unitPrice: Number(invoice.subtotal),
        total: Number(invoice.subtotal),
      }],

      subtotal: Number(invoice.subtotal),
      taxRate: 18,
      taxAmount: Number(invoice.taxAmount),
      shippingCost: Number(invoice.shippingCost),
      commission: 0,
      total: Number(invoice.total),

      paymentMethod: 'Online Ödeme',
      currency: 'TRY',
    };

    return this.generatePdfFromData(invoiceData);
  }

  /**
   * Generate unique invoice number
   */
  private async generateInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');

    // Get last invoice number for this month
    const lastInvoice = await this.prisma.invoice.findFirst({
      where: {
        invoiceNumber: {
          startsWith: `TRD-${year}${month}`,
        },
      },
      orderBy: { invoiceNumber: 'desc' },
    });

    let sequence = 1;
    if (lastInvoice) {
      const lastSequence = parseInt(lastInvoice.invoiceNumber.split('-')[2], 10);
      sequence = lastSequence + 1;
    }

    return `TRD-${year}${month}-${String(sequence).padStart(6, '0')}`;
  }

  /**
   * Generate HTML invoice content
   */
  private generateInvoiceHtml(data: InvoiceData): string {
    const formatCurrency = (amount: number) =>
      new Intl.NumberFormat('tr-TR', { style: 'currency', currency: data.currency }).format(amount);

    const formatDate = (date: Date) =>
      new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long' }).format(date);

    return `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Fatura ${data.invoiceNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333; background: #f5f5f5; }
    .invoice { max-width: 800px; margin: 20px auto; background: white; padding: 40px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 2px solid #e63946; }
    .logo { font-size: 28px; font-weight: bold; color: #e63946; }
    .logo span { color: #1d3557; }
    .invoice-info { text-align: right; }
    .invoice-info h1 { font-size: 24px; color: #1d3557; margin-bottom: 5px; }
    .invoice-info .invoice-number { font-size: 16px; color: #666; }
    .parties { display: flex; justify-content: space-between; margin-bottom: 40px; }
    .party { width: 45%; }
    .party h3 { font-size: 12px; text-transform: uppercase; color: #999; margin-bottom: 10px; letter-spacing: 1px; }
    .party p { margin-bottom: 5px; }
    .party .name { font-size: 16px; font-weight: bold; color: #1d3557; }
    .details { margin-bottom: 30px; }
    .details table { width: 100%; border-collapse: collapse; }
    .details th { background: #1d3557; color: white; padding: 12px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; }
    .details td { padding: 12px; border-bottom: 1px solid #eee; }
    .details tr:hover { background: #f9f9f9; }
    .details .amount { text-align: right; }
    .totals { display: flex; justify-content: flex-end; margin-top: 20px; }
    .totals table { width: 300px; }
    .totals td { padding: 8px 0; }
    .totals td:last-child { text-align: right; font-weight: bold; }
    .totals .total-row { border-top: 2px solid #1d3557; font-size: 18px; color: #1d3557; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #999; font-size: 12px; }
    .payment-info { background: #f8f9fa; padding: 15px; border-radius: 8px; margin-top: 20px; }
    .payment-info h4 { color: #1d3557; margin-bottom: 10px; }
    .badge { display: inline-block; padding: 4px 8px; background: #28a745; color: white; border-radius: 4px; font-size: 12px; }
  </style>
</head>
<body>
  <div class="invoice">
    <div class="header">
      <div class="logo">Taro<span>dan</span></div>
      <div class="invoice-info">
        <h1>FATURA</h1>
        <div class="invoice-number">${data.invoiceNumber}</div>
        <p style="margin-top: 10px;">Tarih: ${formatDate(data.invoiceDate)}</p>
        <p>Sipariş No: ${data.orderNumber}</p>
      </div>
    </div>

    <div class="parties">
      <div class="party">
        <h3>Satıcı</h3>
        <p class="name">${data.seller.name}</p>
        <p>${data.seller.email}</p>
        ${data.seller.phone ? `<p>${data.seller.phone}</p>` : ''}
        ${data.seller.address ? `<p>${data.seller.address}</p>` : ''}
        ${data.seller.taxId ? `<p>Vergi No: ${data.seller.taxId}</p>` : ''}
      </div>
      <div class="party">
        <h3>Alıcı</h3>
        <p class="name">${data.buyer.name}</p>
        <p>${data.buyer.email}</p>
        ${data.buyer.phone ? `<p>${data.buyer.phone}</p>` : ''}
        ${data.buyer.address ? `<p>${data.buyer.address}</p>` : ''}
        ${data.buyer.taxId ? `<p>Vergi No: ${data.buyer.taxId}</p>` : ''}
      </div>
    </div>

    <div class="details">
      <table>
        <thead>
          <tr>
            <th>Açıklama</th>
            <th style="width: 80px; text-align: center;">Adet</th>
            <th style="width: 120px; text-align: right;">Birim Fiyat</th>
            <th style="width: 120px; text-align: right;">Toplam</th>
          </tr>
        </thead>
        <tbody>
          ${data.items.map(item => `
            <tr>
              <td>${item.description}</td>
              <td style="text-align: center;">${item.quantity}</td>
              <td class="amount">${formatCurrency(item.unitPrice)}</td>
              <td class="amount">${formatCurrency(item.total)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div class="totals">
      <table>
        <tr>
          <td>Ara Toplam:</td>
          <td>${formatCurrency(data.subtotal)}</td>
        </tr>
        ${data.shippingCost > 0 ? `
          <tr>
            <td>Kargo:</td>
            <td>${formatCurrency(data.shippingCost)}</td>
          </tr>
        ` : ''}
        ${data.taxAmount > 0 ? `
          <tr>
            <td>KDV (%${data.taxRate}):</td>
            <td>${formatCurrency(data.taxAmount)}</td>
          </tr>
        ` : ''}
        <tr class="total-row">
          <td>Genel Toplam:</td>
          <td>${formatCurrency(data.total)}</td>
        </tr>
      </table>
    </div>

    <div class="payment-info">
      <h4>Ödeme Bilgileri</h4>
      <p>Ödeme Yöntemi: ${data.paymentMethod}</p>
      ${data.paymentDate ? `<p>Ödeme Tarihi: ${formatDate(data.paymentDate)}</p>` : ''}
      <p style="margin-top: 10px;"><span class="badge">✓ Ödendi</span></p>
    </div>

    <div class="footer">
      <p><strong>${this.companyInfo.name}</strong></p>
      <p>${this.companyInfo.address} | ${this.companyInfo.email} | ${this.companyInfo.phone}</p>
      <p style="margin-top: 10px;">Bu fatura elektronik olarak oluşturulmuştur.</p>
    </div>
  </div>
</body>
</html>
    `;
  }

  /**
   * Internal PDF generator using pdfkit
   */
  private async generatePdfFromData(data: InvoiceData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const buffers: Buffer[] = [];

        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', (err) => reject(err));

        // Load font for Turkish support
        const fontPath = '/System/Library/Fonts/Supplemental/Arial.ttf';
        try {
          doc.font(fontPath);
        } catch {
          // Fallback to standard Helvetica if Arial is not found (might lose Turkish chars)
          doc.font('Helvetica');
        }

        // Header
        doc.fillColor('#1d3557').fontSize(24).text('TARODAN', { align: 'left' });
        doc.fontSize(10).fillColor('#666666').text('İkinci El Model Araba Pazarı', { align: 'left' });

        doc.moveDown();
        doc.fillColor('#000000').fontSize(20).text('FATURA', { align: 'right' });
        doc.fontSize(10).text(`Fatura No: ${data.invoiceNumber}`, { align: 'right' });
        doc.text(`Tarih: ${data.invoiceDate.toLocaleDateString('tr-TR')}`, { align: 'right' });

        doc.moveDown();
        const yBeforeInfo = doc.y;

        // Seller Block
        doc.fontSize(12).fillColor('#1d3557').text('SATICI BİLGİLERİ', 50, yBeforeInfo);
        doc.fontSize(10).fillColor('#333333');
        doc.text(data.seller.name);
        doc.text(data.seller.email);
        if (data.seller.taxId) doc.text(`Vergi No: ${data.seller.taxId}`);
        if (data.seller.address) doc.text(data.seller.address, { width: 200 });

        // Buyer Block
        doc.fontSize(12).fillColor('#1d3557').text('ALICI BİLGİLERİ', 300, yBeforeInfo);
        doc.fontSize(10).fillColor('#333333');
        doc.text(data.buyer.name, 300);
        doc.text(data.buyer.email, 300);
        if (data.buyer.address) doc.text(data.buyer.address, 300, doc.y, { width: 200 });

        doc.moveDown(4);

        // Table Header
        const tableTop = doc.y;
        doc.rect(50, tableTop, 500, 20).fill('#f8f9fa');
        doc.fillColor('#1d3557').fontSize(10);
        doc.text('Açıklama', 60, tableTop + 6);
        doc.text('Adet', 350, tableTop + 6, { width: 50, align: 'center' });
        doc.text('Birim Fiyat', 400, tableTop + 6, { width: 70, align: 'right' });
        doc.text('Toplam', 480, tableTop + 6, { width: 60, align: 'right' });

        // Table Items
        let currentY = tableTop + 25;
        data.items.forEach((item) => {
          doc.fillColor('#333333');
          doc.text(item.description, 60, currentY, { width: 280 });
          doc.text(item.quantity.toString(), 350, currentY, { width: 50, align: 'center' });
          doc.text(`${item.unitPrice.toLocaleString('tr-TR')} TL`, 400, currentY, { width: 70, align: 'right' });
          doc.text(`${item.total.toLocaleString('tr-TR')} TL`, 480, currentY, { width: 60, align: 'right' });
          currentY += 20;
        });

        // Totals
        const totalGap = 15;
        currentY += 20;
        doc.fontSize(10).fillColor('#666666');

        doc.text('Ara Toplam:', 380, currentY, { width: 100, align: 'right' });
        doc.text(`${data.subtotal.toLocaleString('tr-TR')} TL`, 480, currentY, { width: 60, align: 'right' });

        currentY += totalGap;
        doc.text(`KDV (%${data.taxRate}):`, 380, currentY, { width: 100, align: 'right' });
        doc.text(`${data.taxAmount.toLocaleString('tr-TR')} TL`, 480, currentY, { width: 60, align: 'right' });

        if (data.shippingCost > 0) {
          currentY += totalGap;
          doc.text('Kargo Ücreti:', 380, currentY, { width: 100, align: 'right' });
          doc.text(`${data.shippingCost.toLocaleString('tr-TR')} TL`, 480, currentY, { width: 60, align: 'right' });
        }

        currentY += 25;
        doc.fontSize(14).fillColor('#1d3557').font(fontPath).text('GENEL TOPLAM:', 300, currentY, { width: 180, align: 'right' });
        doc.text(`${data.total.toLocaleString('tr-TR')} TL`, 480, currentY, { width: 60, align: 'right' });

        // Footer
        const footerY = 750;
        doc.fontSize(8).fillColor('#999999');
        doc.text('Bu fatura elektronik olarak oluşturulmuştur ve mali değeri vardır.', 50, footerY, { align: 'center', width: 500 });
        doc.text('Tarodan - Model Araba Alım Satım ve Takas Platformu', 50, footerY + 12, { align: 'center', width: 500 });
        doc.text('https://tarodan.com', 50, footerY + 24, { align: 'center', width: 500 });

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Convert HTML to PDF buffer (Legacy - kept for compatibility, uses generatePdfFromData internally if possible)
   */
  private async htmlToPdf(html: string): Promise<Buffer> {
    // This is now redundant but kept to avoid breaking types if any external calls exist
    return Buffer.from(html, 'utf-8');
  }

  /**
   * Cancel invoice
   */
  async cancelInvoice(invoiceId: string, reason: string): Promise<void> {
    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelReason: reason,
      },
    });

    this.logger.log(`Invoice ${invoiceId} cancelled: ${reason}`);
  }

  /**
   * Generate refund invoice (credit note)
   */
  async generateRefundInvoice(orderId: string, amount: number): Promise<string> {
    const originalInvoice = await this.prisma.invoice.findFirst({
      where: { orderId },
    });

    if (!originalInvoice) {
      throw new NotFoundException('Orijinal fatura bulunamadı');
    }

    const refundInvoiceNumber = `${originalInvoice.invoiceNumber}-R`;

    await this.prisma.invoice.create({
      data: {
        invoiceNumber: refundInvoiceNumber,
        orderId,
        buyerId: originalInvoice.buyerId,
        sellerId: originalInvoice.sellerId,
        subtotal: -amount,
        taxAmount: 0,
        shippingCost: 0,
        total: -amount,
        status: 'issued',
        issuedAt: new Date(),
        notes: `İade faturası - Referans: ${originalInvoice.invoiceNumber}`,
      },
    });

    this.logger.log(`Refund invoice ${refundInvoiceNumber} generated for order ${orderId}`);

    return refundInvoiceNumber;
  }
}
