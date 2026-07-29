import { Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { QUEUE_NAMES } from "../../workers/constants";
import { PrismaService } from "../../prisma";
import {
  escapeEmailHtml,
  wrapEmailTemplateLayout,
} from "../../common/helpers/email-template-renderer";

/** In-process (EventEmitter2) event adları — modüller-arası döngüsüz decoupling. */
export const PAYMENT_TRADE_CASH_CLEARED = "payment.trade-cash-cleared";
/** Faz 8.1 — fiziksel siparişin ödemesi commit oldu; fulfillment sonlandırması istenir. */
export const ORDER_FULFILLMENT_REQUESTED = "order.fulfillment-requested";

/**
 * Faz 8.1 — Ödeme atomik tx'i (claim + preparing + stok + escrow hold) commit olduktan
 * SONRA fiziksel siparişin POST-COMMIT sonlandırması (ledger capture + order.paid + Sürat)
 * bu event ile İSTENİR; `OrderFulfillmentListener` tüketir. order/payment nesneleri tx'te
 * yüklenmiş hâlleriyle taşınır (birebir aynı argümanlar → davranış değişmez, ekstra sorgu yok).
 */
export interface OrderFulfillmentRequestedPayload {
  order: any; // buyer/seller/product include'lı Prisma order (finalizer'a aynen geçer)
  payment: any; // Prisma payment
  skipBuyer?: boolean;
  transactionId?: string;
}

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
  /** Sipariş adedi (çoklu-adet sepet). Varsayılan 1; e-postada adet gösterimi için. */
  quantity?: number;
  /** Birim fiyat (opsiyonel; adet>1'de satır kırılımı için). */
  unitPrice?: number;
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
  /** When true, email link should point to guest order track page */
  isGuestOrder?: boolean;
  /** Raw buyer email from order (guest@tarodan.system for guest) - used as fallback for track link */
  buyerSystemEmail?: string;
  /**
   * Çoklu-ürün (sepet) ödemesinde alıcı tarafı (onay maili + push) grup başına
   * TEK kez üst seviyeden gönderilir (emitGroupBuyerOrderPaid). Döngüdeki sipariş
   * başına emitOrderPaid çağrısında bu true verilir → alıcıya ürün başına onay
   * maili/push GİTMEZ; yalnız satıcı maili/push'u + analytics çalışır.
   */
  skipBuyer?: boolean;
}

/**
 * Çoklu-ürün (sepet) ödemesinde alıcıya gönderilen TEK onay payload'ı.
 * CheckoutGroup başına bir mail + bir push. Ürünler satır satır listelenir.
 */
export interface GroupBuyerOrderPaidPayload {
  checkoutGroupId: string;
  groupNumber: string;
  buyerId: string;
  buyerEmail: string;
  buyerName: string;
  groupTotal: number;
  paymentMethod: string;
  transactionId: string;
  items: Array<{
    productTitle: string;
    totalAmount: number;
    /** Sipariş adedi (çoklu-adet). Varsayılan 1. */
    quantity?: number;
    /** Bu order satırına yüklü kargo (satıcı paketinin TEK kargosu; kardeşlerde 0). */
    shippingCost?: number;
  }>;
  /**
   * Satıcı-bazlı kargo dökümü — her satıcı = bir OrderPackage = TEK kargo ücreti.
   * Konsolide kardeş order'ların shippingCost'u 0 ("pakete dahil"). Opsiyonel (geriye dönük).
   */
  sellerShipments?: Array<{ sellerName: string; shippingCost: number }>;
  /** Tüm satıcı paketlerinin toplam kargosu. Opsiyonel. */
  shippingTotal?: number;
  shippingAddress: {
    fullName: string;
    phone: string;
    address: string;
    city: string;
    district: string;
    zipCode: string;
  };
  /** When true, email link should point to guest order track page */
  isGuestOrder?: boolean;
  /** Raw buyer email from order (guest@tarodan.system for guest) - used as fallback for track link */
  buyerSystemEmail?: string;
  /** Temsilci sipariş no — misafir takip linki için kullanılır */
  representativeOrderNumber?: string;
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

export interface AdminBroadcastPayload {
  userIds: string[];
  title: string;
  body: string;
  channels: string[];
  data?: Record<string, any>;
}

export interface InAppNotificationPayload {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, any>;
}

@Injectable()
export class EventService {
  private readonly logger = new Logger(EventService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.EMAIL) private readonly emailQueue: Queue,
    @InjectQueue(QUEUE_NAMES.PUSH) private readonly pushQueue: Queue,
    @InjectQueue(QUEUE_NAMES.ANALYTICS) private readonly analyticsQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Faz 8.4: Nakit-farklı takas ödemesi temizlendi → inbound (depoya) Sürat
   * gönderileri oluşturulmalı. TradeService'i Payment içinden ModuleRef + runtime
   * require() ile çözmek (Trade↔Payment döngüsü) yerine in-process event yayınlanır;
   * Trade tarafındaki dinleyici (TradeCashClearedListener) createInboundTradeShipments'ı çağırır.
   */
  emitTradeCashCleared(payload: { tradeId: string }): void {
    this.logger.log(
      `Emitting ${PAYMENT_TRADE_CASH_CLEARED} for trade ${payload.tradeId}`,
    );
    this.eventEmitter.emit(PAYMENT_TRADE_CASH_CLEARED, payload);
  }

