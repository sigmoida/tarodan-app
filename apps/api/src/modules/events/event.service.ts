import { Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { QUEUE_NAMES } from "../../workers/constants";
import { PrismaService } from "../../prisma";
import {
  prepareBroadcastEmailContent,
  newsletterUnsubscribeUrl,
  renderBroadcastEmail,
} from "../../common/helpers/broadcast-email";
import { notificationEventCopy } from "../notification/helpers/notification-event-copy";
import { markBroadcastLogRows } from "../notification/helpers/broadcast-delivery";
import type { Prisma } from "@prisma/client";
import {
  audienceUserWhere,
  MARKETING_CONSENT_WHERE,
} from "../admin/ops/notification-audience";

/** `push` kuyruğundaki yönetici yayını dağıtım işinin adı. */
export const ADMIN_BROADCAST_JOB = "send-broadcast";

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
  /**
   * Temsilci sipariş id — bildirim hedefi için.
   *
   * Grup bildirimi tek bir siparişi göstermiyordu (`checkoutGroupId` var,
   * `orderId` yok) ve tıklanınca hedef üretilemiyordu. Sepette birden çok
   * sipariş var; hedef olarak ilki kullanılır, yoksa sipariş listesine düşülür.
   */
  representativeOrderId?: string;
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
  // The provider's own id is not always known yet: a refund is recorded
  // locally first and reconciled with the provider afterwards.
  providerRefundId?: string;
}

/**
 * Yayının hedefi — kullanıcı LİSTESİ değil, hedefleme kuralı. Alıcılar dağıtım
 * anında worker'da çözülür; `user_ids` yalnız yöneticinin açıkça seçtiği
 * kimliklerdir.
 */
export interface AdminBroadcastTarget {
  targetType: "all" | "segment" | "user_ids";
  userIds?: string[];
  segmentCriteria?: Record<string, unknown> | null;
}

/**
 * `send-broadcast` iş verisi (Redis'e yazılır). Hassas veri TAŞIMAZ: tam
 * kullanıcı listesi ve abonelikten çıkış token'ları yoktur — ikisi de dağıtım
 * anında veritabanından çözülür.
 */
export interface AdminBroadcastJobData {
  /** Teslim izleme satırlarını (`data.broadcastId`) eşler; kişi başı iş kimliği. */
  broadcastId: string;
  title: string;
  body: string;
  channels: string[];
  data?: Record<string, unknown>;
  /** E-postaya özel konu / HTML (opsiyonel); yoksa e-posta push metninden üretilir. */
  emailSubject?: string | null;
  emailHtml?: string | null;
  /**
   * Pazarlama yayını: yalnız izinli kullanıcılara gider; e-posta yalnız çıkış
   * token'ı olan (çıkmamış) üyelere, kendi çıkış linki + `List-Unsubscribe` ile.
   */
  isMarketing: boolean;
  target: AdminBroadcastTarget;
  /** Zamanlanmış gönderimse satırın kimliği: dağıtım bitince durumu yazılır. */
  scheduledNotificationId?: string;
}

/** İstekten gelen yayın — iş verisiyle aynı (alıcılar worker'da çözülür). */
export type AdminBroadcastPayload = AdminBroadcastJobData;

/** Dağıtımın kaldığı yer + o ana dek birikmiş sayaçlar (`job.progress`). */
export interface AdminBroadcastProgress {
  lastUserId: string | null;
  users: number;
  pushQueued: number;
  emailsQueued: number;
}

