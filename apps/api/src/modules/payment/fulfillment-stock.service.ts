import { Injectable, Logger } from "@nestjs/common";
import { Prisma, ProductStatus } from "@prisma/client";
import {
  getProductStatusFromQuantity,
  getReservedAwareStatus,
} from "../product/helpers/product-status.helper";
import { safeDecrementReserved } from "../product/helpers/product-availability.helper";
import { ProductLockService } from "../product/product-lock.service";
import {
  StockoutCancelledOrder,
  StockoutCancelledOffer,
} from "./fulfillment-notifier.service";

export interface StockoutResult {
  cancelledOrders: StockoutCancelledOrder[];
  cancelledOffers: StockoutCancelledOffer[];
  /** undefined = stok TÜKENMEDİ (categoryId'yi güncelleme). null/string = tükendi. */
  stockoutCategoryId?: string | null;
  /**
   * #5: Yakalama anında FİZİKSEL stok ödenen adetten AZSA (rezervasyon drift etti) set
   * edilir → çağıran otomatik iade / manuel inceleme başlatabilir. undefined = oversell yok.
   */
  oversold?: { productId: string; paidQty: number; physicalQty: number };
}

/**
 * FulfillmentStockService (Faz 8.2) — bir ödenmiş fiziksel siparişin stok düşümü +
 * stockout kaskadı. Tekil ve grup fulfillment yollarında BİREBİR aynı olan mantığı
 * tek yere alır (god-service dedup).
 *
 * KRİTİK (para/stok güvenliği): para tx'inin İÇİNDE çağrılır. Ürün satırı FOR UPDATE
 * ile kilitlenir; stok yetersizse fiziksel stok tüketilmeden rezervasyon bırakılır.
 * Stockout kaskadı yalnız FİZİKSEL stok (quantity<=0) gerçekten bitince tetiklenir —
 * available (quantity-reserved) ÜZERİNDEN DEĞİL (reserved başka alıcının geçerli
 * pending_payment siparişini de içerir; q-r üzerinden gate onları yanlışlıkla iptal ederdi).
 */
@Injectable()
export class FulfillmentStockService {
  private readonly logger = new Logger(FulfillmentStockService.name);

  constructor(private readonly productLockService: ProductLockService) {}

  async decrementForOrder(
    tx: Prisma.TransactionClient,
    productId: string,
    orderQty: number,
  ): Promise<StockoutResult> {
    // Ürün satırını FOR UPDATE ile kilitle (reservedQuantity drift'inde iki eşzamanlı
    // ödeme quantity'yi negatife itmesin).
    await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId} FOR UPDATE`;
    const product = await tx.product.findUnique({ where: { id: productId } });
    if (!product) {
      throw new Error(`Product not found for order (productId=${productId})`);
    }

    // FİZİKSEL stok ödenen adetten AZSA bu bir OVERSELL'dir. Sipariş bölünmediği
    // için eldeki kısmi stoğu tüketme: rezervasyonu bırak, siparişi fulfillment'a
    // sokma ve çağıranın tam iade başlatmasını zorunlu kıl.
    const oversoldBy =
      product.quantity !== null && product.quantity < orderQty
        ? orderQty - product.quantity
        : 0;
    if (oversoldBy > 0) {
      this.logger.error(
        `OVERSELL_AT_CAPTURE (fulfillment blocked): productId=${productId} ` +
          `ödenen=${orderQty} fiziksel=${product.quantity} (eksik=${oversoldBy}). ` +
          `Rezervasyon drift etmiş; sipariş otomatik iadeye alınacak.`,
      );
      const newReserved = safeDecrementReserved(
        product.reservedQuantity,
        orderQty,
      );
      await tx.product.update({
        where: { id: productId },
        data: {
          reservedQuantity: newReserved,
          status: getReservedAwareStatus(product.quantity, newReserved),
        },
      });
      return {
        cancelledOrders: [],
        cancelledOffers: [],
        stockoutCategoryId: undefined,
        oversold: {
          productId,
          paidQty: orderQty,
          physicalQty: product.quantity ?? 0,
        },
      };
    }

    const newQuantity =
      product.quantity !== null
        ? Math.max(0, product.quantity - orderQty)
        : null;
    const updateData: any = {
      // SATIŞLA biten stok `sold` olur — "satıldı" ekranlarda ve dokümanlarda
      // vaat edilen statüydü ama hiçbir yol yazmıyordu (stok 0 → inactive'e
      // düşüyordu ve "pasife alındı / süresi doldu" ile ayırt edilemiyordu).
      // Takas/kayıp gibi satış olmayan düşümler inactive kalmaya devam eder.
      status:
        newQuantity === 0
          ? ProductStatus.sold
          : getProductStatusFromQuantity(newQuantity),
      reservedQuantity: safeDecrementReserved(
        product.reservedQuantity,
        orderQty,
      ),
    };
    if (product.quantity !== null) {
      // Clamp'li mutlak set (FOR UPDATE altında yarışsız) — negatif stok imkânsız.
      updateData.quantity = newQuantity;
    }
    await tx.product.update({ where: { id: productId }, data: updateData });

    const result: StockoutResult = {
      cancelledOrders: [],
      cancelledOffers: [],
      stockoutCategoryId: undefined,
      oversold: undefined,
    };

    // Stockout kaskadı: yalnız FİZİKSEL stok bitince (quantity <= 0).
    const refreshed = await tx.product.findUnique({
      where: { id: productId },
      select: { quantity: true, reservedQuantity: true, categoryId: true },
    });
    if (refreshed && refreshed.quantity !== null && refreshed.quantity <= 0) {
      result.stockoutCategoryId = refreshed.categoryId ?? null;
      const orderResult =
        await this.productLockService.invalidatePendingOrdersForProduct(
          tx,
          productId,
          "Stok tükendi",
        );
      const offerResult = await this.productLockService.invalidateRelatedOffers(
        tx,
        productId,
      );
      result.cancelledOrders.push(
        ...orderResult.cancelledOrders.map((o) => ({
          orderId: o.orderId,
          buyerId: o.buyerId,
          productId: o.productId,
          productTitle: o.productTitle,
          offerId: o.offerId,
          hadPayment: o.hadPayment,
        })),
      );
      result.cancelledOffers.push(
        ...offerResult.rejectedOffers.map((o) => ({
          buyerId: o.buyerId,
          productId: o.productId,
          productTitle: o.productTitle,
        })),
      );
    }

    this.logger.log(
      `Product ${productId} stock updated: quantity=${newQuantity}, reserved=${updateData.reservedQuantity}`,
    );
    return result;
  }
}