  /**
   * Faz 8.1 — Ödeme servisi FulfillmentFinalizer'a DOĞRUDAN bağlı olmadan (DIP) sipariş
   * sonlandırmasını ister. `emitAsync` + await: mevcut zamanlama korunur (sonlandırma
   * dönmeden önce tamamlanır) → tek değişiklik dispatch mekanizması, davranış aynı.
   * Listener best-effort (kendi içinde try/catch) → fulfillment hatası ödemeyi BOZMAZ.
   */
  async emitOrderFulfillmentRequested(
    payload: OrderFulfillmentRequestedPayload,
  ): Promise<void> {
    await this.eventEmitter.emitAsync(ORDER_FULFILLMENT_REQUESTED, payload);
  }

  /**
   * Emit order.created event
   * - Sends NO buyer/seller notification (payment not yet confirmed; order may be abandoned).
   *   Both sides are notified only on order.paid.
   * - Queues analytics event for the checkout-initiated funnel
   */
  async emitOrderCreated(payload: OrderCreatedPayload): Promise<void> {
    this.logger.log(
      `Emitting order.created event for order ${payload.orderNumber}`,
    );

    // No buyer/seller notification on order.created: payment is not yet confirmed and the order
    // may be abandoned. Both sides are notified only after payment succeeds (order.paid):
    // buyer gets order-paid + invoice, seller gets the "Yeni Sipariş" email + push.
    // Here we only track analytics for the checkout-initiated funnel.

    // DISABLED — analytics 'track-event' kuyrukta handler'sız + tablosuz boşa fail
    // ediyordu. Üretim durduruldu. (Funnel analitiği için: AnalyticsEvent tablosu +
    // @Process('track-event') ekle.)
    /*
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
    */

    this.logger.log(
      `order.created event emitted for order ${payload.orderNumber}`,
    );
  }

