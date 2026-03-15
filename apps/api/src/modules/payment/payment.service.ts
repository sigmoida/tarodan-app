import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma';
import { CacheService } from '../cache/cache.service';
import { InitiatePaymentDto, PaymentProvider, IyzicoCallbackDto, PayTRCallbackDto, DirectPaymentDto, CreditCardDto } from './dto';
import { PaymentStatus, PaymentHoldStatus, OrderStatus, ProductStatus, SubscriptionStatus, TradeStatus } from '@prisma/client';
import { getProductStatusFromQuantity } from '../product/helpers/product-status.helper';
import { IyzicoService } from '../payment-providers/iyzico.service';
import { PayTRService } from '../payment-providers/paytr.service';
import { EventService } from '../events';
import { InvoiceService } from '../invoice/invoice.service';
import { Request } from 'express';
import * as crypto from 'crypto';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly holdDays: number;
  private readonly iyzicoSecretKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly configService: ConfigService,
    private readonly iyzicoService: IyzicoService,
    private readonly paytrService: PayTRService,
    private readonly eventService: EventService,
    private readonly invoiceService: InvoiceService,
  ) {
    this.holdDays = parseInt(this.configService.get('PAYMENT_HOLD_DAYS') || '7', 10);
    this.iyzicoSecretKey = this.configService.get('IYZICO_SECRET_KEY') || '';
  }

  /**
   * Verify iyzico webhook signature
   * Uses HMAC-SHA256 for signature verification
   */
  private verifyIyzicoSignature(payload: string, signature: string): boolean {
    if (!this.iyzicoSecretKey) {
      this.logger.warn('IYZICO_SECRET_KEY not configured, skipping signature verification');
      return true; // Skip verification in development
    }

    try {
      const expectedSignature = crypto
        .createHmac('sha256', this.iyzicoSecretKey)
        .update(payload)
        .digest('base64');

      const isValid = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature),
      );

      if (!isValid) {
        this.logger.warn('Invalid iyzico signature');
      }

      return isValid;
    } catch (error) {
      this.logger.error('Signature verification error:', error);
      return false;
    }
  }

  /**
   * Get client IP address from request
   */
  private getClientIp(req?: Request): string {
    if (!req) {
      return '127.0.0.1';
    }

    // Check for forwarded IP (behind proxy/load balancer)
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
      return ips.split(',')[0].trim();
    }

    // Check for real IP header
    const realIp = req.headers['x-real-ip'];
    if (realIp) {
      return Array.isArray(realIp) ? realIp[0] : realIp;
    }

    // Fallback to connection remote address
    return req.ip || req.socket?.remoteAddress || '127.0.0.1';
  }

  /**
   * Unified payment initiation for both authenticated and guest users
   * POST /payments/initiate
   */
  async initiatePaymentUnified(userId: string | null, dto: InitiatePaymentDto, req?: Request) {
    // Verify order exists
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: {
        buyer: true,
        seller: true,
        product: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Sipariş bulunamadı');
    }

    // Check if this is a guest order
    const shippingAddress = order.shippingAddress as any;
    const isGuestOrder = shippingAddress?.isGuestOrder === true;

    // Validate access
    if (userId) {
      // Authenticated user - must be the buyer
      if (order.buyerId !== userId) {
        throw new ForbiddenException('Bu sipariş için ödeme yapamazsınız');
      }
    } else {
      // Guest user - order must be a guest order
      if (!isGuestOrder) {
        throw new ForbiddenException('Bu sipariş için giriş yapmanız gerekiyor');
      }
    }

    if (order.status !== OrderStatus.pending_payment) {
      throw new BadRequestException('Bu sipariş için ödeme beklenmiyor');
    }

    return this.processPaymentInitiation(order, dto, req);
  }

  /**
   * Initiate payment for an order (legacy - for backward compatibility)
   */
  async initiatePayment(buyerId: string, dto: InitiatePaymentDto, req?: Request) {
    return this.initiatePaymentUnified(buyerId, dto, req);
  }

  /**
   * Initiate payment for a guest order (legacy - for backward compatibility)
   */
  async initiateGuestPayment(dto: InitiatePaymentDto, req?: Request) {
    return this.initiatePaymentUnified(null, dto, req);
  }

  /**
   * Initiate payment for a trade's cash amount (extra money on top of items).
   * Called from TradeController POST /trades/:id/cash-payment/initiate.
   */
  async initiateTradeCashPayment(tradeId: string, userId: string, req?: Request) {
    const trade = await this.prisma.trade.findUnique({
      where: { id: tradeId },
      include: {
        cashPayment: true,
        initiator: { select: { id: true, displayName: true, email: true, phone: true } },
        receiver: { select: { id: true, displayName: true, email: true, phone: true } },
      },
    });

    if (!trade) throw new NotFoundException('Takas bulunamadı');
    if (trade.status !== TradeStatus.accepted) {
      throw new BadRequestException('Takas henüz kabul edilmedi veya uygun durumda değil');
    }
    if (!trade.cashAmount || Number(trade.cashAmount) <= 0) {
      throw new BadRequestException('Bu takasta ekstra ödeme bulunmuyor');
    }
    if (trade.cashPayerId !== userId) {
      throw new ForbiddenException('Bu ödemeyi sadece belirlenmiş ödeyen taraf başlatabilir');
    }

    const cashPayment = trade.cashPayment;
    if (!cashPayment) {
      throw new BadRequestException('Nakit ödeme kaydı bulunamadı');
    }
    if (cashPayment.status === PaymentStatus.completed) {
      throw new BadRequestException('Bu takas ödemesi zaten tamamlandı');
    }

    // trade_cash_payment_id is unique: only one Payment per TradeCashPayment. Reuse existing if any.
    const existingPayment = await this.prisma.payment.findUnique({
      where: { tradeCashPaymentId: cashPayment.id },
    });

    if (existingPayment) {
      if (existingPayment.status === PaymentStatus.completed) {
        throw new BadRequestException('Bu takas ödemesi zaten tamamlandı');
      }
      // Pending veya failed: yeniden kullan (failed ise pending yap)
      if (existingPayment.status === PaymentStatus.failed) {
        await this.prisma.payment.update({
          where: { id: existingPayment.id },
          data: { status: PaymentStatus.pending, failureReason: null },
        });
      }
      const frontendUrl = this.configService.get('FRONTEND_URL') || (this.configService.get('NODE_ENV') === 'production' ? 'https://tarodan.com' : 'http://localhost:3000');
      const paymentBypassExisting = this.configService.get('PAYMENT_BYPASS') === 'true' || this.configService.get('PAYMENT_BYPASS') === '1';
      return {
        paymentId: existingPayment.id,
        paymentUrl: `${frontendUrl}/payment/${existingPayment.id}`,
        provider: existingPayment.provider,
        expiresIn: 300,
        ...(paymentBypassExisting && { useBypass: true }),
        tradeId,
        amount: Number(cashPayment.totalAmount),
      };
    }

    const provider = PaymentProvider.paytr;
    const totalAmount = Number(cashPayment.totalAmount);

    const payment = await this.prisma.payment.create({
      data: {
        tradeCashPaymentId: cashPayment.id,
        amount: totalAmount,
        currency: 'TRY',
        provider,
        status: PaymentStatus.pending,
      },
    });

    await this.logPaymentAction('created', payment.id, undefined, undefined, undefined, PaymentStatus.pending, {
      amount: totalAmount,
      provider,
      tradeId,
      tradeCashPaymentId: cashPayment.id,
      payerId: userId,
    });

    const paymentBypass = this.configService.get('PAYMENT_BYPASS') === 'true' || this.configService.get('PAYMENT_BYPASS') === '1';
    if (paymentBypass) {
      return {
        paymentId: payment.id,
        tradeId,
        amount: totalAmount,
        paymentUrl: undefined,
        paymentHtml: undefined,
        provider,
        expiresIn: 300,
        useBypass: true,
      };
    }

    // Build a virtual order-like object for PayTR initialization
    const payer = trade.cashPayerId === trade.initiatorId ? trade.initiator : trade.receiver;
    const virtualOrder = {
      id: tradeId,
      orderNumber: `TRADE-${trade.tradeNumber}`,
      totalAmount,
      buyer: payer,
      product: {
        id: `trade-cash-${tradeId}`,
        title: `Takas #${trade.tradeNumber} Ekstra Ödeme`,
      },
      productId: `trade-cash-${tradeId}`,
      shippingAddress: null,
    };

    try {
      const result = await this.initializePayTRPayment(payment, virtualOrder, this.getClientIp(req));
      return {
        paymentId: payment.id,
        paymentUrl: result.paymentUrl,
        paymentHtml: result.paymentHtml,
        provider,
        expiresIn: 300,
      };
    } catch (error: any) {
      // Mark payment as failed but don't release products (trade products are managed separately)
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.failed, failureReason: error.message || 'PayTR ödeme başlatılamadı' },
      });
      throw new BadRequestException(error.message || 'PayTR ödeme başlatılamadı');
    }
  }

  /**
   * Common payment initiation logic for both authenticated and guest users
   */
  private async processPaymentInitiation(order: any, dto: InitiatePaymentDto, req?: Request) {
    // Check for existing pending payment
    const existingPayment = await this.prisma.payment.findFirst({
      where: {
        orderId: dto.orderId,
        status: PaymentStatus.pending,
      },
    });

    if (existingPayment) {
      // Eski hata mesajını temizle; kullanıcı yeni deneme yapıyor
      if (existingPayment.failureReason) {
        await this.prisma.payment.update({
          where: { id: existingPayment.id },
          data: { failureReason: null },
        });
      }

      const paymentBypassExisting = this.configService.get('PAYMENT_BYPASS') === 'true' || this.configService.get('PAYMENT_BYPASS') === '1';
      if (paymentBypassExisting) {
        return {
          paymentId: existingPayment.id,
          orderId: dto.orderId,
          amount: Number(order.totalAmount),
          paymentUrl: undefined,
          paymentHtml: undefined,
          provider: existingPayment.provider,
          expiresIn: 300,
          useBypass: true,
        };
      }

      return {
        paymentId: existingPayment.id,
        paymentUrl: `${this.configService.get('FRONTEND_URL') || (this.configService.get('NODE_ENV') === 'production' ? 'https://tarodan.com' : 'http://localhost:3000')}/payment/${existingPayment.id}`,
        provider: existingPayment.provider,
        expiresIn: 300,
      };
    }

    // Create payment record
    const payment = await this.prisma.payment.create({
      data: {
        orderId: dto.orderId,
        amount: order.totalAmount,
        currency: 'TRY',
        provider: dto.provider,
        status: PaymentStatus.pending,
      },
    });

    // Log payment creation
    await this.logPaymentAction('created', payment.id, dto.orderId, undefined, undefined, PaymentStatus.pending, {
      amount: Number(order.totalAmount),
      provider: dto.provider,
      buyerId: order.buyerId,
    });

    // Generate payment URL based on provider
    let paymentUrl: string;
    let paymentHtml: string | undefined;
    const clientIp = this.getClientIp(req);

    // İyzico kaldırıldı – sadece PayTR kullanılıyor
    if (dto.provider === PaymentProvider.iyzico) {
      dto.provider = PaymentProvider.paytr;
    }

    // Ödeme bypass (test): PayTR çağrılmaz; tek kart başarılı, diğerleri başarısız
    const paymentBypass = this.configService.get('PAYMENT_BYPASS') === 'true' || this.configService.get('PAYMENT_BYPASS') === '1';
    if (paymentBypass) {
      return {
        paymentId: payment.id,
        orderId: dto.orderId,
        amount: Number(order.totalAmount),
        paymentUrl: undefined,
        paymentHtml: undefined,
        provider: dto.provider,
        expiresIn: 300,
        useBypass: true,
      };
    }

    // PayTR flow
    {
      const result = await this.initializePayTRPayment(payment, order, clientIp);
      return {
        paymentId: payment.id,
        paymentUrl: result.paymentUrl,
        paymentHtml: result.paymentHtml,
        provider: dto.provider,
        expiresIn: 300, // 5 minutes
      };
    }
  }

  /**
   * Initialize Iyzico payment using checkout form
   */
  private async initializeIyzicoPayment(payment: any, order: any, clientIp: string) {
    try {
      const baseUrl = this.configService.get('FRONTEND_URL') || (this.configService.get('NODE_ENV') === 'production' ? 'https://tarodan.com' : 'http://localhost:3000');
      const isMembershipOrder = order.productId?.startsWith?.('membership-');
      const callbackUrl = `${baseUrl}/api/payment/callback/iyzico?paymentId=${payment.id}${isMembershipOrder ? '&type=membership' : ''}`;
      const shippingAddress = order.shippingAddress as any;

      // Check if this is a guest order
      const isGuestOrder = shippingAddress?.isGuestOrder === true;

      // Prepare buyer information - handle guest orders
      let buyerFirstName: string;
      let buyerLastName: string;
      let buyerEmail: string;
      let buyerPhone: string;

      if (isGuestOrder) {
        // For guest orders, use guest info from shippingAddress
        const guestName = shippingAddress?.guestName || shippingAddress?.fullName || 'Misafir Müşteri';
        const nameParts = guestName.split(' ');
        buyerFirstName = nameParts[0] || 'Misafir';
        buyerLastName = nameParts.slice(1).join(' ') || 'Müşteri';
        buyerEmail = shippingAddress?.guestEmail || 'guest@tarodan.com';
        buyerPhone = shippingAddress?.guestPhone || shippingAddress?.phone || '+905000000000';
      } else {
        // For authenticated users
        const buyerName = order.buyer.displayName?.split(' ') || ['Müşteri', ''];
        buyerFirstName = buyerName[0] || 'Müşteri';
        buyerLastName = buyerName.slice(1).join(' ') || 'Müşteri';
        buyerEmail = order.buyer.email;
        buyerPhone = order.buyer.phone || '+905000000000';
      }

      // Ensure names are not empty (iyzico requires non-empty values)
      if (!buyerFirstName || buyerFirstName.trim() === '') buyerFirstName = 'Müşteri';
      if (!buyerLastName || buyerLastName.trim() === '') buyerLastName = 'Müşteri';

      // Prepare basket items
      const basketItems = [{
        id: order.product.id,
        name: order.product.title.substring(0, 50), // iyzico has a limit
        category1: 'Koleksiyon',
        itemType: 'PHYSICAL' as const,
        price: Number(order.totalAmount).toFixed(2),
      }];

      // Prepare shipping address
      const addressLine = shippingAddress?.address || 'Türkiye';
      const cityName = shippingAddress?.city || 'İstanbul';
      const contactName = shippingAddress?.fullName || `${buyerFirstName} ${buyerLastName}`;

      const shippingAddr = {
        contactName: contactName,
        city: cityName,
        country: 'Turkey',
        address: addressLine.length > 0 ? addressLine : 'Türkiye',
        zipCode: shippingAddress?.zipCode || '34000',
      };

      // Billing: use separate billing address when stored, otherwise same as shipping
      const billingSource = (shippingAddress as any)?.billingAddress || shippingAddress;
      const billingAddr = {
        contactName: billingSource?.fullName || contactName,
        city: billingSource?.city || cityName,
        country: 'Turkey',
        address: (billingSource?.address || addressLine).length > 0 ? (billingSource?.address || addressLine) : 'Türkiye',
        zipCode: billingSource?.zipCode || '34000',
      };

      // Initialize checkout form
      const checkoutFormRequest = {
        locale: 'tr',
        conversationId: order.id,
        price: Number(order.totalAmount).toFixed(2),
        paidPrice: Number(order.totalAmount).toFixed(2),
        currency: 'TRY',
        basketId: order.id,
        paymentGroup: 'PRODUCT',
        callbackUrl,
        enabledInstallments: [1, 2, 3, 6, 9],
        buyer: {
          id: order.buyer.id,
          name: buyerFirstName,
          surname: buyerLastName,
          gsmNumber: buyerPhone.startsWith('+') ? buyerPhone : `+90${buyerPhone.replace(/^0/, '')}`,
          email: buyerEmail,
          identityNumber: '11111111111', // Test TC Kimlik No for sandbox
          registrationAddress: shippingAddr.address,
          ip: clientIp || '127.0.0.1',
          city: shippingAddr.city,
          country: 'Turkey',
        },
        shippingAddress: shippingAddr,
        billingAddress: billingAddr,
        basketItems,
      };

      const result = await this.iyzicoService.initializeCheckoutForm(checkoutFormRequest);

      if (result.status === 'failure') {
        throw new BadRequestException(
          result.errorMessage || 'Iyzico ödeme başlatılamadı',
        );
      }

      if (!result.checkoutFormContent && !result.paymentPageUrl) {
        throw new BadRequestException('Iyzico ödeme sayfası oluşturulamadı');
      }

      // Update payment with provider reference
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          providerPaymentId: result.token || payment.id,
          providerConversationId: order.id,
          metadata: {
            token: result.token,
            tokenExpireTime: result.tokenExpireTime,
          },
        },
      });

      // Return payment page URL or HTML content
      if (result.paymentPageUrl) {
        return {
          paymentUrl: result.paymentPageUrl,
          paymentHtml: undefined,
        };
      } else if (result.checkoutFormContent) {
        return {
          paymentUrl: `${this.configService.get('FRONTEND_URL') || (this.configService.get('NODE_ENV') === 'production' ? 'https://tarodan.com' : 'http://localhost:3000')}/payment/iyzico/${payment.id}`,
          paymentHtml: result.checkoutFormContent,
        };
      } else {
        throw new BadRequestException('Iyzico ödeme sayfası oluşturulamadı');
      }
    } catch (error: any) {
      this.logger.error(`Iyzico initialization error: ${error.message}`, error.stack);
      throw new BadRequestException(
        error.message || 'Iyzico ödeme başlatılamadı',
      );
    }
  }

  /**
   * Initialize PayTR payment
   * Uses PayTR iframe token API for secure payment
   */
  private async initializePayTRPayment(payment: any, order: any, clientIp: string) {
    this.logger.log(`Initializing PayTR payment for order ${order.id}`);

    // PayTR merchant_oid sadece harf ve rakam kabul ediyor (tire vb. kabul etmiyor)
    const merchantOid = String(order.orderNumber || order.id).replace(/-/g, '');

    try {
      // Get shipping address from order
      const shippingAddress = order.shippingAddress as any;

      // Prepare buyer info with actual shipping address
      const buyerName = order.buyer.displayName?.split(' ') || ['Müşteri', ''];
      const buyerFirstName = buyerName[0] || 'Müşteri';
      const buyerLastName = buyerName.slice(1).join(' ') || '';

      const buyer = {
        id: order.buyer.id,
        name: buyerFirstName,
        surname: buyerLastName,
        email: order.buyer.email,
        phone: shippingAddress?.phone || order.buyer.phone || '+905000000000',
        ip: clientIp,
        address: shippingAddress?.address || shippingAddress?.fullAddress || 'Türkiye',
        city: shippingAddress?.city || 'İstanbul',
      };

      // Prepare basket items
      const basketItems = [{
        id: order.product.id,
        name: order.product.title,
        category: 'Koleksiyon',
        price: Number(order.totalAmount),
        quantity: 1,
      }];

      // Membership ödemelerinde başarı sayfası /membership/success olsun (PayTR yönlendirmesi)
      const isMembershipOrder = order.productId?.startsWith?.('membership-');
      const result = await this.paytrService.processOrderPayment(
        merchantOid,
        Number(order.totalAmount),
        buyer,
        basketItems,
        1, // installment count
        isMembershipOrder ? 'type=membership' : undefined,
      );

      // Update payment with provider reference (callback merchant_oid ile eşleşmesi için aynı değer)
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          providerPaymentId: result.token,
          providerConversationId: merchantOid,
        },
      });

      // Return iframe URL and HTML for embedding
      return {
        paymentUrl: result.iframeUrl,
        paymentHtml: `<iframe src="${result.iframeUrl}" frameborder="0" style="width:100%;height:600px;border:none;"></iframe>`,
      };
    } catch (error: any) {
      this.logger.error(`PayTR initialization error: ${error.message}`, error.stack);

      // Ödeme hiç başlamadı ama sipariş oluştuğu için ürün rezerve kaldı – hemen serbest bırak (stoktan düşmesin)
      try {
        await this.processFailedPayment(payment, error?.message || 'PayTR ödeme başlatılamadı');
      } catch (releaseErr: any) {
        this.logger.warn(`Release product after PayTR init error failed: ${releaseErr?.message}`);
      }

      throw new BadRequestException(
        error.message || 'PayTR ödeme başlatılamadı',
      );
    }
  }

  /**
   * Process Direct Payment (3D Secure via API)
   * Supports saved cards (cardToken) or new card entry
   */
  async processDirectPayment(dto: DirectPaymentDto, userId: string, req?: Request) {
    // Optional CVV-based bypass for testing:
    // - CVV "000" => force success (no gateway call)
    // - CVV "001" => force failure (no gateway call)
    const cvvBypassFlag = this.configService.get('PAYMENT_CVV_BYPASS_ENABLED');
    const isCvvBypassEnabled = cvvBypassFlag !== 'false' && cvvBypassFlag !== '0';

    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: {
        buyer: true,
        product: true,
      },
    });

    if (!order) throw new NotFoundException('Sipariş bulunamadı');
    if (order.status !== OrderStatus.pending_payment) throw new BadRequestException('Sipariş ödeme bekliyor durumunda değil');

    // Guest check
    if (userId && order.buyerId !== userId) throw new ForbiddenException('Bu sipariş size ait değil');

    // Guest orders can't use saved cards unless we implement guest temporary storage (risky), so block cardToken for guests if strict
    // but for now assumme cardToken implies auth user.

    const clientIp = this.getClientIp(req);
    const shippingAddress = order.shippingAddress as any;
    const isGuestOrder = !userId; // or check shippingAddress.isGuestOrder

    // Create payment record if not exists
    let payment = await this.prisma.payment.findFirst({
      where: { orderId: dto.orderId, status: PaymentStatus.pending },
    });

    if (!payment) {
      payment = await this.prisma.payment.create({
        data: {
          orderId: dto.orderId,
          amount: order.totalAmount,
          currency: 'TRY',
          provider: PaymentProvider.iyzico,
          status: PaymentStatus.pending,
        },
      });
    }

    // Prepare buyer info
    let buyerFirstName, buyerLastName, buyerEmail, buyerPhone;
    if (isGuestOrder) {
      const guestName = shippingAddress?.guestName || shippingAddress?.fullName || 'Misafir Müşteri';
      const parts = guestName.split(' ');
      buyerFirstName = parts[0];
      buyerLastName = parts.slice(1).join(' ') || 'Müşteri';
      buyerEmail = shippingAddress?.guestEmail || 'guest@tarodan.com';
      buyerPhone = shippingAddress?.guestPhone || shippingAddress?.phone || '+905555555555';
    } else {
      const parts = order.buyer.displayName?.split(' ') || ['Müşteri'];
      buyerFirstName = parts[0];
      buyerLastName = parts.slice(1).join(' ') || 'Müşteri';
      buyerEmail = order.buyer.email;
      buyerPhone = order.buyer.phone || '+905555555555';
    }

    // Address mapping
    const address = shippingAddress?.address || 'Türkiye';
    const city = shippingAddress?.city || 'İstanbul';
    const contactName = shippingAddress?.fullName || `${buyerFirstName} ${buyerLastName}`;

    const iyzicoAddress = {
      contactName,
      city,
      country: 'Turkey',
      address,
      zipCode: shippingAddress?.zipCode || '34000',
    };

    // ==========================================================================
    // CVV BYPASS (test helper)
    // ==========================================================================
    if (isCvvBypassEnabled && dto.card?.cvc) {
      const cvv = String(dto.card.cvc).trim();

      // Success bypass: CVV === "000"
      if (cvv === '000') {
        // Reload payment with order relations required by processSuccessfulPayment
        const paymentWithOrder = await this.prisma.payment.findUnique({
          where: { id: payment.id },
          include: {
            order: {
              include: {
                buyer: true,
                seller: true,
                product: true,
              },
            },
          },
        });

        if (!paymentWithOrder) {
          throw new NotFoundException('Ödeme bulunamadı');
        }

        await this.processSuccessfulPayment(paymentWithOrder, 'TEST_CVV_000');

        const frontendUrl =
          this.configService.get('FRONTEND_URL') ||
          (this.configService.get('NODE_ENV') === 'production'
            ? 'https://tarodan.com'
            : 'http://localhost:3000');

        const guestParam = isGuestOrder ? '&guest=true' : '';
        const successUrl = `${frontendUrl}/payment/success?orderId=${order.id}&paymentId=${paymentWithOrder.id}${guestParam}&debug=cvv-000-bypass`;

        const html = `
<!DOCTYPE html>
<html lang="tr">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="refresh" content="0;url=${successUrl}" />
    <title>Ödeme Başarılı</title>
  </head>
  <body>
    <p>Ödemeniz test modu (CVV 000) ile başarılı kabul edildi. Yönlendiriliyorsunuz...</p>
    <script>window.location.href = ${JSON.stringify(successUrl)};</script>
  </body>
</html>`;

        return {
          status: 'success',
          htmlContent: Buffer.from(html).toString('base64'),
          isBase64: true,
          paymentId: paymentWithOrder.id,
        };
      }

      // Failure bypass: CVV === "001"
      if (cvv === '001') {
        await this.processFailedPayment(payment, 'TEST_CVV_001');

        const frontendUrl =
          this.configService.get('FRONTEND_URL') ||
          (this.configService.get('NODE_ENV') === 'production'
            ? 'https://tarodan.com'
            : 'http://localhost:3000');

        const guestParam = isGuestOrder ? '&guest=true' : '';
        const failUrl = `${frontendUrl}/payment/fail?paymentId=${payment.id}&orderId=${order.id}${guestParam}&error=${encodeURIComponent(
          'TEST_CVV_001',
        )}&debug=cvv-001-bypass`;

        const html = `
<!DOCTYPE html>
<html lang="tr">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="refresh" content="0;url=${failUrl}" />
    <title>Ödeme Başarısız</title>
  </head>
  <body>
    <p>Ödemeniz test modu (CVV 001) ile başarısız kabul edildi. Yönlendiriliyorsunuz...</p>
    <script>window.location.href = ${JSON.stringify(failUrl)};</script>
  </body>
</html>`;

        return {
          status: 'error',
          htmlContent: Buffer.from(html).toString('base64'),
          isBase64: true,
          paymentId: payment.id,
          message: 'TEST_CVV_001',
        };
      }
    }

    // Callback URL: bank/iyzico POSTs here after 3DS. Must be backend so we can call complete3DSecure and redirect.
    const apiBaseUrl = this.configService.get('API_URL') || (this.configService.get('NODE_ENV') === 'production' ? 'https://api.tarodan.com' : 'http://localhost:3001');
    const callbackUrl = `${apiBaseUrl}/api/payments/callback/iyzico?paymentId=${payment.id}&direct=true`;

    const request: any = {
      locale: 'tr',
      conversationId: order.id,
      price: Number(order.totalAmount).toFixed(2),
      paidPrice: Number(order.totalAmount).toFixed(2),
      currency: 'TRY',
      basketId: order.id,
      paymentGroup: 'PRODUCT',
      callbackUrl,
      buyer: {
        id: order.buyerId || 'guest',
        name: buyerFirstName,
        surname: buyerLastName,
        gsmNumber: buyerPhone,
        email: buyerEmail,
        identityNumber: '11111111111',
        registrationAddress: address,
        ip: clientIp,
        city,
        country: 'Turkey',
      },
      shippingAddress: iyzicoAddress,
      billingAddress: iyzicoAddress, // Using same for simplicity
      basketItems: [{
        id: order.product.id,
        name: order.product.title.substring(0, 50),
        category1: 'Koleksiyon',
        itemType: 'PHYSICAL',
        price: Number(order.totalAmount).toFixed(2),
      }],
      installment: 1, // Default single installment
    };

    // Card Token Logic
    if (dto.cardToken && userId) {
      // Use stored card
      request.cardUserKey = userId; // Using userId as cardUserKey
      request.cardToken = dto.cardToken;
    } else if (dto.card) {
      // Use new card
      request.paymentCard = {
        cardHolderName: dto.card.cardHolderName,
        cardNumber: dto.card.cardNumber.replace(/\s/g, ''),
        expireMonth: dto.card.expireMonth,
        expireYear: dto.card.expireYear,
        cvc: dto.card.cvc,
        registerCard: dto.saveCard && userId ? 1 : 0, // Register if requested and user logged in
      };

      // If saving card, we need cardUserKey (userId)
      if (dto.saveCard && userId) {
        request.cardUserKey = userId;
      }
    } else {
      throw new BadRequestException('Kart bilgisi veya kayıtlı kart seçilmeli');
    }

    // DEBUG: Log card saving parameters
    this.logger.log(`[ÖDEME] Card Save Debug: saveCard=${dto.saveCard}, userId=${userId}, registerCard=${request.paymentCard?.registerCard}, cardUserKey=${request.cardUserKey}`);

    try {
      const result = await this.iyzicoService.initialize3DSecure(request);

      const resultKeys = Object.keys(result || {}).join(',');
      this.logger.log(`[ÖDEME] Iyzico 3DS yanıt keys: ${resultKeys}, status: ${(result as any)?.status}`);
      Object.keys(result || {}).forEach((k) => {
        const v = (result as any)[k];
        if (typeof v === 'string' && v.length > 0 && v.length < 500) this.logger.log(`[ÖDEME] Iyzico.${k} (${v.length} char): ${v.substring(0, 100)}...`);
        else if (typeof v === 'string') this.logger.log(`[ÖDEME] Iyzico.${k} length=${v.length}, startsWith: ${v.substring(0, 50)}`);
      });

      // Iyzico SDK can return HTML under different keys (htmlContent, threeDSHtmlContent, etc.)
      const htmlKey = Object.keys(result || {}).find((k) => k.toLowerCase().includes('html'));
      const rawHtmlContent =
        (result as any).htmlContent ||
        (result as any).threeDSHtmlContent ||
        (result as any).HTMLContent ||
        (result as any).three_ds_html_content ||
        (htmlKey ? (result as any)[htmlKey] : undefined);

      // Store iyzico paymentId for 3DS callback (complete3DSecure needs it)
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          providerPaymentId: (result as any).paymentId || payment.id,
          providerConversationId: order.id,
          metadata: {
            isDirectApi: true,
            iyzicoStatus: result.status,
            iyzicoPaymentId: (result as any).paymentId,
          }
        }
      });

      if (rawHtmlContent) {
        this.logger.log(`[ÖDEME] 3DS HTML bulundu, length=${rawHtmlContent.length}, ilk 60 char: ${rawHtmlContent.substring(0, 60)}`);
        return {
          status: 'success',
          htmlContent: Buffer.from(rawHtmlContent).toString('base64'),
          isBase64: true,
          paymentId: payment.id,
        };
      } else {
        // Init başarılı (status: success) olsa bile HTML yoksa 3DS başlayamaz.
        // Bu durumda ödeme alınmamıştır, sadece init olmuştur.
        // Kullanıcıya başarılı demek yanlıştır.

        this.logger.error(`[ÖDEME] Iyzico HTML yok. Keys: ${resultKeys}. Frontend bu mesajı gösterecek.`);
        throw new BadRequestException(`3D Secure HTML gelmedi. Iyzico dönen alanlar: ${resultKeys}. (Sandbox/API key kontrol et.)`);
      }

    } catch (e: any) {
      this.logger.error(`[ÖDEME] processDirect hata: ${e.message}`, e?.stack);
      throw new BadRequestException(e.message || 'Ödeme başlatılamadı');
    }
  }

  /**
   * Get Stored Cards
   */
  async getStoredCards(userId: string) {
    if (!userId) return [];
    try {
      const res = await this.iyzicoService.getCards(userId);
      return res.cardDetails || [];
    } catch (e) {
      // If user has no cards yet, iyzico might throw or return empty. handled in service.
      return [];
    }
  }

  /**
   * Add Card standalone
   */
  async addStoredCard(userId: string, email: string, card: CreditCardDto) {
    return this.iyzicoService.addCard({
      email,
      cardUserKey: userId,
      card: {
        cardAlias: card.cardAlias || 'Kartım',
        cardHolderName: card.cardHolderName,
        cardNumber: card.cardNumber,
        expireMonth: card.expireMonth,
        expireYear: card.expireYear,
      }
    });
  }

  /**
   * Remove Card
   */
  async removeStoredCard(userId: string, cardToken: string) {
    return this.iyzicoService.deleteCard({
      cardUserKey: userId,
      cardToken,
    });
  }

  /**
   * Handle Iyzico callback
   * POST /payments/callback/iyzico
   * Requirement: iyzico signature verification (3.1)
   */
  async handleIyzicoCallback(dto: IyzicoCallbackDto, rawBody?: string, signature?: string) {
    // Log only that callback was received — never log token, paymentId, conversationId (PCI/security)
    this.logger.log('Iyzico callback received');

    // Verify signature if provided (webhook verification)
    if (rawBody && signature) {
      const isValid = this.verifyIyzicoSignature(rawBody, signature);
      if (!isValid) {
        throw new UnauthorizedException('Invalid iyzico signature');
      }
      this.logger.log('Iyzico signature verified successfully');
    }

    // Find payment by token or conversation ID
    const payment = await this.prisma.payment.findFirst({
      where: {
        OR: [
          { providerPaymentId: dto.token },
          { providerConversationId: dto.conversationId || dto.token },
          { metadata: { path: ['token'], equals: dto.token } },
        ],
      },
      include: {
        order: {
          include: {
            buyer: true,
            seller: true,
            product: true,
          },
        },
      },
    });

    if (!payment) {
      this.logger.warn('Payment not found for Iyzico callback');
      throw new NotFoundException('Payment not found');
    }

    this.logger.log(`Payment found: internalId=${payment.id}, orderId=${payment.orderId}, status=${payment.status}`);

    if (!dto.token) {
      throw new BadRequestException('Payment token is required');
    }

    // Retrieve checkout form result from Iyzico
    try {
      const checkoutResult = await this.iyzicoService.retrieveCheckoutForm(dto.token);

      if (checkoutResult.status === 'success' && checkoutResult.paymentId) {
        // Payment successful
        await this.processSuccessfulPayment(
          payment,
          checkoutResult.paymentId,
        );
        return { status: 'ok', paymentId: checkoutResult.paymentId };
      } else {
        // Payment failed
        const errorMessage = checkoutResult.errorMessage || 'Iyzico payment failed';
        await this.processFailedPayment(payment, errorMessage);
        return { status: 'error', message: errorMessage };
      }
    } catch (error: any) {
      this.logger.error('Error retrieving Iyzico checkout form (do not log provider details)');

      // Fallback: use status from DTO if available
      if (dto.status === 'success') {
        await this.processSuccessfulPayment(payment, dto.paymentId || dto.token);
        return { status: 'ok' };
      } else {
        await this.processFailedPayment(payment, error.message || 'Iyzico payment failed');
        return { status: 'error', message: error.message };
      }
    }
  }

  /**
   * Complete Direct 3D Secure Payment
   */
  async completeDirect3DSecure(paymentId: string, dto: IyzicoCallbackDto) {
    this.logger.log(`Completing Direct 3D Secure for payment ${paymentId}`);

    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        order: {
          include: {
            buyer: true,
            product: true,
          },
        },
      },
    });

    if (!payment) throw new NotFoundException('Payment not found');

    if (payment.status === PaymentStatus.completed) {
      const isGuest = !(payment.order as any)?.buyerId;
      return { status: 'success', paymentId: payment.id, orderId: payment.orderId, isGuest };
    }

    try {
      // Use iyzico paymentId from init (stored in metadata); callback form may send conversationData only
      const iyzicoPaymentId = (payment.metadata as any)?.iyzicoPaymentId || dto.paymentId || '';
      const conversationId = payment.providerConversationId || payment.orderId || (payment.order as any)?.id;

      if (!iyzicoPaymentId) {
        this.logger.error('Missing iyzico paymentId for 3DS complete');
        await this.processFailedPayment(payment, '3D Secure doğrulama bilgisi eksik');
        return { status: 'error', message: '3D Secure doğrulama bilgisi eksik' };
      }

      // Iyzico/bank may send conversationData or token (Mock bazen token döner)
      const dtoAny = dto as any;
      const conversationData =
        dto.conversationData ||
        dto.conversation_data ||
        dtoAny.conversationData ||
        dtoAny.conversation_data ||
        dtoAny.threeDSHtmlContent ||
        '';
      const token = dto.token || dtoAny.token || '';

      // conversationData yok ama token varsa (Iyzico Mock): retrieveCheckoutForm ile sonucu al
      if ((!conversationData || String(conversationData).trim() === '') && token) {
        this.logger.log('[ÖDEME] conversationData yok, token ile retrieveCheckoutForm deneniyor (Mock)');
        try {
          const retrieveResult = await this.iyzicoService.retrieveCheckoutForm(token);
          const isGuest = !(payment.order as any)?.buyerId;
          if (retrieveResult.status === 'success' && retrieveResult.paymentId) {
            await this.processSuccessfulPayment(payment, retrieveResult.paymentId);
            return { status: 'success', paymentId: payment.id, orderId: payment.orderId, isGuest };
          }
          const err = retrieveResult.errorMessage || 'Ödeme doğrulanamadı';
          await this.processFailedPayment(payment, err);
          return { status: 'failed', message: err, orderId: payment.orderId, isGuest };
        } catch (e: any) {
          this.logger.error(`[ÖDEME] retrieveCheckoutForm failed: ${e?.message}`);
          await this.processFailedPayment(payment, e?.message || 'Token ile doğrulama başarısız');
          const isGuest = !(payment.order as any)?.buyerId;
          return { status: 'error', message: e?.message || '3D Secure yanıtı alınamadı', orderId: payment.orderId, isGuest };
        }
      }

      // NEW FIX: If mdStatus=1 and status=success, payment is successful even without conversationData
      // Iyzico sometimes sends empty conversationData but with mdStatus=1 indicating 3DS was successful
      const mdStatus = dtoAny.mdStatus || '';
      const iyzicoStatus = dtoAny.status || '';
      const iyzicoPaymentIdFromCallback = dtoAny.paymentId || '';

      if (mdStatus === '1' && iyzicoStatus === 'success') {
        this.logger.log(`[ÖDEME] mdStatus=1 ve status=success, ödeme başarılı kabul ediliyor. Iyzico paymentId: ${iyzicoPaymentIdFromCallback}`);
        const isGuest = !(payment.order as any)?.buyerId;
        await this.processSuccessfulPayment(payment, iyzicoPaymentIdFromCallback || iyzicoPaymentId);
        return { status: 'success', paymentId: payment.id, orderId: payment.orderId, isGuest };
      }

      if (!conversationData || String(conversationData).trim() === '') {
        this.logger.warn('[ÖDEME] conversationData ve token yok, mdStatus da başarılı değil. Keys: ' + Object.keys(dtoAny).join(','));
        await this.processFailedPayment(payment, '3D Secure yanıtı alınamadı (conversationData/token eksik)');
        const isGuest = !(payment.order as any)?.buyerId;
        return { status: 'error', message: '3D Secure yanıtı alınamadı', orderId: payment.orderId, isGuest };
      }

      const result = await this.iyzicoService.complete3DSecure({
        paymentId: iyzicoPaymentId,
        conversationId: String(conversationId),
        conversationData: String(conversationData).trim(),
      });

      const isGuest = !(payment.order as any)?.buyerId;
      if (result.status === 'success' && (result.paymentStatus === 'SUCCESS' || result.status === 'success')) {
        await this.processSuccessfulPayment(payment, result.paymentId);
        return { status: 'success', paymentId: payment.id, orderId: payment.orderId, isGuest };
      } else {
        const err = result.errorMessage || '3D Secure Auth failed';
        await this.processFailedPayment(payment, err);
        return { status: 'failed', message: err, orderId: payment.orderId, isGuest };
      }
    } catch (e: any) {
      this.logger.error(`3DS Complete error: ${e.message}`);
      const isGuest = !(payment.order as any)?.buyerId;
      await this.processFailedPayment(payment, e.message);
      return { status: 'error', message: e.message, orderId: payment.orderId, isGuest };
    }
  }

  /**
   * Verify Iyzico checkout form result using token
   * Called by frontend after iyzico redirects back
   */
  async verifyIyzicoCheckoutForm(token: string, paymentId?: string) {
    this.logger.log('Verifying Iyzico checkout form');

    // Find payment by token or paymentId
    const payment = await this.prisma.payment.findFirst({
      where: {
        OR: [
          { id: paymentId || '' },
          { providerPaymentId: token },
          { metadata: { path: ['token'], equals: token } },
        ],
      },
      include: {
        order: {
          include: {
            buyer: true,
            seller: true,
            product: true,
          },
        },
      },
    });

    if (!payment) {
      this.logger.warn('Payment not found for verify request');
      return { success: false, status: 'error', message: 'Ödeme bulunamadı' };
    }

    // If payment is already processed, return its status
    if (payment.status === PaymentStatus.completed) {
      return { success: true, status: 'success', paymentId: payment.id, orderId: payment.orderId };
    }

    if (payment.status === PaymentStatus.failed) {
      return { success: false, status: 'failed', message: 'Ödeme başarısız oldu' };
    }

    // Retrieve checkout form result from Iyzico
    try {
      const checkoutResult = await this.iyzicoService.retrieveCheckoutForm(token);

      if (checkoutResult.status === 'success' && checkoutResult.paymentId) {
        // Payment successful - process it
        await this.processSuccessfulPayment(
          payment,
          checkoutResult.paymentId,
        );
        return {
          success: true,
          status: 'success',
          paymentId: payment.id,
          orderId: payment.orderId,
          iyzicoPaymentId: checkoutResult.paymentId,
        };
      } else {
        // Payment failed
        const errorMessage = checkoutResult.errorMessage || 'Ödeme başarısız';
        await this.processFailedPayment(payment, errorMessage);
        return { success: false, status: 'failed', message: errorMessage };
      }
    } catch (error: any) {
      this.logger.error('Error verifying Iyzico checkout form (do not log provider details)');
      return { success: false, status: 'error', message: error.message || 'Doğrulama hatası' };
    }
  }

  /**
   * Handle PayTR callback
   * POST /payments/callback/paytr
   */
  async handlePayTRCallback(dto: PayTRCallbackDto) {
    this.logger.log('PayTR callback received');

    // Verify hash using PayTR service
    const isValid = this.paytrService.verifyCallback({
      merchant_oid: dto.merchant_oid,
      status: dto.status as 'success' | 'failed',
      total_amount: dto.total_amount,
      hash: dto.hash,
      failed_reason_code: dto.failed_reason_code,
      failed_reason_msg: dto.failed_reason_msg,
    });

    if (!isValid) {
      throw new BadRequestException('Invalid hash');
    }

    // Find payment by order ID or trade reference (merchant_oid is the order ID or trade reference)
    const payment = await this.prisma.payment.findFirst({
      where: {
        OR: [
          { providerConversationId: dto.merchant_oid },
          { orderId: dto.merchant_oid },
        ],
      },
      include: {
        order: {
          include: {
            buyer: true,
            seller: true,
            product: true,
          },
        },
        tradeCashPayment: true,
      },
    });

    if (!payment) {
      // Also try to find by provider payment ID
      const paymentByToken = await this.prisma.payment.findFirst({
        where: { providerPaymentId: { contains: dto.merchant_oid } },
        include: {
          order: {
            include: {
              buyer: true,
              seller: true,
              product: true,
            },
          },
          tradeCashPayment: true,
        },
      });

      if (!paymentByToken) {
        throw new NotFoundException('Payment not found');
      }

      if (dto.status === 'success') {
        await this.processSuccessfulPayment(paymentByToken, dto.merchant_oid);
      } else {
        await this.processFailedPayment(paymentByToken, dto.failed_reason_msg || 'PayTR payment failed');
      }

      return 'OK';
    }

    if (dto.status === 'success') {
      await this.processSuccessfulPayment(payment, dto.merchant_oid);
    } else {
      await this.processFailedPayment(payment, dto.failed_reason_msg || 'PayTR payment failed');
    }

    return 'OK';
  }

  /**
   * Log payment action to audit log
   * Note: AuditLog requires adminUserId, so we only log admin actions
   * For user actions, we store in payment metadata
   */
  private async logPaymentAction(
    action: string,
    paymentId: string,
    orderId: string,
    adminUserId?: string,
    oldStatus?: PaymentStatus,
    newStatus?: PaymentStatus,
    metadata?: any,
  ) {
    try {
      // Only log to AuditLog if adminUserId is provided (admin actions)
      if (adminUserId) {
        // Check if admin user exists
        const adminUser = await this.prisma.adminUser.findUnique({
          where: { id: adminUserId },
        });

        if (adminUser) {
          await this.prisma.auditLog.create({
            data: {
              adminUserId,
              action: `payment.${action}`,
              entityType: 'Payment',
              entityId: paymentId,
              oldValue: oldStatus
                ? {
                  status: oldStatus,
                  paymentId,
                  orderId,
                  ...metadata,
                }
                : null,
              newValue: newStatus
                ? {
                  status: newStatus,
                  paymentId,
                  orderId,
                  ...metadata,
                }
                : {
                  paymentId,
                  orderId,
                  ...metadata,
                },
            },
          });
        }
      }

      // For all actions (including user actions), store in payment metadata
      const payment = await this.prisma.payment.findUnique({
        where: { id: paymentId },
      });

      if (payment) {
        const auditHistory = (payment.metadata as any)?.auditHistory || [];
        auditHistory.push({
          action: `payment.${action}`,
          timestamp: new Date().toISOString(),
          adminUserId: adminUserId || null,
          oldStatus,
          newStatus,
          ...metadata,
        });

        await this.prisma.payment.update({
          where: { id: paymentId },
          data: {
            metadata: {
              ...(payment.metadata as any || {}),
              auditHistory,
            },
          },
        });
      }
    } catch (error) {
      // Log but don't fail payment operations
      this.logger.error(`Failed to log payment action ${action}: ${error}`);
    }
  }

  /**
   * Process successful payment
   * Requirement: Queue job publishing after payment (3.1)
   */
  private async processSuccessfulPayment(payment: any, transactionId?: string) {
    // Trade cash payment: different flow from order payments
    if (payment.tradeCashPaymentId && !payment.orderId) {
      return this.processSuccessfulTradeCashPayment(payment, transactionId);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const oldStatus = payment.status;

      // Update payment status
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.completed,
          providerPaymentId: transactionId || payment.providerPaymentId,
        },
      });

      // Log payment completion (will be done after transaction)
      // Store in metadata for now, will log to audit after transaction
      const auditHistory = ((payment.metadata as any)?.auditHistory || []).concat({
        action: 'payment.completed',
        timestamp: new Date().toISOString(),
        oldStatus,
        newStatus: PaymentStatus.completed,
        transactionId: transactionId || payment.providerPaymentId,
      });

      await tx.payment.update({
        where: { id: payment.id },
        data: {
          metadata: {
            ...(payment.metadata as any || {}),
            auditHistory,
          },
        },
      });

      // Update order status to PREPARING (first state after purchase; seller will then mark shipped when sent)
      await tx.order.update({
        where: { id: payment.orderId },
        data: {
          status: OrderStatus.preparing,
          version: { increment: 1 },
        },
      });

      // Check if this is a membership order (productId starts with "membership-")
      const isMembershipOrder = payment.order?.productId?.startsWith('membership-') ?? false;
      const productIdsToInvalidate: string[] = [];

      if (isMembershipOrder) {
        // Activate membership for the buyer
        const membership = await tx.userMembership.findUnique({
          where: { userId: payment.order.buyerId },
          include: { tier: true },
        });

        if (membership) {
          await tx.userMembership.update({
            where: { userId: payment.order.buyerId },
            data: {
              status: SubscriptionStatus.active,
              cancelledAt: null,
            },
          });

          // Update membership payment record
          await tx.membershipPayment.updateMany({
            where: {
              membershipId: membership.id,
              status: 'pending',
            },
            data: {
              status: 'completed',
              providerPaymentId: transactionId || payment.providerPaymentId,
            },
          });

          // Save card information if provided in payment metadata
          const paymentMetadata = payment.metadata as any;
          if (paymentMetadata?.cardData) {
            const cardData = paymentMetadata.cardData;
            const cardNumber = cardData.number?.replace(/\s/g, '') || '';

            if (cardNumber.length >= 13) {
              // Extract card brand
              let cardBrand = 'Kart';
              if (cardNumber.startsWith('4')) {
                cardBrand = 'Visa';
              } else if (cardNumber.startsWith('5') || cardNumber.startsWith('2')) {
                cardBrand = 'Mastercard';
              } else if (cardNumber.startsWith('3')) {
                cardBrand = 'Amex';
              } else if (cardNumber.startsWith('9')) {
                cardBrand = 'Troy';
              }

              const lastFour = cardNumber.slice(-4);

              // Parse expiry (format: MM/YY)
              const expiryParts = cardData.expiry?.split('/') || [];
              const expiryMonth = parseInt(expiryParts[0] || '0', 10);
              const expiryYear = 2000 + parseInt(expiryParts[1] || '0', 10);

              // Check if card already exists
              const existingCard = await tx.paymentMethod.findFirst({
                where: {
                  userId: payment.order.buyerId,
                  lastFour,
                  expiryMonth,
                  expiryYear,
                },
              });

              if (!existingCard) {
                // Check if this is the first card (make it default)
                const existingCount = await tx.paymentMethod.count({
                  where: { userId: payment.order.buyerId },
                });

                await tx.paymentMethod.create({
                  data: {
                    userId: payment.order.buyerId,
                    cardBrand,
                    lastFour,
                    expiryMonth,
                    expiryYear,
                    isDefault: existingCount === 0,
                    tokenId: null, // Would be set from payment provider in real implementation
                  },
                });

                this.logger.log(`Card saved for user ${payment.order.buyerId} after membership payment ${payment.id}`);
              }
            }
          }

          this.logger.log(`Membership activated for user ${payment.order.buyerId} after payment ${payment.id}`);
        }
      } else {
        // Regular product order - update product status to SOLD and decrement stock (stock is only decremented on payment success, not at order creation)
        productIdsToInvalidate.push(payment.order.productId);
        const product = await tx.product.findUnique({
          where: { id: payment.order.productId },
        });

        if (!product) {
          throw new Error('Product not found');
        }

        // Stok ödeme anında düşer; rezervasyon da kalkar (adet bazlı)
        const newQuantity =
          product.quantity !== null ? product.quantity - 1 : null;
        const updateData: any = {
          status: getProductStatusFromQuantity(newQuantity),
          reservedQuantity: { decrement: 1 },
        };
        if (product.quantity !== null) {
          updateData.quantity = { decrement: 1 };
        }

        await tx.product.update({
          where: { id: payment.order.productId },
          data: updateData,
        });

        // CRITICAL: Cancel all pending/accepted trades that include this product
        // When a product is sold, any pending or accepted trades involving it should be cancelled
        const tradesWithThisProduct = await tx.tradeItem.findMany({
          where: { productId: payment.order.productId },
          select: { tradeId: true },
          distinct: ['tradeId'],
        });

        const tradeIds = tradesWithThisProduct.map((item) => item.tradeId);

        if (tradeIds.length > 0) {
          // Find trades that are still pending or accepted (can be cancelled)
          const activeTrades = await tx.trade.findMany({
            where: {
              id: { in: tradeIds },
              status: {
                in: [TradeStatus.pending, TradeStatus.accepted],
              },
            },
          });

          if (activeTrades.length > 0) {
            // Cancel these trades
            await tx.trade.updateMany({
              where: {
                id: { in: activeTrades.map((t) => t.id) },
              },
              data: {
                status: TradeStatus.cancelled,
                cancelledAt: new Date(),
                cancelReason: 'Ürün satın alındığı için takas iptal edildi',
                version: { increment: 1 },
              },
            });

            // Adet bazlı: iptal edilen takaslardaki ürünlerin reservedQuantity'sini düşür
            const allTradeItems = await tx.tradeItem.findMany({
              where: {
                tradeId: { in: activeTrades.map((t) => t.id) },
              },
              select: { productId: true, quantity: true },
            });

            const restoreByProduct = new Map<string, number>();
            for (const item of allTradeItems) {
              if (item.productId === payment.order.productId) continue;
              restoreByProduct.set(
                item.productId,
                (restoreByProduct.get(item.productId) ?? 0) + item.quantity,
              );
            }
            for (const [productId, qty] of restoreByProduct) {
              productIdsToInvalidate.push(productId);
              await tx.product.update({
                where: { id: productId },
                data: {
                  reservedQuantity: { decrement: qty },
                  status: ProductStatus.active,
                },
              });
            }

            this.logger.log(
              `Cancelled ${activeTrades.length} trade(s) due to product ${payment.order.productId} being sold`,
            );
          }
        }
      }

      // Get full order details for event emission
      const order = await tx.order.findUnique({
        where: { id: payment.orderId },
        include: {
          buyer: true,
          seller: true,
          product: true,
        },
      });

      if (!order) {
        throw new Error('Order not found after payment');
      }

      // Only create payment hold for regular product orders (not membership orders)
      if (!isMembershipOrder) {
        // Calculate seller payout (amount - commission)
        const sellerAmount = Number(order.totalAmount) - Number(order.commissionAmount);

        // Create payment hold for seller (escrow)
        const releaseAt = new Date();
        releaseAt.setDate(releaseAt.getDate() + this.holdDays);

        await tx.paymentHold.create({
          data: {
            paymentId: payment.id,
            orderId: payment.orderId,
            sellerId: order.sellerId,
            amount: sellerAmount,
            status: PaymentHoldStatus.held,
            releaseAt,
          },
        });

        this.logger.log(`Payment ${payment.id} completed, hold created for seller ${order.sellerId}`);
      } else {
        this.logger.log(`Membership payment ${payment.id} completed, no hold needed`);
      }

      return { order, productIdsToInvalidate };
    });

    const resultOrder = result.order;
    for (const productId of result.productIdsToInvalidate) {
      await this.cache.del(`products:detail:${productId}`);
    }

    // Emit order.paid event AFTER transaction commits (only for regular product orders, not membership)
    // This publishes jobs to email, push, and shipping queues
    const isMembershipOrder = resultOrder.productId.startsWith('membership-');

    if (!isMembershipOrder) {
      try {
        const shippingAddressData = resultOrder.shippingAddress as any;

        // Check if this is a guest order and get actual buyer info
        const isGuestOrder = resultOrder.buyer.email === 'guest@tarodan.system' || shippingAddressData?.isGuestOrder;
        const actualBuyerEmail = isGuestOrder
          ? (shippingAddressData?.guestEmail || shippingAddressData?.email || resultOrder.buyer.email)
          : resultOrder.buyer.email;
        const actualBuyerName = isGuestOrder
          ? (shippingAddressData?.guestName || shippingAddressData?.fullName || 'Misafir Müşteri')
          : (resultOrder.buyer.displayName || resultOrder.buyer.email);

        this.logger.log(`Emitting order.paid event - buyerEmail: ${actualBuyerEmail}, isGuest: ${isGuestOrder}`);

        await this.eventService.emitOrderPaid({
          orderId: resultOrder.id,
          orderNumber: resultOrder.orderNumber,
          buyerId: resultOrder.buyerId,
          sellerId: resultOrder.sellerId,
          productId: resultOrder.productId,
          productTitle: resultOrder.product.title,
          totalAmount: Number(resultOrder.totalAmount),
          commissionAmount: Number(resultOrder.commissionAmount),
          buyerEmail: actualBuyerEmail,
          buyerName: actualBuyerName,
          sellerEmail: resultOrder.seller.email,
          sellerName: resultOrder.seller.displayName || resultOrder.seller.email,
          paymentMethod: payment.provider,
          transactionId: transactionId || payment.providerPaymentId || payment.id,
          shippingAddress: {
            fullName: shippingAddressData?.fullName || '',
            phone: shippingAddressData?.phone || '',
            address: shippingAddressData?.address || '',
            city: shippingAddressData?.city || '',
            district: shippingAddressData?.district || '',
            zipCode: shippingAddressData?.zipCode || '',
          },
          isGuestOrder,
          buyerSystemEmail: resultOrder.buyer.email || '',
        });

        this.logger.log(`order.paid event emitted for order ${resultOrder.orderNumber}`);
      } catch (error) {
        // Log but don't fail - payment was already successful
        this.logger.error(`Failed to emit order.paid event: ${error}`);
      }
    }

    // Generate and send invoice to buyer (only for regular product orders, not membership)
    if (!isMembershipOrder) {
      try {
        await this.invoiceService.generateAndSendInvoice(resultOrder.id);
        this.logger.log(`Invoice generated and sent for order ${resultOrder.orderNumber}`);
      } catch (error) {
        // Log but don't fail - payment was already successful
        this.logger.error(`Failed to generate invoice for order ${resultOrder.orderNumber}: ${error}`);
      }
    }
  }

  /**
   * Ödeme başarısız/iptal olduğunda rezervasyonu kaldır (adet bazlı), siparişi iptal et.
   */
  private async releaseProductForFailedPayment(orderId: string): Promise<void> {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: { status: true, productId: true },
      });
      if (!order || order.status !== OrderStatus.pending_payment || !order.productId) return;

      const product = await this.prisma.product.findUnique({
        where: { id: order.productId },
        select: { reservedQuantity: true, status: true },
      });
      const updateData: { reservedQuantity?: number; status?: ProductStatus } = {};
      if (product) {
        const newReserved = Math.max(0, (product.reservedQuantity ?? 0) - 1);
        updateData.reservedQuantity = newReserved;
        if (product.status === ProductStatus.reserved) {
          updateData.status = ProductStatus.active;
        }
      }

      await this.prisma.$transaction([
        this.prisma.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.cancelled },
        }),
        ...(product && Object.keys(updateData).length > 0
          ? [
              this.prisma.product.update({
                where: { id: order.productId },
                data: updateData,
              }),
            ]
          : []),
      ]);
      this.logger.log(`Order ${orderId} cancelled and product ${order.productId} released (reservation decremented) after payment failure`);
      await this.cache.del(`products:detail:${order.productId}`);
    } catch (error: any) {
      this.logger.error(`Failed to release product for order ${orderId}: ${error?.message}`);
    }
  }

  /**
   * Process failed payment
   */
  private async processFailedPayment(payment: any, reason: string) {
    const oldStatus = payment.status;

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.failed,
        failureReason: reason,
      },
    });

    // Trade cash payments don't have order/product to release
    if (payment.tradeCashPaymentId && !payment.orderId) {
      this.logger.warn(`Trade cash payment ${payment.id} failed: ${reason}`);
      return;
    }

    // Siparişi iptal et ve ürünü tekrar satışa aç (ilanlar listesinde görünsün)
    if (payment.orderId) {
      await this.releaseProductForFailedPayment(payment.orderId);
    }

    // Log payment failure
    await this.logPaymentAction('failed', payment.id, payment.orderId, undefined, oldStatus, PaymentStatus.failed, {
      reason,
    });

    this.logger.warn(`Payment ${payment.id} failed: ${reason}`);

    // Emit payment.failed event
    try {
      if (payment.orderId) {
        const order = await this.prisma.order.findUnique({
          where: { id: payment.orderId },
          include: {
            buyer: { select: { id: true, email: true, displayName: true } },
          },
        });

        if (order) {
          await this.eventService.emitPaymentFailed({
            paymentId: payment.id,
            orderId: payment.orderId,
            orderNumber: order.orderNumber,
            buyerId: order.buyerId,
            buyerEmail: order.buyer.email,
            buyerName: order.buyer.displayName || order.buyer.email,
            amount: Number(payment.amount),
            provider: payment.provider,
            failureReason: reason,
          });

          this.logger.log(`payment.failed event emitted for payment ${payment.id}`);
        }
      }
    } catch (error) {
      // Log but don't fail - payment was already marked as failed
      this.logger.error(`Failed to emit payment.failed event: ${error}`);
    }
  }

  /**
   * Handle successful trade cash payment separately from order payments.
   * Updates TradeCashPayment status to completed; does NOT touch orders/products.
   */
  private async processSuccessfulTradeCashPayment(payment: any, transactionId?: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.completed,
          providerPaymentId: transactionId || payment.providerPaymentId,
          paidAt: new Date(),
        },
      });

      await tx.tradeCashPayment.update({
        where: { id: payment.tradeCashPaymentId },
        data: {
          status: PaymentStatus.completed,
          providerPaymentId: transactionId || payment.providerPaymentId,
          paidAt: new Date(),
        },
      });
    });

    this.logger.log(`Trade cash payment ${payment.id} completed (tradeCashPaymentId=${payment.tradeCashPaymentId})`);
  }

  /**
   * Retry a failed payment
   * Creates a new payment for the same order
   */
  async retryPayment(paymentId: string, userId: string, req?: Request) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        order: {
          include: {
            buyer: true,
            seller: true,
            product: true,
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Ödeme bulunamadı');
    }

    // Verify user owns the order
    if (payment.order.buyerId !== userId && payment.order.sellerId !== userId) {
      throw new ForbiddenException('Bu ödemeyi tekrar deneme yetkiniz yok');
    }

    // Only allow retrying failed payments
    if (payment.status !== PaymentStatus.failed) {
      throw new BadRequestException('Sadece başarısız ödemeler tekrar denenebilir');
    }

    const order = payment.order;
    const wasCancelled = order.status === OrderStatus.cancelled;

    // Sipariş iptal edilmişse (ödeme başarısız sonrası): ürün hâlâ aktifse siparişi yeniden açıp rezerve et
    if (wasCancelled && order.productId) {
      const product = await this.prisma.product.findUnique({
        where: { id: order.productId },
      });
      if (!product || product.status !== ProductStatus.active) {
        throw new BadRequestException(
          'Ürün artık satışta değil veya başka alıcıya satıldı. Lütfen ilanlar sayfasından tekrar sipariş oluşturun.',
        );
      }
      await this.prisma.$transaction([
        this.prisma.order.update({
          where: { id: order.id },
          data: { status: OrderStatus.pending_payment },
        }),
        this.prisma.product.update({
          where: { id: order.productId },
          data: { status: ProductStatus.reserved },
        }),
      ]);
      // Reload order with relations for payment init
      (payment as any).order = await this.prisma.order.findUnique({
        where: { id: order.id },
        include: {
          buyer: true,
          seller: true,
          product: true,
        },
      });
    } else if (order.status !== OrderStatus.pending_payment) {
      throw new BadRequestException('Sipariş durumu ödeme tekrarına uygun değil');
    }

    // Create new payment record
    const newPayment = await this.prisma.payment.create({
      data: {
        orderId: payment.orderId,
        amount: payment.amount,
        currency: payment.currency,
        provider: payment.provider,
        status: PaymentStatus.pending,
        metadata: {
          retriedFrom: paymentId,
          retriedAt: new Date().toISOString(),
          auditHistory: [{
            action: 'payment.retried',
            timestamp: new Date().toISOString(),
            originalPaymentId: paymentId,
            userId,
          }],
        },
      },
    });

    // Log retry action on original payment
    await this.logPaymentAction('retried', paymentId, payment.orderId, undefined, PaymentStatus.failed, undefined, {
      newPaymentId: newPayment.id,
      userId,
    });

    const paymentBypass = this.configService.get('PAYMENT_BYPASS') === 'true' || this.configService.get('PAYMENT_BYPASS') === '1';
    if (paymentBypass) {
      this.logger.log(`Payment ${paymentId} retried (bypass), new payment ${newPayment.id}`);
      return {
        success: true,
        paymentId: payment.id,
        newPaymentId: newPayment.id,
        orderId: payment.orderId,
        paymentUrl: undefined,
        paymentHtml: undefined,
        provider: payment.provider,
        expiresIn: 300,
        useBypass: true,
      };
    }

    // Generate payment URL based on provider
    let paymentUrl: string;
    let paymentHtml: string | undefined;
    const clientIp = this.getClientIp(req);

    if (payment.provider === PaymentProvider.iyzico) {
      const result = await this.initializeIyzicoPayment(newPayment, payment.order, clientIp);
      paymentUrl = result.paymentUrl;
      paymentHtml = result.paymentHtml;
    } else {
      const result = await this.initializePayTRPayment(newPayment, payment.order, clientIp);
      paymentUrl = result.paymentUrl;
      paymentHtml = result.paymentHtml;
    }

    this.logger.log(`Payment ${paymentId} retried, new payment ${newPayment.id} created`);

    return {
      success: true,
      paymentId: payment.id,
      newPaymentId: newPayment.id,
      paymentUrl,
      paymentHtml,
      provider: payment.provider,
      expiresIn: 300,
    };
  }

  /**
   * Cancel a pending payment
   * Only allows canceling pending payments
   */
  async cancelPayment(paymentId: string, userId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        order: {
          include: {
            buyer: { select: { id: true, email: true, displayName: true } },
            seller: { select: { id: true, email: true, displayName: true } },
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Ödeme bulunamadı');
    }

    // Verify user owns the order
    if (payment.order.buyerId !== userId && payment.order.sellerId !== userId) {
      throw new ForbiddenException('Bu ödemeyi iptal etme yetkiniz yok');
    }

    // Only allow canceling pending payments
    if (payment.status !== PaymentStatus.pending) {
      throw new BadRequestException('Sadece bekleyen ödemeler iptal edilebilir');
    }

    const oldStatus = payment.status;

    // Update payment status to failed
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: PaymentStatus.failed,
        failureReason: 'Kullanıcı tarafından iptal edildi',
      },
    });

    // Siparişi iptal et ve ürünü tekrar satışa aç
    await this.releaseProductForFailedPayment(payment.orderId);

    this.logger.log(`Payment ${paymentId} cancelled by user ${userId}`);

    // Log payment cancellation
    await this.logPaymentAction('cancelled', paymentId, payment.orderId, undefined, oldStatus, PaymentStatus.failed, {
      reason: 'Kullanıcı tarafından iptal edildi',
      userId,
    });

    // Emit payment.failed event
    try {
      await this.eventService.emitPaymentFailed({
        paymentId: payment.id,
        orderId: payment.orderId,
        orderNumber: payment.order.orderNumber,
        buyerId: payment.order.buyerId,
        buyerEmail: payment.order.buyer.email,
        buyerName: payment.order.buyer.displayName || payment.order.buyer.email,
        amount: Number(payment.amount),
        provider: payment.provider,
        failureReason: 'Kullanıcı tarafından iptal edildi',
      });

      this.logger.log(`payment.failed event emitted for payment ${payment.id}`);
    } catch (error) {
      // Log but don't fail - payment was already cancelled
      this.logger.error(`Failed to emit payment.failed event: ${error}`);
    }

    return {
      success: true,
      paymentId: payment.id,
      message: 'Ödeme başarıyla iptal edildi',
    };
  }

  /**
   * Kullanıcı ödeme fail sayfasına geldiğinde çağrılır. PayTR callback bazen ulaşmayabiliyor;
   * bu endpoint ile ürün rezervasyonu hemen serbest bırakılır (ilan tekrar listelerde görünür).
   * Sadece status=pending ise işlem yapılır; idempotent.
   */
  async confirmFailedFromClient(paymentId: string): Promise<{ released: boolean }> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: { select: { id: true } } },
    });
    if (!payment || payment.status !== PaymentStatus.pending) {
      return { released: false };
    }
    await this.processFailedPayment(payment, 'Fail sayfasından onay - rezervasyon serbest bırakıldı');
    return { released: true };
  }

  /**
   * Process refund
   * Requirement: Refund handling (project.md)
   */
  async processRefund(orderId: string, refundAmount?: number) {
    const payment = await this.prisma.payment.findFirst({
      where: {
        orderId,
        status: PaymentStatus.completed,
      },
      include: {
        order: true,
      },
    });

    if (!payment) {
      throw new NotFoundException('Tamamlanmış ödeme bulunamadı');
    }

    const amountToRefund = refundAmount || Number(payment.amount);

    try {
      // Call provider refund API
      let refundResult: any;

      if (payment.provider === 'iyzico') {
        // Iyzico refund requires paymentTransactionId
        // For full refund, we need the transaction ID from the payment
        if (!payment.providerPaymentId) {
          throw new BadRequestException('Iyzico ödeme transaction ID bulunamadı');
        }

        refundResult = await this.iyzicoService.createPartialRefund(
          payment.providerPaymentId,
          amountToRefund,
          '127.0.0.1', // IP not critical for refund, but can be added if needed
        );

        if (refundResult.status === 'failure') {
          throw new BadRequestException(
            refundResult.errorMessage || 'Iyzico iade işlemi başarısız',
          );
        }
      } else if (payment.provider === 'paytr') {
        // PayTR refund uses merchant_oid (order ID)
        refundResult = await this.paytrService.createRefund(
          orderId,
          amountToRefund,
        );

        if (refundResult.status !== 'success') {
          throw new BadRequestException(
            refundResult.err_msg || 'PayTR iade işlemi başarısız',
          );
        }
      } else {
        throw new BadRequestException(`Bilinmeyen ödeme sağlayıcı: ${payment.provider}`);
      }

      // Update payment status after successful refund
      return this.prisma.$transaction(async (tx) => {
        const oldStatus = payment.status;
        const existingMetadata = (payment.metadata as any) || {};
        const auditHistory = existingMetadata.auditHistory || [];

        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.refunded,
            metadata: {
              ...existingMetadata,
              refundAmount: amountToRefund,
              refundedAt: new Date().toISOString(),
              refundResult,
              auditHistory: auditHistory.concat({
                action: 'payment.refunded',
                timestamp: new Date().toISOString(),
                oldStatus,
                newStatus: PaymentStatus.refunded,
                refundAmount: amountToRefund,
              }),
            },
          },
        });

        // Cancel payment hold
        await tx.paymentHold.updateMany({
          where: {
            orderId,
            status: PaymentHoldStatus.held,
          },
          data: { status: PaymentHoldStatus.cancelled },
        });

        // Update order status if full refund
        if (amountToRefund >= Number(payment.amount)) {
          await tx.order.update({
            where: { id: orderId },
            data: { status: OrderStatus.cancelled },
          });
        }

        this.logger.log(`Refund processed for payment ${payment.id}: ${amountToRefund} TRY`);

        const refundResponse = {
          success: true,
          paymentId: payment.id,
          refundAmount: amountToRefund,
          providerRefundId: refundResult.paymentId || refundResult.merchant_oid,
        };

        // Emit payment.refunded event
        try {
          const order = await tx.order.findUnique({
            where: { id: orderId },
            include: {
              buyer: { select: { id: true, email: true, displayName: true } },
              seller: { select: { id: true, email: true, displayName: true } },
            },
          });

          if (order) {
            await this.eventService.emitPaymentRefunded({
              paymentId: payment.id,
              orderId: orderId,
              orderNumber: order.orderNumber,
              buyerId: order.buyerId,
              buyerEmail: order.buyer.email,
              buyerName: order.buyer.displayName || order.buyer.email,
              sellerId: order.sellerId,
              sellerEmail: order.seller.email,
              sellerName: order.seller.displayName || order.seller.email,
              refundAmount: amountToRefund,
              totalAmount: Number(payment.amount),
              provider: payment.provider,
              providerRefundId: refundResponse.providerRefundId,
            });

            this.logger.log(`payment.refunded event emitted for payment ${payment.id}`);
          }
        } catch (error) {
          // Log but don't fail - refund was already processed
          this.logger.error(`Failed to emit payment.refunded event: ${error}`);
        }

        return refundResponse;
      });
    } catch (error: any) {
      this.logger.error(`Refund error for payment ${payment.id}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Release held payment to seller
   * Called when order is completed
   */
  async releasePayment(orderId: string) {
    const hold = await this.prisma.paymentHold.findFirst({
      where: {
        orderId,
        status: PaymentHoldStatus.held,
      },
    });

    if (!hold) {
      throw new NotFoundException('Bekleyen ödeme bulunamadı');
    }

    await this.prisma.paymentHold.update({
      where: { id: hold.id },
      data: {
        status: PaymentHoldStatus.released,
        releasedAt: new Date(),
      },
    });

    // In production: transfer funds to seller
    this.logger.log(`Payment hold ${hold.id} released to seller ${hold.sellerId}`);

    return { success: true, holdId: hold.id, amount: Number(hold.amount) };
  }

  /**
   * Release all payment holds whose releaseAt date has passed (for cron).
   * Returns the number of holds released.
   */
  async releaseHoldsDue(): Promise<{ count: number }> {
    const now = new Date();
    const result = await this.prisma.paymentHold.updateMany({
      where: {
        status: PaymentHoldStatus.held,
        releaseAt: { lte: now },
      },
      data: {
        status: PaymentHoldStatus.released,
        releasedAt: now,
      },
    });
    if (result.count > 0) {
      this.logger.log(`Released ${result.count} payment hold(s) (releaseAt <= ${now.toISOString()})`);
    }
    return { count: result.count };
  }

  /**
   * Try to release payment hold for an order (e.g. on delivery). Idempotent: no-op if already released or not found.
   */
  async releasePaymentIfHeld(orderId: string): Promise<boolean> {
    const hold = await this.prisma.paymentHold.findFirst({
      where: { orderId, status: PaymentHoldStatus.held },
    });
    if (!hold) return false;
    await this.prisma.paymentHold.update({
      where: { id: hold.id },
      data: { status: PaymentHoldStatus.released, releasedAt: new Date() },
    });
    this.logger.log(`Payment hold ${hold.id} released for order ${orderId}`);
    return true;
  }

  /**
   * Unified get payment status (works for both auth and guest)
   */
  async getPaymentStatusUnified(paymentId: string, userId: string | null) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        order: {
          select: {
            buyerId: true,
            sellerId: true,
            productId: true,
            shippingAddress: true,
            totalAmount: true,
            shippingCost: true,
            buyerFeeAmount: true,
            sellerFeeAmount: true,
            commissionAmount: true,
          },
        },
        tradeCashPayment: {
          select: {
            payerId: true,
            recipientId: true,
            tradeId: true,
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Ödeme bulunamadı');
    }

    const useBypass =
      (this.configService.get('PAYMENT_BYPASS') === 'true' || this.configService.get('PAYMENT_BYPASS') === '1') &&
      payment.status === PaymentStatus.pending;

    // Trade cash payment (no order)
    if (!payment.order && payment.tradeCashPayment) {
      if (userId && payment.tradeCashPayment.payerId !== userId && payment.tradeCashPayment.recipientId !== userId) {
        throw new ForbiddenException('Bu ödeme durumunu görüntüleme yetkiniz yok');
      }
      return {
        id: payment.id,
        orderId: null,
        tradeId: payment.tradeCashPayment.tradeId,
        status: payment.status,
        amount: Number(payment.amount),
        currency: payment.currency,
        provider: payment.provider,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
        ...(useBypass && { useBypass: true }),
      };
    }

    if (!payment.order) {
      throw new NotFoundException('Ödeme ile ilişkili sipariş veya takas bulunamadı');
    }

    // Check if this is a guest order
    const shippingAddress = payment.order.shippingAddress as any;
    const isGuestOrder = shippingAddress?.isGuestOrder === true;

    // Validate access
    if (userId) {
      if (payment.order.buyerId !== userId && payment.order.sellerId !== userId) {
        throw new ForbiddenException('Bu ödeme durumunu görüntüleme yetkiniz yok');
      }
    } else {
      if (!isGuestOrder) {
        throw new ForbiddenException('Bu ödeme için giriş yapmanız gerekiyor');
      }
    }

    const totalAmount = Number(payment.order.totalAmount ?? 0);
    const shippingCost = Number(payment.order.shippingCost ?? 0);
    const buyerFeeAmount = Number(payment.order.buyerFeeAmount ?? 0);
    const sellerFeeAmount = Number(payment.order.sellerFeeAmount ?? 0);
    const commissionAmount = Number(payment.order.commissionAmount ?? 0);
    const subtotal = totalAmount - shippingCost - buyerFeeAmount;
    const sellerNetAmount = Math.max(0, subtotal - sellerFeeAmount);

    const pricing = {
      subtotal,
      shippingAmount: shippingCost,
      buyerFeeAmount,
      sellerFeeAmount,
      commissionAmount,
      totalAmount,
      sellerNetAmount,
    };

    const isMembershipOrder = payment.order.productId?.startsWith?.('membership-') ?? false;

    return {
      id: payment.id,
      orderId: payment.orderId,
      status: payment.status,
      amount: Number(payment.amount),
      currency: payment.currency,
      provider: payment.provider,
      pricing,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      ...(useBypass && { useBypass: true }),
      ...(isMembershipOrder && { isMembershipOrder: true }),
    };
  }

  /**
   * Test bypass: belirtilen kart numarası başarılı, diğerleri başarısız (PAYMENT_BYPASS=true iken)
   */
  async bypassComplete(paymentId: string, cardNumber: string): Promise<{ success: boolean }> {
    if (this.configService.get('PAYMENT_BYPASS') !== 'true' && this.configService.get('PAYMENT_BYPASS') !== '1') {
      throw new BadRequestException('Bypass modu kapalı');
    }

    const normalized = cardNumber.replace(/\D/g, '');
    const successCard = (this.configService.get('PAYMENT_BYPASS_SUCCESS_CARD') || '0000000000000000').replace(/\D/g, '');

    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        order: {
          include: {
            buyer: true,
            seller: true,
            product: true,
          },
        },
        tradeCashPayment: true,
      },
    });

    if (!payment) throw new NotFoundException('Ödeme bulunamadı');
    if (payment.status !== PaymentStatus.pending) {
      return { success: payment.status === PaymentStatus.completed };
    }

    if (normalized === successCard) {
      const transactionRef = payment.order?.orderNumber || payment.orderId || payment.tradeCashPaymentId || payment.id;
      await this.processSuccessfulPayment(payment, transactionRef);
      return { success: true };
    }

    await this.processFailedPayment(payment, 'Test kartı geçersiz (bypass: sadece belirlenen kart başarılı)');
    return { success: false };
  }

  /**
   * Get payment status (legacy - for backward compatibility)
   */
  async getPaymentStatus(paymentId: string, userId: string) {
    return this.getPaymentStatusUnified(paymentId, userId);
  }

  /**
   * Get payment status for guest orders (legacy - for backward compatibility)
   */
  async getGuestPaymentStatus(paymentId: string) {
    return this.getPaymentStatusUnified(paymentId, null);
  }

  /**
   * Get payment by ID
   */
  async findOne(paymentId: string, userId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        order: {
          include: {
            buyer: { select: { id: true, displayName: true } },
            seller: { select: { id: true, displayName: true } },
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Ödeme bulunamadı');
    }

    // Only buyer or seller can view
    if (payment.order.buyerId !== userId && payment.order.sellerId !== userId) {
      throw new ForbiddenException('Bu ödemeyi görüntüleme yetkiniz yok');
    }

    const totalAmount = Number(payment.order.totalAmount ?? 0);
    const shippingCost = Number(payment.order.shippingCost ?? 0);
    const buyerFeeAmount = Number(payment.order.buyerFeeAmount ?? 0);
    const sellerFeeAmount = Number(payment.order.sellerFeeAmount ?? 0);
    const commissionAmount = Number(payment.order.commissionAmount ?? 0);
    const subtotal = totalAmount - shippingCost - buyerFeeAmount;
    const sellerNetAmount = Math.max(0, subtotal - sellerFeeAmount);

    const pricing = {
      subtotal,
      shippingAmount: shippingCost,
      buyerFeeAmount,
      sellerFeeAmount,
      commissionAmount,
      totalAmount,
      sellerNetAmount,
    };

    return {
      id: payment.id,
      orderId: payment.orderId,
      amount: Number(payment.amount),
      currency: payment.currency,
      provider: payment.provider,
      status: payment.status,
      providerTransactionId: payment.providerPaymentId || payment.providerConversationId,
      pricing,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    };
  }

  /**
   * Get payment holds for seller
   */
  async getSellerHolds(sellerId: string) {
    const holds = await this.prisma.paymentHold.findMany({
      where: { sellerId },
      orderBy: { createdAt: 'desc' },
      include: {
        payment: {
          include: {
            order: {
              include: {
                product: { select: { id: true, title: true } },
              },
            },
          },
        },
      },
    });

    return holds.map((h) => ({
      id: h.id,
      orderId: h.orderId,
      sellerId: h.sellerId,
      amount: Number(h.amount),
      status: h.status,
      releaseAt: h.releaseAt ?? undefined,
      releasedAt: h.releasedAt ?? undefined,
      product: h.payment.order.product,
      createdAt: h.createdAt,
    }));
  }

  // ==========================================================================
  // PAYMENT METHODS (Saved Cards)
  // ==========================================================================

  /**
   * Get user's saved payment methods
   */
  async getPaymentMethods(userId: string) {
    const methods = await this.prisma.paymentMethod.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    return {
      methods: methods.map(m => ({
        id: m.id,
        cardBrand: m.cardBrand,
        lastFour: m.lastFour,
        expiryMonth: m.expiryMonth,
        expiryYear: m.expiryYear,
        isDefault: m.isDefault,
        createdAt: m.createdAt,
      })),
    };
  }

  /**
   * Add new payment method
   * In real implementation, this would tokenize the card via payment provider
   */
  async addPaymentMethod(
    userId: string,
    dto: { cardNumber: string; cardHolder: string; expiryMonth: number; expiryYear: number; cvv: string },
  ) {
    // Extract card brand from card number (simple detection)
    const cardNumber = dto.cardNumber.replace(/\s/g, '');
    let cardBrand = 'Kart';

    if (cardNumber.startsWith('4')) {
      cardBrand = 'Visa';
    } else if (cardNumber.startsWith('5') || cardNumber.startsWith('2')) {
      cardBrand = 'Mastercard';
    } else if (cardNumber.startsWith('3')) {
      cardBrand = 'Amex';
    } else if (cardNumber.startsWith('9')) {
      cardBrand = 'Troy';
    }

    const lastFour = cardNumber.slice(-4);

    // Check for duplicate card
    const existing = await this.prisma.paymentMethod.findFirst({
      where: {
        userId,
        lastFour,
        expiryMonth: dto.expiryMonth,
        expiryYear: dto.expiryYear,
      },
    });

    if (existing) {
      throw new BadRequestException('Bu kart zaten kayıtlı');
    }

    // Check if this is the first card (make it default)
    const existingCount = await this.prisma.paymentMethod.count({
      where: { userId },
    });

    // In real implementation: tokenize card with Iyzico/PayTR
    // const tokenId = await this.iyzicoService.tokenizeCard(dto);

    const paymentMethod = await this.prisma.paymentMethod.create({
      data: {
        userId,
        cardBrand,
        lastFour,
        expiryMonth: dto.expiryMonth,
        expiryYear: dto.expiryYear,
        isDefault: existingCount === 0,
        tokenId: null, // Would be set from payment provider
      },
    });

    return {
      id: paymentMethod.id,
      cardBrand: paymentMethod.cardBrand,
      lastFour: paymentMethod.lastFour,
      expiryMonth: paymentMethod.expiryMonth,
      expiryYear: paymentMethod.expiryYear,
      isDefault: paymentMethod.isDefault,
      createdAt: paymentMethod.createdAt,
    };
  }

  /**
   * Delete a payment method
   */
  async deletePaymentMethod(userId: string, id: string) {
    const method = await this.prisma.paymentMethod.findFirst({
      where: { id, userId },
    });

    if (!method) {
      throw new NotFoundException('Ödeme yöntemi bulunamadı');
    }

    await this.prisma.paymentMethod.delete({
      where: { id },
    });

    // If deleted card was default, set another as default
    if (method.isDefault) {
      const nextDefault = await this.prisma.paymentMethod.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });

      if (nextDefault) {
        await this.prisma.paymentMethod.update({
          where: { id: nextDefault.id },
          data: { isDefault: true },
        });
      }
    }

    return { success: true };
  }

  /**
   * Set a payment method as default
   */
  async setDefaultPaymentMethod(userId: string, id: string) {
    const method = await this.prisma.paymentMethod.findFirst({
      where: { id, userId },
    });

    if (!method) {
      throw new NotFoundException('Ödeme yöntemi bulunamadı');
    }

    // Remove default from all other cards
    await this.prisma.paymentMethod.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false },
    });

    // Set this card as default
    await this.prisma.paymentMethod.update({
      where: { id },
      data: { isDefault: true },
    });

    return { success: true };
  }

  /**
   * Get user's payment history
   */
  async getUserPayments(
    userId: string,
    options?: {
      status?: PaymentStatus;
      provider?: string;
      startDate?: Date;
      endDate?: Date;
      page?: number;
      limit?: number;
    },
  ) {
    const page = options?.page || 1;
    const limit = options?.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {
      OR: [
        { order: { buyerId: userId } },
        { order: { sellerId: userId } },
      ],
    };

    if (options?.status) {
      where.status = options.status;
    }

    if (options?.provider) {
      where.provider = options.provider;
    }

    if (options?.startDate || options?.endDate) {
      where.createdAt = {};
      if (options.startDate) {
        where.createdAt.gte = options.startDate;
      }
      if (options.endDate) {
        where.createdAt.lte = options.endDate;
      }
    }

    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          order: {
            include: {
              product: { select: { id: true, title: true, images: true } },
              buyer: { select: { id: true, displayName: true } },
              seller: { select: { id: true, displayName: true } },
            },
          },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      payments: payments.map((p) => ({
        id: p.id,
        orderId: p.orderId,
        orderNumber: p.order.orderNumber,
        amount: Number(p.amount),
        currency: p.currency,
        provider: p.provider,
        status: p.status,
        failureReason: p.failureReason,
        providerTransactionId: p.providerPaymentId || p.providerConversationId,
        product: p.order.product,
        buyer: p.order.buyer,
        seller: p.order.seller,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        paidAt: p.paidAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Sipariş bazlı zaman aşımı: pending_payment siparişler X dakika (varsayılan 10) içinde ödenmezse
   * ürünü tekrar active yapar, siparişi iptal eder. "Öde"ye hiç basılmadan çıkılan siparişler için.
   */
  async releaseExpiredOrderReservations(): Promise<{ count: number }> {
    const timeoutMinutes = parseInt(
      this.configService.get('PAYMENT_TIMEOUT_MINUTES') || '10',
      10,
    );
    const cutoff = new Date();
    cutoff.setMinutes(cutoff.getMinutes() - timeoutMinutes);

    const expiredOrders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.pending_payment,
        createdAt: { lt: cutoff },
        offerId: null, // Tekliften gelen siparişleri otomatik iptal etme; sadece sepetteki ödeme bekleyen siparişler
      },
      select: { id: true, productId: true, orderNumber: true },
    });

    let released = 0;
    for (const order of expiredOrders) {
      if (!order.productId) continue; // productId yoksa atla (Prisma'da not: null hataya yol açıyor)
      try {
        const product = await this.prisma.product.findUnique({
          where: { id: order.productId },
          select: { reservedQuantity: true, status: true },
        });
        const updateData: { reservedQuantity?: number; status?: ProductStatus } = {};
        if (product) {
          const newReserved = Math.max(0, (product.reservedQuantity ?? 0) - 1);
          updateData.reservedQuantity = newReserved;
          if (product.status === ProductStatus.reserved) {
            updateData.status = ProductStatus.active;
          }
        }
        await this.prisma.$transaction([
          this.prisma.order.update({
            where: { id: order.id },
            data: { status: OrderStatus.cancelled },
          }),
          ...(product && Object.keys(updateData).length > 0
            ? [
                this.prisma.product.update({
                  where: { id: order.productId },
                  data: updateData,
                }),
              ]
            : []),
        ]);
        const pendingPayment = await this.prisma.payment.findFirst({
          where: { orderId: order.id, status: PaymentStatus.pending },
          select: { id: true },
        });
        if (pendingPayment) {
          await this.prisma.payment.update({
            where: { id: pendingPayment.id },
            data: {
              status: PaymentStatus.failed,
              failureReason: `Ödeme ${timeoutMinutes} dakika içinde tamamlanmadığı için otomatik iptal`,
            },
          });
        }
        await this.cache.del(`products:detail:${order.productId}`);
        released++;
        this.logger.log(`Released reservation for order ${order.orderNumber} (product ${order.productId})`);
      } catch (error: any) {
        this.logger.error(`Failed to release expired order ${order.id}: ${error?.message}`);
      }
    }
    return { count: released };
  }

  /**
   * Cancel expired pending payments
   * Called by scheduler to automatically cancel payments older than timeout period
   */
  async cancelExpiredPayments() {
    const timeoutMinutes = parseInt(
      this.configService.get('PAYMENT_TIMEOUT_MINUTES') || '10',
      10,
    );
    const timeoutDate = new Date();
    timeoutDate.setMinutes(timeoutDate.getMinutes() - timeoutMinutes);

    // Find pending payments older than timeout
    const expiredPayments = await this.prisma.payment.findMany({
      where: {
        status: PaymentStatus.pending,
        createdAt: {
          lt: timeoutDate,
        },
      },
      include: {
        order: {
          include: {
            buyer: { select: { id: true, email: true, displayName: true } },
          },
        },
      },
    });

    let cancelledCount = 0;

    for (const payment of expiredPayments) {
      try {
        // Update payment status to failed
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.failed,
            failureReason: `Ödeme ${timeoutMinutes} dakika içinde tamamlanmadığı için otomatik olarak iptal edildi`,
          },
        });

        // Siparişi iptal et ve ürünü tekrar satışa aç
        await this.releaseProductForFailedPayment(payment.orderId);

        // Emit payment.failed event
        try {
          await this.eventService.emitPaymentFailed({
            paymentId: payment.id,
            orderId: payment.orderId,
            orderNumber: payment.order.orderNumber,
            buyerId: payment.order.buyerId,
            buyerEmail: payment.order.buyer.email,
            buyerName: payment.order.buyer.displayName || payment.order.buyer.email,
            amount: Number(payment.amount),
            provider: payment.provider,
            failureReason: `Ödeme ${timeoutMinutes} dakika içinde tamamlanmadığı için otomatik olarak iptal edildi`,
          });
        } catch (error) {
          // Log but don't fail
          this.logger.error(`Failed to emit payment.failed event for payment ${payment.id}: ${error}`);
        }

        cancelledCount++;
        this.logger.log(`Cancelled expired payment ${payment.id} for order ${payment.order.orderNumber}`);
      } catch (error: any) {
        this.logger.error(`Failed to cancel expired payment ${payment.id}: ${error.message}`);
      }
    }

    return { count: cancelledCount };
  }
}
