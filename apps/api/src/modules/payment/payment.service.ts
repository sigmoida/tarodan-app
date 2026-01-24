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
import { InitiatePaymentDto, PaymentProvider, IyzicoCallbackDto, PayTRCallbackDto } from './dto';
import { PaymentStatus, PaymentHoldStatus, OrderStatus, ProductStatus } from '@prisma/client';
import { IyzicoService } from '../payment-providers/iyzico.service';
import { PayTRService } from '../payment-providers/paytr.service';
import { EventService } from '../events';
import { Request } from 'express';
import * as crypto from 'crypto';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly holdDays: number;
  private readonly iyzicoSecretKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly iyzicoService: IyzicoService,
    private readonly paytrService: PayTRService,
    private readonly eventService: EventService,
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
   * Initiate payment for an order
   * POST /payments/initiate
   * Requirement: PayTR & Iyzico integration (project.md)
   */
  async initiatePayment(buyerId: string, dto: InitiatePaymentDto, req?: Request) {
    // Verify order exists and belongs to buyer
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

    if (order.buyerId !== buyerId) {
      throw new ForbiddenException('Bu sipariş için ödeme yapamazsınız');
    }

    if (order.status !== OrderStatus.pending_payment) {
      throw new BadRequestException('Bu sipariş için ödeme beklenmiyor');
    }

    // Check for existing pending payment
    const existingPayment = await this.prisma.payment.findFirst({
      where: {
        orderId: dto.orderId,
        status: PaymentStatus.pending,
      },
    });

    if (existingPayment) {
      // Return existing payment URL if still valid
      return {
        paymentId: existingPayment.id,
        paymentUrl: `${this.configService.get('FRONTEND_URL')}/payment/${existingPayment.id}`,
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
      buyerId: buyerId,
    });

    // Generate payment URL based on provider
    let paymentUrl: string;
    let paymentHtml: string | undefined;
    const clientIp = this.getClientIp(req);

    if (dto.provider === PaymentProvider.iyzico) {
      const result = await this.initializeIyzicoPayment(payment, order, clientIp);
      paymentUrl = result.paymentUrl;
      paymentHtml = result.paymentHtml;
    } else {
      const result = await this.initializePayTRPayment(payment, order, clientIp);
      paymentUrl = result.paymentUrl;
      paymentHtml = result.paymentHtml;
    }

    return {
      paymentId: payment.id,
      paymentUrl,
      paymentHtml,
      provider: dto.provider,
      expiresIn: 300, // 5 minutes
    };
  }

  /**
   * Initialize Iyzico payment using checkout form
   */
  private async initializeIyzicoPayment(payment: any, order: any, clientIp: string) {
    try {
      const callbackUrl = `${this.configService.get('FRONTEND_URL')}/payment/callback/iyzico?paymentId=${payment.id}`;
      const shippingAddress = order.shippingAddress as any;

      // Prepare buyer information
      const buyerName = order.buyer.displayName?.split(' ') || ['Müşteri', ''];
      const buyerFirstName = buyerName[0] || 'Müşteri';
      const buyerLastName = buyerName.slice(1).join(' ') || '';

      // Prepare basket items
      const basketItems = [{
        id: order.product.id,
        name: order.product.title,
        category1: 'Koleksiyon',
        itemType: 'PHYSICAL' as const,
        price: Number(order.totalAmount).toFixed(2),
      }];

      // Prepare addresses
      const shippingAddr = shippingAddress ? {
        contactName: shippingAddress.fullName || `${buyerFirstName} ${buyerLastName}`,
        city: shippingAddress.city || 'İstanbul',
        country: 'Turkey',
        address: shippingAddress.address || '',
        zipCode: shippingAddress.zipCode || '',
      } : {
        contactName: `${buyerFirstName} ${buyerLastName}`,
        city: 'İstanbul',
        country: 'Turkey',
        address: '',
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
          gsmNumber: order.buyer.phone || '+905000000000',
          email: order.buyer.email,
          identityNumber: '00000000000', // Should be collected from user
          registrationAddress: shippingAddr.address,
          ip: clientIp,
          city: shippingAddr.city,
          country: 'Turkey',
        },
        shippingAddress: shippingAddr,
        billingAddress: shippingAddr,
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
          paymentUrl: `${this.configService.get('FRONTEND_URL')}/payment/iyzico/${payment.id}`,
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

      // Create PayTR iframe token
      const result = await this.paytrService.processOrderPayment(
        order.id,
        Number(order.totalAmount),
        buyer,
        basketItems,
        1, // installment count
      );

      // Update payment with provider reference
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          providerPaymentId: result.token,
          providerConversationId: order.id,
        },
      });

      // Return iframe URL and HTML for embedding
      return {
        paymentUrl: result.iframeUrl,
        paymentHtml: `<iframe src="${result.iframeUrl}" frameborder="0" style="width:100%;height:600px;border:none;"></iframe>`,
      };
    } catch (error: any) {
      this.logger.error(`PayTR initialization error: ${error.message}`, error.stack);
      
      // Don't fallback - throw error so user knows payment failed
      throw new BadRequestException(
        error.message || 'PayTR ödeme başlatılamadı',
      );
    }
  }

  /**
   * Handle Iyzico callback
   * POST /payments/callback/iyzico
   * Requirement: iyzico signature verification (3.1)
   */
  async handleIyzicoCallback(dto: IyzicoCallbackDto, rawBody?: string, signature?: string) {
    this.logger.log(`Iyzico callback received: ${dto.token}`);

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
      this.logger.warn(`Payment not found for token: ${dto.token}`);
      throw new NotFoundException('Payment not found');
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
      this.logger.error(`Error retrieving Iyzico checkout form: ${error.message}`);
      
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
   * Handle PayTR callback
   * POST /payments/callback/paytr
   */
  async handlePayTRCallback(dto: PayTRCallbackDto) {
    this.logger.log(`PayTR callback received: ${dto.merchant_oid}`);

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

    // Find payment by order ID (merchant_oid is the order ID)
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

      // Update order status to PAID
      await tx.order.update({
        where: { id: payment.orderId },
        data: {
          status: OrderStatus.paid,
          version: { increment: 1 },
        },
      });

      // Update product status to SOLD
      await tx.product.update({
        where: { id: payment.order.productId },
        data: { status: ProductStatus.sold },
      });

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

      return order;
    });

    // Emit order.paid event AFTER transaction commits
    // This publishes jobs to email, push, and shipping queues
    try {
      const shippingAddressData = result.shippingAddress as any;
      
      await this.eventService.emitOrderPaid({
        orderId: result.id,
        orderNumber: result.orderNumber,
        buyerId: result.buyerId,
        sellerId: result.sellerId,
        productId: result.productId,
        productTitle: result.product.title,
        totalAmount: Number(result.totalAmount),
        commissionAmount: Number(result.commissionAmount),
        buyerEmail: result.buyer.email,
        buyerName: result.buyer.displayName || result.buyer.email,
        sellerEmail: result.seller.email,
        sellerName: result.seller.displayName || result.seller.email,
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
      });

      this.logger.log(`order.paid event emitted for order ${result.orderNumber}`);
    } catch (error) {
      // Log but don't fail - payment was already successful
      this.logger.error(`Failed to emit order.paid event: ${error}`);
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

    // Log payment failure
    await this.logPaymentAction('failed', payment.id, payment.orderId, undefined, oldStatus, PaymentStatus.failed, {
      reason,
    });

    this.logger.warn(`Payment ${payment.id} failed: ${reason}`);

    // Emit payment.failed event
    try {
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
    } catch (error) {
      // Log but don't fail - payment was already marked as failed
      this.logger.error(`Failed to emit payment.failed event: ${error}`);
    }
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

    // Verify order is still in pending_payment status
    if (payment.order.status !== OrderStatus.pending_payment) {
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
   * Get payment status (lightweight for polling)
   */
  async getPaymentStatus(paymentId: string, userId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        order: {
          select: {
            buyerId: true,
            sellerId: true,
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Ödeme bulunamadı');
    }

    // Only buyer or seller can view
    if (payment.order.buyerId !== userId && payment.order.sellerId !== userId) {
      throw new ForbiddenException('Bu ödeme durumunu görüntüleme yetkiniz yok');
    }

    return {
      id: payment.id,
      status: payment.status,
      amount: Number(payment.amount),
      currency: payment.currency,
      provider: payment.provider,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    };
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

    return {
      id: payment.id,
      orderId: payment.orderId,
      amount: Number(payment.amount),
      currency: payment.currency,
      provider: payment.provider,
      status: payment.status,
      providerTransactionId: payment.providerPaymentId || payment.providerConversationId,
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
   * Cancel expired pending payments
   * Called by scheduler to automatically cancel payments older than timeout period
   */
  async cancelExpiredPayments() {
    const timeoutMinutes = parseInt(
      this.configService.get('PAYMENT_TIMEOUT_MINUTES') || '15',
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