  /**
   * Emit order.paid event
   * - Sends payment confirmation email to buyer
   * - Sends payment received notification to seller
   * - Queues shipping job
   * - Queues analytics event
   */
  async emitOrderPaid(payload: OrderPaidPayload): Promise<void> {
    this.logger.log(
      `Emitting order.paid event for order ${payload.orderNumber}`,
    );

    // Çoklu-ürün (sepet) akışında alıcıya ürün başına onay maili/push GÖNDERME.
    // Alıcı tarafı grup başına TEK kez emitGroupBuyerOrderPaid ile üst seviyeden
    // gönderilir; burada yalnız satıcı maili/push'u + analytics çalışır.
    if (!payload.skipBuyer) {
      // Queue email to buyer - Payment confirmation
      await this.emailQueue.add(
        "send-template",
        {
          to: payload.buyerEmail,
          template: "order-paid",
          subject: `Ödeme alındı - ${payload.orderNumber}`,
          templateData: {
            orderNumber: payload.orderNumber,
            buyerName: payload.buyerName,
            buyerEmail: payload.buyerEmail,
            productTitle: payload.productTitle,
            quantity: payload.quantity ?? 1,
            unitPrice: payload.unitPrice,
            totalAmount: payload.totalAmount,
            paymentMethod: payload.paymentMethod,
            transactionId: payload.transactionId,
            orderId: payload.orderId,
            shippingAddress: payload.shippingAddress,
            isGuestOrder: payload.isGuestOrder ?? false,
            buyerSystemEmail: payload.buyerSystemEmail ?? "",
          },
        },
        {
          priority: 1,
          attempts: 3,
          backoff: { type: "exponential", delay: 2000 },
        },
      );
    }

    // Queue email to seller - Payment received, prepare shipment
    await this.emailQueue.add(
      "send-template",
      {
        to: payload.sellerEmail,
        template: "order-paid-seller",
        subject: `Yeni sipariş - ${payload.orderNumber}`,
        templateData: {
          orderNumber: payload.orderNumber,
          sellerName: payload.sellerName,
          productTitle: payload.productTitle,
          quantity: payload.quantity ?? 1,
          totalAmount: payload.totalAmount,
          commissionAmount: payload.commissionAmount,
          netAmount: payload.totalAmount - payload.commissionAmount,
          orderId: payload.orderId,
          shippingAddress: payload.shippingAddress,
        },
      },
      {
        priority: 1,
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
      },
    );

    // Queue push notification to buyer (sepet akışında atlanır — grup başına tek push)
    if (!payload.skipBuyer) {
      await this.pushQueue.add(
        "send-notification",
        {
          userId: payload.buyerId,
          title: "Ödeme Onaylandı",
          body: `${payload.productTitle} siparişiniz için ödeme alındı`,
          data: {
            type: "payment_confirmed",
            orderId: payload.orderId,
            orderNumber: payload.orderNumber,
          },
        },
        {
          priority: 1,
        },
      );
    }

    // Queue push notification to seller — this is the seller's first ("new order") alert,
    // fired only after payment is confirmed.
    await this.pushQueue.add(
      "send-notification",
      {
        userId: payload.sellerId,
        title: "Yeni Sipariş",
        body: `${payload.productTitle} ürününüz satıldı! Kargoya hazırlayın.`,
        data: {
          type: "payment_received",
          orderId: payload.orderId,
          orderNumber: payload.orderNumber,
        },
      },
      {
        priority: 1,
      },
    );

    // Do NOT auto-create shipment here – order stays "Hazırlanıyor" until seller enters tracking / marks shipped

    // Queue analytics event
    // DISABLED — analytics 'track-event' (handler/tablo yok, boşa fail ediyordu).
    /*
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
    */

    this.logger.log(
      `order.paid event emitted for order ${payload.orderNumber}`,
    );
  }

  /**
   * Emit group buyer order.paid — çoklu-ürün (sepet) ödemesinde alıcıya
   * CheckoutGroup başına TEK onay maili + TEK push gönderir. Sipariş başına
   * emitOrderPaid (skipBuyer:true) yalnız satıcı tarafını işler; alıcı tarafı
   * bu üst-seviye çağrıyla bir kez kapsanır. Ürünler satır satır 'order-paid-group'
   * template'inde listelenir.
   */
  async emitGroupBuyerOrderPaid(
    payload: GroupBuyerOrderPaidPayload,
  ): Promise<void> {
    this.logger.log(
      `Emitting group buyer order.paid for group ${payload.groupNumber}`,
    );

    // Queue tek onay maili — alıcı
    await this.emailQueue.add(
      "send-template",
      {
        to: payload.buyerEmail,
        template: "order-paid-group",
        subject: `Siparişiniz alındı - ${payload.groupNumber}`,
        templateData: {
          groupNumber: payload.groupNumber,
          buyerName: payload.buyerName,
          buyerEmail: payload.buyerEmail,
          items: payload.items,
          // Satıcı-bazlı kargo dökümü + toplam (satıcı = paket = tek kargo).
          sellerShipments: payload.sellerShipments ?? [],
          shippingTotal: payload.shippingTotal ?? 0,
          groupTotal: payload.groupTotal,
          paymentMethod: payload.paymentMethod,
          transactionId: payload.transactionId,
          shippingAddress: payload.shippingAddress,
          isGuestOrder: payload.isGuestOrder ?? false,
          buyerSystemEmail: payload.buyerSystemEmail ?? "",
          // Misafir takip linki temsilci sipariş no üzerinden çözülür
          orderNumber: payload.representativeOrderNumber ?? "",
        },
      },
      {
        priority: 1,
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
      },
    );

    // Queue tek push — alıcı
    await this.pushQueue.add(
      "send-notification",
      {
        userId: payload.buyerId,
        title: "Ödeme Onaylandı",
        body: `${payload.items.length} ürünlük siparişiniz için ödeme alındı`,
        data: {
          type: "payment_confirmed",
          checkoutGroupId: payload.checkoutGroupId,
          groupNumber: payload.groupNumber,
        },
      },
      {
        priority: 1,
      },
    );

    this.logger.log(
      `group buyer order.paid emitted for group ${payload.groupNumber}`,
    );
  }