/** Kişi başı yayın işlerinin kimlik ömrü: yeniden denenen parça çift gönderemez. */
const BROADCAST_JOB_DEDUPE_RETENTION_S = 6 * 60 * 60;

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
          ...notificationEventCopy("orderPaidBuyer", {
            productTitle: payload.productTitle,
          }),
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
        ...notificationEventCopy("orderPaidSeller", {
          productTitle: payload.productTitle,
        }),
        data: {
          type: "payment_received",
          // SATICI ekranı (satış detayı). Eksikken mobil push dokunuşu alıcının
          // sipariş ekranını açıyordu.
          audience: "seller",
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
        ...notificationEventCopy("groupOrderPaidBuyer", {
          itemCount: payload.items.length,
        }),
        data: {
          type: "payment_confirmed",
          checkoutGroupId: payload.checkoutGroupId,
          groupNumber: payload.groupNumber,
          // Hedef: temsilci siparişin detayı. Yoksa link üretimi sipariş
          // listesine düşer — grup bildirimi hedefsiz kalmaz.
          orderId: payload.representativeOrderId,
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
        ...notificationEventCopy("offerReceived", {
          productTitle: payload.productTitle,
          amount: payload.offerAmount.toFixed(2),
        }),
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

    // Push + zil BURADAN gitmez: teklif kabulünü `OfferService.accept`
    // commit sonrası `notifyOfferAccepted` ile (alıcının dilinde, tek push)
    // duyurur. Burada da kuyruğa yazılınca alıcı İKİ push alıyordu (worker'ın
    // mükerrer filtresi yalnız zil satırını eliyordu).

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
        ...notificationEventCopy("paymentFailed", {
          orderNumber: payload.orderNumber,
        }),
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
        ...notificationEventCopy("paymentRefundedBuyer", {
          orderNumber: payload.orderNumber,
          amount: payload.refundAmount.toFixed(2),
        }),
        data: {
          type: "payment_refunded",
          // Alıcının kendi sipariş ekranı.
          audience: "buyer",
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
        ...notificationEventCopy("paymentRefundedSeller", {
          orderNumber: payload.orderNumber,
        }),
        data: {
          type: "payment_refunded",
          // Aynı sipariş, SATICI ekranı.
          audience: "seller",
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
        ...notificationEventCopy("offerAutoRejected", {
          productTitle: payload.productTitle,
          reason: payload.reason,
        }),
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
          ...notificationEventCopy("tradeAutoCancelled", {
            reason: payload.reason,
          }),
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
          ...notificationEventCopy("tradeReadyForShipping"),
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
          ...notificationEventCopy("tradeWarehouseApproved"),
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
          ...notificationEventCopy("tradeWarehouseRejected", {
            reason: payload.reason,
          }),
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
          ...notificationEventCopy("tradeCancelLocked"),
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
          ...notificationEventCopy("tradeReturnCompleted"),
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
        ...notificationEventCopy("tradeReturnLost"),
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
          ...notificationEventCopy("tradeRefundFailed"),
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
          ...notificationEventCopy("tradeRefundCompleted"),
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
        ...notificationEventCopy("reservationExpired", {
          productTitle: payload.productTitle,
        }),
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
   * Yönetici yayını: dağıtım (fan-out) HTTP isteğinde DEĞİL, worker'da yapılır.
   *
   * Eskiden bu metot her kullanıcı için ayrı sorgu + kuyruk yazımını istek
   * içinde yapıyordu; 10 bin kişilik bir duyuru yönetici isteğini dakikalarca
   * bekletiyor ve zaman aşımında yarım kalıyordu. Artık TEK bir `send-broadcast`
   * işi kuyruğa yazılır; worker `runAdminBroadcastFanout` ile dağıtır.
   * İş verisi yalnız hedefleme kuralını taşır (kullanıcı listesi ve çıkış
   * token'ları Redis'e yazılmaz). Worker çalışmıyorsa (`PROCESS_ROLE=web` tek
   * başına) iş Redis'te bekler — eskiden de kişi başı push/e-posta işleri
   * worker'ı bekliyordu, yeni bir bağımlılık eklenmez.
   */
  async emitAdminBroadcast(payload: AdminBroadcastPayload): Promise<void> {
    this.logger.log(
      `Queueing admin broadcast ${payload.broadcastId} (${payload.target.targetType})`,
    );
    const job: AdminBroadcastJobData = {
      broadcastId: payload.broadcastId,
      title: payload.title,
      body: payload.body,
      channels: payload.channels,
      data: payload.data,
      emailSubject: payload.emailSubject ?? null,
      emailHtml: payload.emailHtml ?? null,
      isMarketing: payload.isMarketing,
      target: payload.target,
      scheduledNotificationId: payload.scheduledNotificationId,
    };
    await this.pushQueue.add(ADMIN_BROADCAST_JOB, job, {
      attempts: 3,
      backoff: { type: "exponential", delay: 30_000 },
      removeOnComplete: true,
      // Başarısız iş sınırlı süre kalır (teşhis için), sonra silinir.
      removeOnFail: { age: 7 * 24 * 60 * 60 },
    });
  }

  /** Yayın alıcılarının filtresi (istekteki hedef çözümüyle aynı kural). */
  private broadcastRecipientWhere(
    payload: AdminBroadcastJobData,
  ): Prisma.UserWhereInput {
    const consent = payload.isMarketing ? MARKETING_CONSENT_WHERE : {};
    const { target } = payload;
    if (target.targetType === "user_ids") {
      return { id: { in: target.userIds ?? [] }, isBanned: false, ...consent };
    }
    return {
      ...audienceUserWhere(target.targetType, target.segmentCriteria ?? null),
      ...consent,
    };
  }

  /**
   * Yayının kişi başı dağıtımı (worker'da çalışır). Alıcılar kimlik sırasıyla
   * 100'lük parçalarla VERİTABANINDAN okunur; `resume` yeniden denemede
   * kalınan yerden ve birikmiş sayaçlarla sürer, `onChunkDone` ilerlemeyi
   * kaydeder. Kişi başı işlerin kimliği deterministiktir
   * (`<broadcastId>:<userId>:push|email`): yarıda kesilip yeniden denenen
   * parça aynı kişiye ikinci iş YAZAMAZ.
   *
   * Pazarlama e-postasının çıkış token'ları parça başına burada çözülür
   * (`resolveUnsubscribeTokens`) — iş verisinde tutulmaz.
   *
   * Teslim izleme: kişi başı push/e-posta işleri `broadcastId` taşır ve kendi
   * satırını sonuçtan günceller; cihazı olmayanın push satırı hemen "failed".
   */
  async runAdminBroadcastFanout(
    payload: AdminBroadcastJobData,
    opts: {
      resume?: AdminBroadcastProgress | null;
      onChunkDone?: (progress: AdminBroadcastProgress) => Promise<void>;
      resolveUnsubscribeTokens?: (
        userIds: string[],
      ) => Promise<Map<string, string>>;
    } = {},
  ): Promise<AdminBroadcastProgress> {
    const sendsEmail = payload.channels.includes("email");
    const sendsPush = payload.channels.includes("push");
    const { broadcastId } = payload;

    // Alıcıdan bağımsız e-posta içeriği (HTML süzme dahil) BİR kez hazırlanır.
    const emailContent = sendsEmail
      ? prepareBroadcastEmailContent({
          title: payload.title,
          body: payload.body,
          emailSubject: payload.emailSubject,
          emailHtml: payload.emailHtml,
        })
      : undefined;

    const progress: AdminBroadcastProgress = {
      lastUserId: opts.resume?.lastUserId ?? null,
      users: opts.resume?.users ?? 0,
      pushQueued: opts.resume?.pushQueued ?? 0,
      emailsQueued: opts.resume?.emailsQueued ?? 0,
    };
    const where = this.broadcastRecipientWhere(payload);
    const chunkSize = 100;
    const perUserJob = (userId: string, channel: "push" | "email") => ({
      jobId: `${broadcastId}:${userId}:${channel}`,
      removeOnComplete: { age: BROADCAST_JOB_DEDUPE_RETENTION_S },
    });

    for (;;) {
      const users = await this.prisma.user.findMany({
        where: progress.lastUserId
          ? { AND: [where, { id: { gt: progress.lastUserId } }] }
          : where,
        orderBy: { id: "asc" },
        take: chunkSize,
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
      if (users.length === 0) break;

      // Pazarlama: yalnız izni açık, çıkmamış üyelere e-posta (+ kendi çıkış linki).
      const tokens =
        sendsEmail && payload.isMarketing
          ? ((await opts.resolveUnsubscribeTokens?.(users.map((u) => u.id))) ??
            new Map<string, string>())
          : null;
      const noDevice: string[] = [];

      for (const user of users) {
        if (sendsEmail && emailContent) {
          const unsubscribeToken = tokens?.get(user.id);
          // Pazarlama: izni olmayan/çıkmış kullanıcıya e-posta GİTMEZ.
          if (!tokens || unsubscribeToken) {
            const unsubscribeUrl = unsubscribeToken
              ? newsletterUnsubscribeUrl(unsubscribeToken)
              : undefined;
            const email = renderBroadcastEmail(emailContent, {
              to: user.email,
              unsubscribeUrl,
            });
            await this.emailQueue.add(
              "send",
              {
                to: user.email,
                subject: email.subject,
                html: email.html,
                // Toplu duyuru/pazarlama: Mail Yönlendirme'de pazarlama kutusu.
                area: "marketing",
                ...(unsubscribeUrl && {
                  headers: {
                    "List-Unsubscribe": `<${unsubscribeUrl}>`,
                    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
                  },
                }),
                broadcastLog: { userId: user.id, broadcastId },
              },
              perUserJob(user.id, "email"),
            );
            progress.emailsQueued++;
          }
        }

        // Send push if requested and the user has at least one active device token
        if (sendsPush) {
          if (user.pushTokens.length === 0) {
            noDevice.push(user.id);
            continue;
          }
          await this.pushQueue.add(
            "send-notification",
            {
              userId: user.id,
              title: payload.title,
              body: payload.body,
              data: {
                ...payload.data,
                type: "admin_broadcast",
              },
              broadcastId,
            },
            perUserJob(user.id, "push"),
          );
          progress.pushQueued++;
        }
      }

      // Cihazı olmayanın push satırı: gönderim yapılmayacak, "pending"de kalmasın.
      await markBroadcastLogRows(this.prisma, {
        broadcastId,
        userIds: noDevice,
        channels: ["push"],
        delivered: false,
        error: "No active device",
      });

      progress.users += users.length;
      progress.lastUserId = users[users.length - 1]!.id;
      await opts.onChunkDone?.({ ...progress });
    }

    return progress;
  }
}
