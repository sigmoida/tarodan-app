/**
 * Notification Commerce Notifiers
 * Order / offer / trade / back-in-stock domain wrappers. Each builds a payload
 * and delegates delivery to the shared NotificationDispatchService engine.
 */
import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma";
import { NotificationType, NotificationChannel } from "./dto";
import type { NotificationAudience } from "./helpers/notification-link";
import { orderBuyerContact } from "./helpers/order-buyer-contact";
import {
  ALL_ORDER_CANCEL_PARTIES,
  type OrderCancelNoticeParty,
} from "./helpers/order-cancel-notice";
import { formatNotificationDeadline } from "./helpers/notification-deadline";
import { StorageService } from "../storage/storage.service";
import { NotificationDispatchService } from "./notification-dispatch.service";
import { frontendUrl as resolveFrontendUrl } from "../../config/app-urls";
import { ORDER_CANCEL_REASON } from "../order/helpers/order-cancel-reasons";
import { adminCancelReasonLabel } from "../order/helpers/admin-cancel-reason";
import {
  ADMIN_CANCEL_REASON_I18N_KEYS,
  type AdminCancelReasonCode,
} from "@tarodan/types";
import { TRADE_CANCEL_REASON } from "../trade/helpers/trade-cancel-reasons";
import { errorMessage } from "../../common/helpers/error-message";

/** Alıcı e-postasını çözmek için okunan alanlar (`orderBuyerContact`). */
const ORDER_BUYER_SELECT = {
  shippingAddress: true,
  buyer: { select: { email: true, displayName: true } },
} as const satisfies Prisma.OrderSelect;

@Injectable()
export class NotificationCommerceService {
  private readonly logger = new Logger(NotificationCommerceService.name);