  /**
   * Emit order.shipped event
   * - Sends shipping notification email to buyer
   * - Queues push notification with tracking info
   */
  async emitOrderShipped(payload: OrderShippedPayload): Promise<void> {
    this.logger.log(
      `Emitting order.shipped event for order ${payload.orderNumber}`,
    );

    // Queue email to buyer - Shipment notification
    await this.emailQueue.add(
      "send-template",
      {
        to: payload.buyerEmail,
        template: "order-shipped",
        subject: `Siparişiniz kargoya verildi - ${payload.orderNumber}`,
        templateData: {
          orderNumber: payload.orderNumber,
          buyerName: payload.buyerName,
          trackingNumber: payload.trackingNumber,
          trackingUrl: payload.trackingUrl,
          provider: payload.provider,
          estimatedDelivery: payload.estimatedDelivery,
        },
      },
      {
        priority: 1,
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
      },
    );

    this.logger.log(
      `order.shipped event emitted for order ${payload.orderNumber}`,
    );
  }

  /**
   * Emit order.delivered event
   * - Sends delivery confirmation email to buyer
   * - Prompts buyer to confirm receipt
   */
  async emitOrderDelivered(payload: OrderDeliveredPayload): Promise<void> {
    this.logger.log(
      `Emitting order.delivered event for order ${payload.orderNumber}`,
    );

    // Queue email to buyer - Delivery confirmation
    await this.emailQueue.add(
      "send-template",
      {
        to: payload.buyerEmail,
        template: "order-delivered",
        subject: `Siparişiniz teslim edildi - ${payload.orderNumber}`,
        templateData: {
          orderNumber: payload.orderNumber,
          buyerName: payload.buyerName,
          orderId: payload.orderId,
        },
      },
      {
        priority: 2,
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
      },
    );

    this.logger.log(
      `order.delivered event emitted for order ${payload.orderNumber}`,
    );
  }

  /**
   * Emit offer.created event
   * - Sends email notification to seller about new offer
   * - Sends push notification to seller
   * - Queues analytics event
   */
  async emitOfferCreated(payload: OfferCreatedPayload): Promise<void> {
    this.logger.log(
      `Emitting offer.created event for offer ${payload.offerId}`,
    );

    // Queue email to seller - New offer received
    await this.emailQueue.add(
      "send-template",
      {
        to: payload.sellerEmail,
        template: "offer-received",
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
      },
      {
        priority: 1,
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
      },
    );

    // Queue push notification to seller
    await this.pushQueue.add(
      "send-notification",
      {
        userId: payload.sellerId,
        title: "Yeni Teklif",
        body: `${payload.productTitle} için ${payload.offerAmount.toFixed(2)} TL teklif aldınız`,
        data: {
          type: "offer_received",
          offerId: payload.offerId,
          productId: payload.productId,
        },
      },
      {
        priority: 1,
      },
    );

    // Queue analytics event
    // DISABLED — analytics 'track-event' (handler/tablo yok, boşa fail ediyordu).
    /*
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
    */

    this.logger.log(`offer.created event emitted for offer ${payload.offerId}`);
  }

