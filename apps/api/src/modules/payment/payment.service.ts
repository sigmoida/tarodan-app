import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma';
import { CacheService } from '../cache/cache.service';
import { InitiatePaymentDto, PaymentProvider, PayTRCallbackDto } from './dto';
import { PaymentStatus, PaymentHoldStatus, OrderStatus, ProductStatus, SubscriptionStatus, TradeStatus, OfferStatus } from '@prisma/client';
import { getProductStatusFromQuantity } from '../product/helpers/product-status.helper';
import { safeDecrementReserved } from '../product/helpers/product-availability.helper';
import { PayTRService } from '../payment-providers/paytr.service';
import { EventService } from '../events';
import { InvoiceService } from '../invoice/invoice.service';
import { Request } from 'express';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly holdDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly configService: ConfigService,
    private readonly paytrService: PayTRService,
    private readonly eventService: EventService,
    private readonly invoiceService: InvoiceService,
  ) {
    this.holdDays = parseInt(this.configService.get('PAYMENT_HOLD_DAYS') || '7', 10);
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
      return {
        paymentId: existingPayment.id,
        paymentUrl: `${frontendUrl}/payment/${existingPayment.id}`,
        provider: existingPayment.provider,
        expiresIn: 300,
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
        provider: PaymentProvider.paytr,
        status: PaymentStatus.pending,
      },
    });

    // Log payment creation
    await this.logPaymentAction('created', payment.id, dto.orderId, undefined, undefined, PaymentStatus.pending, {
      amount: Number(order.totalAmount),
      provider: PaymentProvider.paytr,
      buyerId: order.buyerId,
    });

    // Generate payment URL based on provider
    let paymentUrl: string;
    let paymentHtml: string | undefined;
    const clientIp = this.getClientIp(req);

    const result = await this.initializePayTRPayment(payment, order, clientIp);
    return {
      paymentId: payment.id,
      paymentUrl: result.paymentUrl,
      paymentHtml: result.paymentHtml,
      provider: PaymentProvider.paytr,
      expiresIn: 300, // 5 minutes
    };
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
   * Resolve payment row for PayTR callback (merchant_oid matches providerConversationId, orderId, or token substring).
   */
  private async findPaymentForPaytrCallback(merchantOid: string) {
    let payment = await this.prisma.payment.findFirst({
      where: {
        OR: [
          { providerConversationId: merchantOid },
          { orderId: merchantOid },
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
      payment = await this.prisma.payment.findFirst({
        where: { providerPaymentId: { contains: merchantOid } },
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
    }

    return payment;
  }

  /**
   * Hash mismatch: do not trust callback body; verify via PayTR durum-sorgu when a pending PayTR payment exists.
   * Returns OK so PayTR stops retrying; logs errors for ops.
   */
  private async handlePayTRCallbackHashMismatch(dto: PayTRCallbackDto): Promise<string> {
    const payment = await this.findPaymentForPaytrCallback(dto.merchant_oid);

    if (!payment) {
      this.logger.error(
        `PayTR callback invalid hash and no payment row: merchant_oid=${dto.merchant_oid} status=${dto.status}`,
      );
      throw new NotFoundException('Payment not found');
    }

    if (payment.provider !== PaymentProvider.paytr) {
      this.logger.error(
        `PayTR hash mismatch: payment=${payment.id} provider=${payment.provider} merchant_oid=${dto.merchant_oid}`,
      );
      return 'OK';
    }

    if (payment.status !== PaymentStatus.pending) {
      this.logger.error(
        `PayTR hash mismatch: payment=${payment.id} status=${payment.status} merchant_oid=${dto.merchant_oid}`,
      );
      return 'OK';
    }

    if (payment.orderId && payment.order && payment.order.status !== OrderStatus.pending_payment) {
      this.logger.error(
        `PayTR hash mismatch: payment=${payment.id} orderStatus=${payment.order.status} merchant_oid=${dto.merchant_oid}`,
      );
      return 'OK';
    }

    const tolerance = parseFloat(
      this.configService.get('PAYTR_RECONCILE_AMOUNT_TOLERANCE_TL') || '0.05',
    );
    const oid =
      (payment.providerConversationId || dto.merchant_oid || '').trim() || dto.merchant_oid.trim();

    let inquiry = await this.paytrService.queryPaymentStatus(oid);
    if (!inquiry.ok && oid.includes('-')) {
      inquiry = await this.paytrService.queryPaymentStatus(oid.replace(/-/g, ''));
    }

    if (!inquiry.ok) {
      const fail = inquiry as { ok: false; errNo?: string; errMsg?: string };
      this.logger.error(
        `PayTR hash mismatch: durum-sorgu failed payment=${payment.id} merchant_oid=${dto.merchant_oid} oid=${oid} err=${fail.errMsg ?? fail.errNo ?? 'unknown'} ourAmount=${Number(payment.amount)}`,
      );
      return 'OK';
    }

    const ourAmount = Number(payment.amount);
    if (Math.abs(inquiry.paymentTotalTl - ourAmount) > tolerance) {
      this.logger.error(
        `PayTR hash mismatch: amount mismatch payment=${payment.id} merchant_oid=${dto.merchant_oid} paytr=${inquiry.paymentTotalTl} ours=${ourAmount}`,
      );
      return 'OK';
    }

    const txnRef =
      inquiry.paymentDate != null && inquiry.paymentDate !== ''
        ? `paytr:${oid}:${inquiry.paymentDate}`
        : `paytr:${oid}`;

    const did = await this.processSuccessfulPayment(payment, txnRef);
    if (did) {
      this.logger.log(
        `PayTR hash mismatch recovered via durum-sorgu payment=${payment.id} merchant_oid=${dto.merchant_oid} dtoStatus=${dto.status}`,
      );
    }
    return 'OK';
  }

  /**
   * Handle PayTR callback
   * POST /payments/callback/paytr
   */
  async handlePayTRCallback(dto: PayTRCallbackDto) {
    this.logger.log('PayTR callback received');

    const isValid = this.paytrService.verifyCallback({
      merchant_oid: dto.merchant_oid,
      status: dto.status as 'success' | 'failed',
      total_amount: dto.total_amount,
      hash: dto.hash,
      failed_reason_code: dto.failed_reason_code,
      failed_reason_msg: dto.failed_reason_msg,
    });

    if (!isValid) {
      return this.handlePayTRCallbackHashMismatch(dto);
    }

    const payment = await this.findPaymentForPaytrCallback(dto.merchant_oid);

    if (!payment) {
      throw new NotFoundException('Payment not found');
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
   * @returns true if this invocation completed the payment; false if already completed (idempotent / race with callback).
   */
  private async processSuccessfulPayment(payment: any, transactionId?: string): Promise<boolean> {
    // Trade cash payment: different flow from order payments
    if (payment.tradeCashPaymentId && !payment.orderId) {
      return this.processSuccessfulTradeCashPayment(payment, transactionId);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const oldStatus = payment.status;

      const auditHistory = ((payment.metadata as any)?.auditHistory || []).concat({
        action: 'payment.completed',
        timestamp: new Date().toISOString(),
        oldStatus,
        newStatus: PaymentStatus.completed,
        transactionId: transactionId || payment.providerPaymentId,
      });

      const newMetadata = {
        ...(payment.metadata as any || {}),
        auditHistory,
      };

      const claimed = await tx.payment.updateMany({
        where: {
          id: payment.id,
          status: PaymentStatus.pending,
        },
        data: {
          status: PaymentStatus.completed,
          paidAt: new Date(),
          providerPaymentId: transactionId || payment.providerPaymentId,
          metadata: newMetadata as object,
        },
      });

      if (claimed.count === 0) {
        return null;
      }

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
          reservedQuantity: safeDecrementReserved(product.reservedQuantity, 1),
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
              const prodToRestore = await tx.product.findUnique({
                where: { id: productId },
                select: { reservedQuantity: true },
              });
              const newReserved = safeDecrementReserved(prodToRestore?.reservedQuantity, qty);
              await tx.product.update({
                where: { id: productId },
                data: {
                  reservedQuantity: newReserved,
                  status: newReserved > 0 ? ProductStatus.reserved : ProductStatus.active,
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

    if (!result) {
      this.logger.log(
        `processSuccessfulPayment: payment ${payment.id} already completed — skipping duplicate success handling`,
      );
      return false;
    }

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

    return true;
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
  private async processSuccessfulTradeCashPayment(payment: any, transactionId?: string): Promise<boolean> {
    const didComplete = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.payment.updateMany({
        where: { id: payment.id, status: PaymentStatus.pending },
        data: {
          status: PaymentStatus.completed,
          providerPaymentId: transactionId || payment.providerPaymentId,
          paidAt: new Date(),
        },
      });
      if (claimed.count === 0) {
        return false;
      }

      await tx.tradeCashPayment.update({
        where: { id: payment.tradeCashPaymentId },
        data: {
          status: PaymentStatus.completed,
          providerPaymentId: transactionId || payment.providerPaymentId,
          paidAt: new Date(),
        },
      });
      return true;
    });

    if (didComplete) {
      this.logger.log(`Trade cash payment ${payment.id} completed (tradeCashPaymentId=${payment.tradeCashPaymentId})`);
    }
    return didComplete;
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

    // Generate payment URL based on provider
    let paymentUrl: string;
    let paymentHtml: string | undefined;
    const clientIp = this.getClientIp(req);

    const result = await this.initializePayTRPayment(newPayment, payment.order, clientIp);
    paymentUrl = result.paymentUrl;
    paymentHtml = result.paymentHtml;

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

      if (payment.provider === 'paytr') {
        const paytrOid =
          payment.providerConversationId?.trim() ||
          orderId.replace(/-/g, '');
        refundResult = await this.paytrService.createRefund(paytrOid, amountToRefund);

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
   * Takas nakit ödemesi PayTR ile tamamlanmışken iptal: PayTR iade API + payment / trade_cash_payment güncelleme.
   * Tamamlanmış PayTR trade ödemesi yoksa no-op (refunded: false).
   */
  async refundTradeCashPaymentIfCompleted(tradeId: string): Promise<{
    refunded: boolean;
    paymentId?: string;
    skippedReason?: string;
  }> {
    const payment = await this.prisma.payment.findFirst({
      where: {
        tradeCashPayment: { tradeId },
        status: PaymentStatus.completed,
        provider: PaymentProvider.paytr,
      },
      include: { tradeCashPayment: true },
    });

    if (!payment) {
      return { refunded: false, skippedReason: 'no_completed_paytr_payment' };
    }

    const oid =
      payment.providerConversationId?.trim() ||
      tradeId.replace(/-/g, '');
    const amount = Number(payment.amount);

    try {
      const refundResult = await this.paytrService.createRefund(oid, amount);
      if (refundResult.status !== 'success') {
        throw new BadRequestException(
          refundResult.err_msg || 'PayTR iade işlemi başarısız',
        );
      }
    } catch (e: any) {
      this.logger.error(
        `refundTradeCashPaymentIfCompleted(tradeId=${tradeId}) PayTR error: ${e?.message}`,
      );
      throw e;
    }

    const existingMeta = (payment.metadata as Record<string, unknown>) || {};
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.refunded,
          metadata: {
            ...existingMeta,
            refundAmount: amount,
            refundedAt: new Date().toISOString(),
            tradeCashRefund: true,
          },
        },
      });
      if (payment.tradeCashPaymentId) {
        await tx.tradeCashPayment.update({
          where: { id: payment.tradeCashPaymentId },
          data: { status: PaymentStatus.refunded, refundedAt: new Date() },
        });
      }
    });

    this.logger.log(`Trade cash refunded via PayTR tradeId=${tradeId} paymentId=${payment.id}`);
    return { refunded: true, paymentId: payment.id };
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

    const pendingPaytrResume =
      payment.status === PaymentStatus.pending &&
      payment.provider === PaymentProvider.paytr &&
      payment.providerPaymentId
        ? {
            paymentUrl: `https://www.paytr.com/odeme/guvenli/${payment.providerPaymentId}`,
            paymentHtml: `<iframe src="https://www.paytr.com/odeme/guvenli/${payment.providerPaymentId}" frameborder="0" style="width:100%;height:600px;border:none;"></iframe>`,
          }
        : {};

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
        ...pendingPaytrResume,
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
        // Oturum yok veya JWT decode edilemedi (ör. token checkout sırasında temizlendi): yine de
        // bekleyen/işlenen ödemede durum okunabilsin; ödeme kimliği UUID ile korunur.
        const canPollWithoutAuth =
          payment.status === PaymentStatus.pending || payment.status === PaymentStatus.processing;
        if (!canPollWithoutAuth) {
          throw new ForbiddenException('Bu ödeme için giriş yapmanız gerekiyor');
        }
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
      ...pendingPaytrResume,
      ...(isMembershipOrder && { isMembershipOrder: true }),
    };
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

    // tokenId: set when integrating PayTR stored card API

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
   * PayTR callback sunucuya ulaşmadan ödeme başarılı olduysa: durum-sorgu ile doğrula ve tamamla (1.4).
   * PAYTR_RECONCILIATION_ENABLED=false ile kapatılabilir.
   */
  async reconcilePendingPaytrPayments(): Promise<{ checked: number; completed: number }> {
    const enabled = this.configService.get('PAYTR_RECONCILIATION_ENABLED');
    if (enabled === 'false' || enabled === '0') {
      return { checked: 0, completed: 0 };
    }

    const minAgeMin = parseInt(
      this.configService.get('PAYTR_RECONCILIATION_MIN_AGE_MINUTES') || '3',
      10,
    );
    const batch = parseInt(this.configService.get('PAYTR_RECONCILIATION_BATCH_LIMIT') || '40', 10);
    const tolerance = parseFloat(this.configService.get('PAYTR_RECONCILE_AMOUNT_TOLERANCE_TL') || '0.05');

    const cutoff = new Date();
    cutoff.setMinutes(cutoff.getMinutes() - minAgeMin);

    const candidates = await this.prisma.payment.findMany({
      where: {
        provider: 'paytr',
        status: PaymentStatus.pending,
        providerConversationId: { not: null },
        order: { status: OrderStatus.pending_payment },
        createdAt: { lt: cutoff },
      },
      include: {
        order: { select: { id: true, status: true, totalAmount: true } },
      },
      take: batch,
      orderBy: { createdAt: 'asc' },
    });

    let checked = 0;
    let completed = 0;

    for (const row of candidates) {
      checked++;
      const oid = row.providerConversationId as string;
      try {
        const inquiry = await this.paytrService.queryPaymentStatus(oid);
        if (!inquiry.ok) {
          continue;
        }

        const ourAmount = Number(row.amount);
        if (Math.abs(inquiry.paymentTotalTl - ourAmount) > tolerance) {
          this.logger.warn(
            `PayTR reconcile amount mismatch payment=${row.id} oid=${oid} paytr=${inquiry.paymentTotalTl} ours=${ourAmount}`,
          );
          continue;
        }

        const full = await this.prisma.payment.findUnique({
          where: { id: row.id },
          include: {
            order: { include: { buyer: true, seller: true, product: true } },
            tradeCashPayment: true,
          },
        });

        if (
          !full ||
          full.status !== PaymentStatus.pending ||
          full.order?.status !== OrderStatus.pending_payment
        ) {
          continue;
        }

        const txnRef =
          inquiry.paymentDate != null && inquiry.paymentDate !== ''
            ? `paytr:${oid}:${inquiry.paymentDate}`
            : `paytr:${oid}`;

        const did = await this.processSuccessfulPayment(full, txnRef);
        if (did) {
          completed++;
          this.logger.log(`PayTR reconcile completed payment ${row.id} oid=${oid}`);
        }
      } catch (error: any) {
        this.logger.error(`PayTR reconcile failed payment ${row.id}: ${error?.message}`);
      }
    }

    return { checked, completed };
  }

  /**
   * Sipariş bazlı zaman aşımı: pending_payment siparişler X dakika (varsayılan 30) içinde ödenmezse
   * ürünü tekrar active yapar, siparişi iptal eder. "Öde"ye hiç basılmadan çıkılan siparişler için.
   */
  async releaseExpiredOrderReservations(): Promise<{ count: number }> {
    const timeoutMinutes = parseInt(
      this.configService.get('PAYMENT_TIMEOUT_MINUTES') || '30',
      10,
    );
    const cutoff = new Date();
    cutoff.setMinutes(cutoff.getMinutes() - timeoutMinutes);

    // Include ALL pending_payment orders (both direct-buy and offer-based)
    const expiredOrders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.pending_payment,
        createdAt: { lt: cutoff },
      },
      select: { id: true, productId: true, orderNumber: true, offerId: true },
    });

    let released = 0;
    for (const order of expiredOrders) {
      if (!order.productId) continue;
      try {
        await this.prisma.$transaction(async (tx) => {
          // FOR UPDATE: sipariş satırını kilitle — aynı anda ödeme gelmesini engeller
          await tx.$queryRaw`SELECT id FROM orders WHERE id = ${order.id} FOR UPDATE`;

          // Kilitleme sonrası statüyü tekrar kontrol et
          const freshOrder = await tx.order.findUnique({
            where: { id: order.id },
            select: { status: true },
          });
          if (!freshOrder || freshOrder.status !== OrderStatus.pending_payment) {
            // Başka bir akış (ödeme webhook'u vb.) zaten işledi, atla
            return;
          }

          // Ürün satırını da kilitle
          await tx.$queryRaw`SELECT id FROM products WHERE id = ${order.productId} FOR UPDATE`;
          const product = await tx.product.findUnique({
            where: { id: order.productId },
            select: { reservedQuantity: true, status: true },
          });

          if (product) {
            const newReserved = safeDecrementReserved(product.reservedQuantity, 1);
            await tx.product.update({
              where: { id: order.productId },
              data: {
                reservedQuantity: newReserved,
                status: newReserved > 0 ? ProductStatus.reserved : ProductStatus.active,
              },
            });
          }

          await tx.order.update({
            where: { id: order.id },
            data: { status: OrderStatus.cancelled },
          });

          // Cancel associated offer so buyer can re-offer later
          if (order.offerId) {
            await tx.offer.update({
              where: { id: order.offerId },
              data: { status: OfferStatus.cancelled },
            });
          }
        });

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
      this.configService.get('PAYMENT_TIMEOUT_MINUTES') || '30',
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
