import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { getProductStatusFromQuantity } from "../product/helpers/product-status.helper";
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
}

/**
 * FulfillmentStockService (Faz 8.2) — bir ödenmiş fiziksel siparişin stok düşümü +
 * stockout kaskadı. Tekil ve grup fulfillment yollarında BİREBİR aynı olan mantığı
 * tek yere alır (god-service dedup).
 *
 * KRİTİK (para/stok güvenliği): para tx'inin İÇİNDE çağrılır. Ürün satırı FOR UPDATE
 * ile kilitlenir; clamp'li mutlak set (GREATEST(q-orderQty,0)) → negatif stok imkânsız.
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

    const newQuantity =
      product.quantity !== null
        ? Math.max(0, product.quantity - orderQty)
        : null;
    const updateData: any = {
      status: getProductStatusFromQuantity(newQuantity),
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