  /**
   * Emit offer.accepted event
   * - Sends email notification to buyer that offer was accepted
   * - Sends push notification to buyer with payment link
   * - Queues analytics event
   */
  async emitOfferAccepted(payload: OfferAcceptedPayload): Promise<void> {
    this.logger.log(
      `Emitting offer.accepted event for offer ${payload.offerId}`,
    );

    // Queue email to buyer - Offer accepted, payment required
    await this.emailQueue.add(
      "send-template",
      {
        to: payload.buyerEmail,
        template: "offer-accepted",
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
      },
      {
        priority: 1,
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
      },
    );

    // Queue push notification to buyer - Offer accepted, proceed to payment
    await this.pushQueue.add(
      "send-notification",
      {
        userId: payload.buyerId,
        title: "Teklif Kabul Edildi!",
        body: `${payload.productTitle} için teklifiniz kabul edildi. Ödeme yaparak siparişinizi tamamlayın.`,
        data: {
          type: "offer_accepted",
          offerId: payload.offerId,
          orderId: payload.orderId,
          orderNumber: payload.orderNumber,
        },
      },
      {
        priority: 1,
      },
    );

    // Queue analytics event
    // DISABLED — analytics 'track-event' (handler/tablo yok, boşa fail ediyordu).
    /*
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
    */

    this.logger.log(
      `offer.accepted event emitted for offer ${payload.offerId}`,
    );
  }

  /**
   * Emit payment.failed event
   * - Sends email notification to buyer about payment failure
   * - Sends push notification to buyer
   */
  async emitPaymentFailed(payload: PaymentFailedPayload): Promise<void> {
    this.logger.log(
      `Emitting payment.failed event for order ${payload.orderNumber}`,
    );

    // Queue email to buyer - Payment failed
    await this.emailQueue.add(
      "send-template",
      {
        to: payload.buyerEmail,
        template: "payment-failed",
        subject: `Ödeme Başarısız - ${payload.orderNumber}`,
        templateData: {
          orderNumber: payload.orderNumber,
          buyerName: payload.buyerName,
          amount: payload.amount,
          provider: payload.provider,
          failureReason: payload.failureReason,
          orderId: payload.orderId,
        },
      },
      {
        priority: 1,
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
      },
    );

    // Queue push notification to buyer
    await this.pushQueue.add(
      "send-notification",
      {
        userId: payload.buyerId,
        title: "Ödeme Başarısız",
        body: `Sipariş ${payload.orderNumber} için ödeme başarısız oldu.`,
        data: {
          type: "payment_failed",
          orderId: payload.orderId,
          orderNumber: payload.orderNumber,
        },
      },
      {
        priority: 1,
      },
    );

    this.logger.log(
      `payment.failed event emitted for order ${payload.orderNumber}`,
    );
  }

  /**
   * Emit payment.refunded event
   * - Sends email notification to buyer and seller about refund
   * - Sends push notifications
   */
  async emitPaymentRefunded(payload: PaymentRefundedPayload): Promise<void> {
    this.logger.log(
      `Emitting payment.refunded event for order ${payload.orderNumber}`,
    );

    // Queue email to buyer - Refund processed
    await this.emailQueue.add(
      "send-template",
      {
        to: payload.buyerEmail,
        template: "payment-refunded",
        subject: `İade İşlemi Tamamlandı - ${payload.orderNumber}`,
        templateData: {
          orderNumber: payload.orderNumber,
          buyerName: payload.buyerName,
          refundAmount: payload.refundAmount,
          totalAmount: payload.totalAmount,
          provider: payload.provider,
          orderId: payload.orderId,
        },
      },
      {
        priority: 1,
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
      },
    );

    // Queue email to seller - Refund notification
    await this.emailQueue.add(
      "send-template",
      {
        to: payload.sellerEmail,
        template: "payment-refunded-seller",
        subject: `İade İşlemi - ${payload.orderNumber}`,
        templateData: {
          orderNumber: payload.orderNumber,
          sellerName: payload.sellerName,
          refundAmount: payload.refundAmount,
          totalAmount: payload.totalAmount,
          orderId: payload.orderId,
        },
      },
      {
        priority: 1,
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
      },
    );

    // Queue push notification to buyer
    await this.pushQueue.add(
      "send-notification",
      {
        userId: payload.buyerId,
        title: "İade İşlemi Tamamlandı",
        body: `Sipariş ${payload.orderNumber} için ${payload.refundAmount.toFixed(2)} TL iade edildi.`,
        data: {
          type: "payment_refunded",
          orderId: payload.orderId,
          orderNumber: payload.orderNumber,
        },
      },
      {
        priority: 1,
      },
    );

    // Queue push notification to seller
    await this.pushQueue.add(
      "send-notification",
      {
        userId: payload.sellerId,
        title: "İade İşlemi",
        body: `Sipariş ${payload.orderNumber} için iade işlemi gerçekleştirildi.`,
        data: {
          type: "payment_refunded",
          orderId: payload.orderId,
          orderNumber: payload.orderNumber,
        },
      },
      {
        priority: 1,
      },
    );

    this.logger.log(
      `payment.refunded event emitted for order ${payload.orderNumber}`,
    );
  }

