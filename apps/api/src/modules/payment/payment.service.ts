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
   * Initiate payment for an order
   * POST /payments/initiate
   * Requirement: PayTR & Iyzico integration (project.md)
   */
  async initiatePayment(buyerId: string, dto: InitiatePaymentDto) {
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

    // Generate payment URL based on provider
    let paymentUrl: string;
    let paymentHtml: string | undefined;

    if (dto.provider === PaymentProvider.iyzico) {
      const result = await this.initializeIyzicoPayment(payment, order);
      paymentUrl = result.paymentUrl;
      paymentHtml = result.paymentHtml;
    } else {
      const result = await this.initializePayTRPayment(payment, order);
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
   * Initialize Iyzico payment
   * Note: This is a mock implementation - real implementation would use iyzico SDK
   */
  private async initializeIyzicoPayment(payment: any, order: any) {
    // In production, use iyzico SDK:
    // const iyzipay = require('iyzipay');
    // const checkoutFormInitialize = await iyzipay.checkoutFormInitialize.create(request, callback);

    const iyzicoApiKey = this.configService.get('IYZICO_API_KEY');
    const iyzicoSecretKey = this.configService.get('IYZICO_SECRET_KEY');
    const callbackUrl = `${this.configService.get('API_URL')}/payments/callback/iyzico`;

    // Mock response - replace with actual iyzico integration
    this.logger.log(`Initializing Iyzico payment for order ${order.id}`);

    // Update payment with provider reference
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        providerPaymentId: `iyzico_${payment.id}_${Date.now()}`,
      },
    });

    return {
      paymentUrl: `${this.configService.get('FRONTEND_URL')}/payment/iyzico/${payment.id}`,
      paymentHtml: undefined,
    };
  }

  /**
   * Initialize PayTR payment
   * Uses PayTR iframe token API for secure payment
   */
  private async initializePayTRPayment(payment: any, order: any) {
    this.logger.log(`Initializing PayTR payment for order ${order.id}`);

    try {
      // Prepare buyer info
      const buyer = {
        id: order.buyer.id,
        name: order.buyer.displayName?.split(' ')[0] || 'Müşteri',
        surname: order.buyer.displayName?.split(' ').slice(1).join(' ') || '',
        email: order.buyer.email,
        phone: order.buyer.phone || '+905000000000',
        ip: '127.0.0.1', // Should come from request
        address: 'Türkiye',
        city: 'İstanbul',
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

      return {
        paymentUrl: result.iframeUrl,
        paymentHtml: `<iframe src="${result.iframeUrl}" frameborder="0" style="width:100%;height:600px;"></iframe>`,
      };
    } catch (error: any) {
      this.logger.error(`PayTR initialization error: ${error.message}`);
      
      // Fallback to simple redirect
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          providerPaymentId: `paytr_${payment.id}_${Date.now()}`,
        },
      });

      return {
        paymentUrl: `${this.configService.get('FRONTEND_URL')}/payment/paytr/${payment.id}`,
        paymentHtml: undefined,
      };
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

    // In production: verify callback with iyzico SDK
    // const checkoutForm = await iyzipay.checkoutForm.retrieve(request, callback);

    // Find payment by provider conversation ID or payment ID
    const payment = await this.prisma.payment.findFirst({
      where: {
        OR: [
          { providerConversationId: { contains: dto.conversationId || dto.token } },
          { providerPaymentId: { contains: dto.conversationId || dto.token } },
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
      throw new NotFoundException('Payment not found');
    }

    // Process based on status
    if (dto.status === 'success') {
      await this.processSuccessfulPayment(payment, dto.paymentId || dto.token);
    } else {
      await this.processFailedPayment(payment, 'Iyzico payment failed');
    }

    return { status: 'ok' };
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
   * Process successful payment
   * Requirement: Queue job publishing after payment (3.1)
   */
  private async processSuccessfulPayment(payment: any, transactionId?: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      // Update payment status
      await tx.payment.update({
        where: { id: payment.id },
        data: { 
          status: PaymentStatus.completed,
          providerPaymentId: transactionId || payment.providerPaymentId,
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
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.failed,
        failureReason: reason,
      },
    });

    this.logger.warn(`Payment ${payment.id} failed: ${reason}`);
  }

  /**
   * Process refund
   * Requirement: Refund handling (project.md)
   */
  async processRefund(orderId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: {
        orderId,
        status: PaymentStatus.completed,
      },
    });

    if (!payment) {
      throw new NotFoundException('Tamamlanmış ödeme bulunamadı');
    }

    return this.prisma.$transaction(async (tx) => {
      // Update payment status
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.refunded },
      });

      // Cancel payment hold
      await tx.paymentHold.updateMany({
        where: {
          orderId,
          status: PaymentHoldStatus.held,
        },
        data: { status: PaymentHoldStatus.cancelled },
      });

      // In production: call provider refund API
      this.logger.log(`Refund processed for payment ${payment.id}`);

      return { success: true, paymentId: payment.id };
    });
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
}
