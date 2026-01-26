import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { QUEUE_NAMES } from '../../workers/worker.module';

/**
 * Event Payload Types
 */
export interface OrderCreatedPayload {
  orderId: string;
  orderNumber: string;
  buyerId: string;
  sellerId: string;
  productId: string;
  productTitle: string;
  totalAmount: number;
  buyerEmail: string;
  buyerName: string;
  sellerEmail: string;
  sellerName: string;
}

export interface OrderPaidPayload {
  orderId: string;
  orderNumber: string;
  buyerId: string;
  sellerId: string;
  productId: string;
  productTitle: string;
  totalAmount: number;
  commissionAmount: number;
  buyerEmail: string;
  buyerName: string;
  sellerEmail: string;
  sellerName: string;
  paymentMethod: string;
  transactionId: string;
  shippingAddress: {
    fullName: string;
    phone: string;
    address: string;
    city: string;
    district: string;
    zipCode: string;
  };
}

export interface OrderShippedPayload {
  orderId: string;
  orderNumber: string;
  buyerEmail: string;
  buyerName: string;
  trackingNumber: string;
  trackingUrl: string;
  provider: string;
  estimatedDelivery?: Date;
}

export interface OrderDeliveredPayload {
  orderId: string;
  orderNumber: string;
  buyerEmail: string;
  sellerEmail: string;
  buyerName: string;
  sellerName: string;
}

/**
 * Offer Event Payloads
 */
export interface OfferCreatedPayload {
  offerId: string;
  productId: string;
  productTitle: string;
  productPrice: number;
  offerAmount: number;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  sellerEmail: string;
  sellerName: string;
  expiresAt: Date;
}

export interface OfferAcceptedPayload {
  offerId: string;
  orderId: string;
  orderNumber: string;
  productId: string;
  productTitle: string;
  offerAmount: number;
  buyerId: string;
  buyerEmail: string;
  buyerName: string;
  sellerId: string;
  sellerName: string;
}

export interface PaymentFailedPayload {
  paymentId: string;
  orderId: string;
  orderNumber: string;
  buyerId: string;
  buyerEmail: string;
  buyerName: string;
  amount: number;
  provider: string;
  failureReason: string;
}

export interface PaymentRefundedPayload {
  paymentId: string;
  orderId: string;
  orderNumber: string;
  buyerId: string;
  buyerEmail: string;
  buyerName: string;
  sellerId: string;
  sellerEmail: string;
  sellerName: string;
  refundAmount: number;
  totalAmount: number;
  provider: string;
  providerRefundId: string;
}

