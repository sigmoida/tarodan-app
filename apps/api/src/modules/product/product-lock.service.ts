import { Injectable, Logger } from '@nestjs/common';
import {
  OfferStatus,
  ProductStatus,
  TradeStatus,
  Prisma,
} from '@prisma/client';
import { getAvailableQuantity, safeDecrementReserved } from './helpers/product-availability.helper';

type PrismaTx = Prisma.TransactionClient;

/** Bildirim için reddedilen teklif verisi */
export interface RejectedOfferPayload {
  offerId: string;
  buyerId: string;
  productId: string;
  productTitle: string;
}

/** Bildirim için iptal edilen takas verisi */
export interface CancelledTradePayload {
  tradeId: string;
  initiatorId: string;
  receiverId: string;
}

export interface InvalidateOffersResult {
  count: number;
  rejectedOffers: RejectedOfferPayload[];
}

export interface InvalidateTradesResult {
  count: number;
  cancelledTrades: CancelledTradePayload[];
}

/**
 * Centralised product-level locking and cross-flow invalidation.
 *
 * Every time a product is "claimed" (direct buy, offer accept, trade accept)
 * the caller should use this service inside its DB transaction to:
 *   1. Lock the product row (FOR UPDATE)
 *   2. Verify available quantity
 *   3. Reserve the requested quantity
 *   4. Invalidate conflicting offers / trades on the same product
 *
 * Keeping this logic in one place avoids duplication across
 * OrderService, OfferService and TradeService.
 *
 * Bildirimler: invalidation metotları bildirim için gereken verileri döner.
 * Caller, transaction COMMIT'ten sonra bu verileri kullanarak bildirimleri
 * göndermelidir — rollback olursa bildirim asla gönderilmez.
 */
@Injectable()
export class ProductLockService {
  private readonly logger = new Logger(ProductLockService.name);

  // Active trade statuses — trades in these states reference a live product.
  private readonly ACTIVE_TRADE_STATUSES: TradeStatus[] = [
    TradeStatus.pending,
    TradeStatus.accepted,
    TradeStatus.initiator_shipped,
    TradeStatus.receiver_shipped,
    TradeStatus.both_shipped,
    TradeStatus.initiator_received,
    TradeStatus.receiver_received,
  ];

  /**
   * Acquire an exclusive row-level lock on the product and return the
   * current row.  Must be called inside a Prisma interactive transaction.
   */
  async lockProductForUpdate(tx: PrismaTx, productId: string) {
    await tx.$queryRaw`
      SELECT id FROM products WHERE id = ${productId} FOR UPDATE
    `;

    const product = await tx.product.findUnique({
      where: { id: productId },
    });

    return product;
  }

  /**
   * Lock the product, assert that `requiredQty` units are available,
   * then atomically increment `reservedQuantity`.
   */
  async checkAndReserve(
    tx: PrismaTx,
    productId: string,
    requiredQty: number,
  ) {
    const product = await this.lockProductForUpdate(tx, productId);

    if (!product) {
      throw new Error(`Product ${productId} not found`);
    }

    if (product.status !== ProductStatus.active) {
      throw new Error(
        `Product ${productId} is not active (status=${product.status})`,
      );
    }

    const available = getAvailableQuantity(product);
    if (available !== null && available < requiredQty) {
      throw new Error(
        `Product ${productId}: insufficient stock (available=${available}, required=${requiredQty})`,
      );
    }

    await tx.product.update({
      where: { id: productId },
      data: { reservedQuantity: { increment: requiredQty } },
    });

    return product;
  }