  constructor(
    private readonly dispatch: NotificationDispatchService,
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Send order notification
   */
  async notifyOrderCreated(buyerId: string, orderId: string, amount: number) {
    await this.dispatch.send({
      userId: buyerId,
      type: NotificationType.ORDER_CREATED,
      channels: [NotificationChannel.IN_APP],
      data: { orderId, amount },
    });
    // Template email — fetch order details for rich content
    const [user, order] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: buyerId },
        select: { displayName: true },
      }),
      this.prisma.order.findUnique({
        where: { id: orderId },
        select: {
          orderNumber: true,
          totalAmount: true,
          product: { select: { title: true } },
        },
      }),
    ]);
    await this.dispatch.sendTemplateEmailToUser(
      buyerId,
      "order-created-buyer",
      {
        buyerName: user?.displayName || "",
        orderNumber: order?.orderNumber || "",
        productTitle: order?.product?.title || "",
        totalAmount: order?.totalAmount ? Number(order.totalAmount) : amount,
        orderId,
      },
    );
  }

  async notifyOrderPaid(sellerId: string, orderId: string, amount: number) {
    return this.dispatch.send({
      userId: sellerId,
      type: NotificationType.ORDER_PAID,
      channels: [NotificationChannel.IN_APP],
      // SATICIYA gider: hedef ekran satıcının sipariş sayfası.
      data: { orderId, amount, audience: "seller" },
    });
  }

  async notifyOrderShipped(
    buyerId: string,
    orderId: string,
    trackingNumber: string,
  ) {
    return this.dispatch.send({
      userId: buyerId,
      type: NotificationType.ORDER_SHIPPED,
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      data: { orderId, trackingNumber },
    });
  }

  /**
   * Teslim bildirimi (alıcıya). 48 saatlik onay penceresi KAPALIYKEN tek
   * teslim sinyali budur: iade hakkının ve satıcı ödeme saatinin başladığı an.
   */
  async notifyOrderDelivered(buyerId: string, orderId: string) {
    return this.dispatch.send({
      userId: buyerId,
      type: NotificationType.ORDER_DELIVERED,
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      data: { orderId },
    });
  }

  async notifyOrderDeliveredConfirm(
    buyerId: string,
    orderId: string,
    confirmationDeadline: Date,
  ) {
    return this.dispatch.send({
      userId: buyerId,
      type: NotificationType.ORDER_DELIVERED_CONFIRM,
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      data: {
        orderId,
        confirmationDeadline: confirmationDeadline.toISOString(),
      },
    });
  }

  /** Hem alıcıya hem satıcıya gider; hedef ekran `audience` ile ayrılır. */
  async notifyOrderAutoCompleted(
    userId: string,
    orderId: string,
    audience: NotificationAudience,
  ) {
    return this.dispatch.send({
      userId,
      type: NotificationType.ORDER_AUTO_COMPLETED,
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      data: { orderId, audience },
    });
  }

  /**
   * Kusursuz iadede/satıcı-kaynaklı iptalde kupon hakkı geri verildi. Kod mesajın
   * içinde taşınır (kişisel voucher ya da paylaşılan kampanya kodu). TRANSACTION
   * COMMIT olduktan sonra çağrılmalıdır.
   */
  async notifyCouponReturned(userId: string, code: string) {
    return this.dispatch.send({
      userId,
      type: NotificationType.COUPON_RETURNED,
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      data: { code },
    });
  }

  async notifyOrderManuallyConfirmed(sellerId: string, orderId: string) {
    return this.dispatch.send({
      userId: sellerId,
      type: NotificationType.ORDER_MANUALLY_CONFIRMED,
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      // SATICIYA gider.
      data: { orderId, audience: "seller" },
    });
  }

  async notifySellerDidNotShipRefunded(buyerId: string, orderId: string) {
    await this.dispatch.send({
      userId: buyerId,
      type: NotificationType.SELLER_DID_NOT_SHIP_REFUNDED,
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      data: { orderId },
    });
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { orderNumber: true, totalAmount: true, ...ORDER_BUYER_SELECT },
    });
    if (!order) return;
    // Misafir siparişinde e-posta GERÇEK alıcıya gider (orderBuyerContact).
    await this.sendOrderBuyerEmail(order, "seller-did-not-ship-refunded", {
      orderNumber: order.orderNumber || orderId,
      orderId,
      refundAmount: order.totalAmount ? Number(order.totalAmount) : 0,
    });
  }

  /**
   * Hazırlık süresi bir kez uzatıldı — ALICIYA: gecikme, en geç kargo tarihi
   * ve kargodan önce iptal hakkının sürdüğü. Zil + push alıcı hesabına;
   * e-posta `orderBuyerContact` ile GERÇEK alıcıya (misafir siparişinde ortak
   * sistem hesabının zili kimseye ulaşmaz, tek kanal e-postadır).
   * `deadline` bildirim metniyle aynı biçimde (Türkiye saati) gelir.
   */
  async notifyPreparingExtendedBuyer(
    orderId: string,
    data: {
      orderNumber: string;
      productTitle: string;
      deadline: string;
    },
  ): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { buyerId: true, ...ORDER_BUYER_SELECT },
    });
    if (!order) return;
    // Zil hatası e-postayı engellemesin: misafirin tek kanalı e-postadır.
    await this.dispatch
      .createInAppNotification(
        order.buyerId,
        NotificationType.ORDER_PREPARING_EXTENDED,
        { orderId, ...data, audience: "buyer" },
      )
      .catch((error: unknown) =>
        this.logger.warn(
          `preparing-extended in-app failed for ${orderId}: ${errorMessage(error)}`,
        ),
      );
    await this.sendOrderBuyerEmail(order, "order-preparing-extended-buyer", {
      orderId,
      ...data,
    });
  }

  /**
   * Siparişin ALICISINA şablon e-postası. Adres ve hitap `orderBuyerContact`
   * ile çözülür: üyede hesap adresi, misafirde teslimat verisindeki gerçek
   * adres. Kullanıcı kaydına gönderim (`sendTemplateEmailToUser`) misafir
   * siparişinde sistem adresine gidiyordu. Adres yoksa gönderilmez; asla
   * throw etmez.
   */
  private async sendOrderBuyerEmail(
    order: {
      buyer: { email: string | null; displayName: string | null } | null;
      shippingAddress: unknown;
    },
    templateKey: string,
    templateData: Record<string, unknown>,
  ): Promise<void> {
    const contact = orderBuyerContact(order);
    if (!contact.email) {
      this.logger.warn(
        `${templateKey}: alıcı e-posta adresi yok (misafir=${contact.isGuest}) — gönderilmedi`,
      );
      return;
    }
    await this.dispatch.sendTemplateEmailToAddress(contact.email, templateKey, {
      ...templateData,
      name: contact.name,
      buyerName: contact.name,
      // Şablon misafirde "siparişi gör" linkini sipariş takip sayfasına kurar.
      isGuestOrder: contact.isGuest,
      buyerEmail: contact.email,
    });
  }

  /**
   * Send offer notification
   */
  async notifyOfferReceived(
    sellerId: string,
    productId: string,
    amount: number,
  ) {
    return this.dispatch.send({
      userId: sellerId,
      type: NotificationType.OFFER_RECEIVED,
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      data: { productId, amount },
    });
  }

  /**
   * Teklif kabul edildi → ALICI'ya. 24 saatlik ödeme penceresi bu bildirimle
   * duyurulur; hedef ilan değil ödenecek SİPARİŞTİR, bu yüzden `orderId` taşınır.
   *
   * `offerId` de taşınır: aynı olay event.service üzerinden push kuyruğuna da
   * gider ve push worker'ın 60 dk mükerrer filtresi anahtarı ÖNCE `offerId`dan
   * türetir. Bu satır offerId taşımazsa filtre tutmaz → çift zil + çift push.
   */
  async notifyOfferAccepted(
    buyerId: string,
    productId: string,
    amount: number,
    orderId?: string,
    productTitle?: string,
    offerId?: string,
  ) {
    return this.dispatch.send({
      userId: buyerId,
      type: NotificationType.OFFER_ACCEPTED,
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      data: { productId, amount, orderId, productTitle, offerId },
    });
  }

  /**
   * Karşı teklifi ALICI kabul etti → SATICI'ya. Satıcı, kendi verdiği karşı
   * teklifin bağlandığını ve karşı tarafın ödeme penceresine girdiğini görür.
   */
  async notifyOfferCounterAccepted(
    sellerId: string,
    productId: string,
    amount: number,
    orderId?: string,
    productTitle?: string,
  ) {
    return this.dispatch.send({
      userId: sellerId,
      type: NotificationType.OFFER_COUNTER_ACCEPTED,
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      data: { productId, amount, orderId, productTitle },
    });
  }

  /** Süresi dolan teklif → iki tarafa da (alıcı: kendi teklifi, satıcı: gelen teklif). */
  async notifyOfferExpired(params: {
    buyerId: string;
    sellerId: string;
    productId: string;
    productTitle: string;
  }) {
    const data = {
      productId: params.productId,
      productTitle: params.productTitle,
    };
    await this.dispatch.send({
      userId: params.buyerId,
      type: NotificationType.OFFER_EXPIRED,
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      data,
    });
    await this.dispatch.send({
      userId: params.sellerId,
      type: NotificationType.OFFER_EXPIRED_SELLER,
      channels: [NotificationChannel.IN_APP],
      data,
    });
  }

  /**
   * Teklif süresi bir kez uzatıldı (extend_once) → yalnız SIRASI GELEN tarafa
   * (satıcı: gelen teklif, alıcı: satıcının karşı teklifi). Yeni bitiş anı metinde.
   */
  async notifyOfferExtended(params: {
    recipientId: string;
    audience: NotificationAudience;
    offerId: string;
    productId: string;
    productTitle: string;
    until: Date;
  }) {
    await this.dispatch.send({
      userId: params.recipientId,
      type: NotificationType.OFFER_EXTENDED,
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      data: {
        offerId: params.offerId,
        productId: params.productId,
        productTitle: params.productTitle,
        audience: params.audience,
        until: formatNotificationDeadline(params.until),
        untilAt: params.until.toISOString(),
      },
    });
  }

  /**
   * Stockout cancel + back-in-stock bildirimleri için ortak data payload'ı
   * üretir. Frontend `/products/unavailable/[productId]` sayfasında ek fetch
   * yapmadan thumbnail + kategori bilgisini render edebilsin diye burada
   * tek seferde toparlanır.
   */
  private async buildStockoutData(productId: string): Promise<{
    productId: string;
    productTitle: string;
    productImage: string | null;
    categoryId: string | null;
    categorySlug: string | null;
    categoryName: string | null;
  }> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        title: true,
        categoryId: true,
        category: { select: { slug: true, name: true } },
        images: {
          orderBy: { sortOrder: "asc" },
          take: 1,
          select: { cardKey: true },
        },
      },
    });
    const cardKey = product?.images[0]?.cardKey ?? null;
    return {
      productId,
      productTitle: product?.title ?? "",
      // Resolve to a public URL — clients (notification bell, unavailable
      // page) can render <img src=...> directly. Without this, they'd get
      // a raw S3 key like "products/abc/card.jpg" which won't load.
      productImage: cardKey
        ? this.storageService.getPublicAssetUrl(cardKey)
        : null,
      categoryId: product?.categoryId ?? null,
      categorySlug: product?.category?.slug ?? null,
      categoryName: product?.category?.name ?? null,
    };
  }

  async notifyOrderCancelledOutOfStock(
    buyerId: string,
    productId: string,
    _productTitle: string,
    _categoryId: string | null,
  ) {
    const data = await this.buildStockoutData(productId);
    return this.dispatch.send({
      userId: buyerId,
      type: NotificationType.ORDER_CANCELLED_OUT_OF_STOCK,
      data,
    });
  }

  async notifyOfferCancelledOutOfStock(
    buyerId: string,
    productId: string,
    _productTitle: string,
    _categoryId: string | null,
  ) {
    const data = await this.buildStockoutData(productId);
    return this.dispatch.send({
      userId: buyerId,
      type: NotificationType.OFFER_CANCELLED_OUT_OF_STOCK,
      channels: [NotificationChannel.IN_APP, NotificationChannel.PUSH],
      data,
    });
  }

  /** Yönetici iptali: alıcıya VE satıcıya, gerekçeyle. */
  async notifyOfferCancelledByAdmin(
    userId: string,
    data: {
      offerId: string;
      productId: string;
      productTitle: string;
      reason: string;
    },
  ) {
    return this.dispatch.send({
      userId,
      type: NotificationType.OFFER_CANCELLED_BY_ADMIN,
      channels: [NotificationChannel.IN_APP, NotificationChannel.PUSH],
      data,
    });
  }

  /**
   * İlan satıcı tarafından silinince kapanan teklif — stok bitişinden AYRI
   * metin: eskiden OUT_OF_STOCK şablonu gidiyor, alıcı "ürün satıldığı için
   * iptal edildi" okuyordu (ilan silinmişken).
   */
  async notifyOfferCancelledListingRemoved(buyerId: string, productId: string) {
    const data = await this.buildStockoutData(productId);
    return this.dispatch.send({
      userId: buyerId,
      type: NotificationType.OFFER_CANCELLED_LISTING_REMOVED,
      channels: [NotificationChannel.IN_APP, NotificationChannel.PUSH],
      data,
    });
  }

  async notifyReservationReleased(
    buyerId: string,
    orderId: string,
    productTitle: string,
  ) {
    return this.dispatch.send({
      userId: buyerId,
      type: NotificationType.ORDER_RESERVATION_RELEASED,
      channels: [NotificationChannel.IN_APP, NotificationChannel.PUSH],
      data: { orderId, productTitle },
    });
  }

  /**
   * 24 saatlik ödeme penceresi doldu → alıcıya.
   *
   * Teklif kaynaklı siparişte mesaj FARKLIDIR: teklif `payment_expired` olur ve
   * alıcı `POST /orders/:id/reactivate` ile taze bir pencere açabilir. Eskiden
   * her iki durumda da genel "siparişiniz iptal edildi" bildirimi gidiyordu;
   * yeniden açma hakkı kullanıcıya hiçbir yerde söylenmiyordu.
   */
  async notifyOrderPaymentExpired(
    buyerId: string,
    orderId: string,
    productTitle: string,
    fromOffer = false,
  ) {
    return this.dispatch.send({
      userId: buyerId,
      type: fromOffer
        ? NotificationType.OFFER_PAYMENT_EXPIRED
        : NotificationType.ORDER_CANCELLED,
      data: { orderId, productTitle },
    });
  }

  /**
   * Kargo öncesi İPTAL duyurusu. Para iade ediliyor ama kullanıcıya "iade"
   * değil "iptal" denir: alıcıya ORDER_CANCELLED (iade tutarıyla), satıcıya
   * ORDER_CANCELLED_SELLER ("kargoya vermeyin") + her birine iptal e-postası
   * (gerekçe `Order.cancelReason`'dan). processRefund'ın iptal dalı, alıcı
   * iptali (yalnız satıcıya) ve platform iptali (ikisine) bu tek tanımı
   * kullanır; kime gideceğini çağıran söyler.
   */
  async notifyOrderCancelledParties(
    order: {
      id: string;
      orderNumber: string;
      buyerId: string;
      sellerId: string;
    },
    refundAmount: number,
    parties: readonly OrderCancelNoticeParty[] = ALL_ORDER_CANCEL_PARTIES,
  ): Promise<void> {
    if (parties.includes("buyer")) {
      await this.dispatch.createInAppNotification(
        order.buyerId,
        NotificationType.ORDER_CANCELLED,
        {
          orderId: order.id,
          orderNumber: order.orderNumber,
          amount: refundAmount,
        },
      );
    }
    if (parties.includes("seller")) {
      await this.dispatch.createInAppNotification(
        order.sellerId,
        NotificationType.ORDER_CANCELLED_SELLER,
        { orderId: order.id, orderNumber: order.orderNumber },
      );
    }
    await this.sendOrderCancelledEmails(order.id, parties);
  }

  /**
   * Yönetici (platform) iptalinin duyurusu — iptalin HER türü (ödenmemiş,
   * kargo öncesi ödenmiş, teklif siparişi) için TEK tanım; çağıran
   * AdminOrderCancelService'tir ve çekirdekler bu iptalde kendi genel iptal
   * duyurularını göndermez. Her taraf bir zil (+push) ve bir e-posta alır:
   * - Alıcı: ORDER_CANCELLED_BY_PLATFORM + `order-cancelled-by-platform-buyer`.
   *   Misafir siparişinde zil gönderilmez (alıcı ortak sistem hesabıdır, zili
   *   kimseye ulaşmaz); e-posta `orderBuyerContact` ile GERÇEK misafire gider.
   * - Satıcı: ORDER_CANCELLED_BY_PLATFORM_SELLER + `…-seller` e-postası.
   *
   * Metinler "Tarodan iptal etti" der, nedenin KATALOG ETİKETİNİ ve (ödenmiş
   * siparişte) iade tutarını taşır. Yöneticinin iç notu bu metoda hiç
   * gelmez. Bir kanalın hatası diğerlerini engellemez; asla throw etmez.
   *
   * @param refundAmount Alıcıya iade edilen tutar; ödeme alınmamışsa null.
   */
  async notifyOrderCancelledByPlatform(input: {
    orderId: string;
    reasonCode: AdminCancelReasonCode;
    refundAmount: number | null;
  }): Promise<void> {
    const order = await this.prisma.order
      .findUnique({
        where: { id: input.orderId },
        select: {
          id: true,
          orderNumber: true,
          buyerId: true,
          sellerId: true,
          product: { select: { title: true } },
          seller: { select: { displayName: true } },
          ...ORDER_BUYER_SELECT,
        },
      })
      .catch((err: unknown) => {
        this.logger.warn(
          `platform-cancel notice: order ${input.orderId} okunamadı: ${errorMessage(err)}`,
        );
        return null;
      });
    if (!order) return;

    const paid = input.refundAmount !== null;
    const productTitle = order.product?.title ?? "";
    // Bildirim verisine dile bağlı metin değil katalog ANAHTARI yazılır;
    // şablon (`localizedValues`) her alıcının dilinde çevirir.
    const inAppData = {
      orderId: order.id,
      orderNumber: order.orderNumber,
      productTitle,
      reasonCode: input.reasonCode,
      reasonKey: ADMIN_CANCEL_REASON_I18N_KEYS[input.reasonCode],
      paid: paid ? "yes" : "no",
      amount: input.refundAmount ?? 0,
    };
    // E-posta şablonları Türkçedir: etiket varsayılan dilde.
    const emailData = {
      orderNumber: order.orderNumber,
      orderId: order.id,
      productTitle,
      reason: adminCancelReasonLabel(input.reasonCode),
      paid,
      ...(paid ? { refundAmount: input.refundAmount } : {}),
    };

    const buyer = orderBuyerContact(order);
    if (!buyer.isGuest) {
      await this.safeInApp(
        order.buyerId,
        NotificationType.ORDER_CANCELLED_BY_PLATFORM,
        inAppData,
      );
    }
    await this.sendOrderBuyerEmail(
      order,
      "order-cancelled-by-platform-buyer",
      emailData,
    );

    await this.safeInApp(
      order.sellerId,
      NotificationType.ORDER_CANCELLED_BY_PLATFORM_SELLER,
      { ...inAppData, audience: "seller" },
    );
    await this.dispatch.sendTemplateEmailToUser(
      order.sellerId,
      "order-cancelled-by-platform-seller",
      { ...emailData, sellerName: order.seller?.displayName ?? "" },
    );
  }

  /** Zil (+push) — hatası aynı duyurunun diğer kanallarını engellemez. */
  private async safeInApp(
    userId: string,
    type: NotificationType,
    data: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.dispatch.createInAppNotification(userId, type, data);
    } catch (err: unknown) {
      this.logger.warn(`${type} → ${userId} failed: ${errorMessage(err)}`);
    }
  }

  /**
   * Sipariş iptali e-postaları: alıcıya `order-cancelled-buyer`, satıcıya
   * `order-cancelled-seller`. Stokout oto-iptal ve ödeme-süresi-doldu
   * senaryolarında çağrılır (in-app/push bildirimler ayrıca gönderilir; bu
   * metod yalnız e-posta fan-out'u yapar). Bu senaryolarda alıcıdan ücret
   * tahsil edilmediği için refundAmount geçilmez. Asla throw etmez.
   */
  async sendOrderCancelledEmails(
    orderId: string,
    parties: readonly OrderCancelNoticeParty[] = ALL_ORDER_CANCEL_PARTIES,
  ): Promise<void> {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          orderNumber: true,
          cancelReason: true,
          buyerId: true,
          sellerId: true,
          product: { select: { title: true } },
          seller: { select: { displayName: true } },
          ...ORDER_BUYER_SELECT,
        },
      });
      if (!order) return;
      const reason = order.cancelReason ?? undefined;
      const productTitle = order.product?.title ?? "";

      if (parties.includes("buyer")) {
        // Misafir siparişinde GERÇEK alıcıya (orderBuyerContact).
        await this.sendOrderBuyerEmail(order, "order-cancelled-buyer", {
          orderNumber: order.orderNumber,
          orderId: order.id,
          productTitle,
          reason,
        });
      }

      if (order.sellerId && parties.includes("seller")) {
        await this.dispatch.sendTemplateEmailToUser(
          order.sellerId,
          "order-cancelled-seller",
          {
            sellerName: order.seller?.displayName ?? "",
            orderNumber: order.orderNumber,
            orderId: order.id,
            productTitle,
            reason,
          },
        );
      }
    } catch (err: any) {
      this.logger.warn(
        `sendOrderCancelledEmails failed for order ${orderId}: ${err?.message}`,
      );
    }
  }

  /**
   * Fan-out helper: send BACK_IN_STOCK to wishlist users ∪ stockout-cancelled
   * buyers (last 7 days). 24h per (user, product) debounce.
   *
   * Caller should only invoke this when product availability transitions
   * from <=0 to >0 (admin restock, refund, payment failure release).
   */
  async broadcastBackInStock(
    productId: string,
    productTitle: string,
  ): Promise<void> {
    const SEVEN_DAYS_AGO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const STOCKOUT_REASONS = [
      ORDER_CANCEL_REASON.stockDepleted,
      TRADE_CANCEL_REASON.stockDepleted,
    ];

    const [wishlistItems, cancelledOrders, cancelledOffers] = await Promise.all(
      [
        this.prisma.wishlistItem.findMany({
          where: { productId },
          include: { wishlist: { select: { userId: true } } },
        }),
        this.prisma.order.findMany({
          where: {
            productId,
            status: "cancelled" as any,
            cancelReason: { in: STOCKOUT_REASONS },
            updatedAt: { gte: SEVEN_DAYS_AGO },
          },
          select: { buyerId: true },
        }),
        this.prisma.offer.findMany({
          where: {
            productId,
            status: "cancelled" as any,
            cancelReason: { in: STOCKOUT_REASONS },
            updatedAt: { gte: SEVEN_DAYS_AGO },
          },
          select: { buyerId: true },
        }),
      ],
    );

    const userIds = Array.from(
      new Set(
        [
          ...wishlistItems.map((w) => w.wishlist.userId),
          ...cancelledOrders.map((o) => o.buyerId),
          ...cancelledOffers.map((o) => o.buyerId),
        ].filter(Boolean),
      ),
    );
    if (userIds.length === 0) return;

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await this.prisma.notificationLog.findMany({
      where: {
        userId: { in: userIds },
        type: NotificationType.BACK_IN_STOCK as any,
        channel: "in_app",
        createdAt: { gte: since },
      },
      select: { userId: true, data: true },
    });
    const debounced = new Set(
      recent
        .filter((row) => (row.data as any)?.productId === productId)
        .map((row) => row.userId),
    );

    for (const userId of userIds) {
      if (debounced.has(userId)) continue;
      try {
        await this.notifyBackInStock(userId, productId, productTitle);
      } catch (err: any) {
        this.logger.warn(
          `broadcastBackInStock failed for user ${userId} product ${productId}: ${err?.message}`,
        );
      }
    }
  }

  async notifyBackInStock(
    userId: string,
    productId: string,
    _productTitle: string,
  ) {
    // Enrich payload (productImage, categorySlug, ...) so the notification
    // bell can render a thumbnail and the click-through can land on the
    // unavailable-page back-in-stock variant without an extra fetch.
    const data = await this.buildStockoutData(productId);
    const result = await this.dispatch.send({
      userId,
      type: NotificationType.BACK_IN_STOCK,
      data,
    });
    // "Stoğa geri geldi" e-postası — in-app/push'un yanında markalı mail.
    const frontendUrl = resolveFrontendUrl();
    await this.dispatch.sendTemplateEmailToUser(userId, "back-in-stock", {
      productTitle: data.productTitle,
      // Ürün detayının gerçek yolu `/listings/:id`; `/products/:id` 404'tü.
      productUrl: `${frontendUrl}/listings/${encodeURIComponent(productId)}`,
    });
    return result;
  }

  /**
   * Send trade notifications
   */
  async notifyTradeReceived(receiverId: string, tradeId: string) {
    await this.dispatch.send({
      userId: receiverId,
      type: NotificationType.TRADE_RECEIVED,
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      data: { tradeId },
    });
    const frontendUrl = resolveFrontendUrl();
    const user = await this.prisma.user.findUnique({
      where: { id: receiverId },
      select: { displayName: true },
    });
    await this.dispatch.sendTemplateEmailToUser(receiverId, "trade-received", {
      name: user?.displayName || "",
      tradeId,
      tradeUrl: `${frontendUrl}/profile/trades/${tradeId}`,
    });
  }

  async notifyTradeAccepted(initiatorId: string, tradeId: string) {
    await this.dispatch.send({
      userId: initiatorId,
      type: NotificationType.TRADE_ACCEPTED,
      channels: [
        NotificationChannel.PUSH,
        NotificationChannel.IN_APP,
        NotificationChannel.SMS,
      ],
      data: { tradeId },
    });
    const frontendUrl = resolveFrontendUrl();
    const user = await this.prisma.user.findUnique({
      where: { id: initiatorId },
      select: { displayName: true },
    });
    await this.dispatch.sendTemplateEmailToUser(initiatorId, "trade-accepted", {
      name: user?.displayName || "",
      tradeId,
      tradeUrl: `${frontendUrl}/profile/trades/${tradeId}`,
    });
  }

  async notifyTradeShipped(
    receiverId: string,
    tradeId: string,
    trackingNumber: string,
  ) {
    await this.dispatch.send({
      userId: receiverId,
      type: NotificationType.TRADE_SHIPPED,
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      data: { tradeId, trackingNumber },
    });
    const frontendUrl = resolveFrontendUrl();
    const user = await this.prisma.user.findUnique({
      where: { id: receiverId },
      select: { displayName: true },
    });
    await this.dispatch.sendTemplateEmailToUser(receiverId, "trade-shipped", {
      name: user?.displayName || "",
      trackingNumber,
      tradeId,
      tradeUrl: `${frontendUrl}/profile/trades/${tradeId}`,
    });
  }

  async notifyTradeCompleted(userId: string, tradeId: string) {
    await this.dispatch.send({
      userId,
      type: NotificationType.TRADE_COMPLETED,
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      data: { tradeId },
    });
    const frontendUrl = resolveFrontendUrl();
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true },
    });
    await this.dispatch.sendTemplateEmailToUser(userId, "trade-completed", {
      name: user?.displayName || "",
      tradeId,
      tradeUrl: `${frontendUrl}/profile/trades/${tradeId}`,
    });
  }
}
