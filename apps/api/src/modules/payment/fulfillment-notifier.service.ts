import { Injectable, Logger } from "@nestjs/common";
import { NotificationService } from "../notification/notification.service";

/** Stokout kaskadında iptal edilen bir sipariş (ödeme yapılmış veya kabul-edilmiş-teklif). */
export interface StockoutCancelledOrder {
  orderId: string;
  buyerId: string;
  productId: string;
  productTitle: string;
  offerId: string | null;
  hadPayment: boolean;
}

/** Stokout kaskadında iptal edilen (ödemesiz) bir teklif siparişi. */
export interface StockoutCancelledOffer {
  buyerId: string;
  productId: string;
  productTitle: string;
}

/**
 * FulfillmentNotifier (Faz 8.2) — ödeme başarısı sonrası POST-COMMIT bildirim
 * orkestrasyonu. Tekil ve grup fulfillment yollarında BİREBİR aynı olan stokout
 * kaskad bildirim üçlemesini tek yere alır (god-service dedup). Best-effort:
 * hatalar loglanır, ödemeyi/akışı BOZMAZ.
 */
@Injectable()
export class FulfillmentNotifier {
  private readonly logger = new Logger(FulfillmentNotifier.name);

  constructor(private readonly notificationService: NotificationService) {}

  /**
   * Stok tükenince iptal edilen sipariş/tekliflerin bildirimleri. Alıcı başına TEK
   * bildirim (kabul-edilmiş-ama-ödenmemiş teklif → "teklif iptal", aksi → "sipariş iptal").
   */
  async notifyStockoutCascade(input: {
    cancelledOrders: StockoutCancelledOrder[];
    cancelledOffers: StockoutCancelledOffer[];
    stockoutCategoryId: string | null;
  }): Promise<void> {
    const { cancelledOrders, cancelledOffers, stockoutCategoryId } = input;

    const notifiedBuyers = new Set<string>();
    for (const o of cancelledOrders) {
      if (notifiedBuyers.has(o.buyerId)) continue;
      notifiedBuyers.add(o.buyerId);
      const isUnpaidOffer = o.offerId !== null && !o.hadPayment;
      const notify = isUnpaidOffer
        ? this.notificationService.notifyOfferCancelledOutOfStock(
            o.buyerId,
            o.productId,
            o.productTitle,
            stockoutCategoryId,
          )
        : this.notificationService.notifyOrderCancelledOutOfStock(
            o.buyerId,
            o.productId,
            o.productTitle,
            stockoutCategoryId,
          );
      await notify.catch((err) =>
        this.logger.warn(
          `stockout-notify (${isUnpaidOffer ? "offer" : "order"}) failed for ${o.buyerId}: ${err.message}`,
        ),
      );
    }

    // Sipariş iptali e-postaları (alıcı+satıcı) — sipariş bazlı; teklif
    // iptallerini (isUnpaidOffer) ve mükerrer order'ları atla.
    const emailedCancelledOrders = new Set<string>();
    for (const o of cancelledOrders) {
      if (o.offerId !== null && !o.hadPayment) continue;
      if (emailedCancelledOrders.has(o.orderId)) continue;
      emailedCancelledOrders.add(o.orderId);
      await this.notificationService.sendOrderCancelledEmails(o.orderId);
    }

    for (const o of cancelledOffers) {
      if (notifiedBuyers.has(o.buyerId)) continue;
      notifiedBuyers.add(o.buyerId);
      await this.notificationService
        .notifyOfferCancelledOutOfStock(
          o.buyerId,
          o.productId,
          o.productTitle,
          stockoutCategoryId,
        )
        .catch((err) =>
          this.logger.warn(
            `stockout-notify (offer) failed for ${o.buyerId}: ${err.message}`,
          ),
        );
    }
  }

  /**
   * Ürün stok 0→>0 geçince wishlist "tekrar stokta" yayını (debounce 24s
   * NotificationService içinde). Ödeme başarısızlığında ürün serbest kalınca çağrılır.
   */
  async dispatchBackInStock(
    productId: string,
    productTitle: string,
  ): Promise<void> {
    return this.notificationService.broadcastBackInStock(
      productId,
      productTitle,
    );
  }
}