  /**
   * Emit offer.auto-rejected event — sent to buyers whose pending
   * offers were auto-rejected because the product was sold / reserved.
   */
  async emitOfferAutoRejected(payload: {
    offerId: string;
    buyerId: string;
    productId: string;
    productTitle: string;
    reason: string;
  }): Promise<void> {
    this.logger.log(
      `Emitting offer.auto-rejected for offer ${payload.offerId}`,
    );

    await this.pushQueue.add(
      "send-notification",
      {
        userId: payload.buyerId,
        title: "Teklifiniz Kapatıldı",
        body: `${payload.productTitle}: ${payload.reason}`,
        data: {
          type: "offer_auto_rejected",
          offerId: payload.offerId,
          productId: payload.productId,
        },
      },
      { priority: 3 },
    );
  }

  /**
   * Emit trade.auto-cancelled event — sent to both parties when
   * a pending/accepted trade is auto-cancelled because a product was sold.
   */
  async emitTradeAutoCancelled(payload: {
    tradeId: string;
    initiatorId: string;
    receiverId: string;
    reason: string;
  }): Promise<void> {
    this.logger.log(
      `Emitting trade.auto-cancelled for trade ${payload.tradeId}`,
    );

    for (const userId of [payload.initiatorId, payload.receiverId]) {
      await this.pushQueue.add(
        "send-notification",
        {
          userId,
          title: "Takas İptal Edildi",
          body: `Takasınız otomatik olarak iptal edildi: ${payload.reason}`,
          data: {
            type: "trade_auto_cancelled",
            tradeId: payload.tradeId,
          },
        },
        { priority: 3 },
      );
    }
  }

  /**
   * Emit trade.ready-for-shipping event — sent to both parties when
   * a safe-trade (escrow) cash payment is completed and the trade is
   * ready to be shipped to the Tarodan warehouse.
   */
  async emitTradeReadyForShipping(payload: {
    tradeId: string;
    initiatorId: string;
    receiverId: string;
    shippingDeadline: Date;
  }): Promise<void> {
    this.logger.log(
      `Emitting trade.ready-for-shipping for trade ${payload.tradeId}`,
    );

    for (const userId of [payload.initiatorId, payload.receiverId]) {
      await this.pushQueue.add(
        "send-notification",
        {
          userId,
          title: "Takas Kargoya Hazır",
          body: "Ödeme tamamlandı. Ürününüzü Tarodan deposuna göndermeniz gerekiyor.",
          data: {
            type: "trade_ready_for_shipping",
            tradeId: payload.tradeId,
            shippingDeadline: payload.shippingDeadline.toISOString(),
          },
        },
        { priority: 3 },
      );
    }
  }

  /**
   * Emit trade.warehouse-approved event — admin approved the safe-trade at the
   * warehouse and items are now being shipped to their new owners.
   */
  async emitTradeWarehouseApproved(payload: {
    tradeId: string;
    initiatorId: string;
    receiverId: string;
    notes?: string;
  }): Promise<void> {
    this.logger.log(
      `Emitting trade.warehouse-approved for trade ${payload.tradeId}`,
    );

    for (const userId of [payload.initiatorId, payload.receiverId]) {
      await this.pushQueue.add(
        "send-notification",
        {
          userId,
          title: "Takas Onaylandı",
          body: "Takas onaylandı, ürünler yolda.",
          data: {
            type: "trade_warehouse_approved",
            tradeId: payload.tradeId,
            notes: payload.notes ?? null,
          },
        },
        { priority: 3 },
      );
    }
  }