  /**
   * Auto-reject every pending offer that targets `productId`.
   * Optionally exclude one offer (e.g. the one being accepted).
   *
   * Returns the count AND the list of rejected offers so the caller can
   * send notifications AFTER the transaction commits.
   */
  async invalidateRelatedOffers(
    tx: PrismaTx,
    productId: string,
    excludeOfferId?: string,
  ): Promise<InvalidateOffersResult> {
    const where: Prisma.OfferWhereInput = {
      productId,
      status: OfferStatus.pending,
    };
    if (excludeOfferId) {
      where.id = { not: excludeOfferId };
    }

    // Bildirim için önce reddedilecek teklifleri çek
    const offersToReject = await tx.offer.findMany({
      where,
      select: {
        id: true,
        buyerId: true,
        productId: true,
        product: { select: { title: true } },
      },
    });

    if (offersToReject.length === 0) {
      return { count: 0, rejectedOffers: [] };
    }

    const result = await tx.offer.updateMany({
      where: { id: { in: offersToReject.map((o) => o.id) } },
      data: { status: OfferStatus.rejected },
    });

    if (result.count > 0) {
      this.logger.log(
        `Auto-rejected ${result.count} pending offer(s) for product ${productId}`,
      );
    }

    return {
      count: result.count,
      rejectedOffers: offersToReject.map((o) => ({
        offerId: o.id,
        buyerId: o.buyerId,
        productId: o.productId,
        productTitle: o.product.title,
      })),
    };
  }

  /**
   * Auto-cancel every *pending* trade that references `productId`
   * (on either side — initiator or receiver).
   * For trades that were already *accepted* (reserved), also release
   * the reserved quantities for all items in that trade.
   *
   * Optionally exclude one trade (e.g. the one being accepted).
   *
   * Returns the count AND the list of cancelled trades so the caller can
   * send notifications AFTER the transaction commits.
   */
  async invalidateRelatedTrades(
    tx: PrismaTx,
    productId: string,
    excludeTradeId?: string,
  ): Promise<InvalidateTradesResult> {
    const tradeItems = await tx.tradeItem.findMany({
      where: {
        productId,
        trade: {
          status: { in: [TradeStatus.pending, TradeStatus.accepted] },
          ...(excludeTradeId ? { id: { not: excludeTradeId } } : {}),
        },
      },
      select: { tradeId: true, trade: { select: { status: true } } },
    });

    const tradeIds = [...new Set(tradeItems.map((ti) => ti.tradeId))];
    if (tradeIds.length === 0) return { count: 0, cancelledTrades: [] };

    // Bildirim için takas katılımcı bilgilerini çek
    const tradesToCancel = await tx.trade.findMany({
      where: { id: { in: tradeIds } },
      select: { id: true, initiatorId: true, receiverId: true, status: true },
    });

    const acceptedTradeIds = [
      ...new Set(
        tradesToCancel
          .filter((t) => t.status === TradeStatus.accepted)
          .map((t) => t.id),
      ),
    ];

    // Release reserved quantities for accepted trades
    for (const tradeId of acceptedTradeIds) {
      const allItems = await tx.tradeItem.findMany({
        where: { tradeId },
      });
      const byProduct = new Map<string, number>();
      for (const item of allItems) {
        byProduct.set(
          item.productId,
          (byProduct.get(item.productId) ?? 0) + item.quantity,
        );
      }
      for (const [pid, qty] of byProduct) {
        const prod = await tx.product.findUnique({
          where: { id: pid },
          select: { reservedQuantity: true },
        });
        if (prod) {
          const newReserved = safeDecrementReserved(prod.reservedQuantity, qty);
          await tx.product.update({
            where: { id: pid },
            data: { reservedQuantity: newReserved },
          });
        }
      }
    }

    // Cancel all identified trades
    await tx.trade.updateMany({
      where: { id: { in: tradeIds } },
      data: {
        status: TradeStatus.cancelled,
        cancelReason: 'Ürün satıldı veya başka bir işlemle rezerve edildi',
        cancelledAt: new Date(),
      },
    });

    this.logger.log(
      `Auto-cancelled ${tradeIds.length} trade(s) for product ${productId}`,
    );

    return {
      count: tradeIds.length,
      cancelledTrades: tradesToCancel.map((t) => ({
        tradeId: t.id,
        initiatorId: t.initiatorId,
        receiverId: t.receiverId,
      })),
    };
  }
}
