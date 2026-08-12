/**
 * Notification Commerce Notifiers
 * Order / offer / trade / back-in-stock domain wrappers. Each builds a payload
 * and delegates delivery to the shared NotificationDispatchService engine.
 */
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma";
import { NotificationType, NotificationChannel } from "./dto";
import type { NotificationAudience } from "./notification-link";
import { StorageService } from "../storage/storage.service";
import { NotificationDispatchService } from "./notification-dispatch.service";

@Injectable()
export class NotificationCommerceService {
  private readonly logger = new Logger(NotificationCommerceService.name);

  constructor(
    private readonly dispatch: NotificationDispatchService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
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

  /** Hem alıcıya hem satıcıya gider; hedef ekran `audience` ile ayrılır. */
  async notifyOrderForceCompletedByAdmin(
    userId: string,
    orderId: string,
    audience: NotificationAudience,
    reason?: string,
  ) {
    return this.dispatch.send({
      userId,
      type: NotificationType.ORDER_FORCE_COMPLETED_BY_ADMIN,
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      data: { orderId, reason, audience },
    });
  }

  async notifySellerDidNotShipRefunded(buyerId: string, orderId: string) {
    await this.dispatch.send({
      userId: buyerId,
      type: NotificationType.SELLER_DID_NOT_SHIP_REFUNDED,
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      data: { orderId },
    });
    const [user, order] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: buyerId },
        select: { displayName: true },
      }),
      this.prisma.order.findUnique({
        where: { id: orderId },
        select: { orderNumber: true, totalAmount: true },
      }),
    ]);
    await this.dispatch.sendTemplateEmailToUser(
      buyerId,
      "seller-did-not-ship-refunded",
      {
        name: user?.displayName || "",
        orderNumber: order?.orderNumber || orderId,
        orderId,
        refundAmount: order?.totalAmount ? Number(order.totalAmount) : 0,
      },
    );
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
   */
  async notifyOfferAccepted(
    buyerId: string,
    productId: string,
    amount: number,
    orderId?: string,
    productTitle?: string,
  ) {
    return this.dispatch.send({
      userId: buyerId,
      type: NotificationType.OFFER_ACCEPTED,
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      data: { productId, amount, orderId, productTitle },
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
   * Sipariş iptali e-postaları: alıcıya `order-cancelled-buyer`, satıcıya
   * `order-cancelled-seller`. Stokout oto-iptal ve ödeme-süresi-doldu
   * senaryolarında çağrılır (in-app/push bildirimler ayrıca gönderilir; bu
   * metod yalnız e-posta fan-out'u yapar). Bu senaryolarda alıcıdan ücret
   * tahsil edilmediği için refundAmount geçilmez. Asla throw etmez.
   */
  async sendOrderCancelledEmails(orderId: string): Promise<void> {
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
          buyer: { select: { displayName: true } },
          seller: { select: { displayName: true } },
        },
      });
      if (!order) return;
      const reason = order.cancelReason ?? undefined;
      const productTitle = order.product?.title ?? "";

      await this.dispatch.sendTemplateEmailToUser(
        order.buyerId,
        "order-cancelled-buyer",
        {
          buyerName: order.buyer?.displayName ?? "",
          orderNumber: order.orderNumber,
          orderId: order.id,
          productTitle,
          reason,
        },
      );

      if (order.sellerId) {
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
      "Stok tükendi",
      "Stok tükendiği için otomatik iptal edildi",
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
    const frontendUrl =
      this.configService.get("FRONTEND_URL") || "https://tarodan.com.tr";
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
    const frontendUrl =
      this.configService.get("FRONTEND_URL") || "https://tarodan.com.tr";
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
    const frontendUrl =
      this.configService.get("FRONTEND_URL") || "https://tarodan.com.tr";
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
    const frontendUrl =
      this.configService.get("FRONTEND_URL") || "https://tarodan.com.tr";
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
    const frontendUrl =
      this.configService.get("FRONTEND_URL") || "https://tarodan.com.tr";
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