  /**
   * Emit trade.warehouse-rejected event — admin rejected the safe-trade; each
   * party's own items are being returned to them.
   */
  async emitTradeWarehouseRejected(payload: {
    tradeId: string;
    initiatorId: string;
    receiverId: string;
    reason: string;
  }): Promise<void> {
    this.logger.log(
      `Emitting trade.warehouse-rejected for trade ${payload.tradeId}`,
    );

    for (const userId of [payload.initiatorId, payload.receiverId]) {
      await this.pushQueue.add(
        "send-notification",
        {
          userId,
          title: "Takas Reddedildi",
          body: `Takas reddedildi: ${payload.reason}`,
          data: {
            type: "trade_warehouse_rejected",
            tradeId: payload.tradeId,
            reason: payload.reason,
          },
        },
        { priority: 3 },
      );
    }
  }

  /**
   * Emit trade.cancel-locked event — fired the moment the first
   * to_warehouse shipment is received. Notifies the counterpart that the
   * user-side cancel option is gone and only admin can unwind from here.
   */
  async emitTradeCancelLocked(payload: {
    tradeId: string;
    initiatorId: string;
    receiverId: string;
  }): Promise<void> {
    this.logger.log(
      `Emitting trade.cancel-locked for trade ${payload.tradeId}`,
    );

    for (const userId of [payload.initiatorId, payload.receiverId]) {
      await this.pushQueue.add(
        "send-notification",
        {
          userId,
          title: "Takas Depoda",
          body: "Ürünlerden biri Tarodan deposuna ulaştı. Bu noktadan sonra iptal yapılamaz; sorun varsa itiraz açın.",
          data: {
            type: "trade_cancel_locked",
            tradeId: payload.tradeId,
          },
        },
        { priority: 3 },
      );
    }
  }

  /**
   * Emit trade.return-completed — both return shipments arrived; the trade
   * is now fully cancelled.
   */
  async emitTradeReturnCompleted(payload: {
    tradeId: string;
    initiatorId: string;
    receiverId: string;
  }): Promise<void> {
    this.logger.log(
      `Emitting trade.return-completed for trade ${payload.tradeId}`,
    );

    for (const userId of [payload.initiatorId, payload.receiverId]) {
      await this.pushQueue.add(
        "send-notification",
        {
          userId,
          title: "İade Tamamlandı",
          body: "Ürününüz size geri ulaştı; takas iptal edildi.",
          data: {
            type: "trade_return_completed",
            tradeId: payload.tradeId,
          },
        },
        { priority: 3 },
      );
    }
  }

  /**
   * Emit trade.return-lost — a return shipment was declared lost in transit
   * and the affected user is owed manual compensation.
   */
  async emitTradeReturnLost(payload: {
    tradeId: string;
    compensationUserId: string | null;
    reason: string;
  }): Promise<void> {
    this.logger.log(`Emitting trade.return-lost for trade ${payload.tradeId}`);

    if (!payload.compensationUserId) return;
    await this.pushQueue.add(
      "send-notification",
      {
        userId: payload.compensationUserId,
        title: "İade Kargosu Kayıp",
        body: `İade gönderiniz kayıp olarak işaretlendi. Tarodan ekibi sizinle iletişime geçecek.`,
        data: {
          type: "trade_return_lost",
          tradeId: payload.tradeId,
          reason: payload.reason,
        },
      },
      { priority: 3 },
    );
  }

  /**
   * Emit trade.refund-failed — PayTR refund call failed during/after reject.
   * Notifies admin channels (via worker) and the cash payer.
   */
  async emitTradeRefundFailed(payload: {
    tradeId: string;
    cashPayerId: string | null;
    reason: string;
  }): Promise<void> {
    this.logger.log(
      `Emitting trade.refund-failed for trade ${payload.tradeId}`,
    );

    if (payload.cashPayerId) {
      await this.pushQueue.add(
        "send-notification",
        {
          userId: payload.cashPayerId,
          title: "İade Gecikti",
          body: "Otomatik iadeniz tamamlanamadı. Tarodan ekibi durumu inceliyor; en kısa sürede çözeceğiz.",
          data: {
            type: "trade_refund_failed",
            tradeId: payload.tradeId,
            reason: payload.reason,
          },
        },
        { priority: 4 },
      );
    }
  }