@Injectable()
export class EventService {
  private readonly logger = new Logger(EventService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.EMAIL) private readonly emailQueue: Queue,
    @InjectQueue(QUEUE_NAMES.PUSH) private readonly pushQueue: Queue,
    @InjectQueue(QUEUE_NAMES.SHIPPING) private readonly shippingQueue: Queue,
    @InjectQueue(QUEUE_NAMES.ANALYTICS) private readonly analyticsQueue: Queue,
  ) {}

  /**
   * Emit order.created event
   * - Sends confirmation email to buyer
   * - Sends notification to seller about new order
   * - Queues analytics event
   */
  async emitOrderCreated(payload: OrderCreatedPayload): Promise<void> {
    this.logger.log(`Emitting order.created event for order ${payload.orderNumber}`);

    // Queue email to buyer - Order confirmation
    await this.emailQueue.add('send-template', {
      to: payload.buyerEmail,
      template: 'order-created-buyer',
      subject: `Siparişiniz alındı - ${payload.orderNumber}`,
      templateData: {
        orderNumber: payload.orderNumber,
        buyerName: payload.buyerName,
        productTitle: payload.productTitle,
        totalAmount: payload.totalAmount,
        orderId: payload.orderId,
      },
    }, {
      priority: 1,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });

    // Queue email to seller - New order notification
    await this.emailQueue.add('send-template', {
      to: payload.sellerEmail,
      template: 'order-created-seller',
      subject: `Yeni sipariş - ${payload.orderNumber}`,
      templateData: {
        orderNumber: payload.orderNumber,
        sellerName: payload.sellerName,
        productTitle: payload.productTitle,
        totalAmount: payload.totalAmount,
        orderId: payload.orderId,
      },
    }, {
      priority: 1,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });

    // Queue push notification to seller
    await this.pushQueue.add('send-notification', {
      userId: payload.sellerId,
      title: 'Yeni Sipariş',
      body: `${payload.productTitle} ürününüz için yeni sipariş alındı`,
      data: {
        type: 'order_created',
        orderId: payload.orderId,
        orderNumber: payload.orderNumber,
      },
    }, {
      priority: 2,
    });

    // Queue analytics event
    await this.analyticsQueue.add('track-event', {
      event: 'order_created',
      properties: {
        orderId: payload.orderId,
        orderNumber: payload.orderNumber,
        buyerId: payload.buyerId,
        sellerId: payload.sellerId,
        productId: payload.productId,
        totalAmount: payload.totalAmount,
        timestamp: new Date().toISOString(),
      },
    });

    this.logger.log(`order.created event emitted for order ${payload.orderNumber}`);
  }

  /**
   * Emit order.paid event
   * - Sends payment confirmation email to buyer
   * - Sends payment received notification to seller
   * - Queues shipping job
   * - Queues analytics event
   */
  async emitOrderPaid(payload: OrderPaidPayload): Promise<void> {
    this.logger.log(`Emitting order.paid event for order ${payload.orderNumber}`);

    // Queue email to buyer - Payment confirmation
    await this.emailQueue.add('send-template', {
      to: payload.buyerEmail,
      template: 'order-paid',
      subject: `Ödeme alındı - ${payload.orderNumber}`,
      templateData: {
        orderNumber: payload.orderNumber,
        buyerName: payload.buyerName,
        productTitle: payload.productTitle,
        totalAmount: payload.totalAmount,
        paymentMethod: payload.paymentMethod,
        transactionId: payload.transactionId,
        orderId: payload.orderId,
        shippingAddress: payload.shippingAddress,
      },
    }, {
      priority: 1,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });

    // Queue email to seller - Payment received, prepare shipment
    await this.emailQueue.add('send-template', {
      to: payload.sellerEmail,
      template: 'order-paid-seller',
      subject: `Ödeme alındı, kargoya hazırlayın - ${payload.orderNumber}`,
      templateData: {
        orderNumber: payload.orderNumber,
        sellerName: payload.sellerName,
        productTitle: payload.productTitle,
        totalAmount: payload.totalAmount,
        commissionAmount: payload.commissionAmount,
        netAmount: payload.totalAmount - payload.commissionAmount,
        orderId: payload.orderId,
        shippingAddress: payload.shippingAddress,
      },
    }, {
      priority: 1,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });

    // Queue push notification to buyer
    await this.pushQueue.add('send-notification', {
      userId: payload.buyerId,
      title: 'Ödeme Onaylandı',
      body: `${payload.productTitle} siparişiniz için ödeme alındı`,
      data: {
        type: 'payment_confirmed',
        orderId: payload.orderId,
        orderNumber: payload.orderNumber,
      },
    }, {
      priority: 1,
    });

    // Queue push notification to seller
    await this.pushQueue.add('send-notification', {
      userId: payload.sellerId,
      title: 'Ödeme Alındı',
      body: `${payload.productTitle} siparişi için ödeme alındı. Kargoya hazırlayın!`,
      data: {
        type: 'payment_received',
        orderId: payload.orderId,
        orderNumber: payload.orderNumber,
      },
    }, {
      priority: 1,
    });

    // Queue shipping creation job
    await this.shippingQueue.add('create-shipment', {
      orderId: payload.orderId,
      orderNumber: payload.orderNumber,
      sellerId: payload.sellerId,
      shippingAddress: payload.shippingAddress,
    }, {
      priority: 2,
    });

    // Queue analytics event
    await this.analyticsQueue.add('track-event', {
      event: 'order_paid',
      properties: {
        orderId: payload.orderId,
        orderNumber: payload.orderNumber,
        buyerId: payload.buyerId,
        sellerId: payload.sellerId,
        productId: payload.productId,
        totalAmount: payload.totalAmount,
        commissionAmount: payload.commissionAmount,
        paymentMethod: payload.paymentMethod,
        timestamp: new Date().toISOString(),
      },
    });

    this.logger.log(`order.paid event emitted for order ${payload.orderNumber}`);
  }

  /**
   * Emit order.shipped event
   * - Sends shipping notification email to buyer
   * - Queues push notification with tracking info
   */
  async emitOrderShipped(payload: OrderShippedPayload): Promise<void> {
    this.logger.log(`Emitting order.shipped event for order ${payload.orderNumber}`);

    // Queue email to buyer - Shipment notification
    await this.emailQueue.add('send-template', {
      to: payload.buyerEmail,
      template: 'order-shipped',
      subject: `Siparişiniz kargoya verildi - ${payload.orderNumber}`,
      templateData: {
        orderNumber: payload.orderNumber,
        buyerName: payload.buyerName,
        trackingNumber: payload.trackingNumber,
        trackingUrl: payload.trackingUrl,
        provider: payload.provider,
        estimatedDelivery: payload.estimatedDelivery,
      },
    }, {
      priority: 1,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });

    this.logger.log(`order.shipped event emitted for order ${payload.orderNumber}`);
  }

  /**
   * Emit order.delivered event
   * - Sends delivery confirmation email to buyer
   * - Prompts buyer to confirm receipt
   */
  async emitOrderDelivered(payload: OrderDeliveredPayload): Promise<void> {
    this.logger.log(`Emitting order.delivered event for order ${payload.orderNumber}`);

    // Queue email to buyer - Delivery confirmation
    await this.emailQueue.add('send-template', {
      to: payload.buyerEmail,
      template: 'order-delivered',
      subject: `Siparişiniz teslim edildi - ${payload.orderNumber}`,
      templateData: {
        orderNumber: payload.orderNumber,
        buyerName: payload.buyerName,
        orderId: payload.orderId,
      },
    }, {
      priority: 2,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });

    this.logger.log(`order.delivered event emitted for order ${payload.orderNumber}`);
  }

  /**
   * Emit offer.created event
   * - Sends email notification to seller about new offer
   * - Sends push notification to seller
   * - Queues analytics event
   */
  async emitOfferCreated(payload: OfferCreatedPayload): Promise<void> {
    this.logger.log(`Emitting offer.created event for offer ${payload.offerId}`);

    // Queue email to seller - New offer received
    await this.emailQueue.add('send-template', {
      to: payload.sellerEmail,
      template: 'offer-received',
      subject: `Yeni teklif aldınız - ${payload.productTitle}`,
      templateData: {
        sellerName: payload.sellerName,
        productTitle: payload.productTitle,
        productPrice: payload.productPrice,
        offerAmount: payload.offerAmount,
        buyerName: payload.buyerName,
        offerId: payload.offerId,
        productId: payload.productId,
        expiresAt: payload.expiresAt,
      },
    }, {
      priority: 1,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });

    // Queue push notification to seller
    await this.pushQueue.add('send-notification', {
      userId: payload.sellerId,
      title: 'Yeni Teklif',
      body: `${payload.productTitle} için ${payload.offerAmount.toFixed(2)} TL teklif aldınız`,
      data: {
        type: 'offer_received',
        offerId: payload.offerId,
        productId: payload.productId,
      },
    }, {
      priority: 1,
    });

    // Queue analytics event
    await this.analyticsQueue.add('track-event', {
      event: 'offer_created',
      properties: {
        offerId: payload.offerId,
        productId: payload.productId,
        buyerId: payload.buyerId,
        sellerId: payload.sellerId,
        offerAmount: payload.offerAmount,
        productPrice: payload.productPrice,
        timestamp: new Date().toISOString(),
      },
    });

    this.logger.log(`offer.created event emitted for offer ${payload.offerId}`);
  }

  /**
   * Emit offer.accepted event
   * - Sends email notification to buyer that offer was accepted
   * - Sends push notification to buyer with payment link
   * - Queues analytics event
   */
  async emitOfferAccepted(payload: OfferAcceptedPayload): Promise<void> {
    this.logger.log(`Emitting offer.accepted event for offer ${payload.offerId}`);

    // Queue email to buyer - Offer accepted, payment required
    await this.emailQueue.add('send-template', {
      to: payload.buyerEmail,
      template: 'offer-accepted',
      subject: `Teklifiniz kabul edildi - ${payload.productTitle}`,
      templateData: {
        buyerName: payload.buyerName,
        productTitle: payload.productTitle,
        offerAmount: payload.offerAmount,
        sellerName: payload.sellerName,
        offerId: payload.offerId,
        orderId: payload.orderId,
        orderNumber: payload.orderNumber,
      },
    }, {
      priority: 1,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });

    // Queue push notification to buyer - Offer accepted, proceed to payment
    await this.pushQueue.add('send-notification', {
      userId: payload.buyerId,
      title: 'Teklif Kabul Edildi!',
      body: `${payload.productTitle} için teklifiniz kabul edildi. Ödeme yaparak siparişinizi tamamlayın.`,
      data: {
        type: 'offer_accepted',
        offerId: payload.offerId,
        orderId: payload.orderId,
        orderNumber: payload.orderNumber,
      },
    }, {
      priority: 1,
    });

    // Queue analytics event
    await this.analyticsQueue.add('track-event', {
      event: 'offer_accepted',
      properties: {
        offerId: payload.offerId,
        orderId: payload.orderId,
        orderNumber: payload.orderNumber,
        productId: payload.productId,
        buyerId: payload.buyerId,
        sellerId: payload.sellerId,
        offerAmount: payload.offerAmount,
        timestamp: new Date().toISOString(),
      },
    });

    this.logger.log(`offer.accepted event emitted for offer ${payload.offerId}`);
  }

  /**
   * Emit payment.failed event
   * - Sends email notification to buyer about payment failure
   * - Sends push notification to buyer
   */
  async emitPaymentFailed(payload: PaymentFailedPayload): Promise<void> {
    this.logger.log(`Emitting payment.failed event for order ${payload.orderNumber}`);

    // Queue email to buyer - Payment failed
    await this.emailQueue.add('send-template', {
      to: payload.buyerEmail,
      template: 'payment-failed',
      subject: `Ödeme Başarısız - ${payload.orderNumber}`,
      templateData: {
        orderNumber: payload.orderNumber,
        buyerName: payload.buyerName,
        amount: payload.amount,
        provider: payload.provider,
        failureReason: payload.failureReason,
        orderId: payload.orderId,
      },
    }, {
      priority: 1,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });

    // Queue push notification to buyer
    await this.pushQueue.add('send-notification', {
      userId: payload.buyerId,
      title: 'Ödeme Başarısız',
      body: `Sipariş ${payload.orderNumber} için ödeme başarısız oldu.`,
      data: {
        type: 'payment_failed',
        orderId: payload.orderId,
        orderNumber: payload.orderNumber,
      },
    }, {
      priority: 1,
    });

    this.logger.log(`payment.failed event emitted for order ${payload.orderNumber}`);
  }

  /**
   * Emit payment.refunded event
   * - Sends email notification to buyer and seller about refund
   * - Sends push notifications
   */
  async emitPaymentRefunded(payload: PaymentRefundedPayload): Promise<void> {
    this.logger.log(`Emitting payment.refunded event for order ${payload.orderNumber}`);

    // Queue email to buyer - Refund processed
    await this.emailQueue.add('send-template', {
      to: payload.buyerEmail,
      template: 'payment-refunded',
      subject: `İade İşlemi Tamamlandı - ${payload.orderNumber}`,
      templateData: {
        orderNumber: payload.orderNumber,
        buyerName: payload.buyerName,
        refundAmount: payload.refundAmount,
        totalAmount: payload.totalAmount,
        provider: payload.provider,
        orderId: payload.orderId,
      },
    }, {
      priority: 1,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });

    // Queue email to seller - Refund notification
    await this.emailQueue.add('send-template', {
      to: payload.sellerEmail,
      template: 'payment-refunded-seller',
      subject: `İade İşlemi - ${payload.orderNumber}`,
      templateData: {
        orderNumber: payload.orderNumber,
        sellerName: payload.sellerName,
        refundAmount: payload.refundAmount,
        totalAmount: payload.totalAmount,
        orderId: payload.orderId,
      },
    }, {
      priority: 1,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });

    // Queue push notification to buyer
    await this.pushQueue.add('send-notification', {
      userId: payload.buyerId,
      title: 'İade İşlemi Tamamlandı',
      body: `Sipariş ${payload.orderNumber} için ${payload.refundAmount.toFixed(2)} TL iade edildi.`,
      data: {
        type: 'payment_refunded',
        orderId: payload.orderId,
        orderNumber: payload.orderNumber,
      },
    }, {
      priority: 1,
    });

    // Queue push notification to seller
    await this.pushQueue.add('send-notification', {
      userId: payload.sellerId,
      title: 'İade İşlemi',
      body: `Sipariş ${payload.orderNumber} için iade işlemi gerçekleştirildi.`,
      data: {
        type: 'payment_refunded',
        orderId: payload.orderId,
        orderNumber: payload.orderNumber,
      },
    }, {
      priority: 1,
    });

    this.logger.log(`payment.refunded event emitted for order ${payload.orderNumber}`);
  }

  /**
   * Queue email for sending (public helper method)
   */
  async queueEmail(data: {
    to: string;
    template: string;
    subject: string;
    templateData?: Record<string, any>;
  }): Promise<void> {
    await this.emailQueue.add('send-template', {
      to: data.to,
      template: data.template,
      subject: data.subject,
      templateData: data.templateData || {},
    }, {
      priority: 2,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });
  }
}