  /**
   * Emit trade.refund-completed — successful PayTR refund (initial or retry).
   */
  async emitTradeRefundCompleted(payload: {
    tradeId: string;
    cashPayerId: string | null;
  }): Promise<void> {
    this.logger.log(
      `Emitting trade.refund-completed for trade ${payload.tradeId}`,
    );

    if (payload.cashPayerId) {
      await this.pushQueue.add(
        "send-notification",
        {
          userId: payload.cashPayerId,
          title: "İade Tamamlandı",
          body: "Nakit fark ödemeniz PayTR üzerinden iade edildi.",
          data: {
            type: "trade_refund_completed",
            tradeId: payload.tradeId,
          },
        },
        { priority: 3 },
      );
    }
  }

  /**
   * Emit reservation.expired event — sent to buyer whose order timed out.
   */
  async emitReservationExpired(payload: {
    orderId: string;
    orderNumber: string;
    buyerId: string;
    productTitle: string;
  }): Promise<void> {
    this.logger.log(
      `Emitting reservation.expired for order ${payload.orderNumber}`,
    );

    await this.pushQueue.add(
      "send-notification",
      {
        userId: payload.buyerId,
        title: "Sipariş Süresi Doldu",
        body: `${payload.productTitle} siparişinizin ödeme süresi doldu ve iptal edildi.`,
        data: {
          type: "reservation_expired",
          orderId: payload.orderId,
          orderNumber: payload.orderNumber,
        },
      },
      { priority: 3 },
    );
  }

  /**
   * Queue email for sending (public helper method)
   */
  async queueEmail(data: {
    to: string;
    template: string;
    subject: string;
    templateData?: Record<string, any>;
    overrideHtml?: string;
    overrideSubject?: string;
  }): Promise<void> {
    await this.emailQueue.add(
      "send-template",
      {
        to: data.to,
        template: data.template,
        subject: data.subject,
        templateData: data.templateData || {},
        overrideHtml: data.overrideHtml,
        overrideSubject: data.overrideSubject,
      },
      {
        priority: 2,
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
      },
    );
  }

  /**
   * Emit admin broadcast notification
   */
  async emitAdminBroadcast(payload: AdminBroadcastPayload): Promise<void> {
    this.logger.log(
      `Emitting admin broadcast to ${payload.userIds.length} users`,
    );

    // Fetch user details in chunks
    const chunkSize = 100;
    for (let i = 0; i < payload.userIds.length; i += chunkSize) {
      const chunkIds = payload.userIds.slice(i, i + chunkSize);

      const users = await this.prisma.user.findMany({
        where: { id: { in: chunkIds }, isBanned: false },
        select: {
          id: true,
          email: true,
          // Only need to know whether the user has at least one active device
          // token (push_tokens table) to decide whether to queue a push job.
          pushTokens: {
            where: { isActive: true },
            select: { id: true },
            take: 1,
          },
        },
      });

      for (const user of users) {
        // Send email if requested
        if (payload.channels.includes("email")) {
          const title = escapeEmailHtml(payload.title);
          const body = escapeEmailHtml(payload.body).replace(/\n/g, "<br>");
          await this.emailQueue.add("send", {
            to: user.email,
            subject: payload.title,
            html: wrapEmailTemplateLayout(
              `
                <h2 style="font-size: 24px; line-height: 1.3; color: #27272a; margin: 0 0 18px;">${title}</h2>
                <p style="font-size: 15px; line-height: 1.7; color: #52525b; margin: 0;">${body}</p>
              `,
              payload.title,
              { to: user.email },
            ),
          });
        }

        // Send push if requested and the user has at least one active device token
        if (payload.channels.includes("push") && user.pushTokens.length > 0) {
          await this.pushQueue.add("send-notification", {
            userId: user.id,
            title: payload.title,
            body: payload.body,
            data: {
              ...payload.data,
              type: "admin_broadcast",
            },
          });
        }
      }
    }
  }
}
