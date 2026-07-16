import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  OfferStatus,
  OrderStatus,
  ProductStatus,
  TradeStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma';
import { i18nMessage } from '../i18n';
import { getAvailableQuantity, safeDecrementReserved } from './helpers/product-availability.helper';
import { NotificationService } from '../notification/notification.service';

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

/** Bildirim için iptal edilen sipariş verisi */
export interface CancelledOrderPayload {
  orderId: string;
  buyerId: string;
  productId: string;
  productTitle: string;
  /** Teklif kökenli sipariş ise teklif id'si, doğrudan satışta null. */
  offerId: string | null;
  /** Ödeme satırı oluşmuş mu? false ise alıcı hiç ödeme başlatmamıştır. */
  hadPayment: boolean;
}

export interface InvalidateOffersResult {
  count: number;
  rejectedOffers: RejectedOfferPayload[];
}

export interface InvalidateTradesResult {
  count: number;
  cancelledTrades: CancelledTradePayload[];
}

export interface InvalidateOrdersResult {
  count: number;
  cancelledOrders: CancelledOrderPayload[];
}

/**
 * Centralised product-level locking and stock reservation.
 *
 * Stok modeli (stock_plan.md):
 *   - quantity = fiziksel stok (sadece ödeme/takas tamamlandığında düşer)
 *   - reservedQuantity = ödeme bekleyen / takas sürecindeki adet
 *   - available = quantity - reservedQuantity
 *
 * Invalidation artık INLINE YAPILMIYOR. Cron (sweepOutOfStockProducts) ile
 * quantity=0 olan ürünlerdeki pending teklif/takaslar periyodik iptal edilir.
 *
 * checkAndReserve: Ödeme başlatılırken veya takas kabul edilirken çağrılır.
 * invalidateRelatedOffers/Trades: Sadece cron tarafından çağrılır.
 */
@Injectable()
export class ProductLockService {
  private readonly logger = new Logger(ProductLockService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Acquire an exclusive row-level lock on the product and return the
   * current row. Must be called inside a Prisma interactive transaction.
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
   *
   * Used at:
   *   - Direct buy checkout (order creation)
   *   - Payment initiate for offer-based orders
   *   - Trade accept (both products)
   */
  async checkAndReserve(
    tx: PrismaTx,
    productId: string,
    requiredQty: number = 1,
  ) {
    const product = await this.lockProductForUpdate(tx, productId);

    if (!product) {
      throw new BadRequestException(
        i18nMessage('server.product.notFoundWithId', { productId }),
      );
    }

    if (product.status !== ProductStatus.active && product.status !== ProductStatus.reserved) {
      throw new BadRequestException(
        i18nMessage('server.product.notForSaleStatus', { status: product.status }),
      );
    }

    const available = getAvailableQuantity(product);
    if (available !== null && available < requiredQty) {
      throw new BadRequestException(
        i18nMessage('server.product.insufficientStock', { available, requested: requiredQty }),
      );
    }

    await tx.product.update({
      where: { id: productId },
      data: { reservedQuantity: { increment: requiredQty } },
    });

    this.logger.log(
      `Reserved ${requiredQty} unit(s) for product ${productId} (new reserved=${(product.reservedQuantity ?? 0) + requiredQty})`,
    );

    return product;
  }

  /**
   * Auto-reject every pending+accepted offer that targets `productId`.
   * Used by the cron sweep when quantity reaches 0.
   */
  async invalidateRelatedOffers(
    tx: PrismaTx,
    productId: string,
    excludeOfferId?: string,
  ): Promise<InvalidateOffersResult> {
    const where: Prisma.OfferWhereInput = {
      productId,
      status: { in: [OfferStatus.pending, OfferStatus.accepted] },
      // Do NOT cancel offers that already turned into a paid sale. An accepted
      // offer keeps its `accepted` status after payment (there is no terminal
      // "paid" OfferStatus); the real lifecycle lives on the linked Order. So
      // only sweep offers that have no order yet (pending) or whose order is
      // still awaiting payment / already cancelled. Without this, the buyer who
      // drained the last unit would also see their PAID offer flipped to
      // "İptal Edildi" alongside the genuinely unpaid ones.
      OR: [
        { order: { is: null } },
        { order: { status: { in: [OrderStatus.pending_payment, OrderStatus.cancelled] } } },
      ],
    };
    if (excludeOfferId) {
      where.id = { not: excludeOfferId };
    }

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
      data: {
        status: OfferStatus.cancelled,
        cancelReason: 'Stok tükendiği için otomatik iptal edildi',
      },
    });

    if (result.count > 0) {
      this.logger.log(
        `Auto-cancelled ${result.count} pending/accepted offer(s) for product ${productId}`,
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
   * Auto-cancel every *pending* trade that references `productId`.
   * ACCEPTED TAKASLARA DOKUNMAZ — kargo sürecinde olabilirler.
   *
   * Used by the cron sweep when quantity reaches 0.
   */
  async invalidateRelatedTrades(
    tx: PrismaTx,
    productId: string,
    excludeTradeId?: string,
  ): Promise<InvalidateTradesResult> {
    // Sadece PENDING takaslari iptal et (accepted'a dokunma!)
    const tradeItems = await tx.tradeItem.findMany({
      where: {
        productId,
        trade: {
          status: TradeStatus.pending,
          ...(excludeTradeId ? { id: { not: excludeTradeId } } : {}),
        },
      },
      select: { tradeId: true },
    });

    const tradeIds = [...new Set(tradeItems.map((ti) => ti.tradeId))];
    if (tradeIds.length === 0) return { count: 0, cancelledTrades: [] };

    const tradesToCancel = await tx.trade.findMany({
      where: { id: { in: tradeIds } },
      select: { id: true, initiatorId: true, receiverId: true, status: true },
    });

    // Cancel all identified pending trades
    await tx.trade.updateMany({
      where: { id: { in: tradeIds } },
      data: {
        status: TradeStatus.cancelled,
        cancelReason: 'Stok tükendiği için otomatik iptal edildi',
        cancelledAt: new Date(),
      },
    });

    this.logger.log(
      `Auto-cancelled ${tradeIds.length} pending trade(s) for product ${productId}`,
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

  /**
   * Cancel pending_payment orders for a product and release their reservations.
   * Called when a trade acceptance depletes stock for other buyers.
   *
   * Safe-trade model: trade acceptance can claim the last unit; existing
   * pending_payment orders for the same product must be cancelled because
   * there's no stock left.
   */
  async invalidatePendingOrdersForProduct(
    tx: PrismaTx,
    productId: string,
    cancelReason: string = 'Stok takas icin ayrildi',
  ): Promise<InvalidateOrdersResult> {
    // Fetch each pending_payment order with the signals we need to tell
    // whether it currently holds a stock reservation:
    //   - directBuy orders (offerId IS NULL): reservation is taken at order
    //     create (order.service.ts createDirectOrder ~line 917-920), BEFORE
    //     any Payment row exists. They always hold a reservation while in
    //     pending_payment.
    //   - offer-flow orders (offerId IS NOT NULL): no reservation at offer
    //     accept ("Teklif kabul = sadece anlaşma. Stok değişmez", offer.
    //     service.ts:307). Reservation is taken at payment-initiate
    //     (payment.service.ts ~line 339 / order.service.ts:2068). So they
    //     hold a reservation iff a Payment row exists.
    //   - failed-and-released payments: processFailedPayment already released
    //     the reservation, so a Payment row in `failed` status no longer
    //     means a live reservation. We treat ANY Payment row as "reserved"
    //     here and rely on the GREATEST(..., 0) clamp below to avoid
    //     under-flow if reality has already drifted.
    const orders = await tx.order.findMany({
      where: {
        productId,
        status: OrderStatus.pending_payment,
      },
      select: {
        id: true,
        buyerId: true,
        productId: true,
        offerId: true,
        product: { select: { title: true } },
        payment: { select: { id: true } },
      },
    });

    if (orders.length === 0) {
      return { count: 0, cancelledOrders: [] };
    }

    // Cancel the orders.
    await tx.order.updateMany({
      where: { id: { in: orders.map((o) => o.id) } },
      data: {
        status: OrderStatus.cancelled,
        cancelReason,
      },
    });

    // Release reservations only for orders that actually held one. Clamp with
    // GREATEST(..., 0) as defensive guard against pre-existing drift or the
    // failed-then-released payment edge case described above. Raw SQL because
    // Prisma's `decrement` does not support clamping.
    const reservedCount = orders.filter(
      (o) => o.offerId === null || o.payment !== null,
    ).length;
    if (reservedCount > 0) {
      await tx.$executeRaw`
        UPDATE "products"
        SET "reserved_quantity" = GREATEST("reserved_quantity" - ${reservedCount}, 0)
        WHERE "id" = ${productId}
      `;
    }

    // Chain-cancel the offers linked to the orders we just cancelled.
    const offerIds = await tx.offer.findMany({
      where: {
        productId,
        order: { id: { in: orders.map((o) => o.id) } },
      },
      select: { id: true },
    });
    if (offerIds.length > 0) {
      await tx.offer.updateMany({
        where: { id: { in: offerIds.map((o) => o.id) } },
        data: {
          status: OfferStatus.cancelled,
          cancelReason,
        },
      });
    }

    this.logger.log(
      `Auto-cancelled ${orders.length} pending_payment order(s) for product ${productId} (${reservedCount} reserved): ${cancelReason}`,
    );

    return {
      count: orders.length,
      cancelledOrders: orders.map((o) => ({
        orderId: o.id,
        buyerId: o.buyerId,
        productId: o.productId,
        productTitle: o.product.title,
        offerId: o.offerId,
        hadPayment: o.payment !== null,
      })),
    };
  }

  /**
   * Periodic safety-net sweep: find all products with quantity = 0 and
   * cancel any lingering pending offers/trades.
   *
   * IMPORTANT: Accepted trades are NOT cancelled (they may be in shipping).
   *
   * Called by payment-scheduler cron every 5 minutes.
   */
  async sweepOutOfStockProducts(): Promise<{
    productsScanned: number;
    offersCancelled: number;
    tradesCancelled: number;
    rejectedOffers: RejectedOfferPayload[];
    cancelledTrades: CancelledTradePayload[];
  }> {
    const outOfStockProducts = await this.prisma.product.findMany({
      where: { quantity: 0 },
      select: { id: true },
    });

    let offersCancelled = 0;
    let tradesCancelled = 0;
    const allRejectedOffers: RejectedOfferPayload[] = [];
    const allCancelledTrades: CancelledTradePayload[] = [];

    for (const product of outOfStockProducts) {
      try {
        const productRejectedOffers: RejectedOfferPayload[] = [];
        await this.prisma.$transaction(async (tx) => {
          const offers = await this.invalidateRelatedOffers(tx, product.id);
          const trades = await this.invalidateRelatedTrades(tx, product.id);
          offersCancelled += offers.count;
          tradesCancelled += trades.count;
          allRejectedOffers.push(...offers.rejectedOffers);
          allCancelledTrades.push(...trades.cancelledTrades);
          productRejectedOffers.push(...offers.rejectedOffers);
        });

        // Dispatch notifications AFTER tx commit so a rollback can't emit phantom messages.
        for (const o of productRejectedOffers) {
          await this.notificationService
            .notifyOfferCancelledOutOfStock(o.buyerId, o.productId, o.productTitle, null)
            .catch((err) =>
              this.logger.warn(`sweep-notify failed for ${o.buyerId}: ${err.message}`),
            );
        }
      } catch (e: any) {
        this.logger.error(
          `Failed to sweep out-of-stock product ${product.id}: ${e.message}`,
        );
      }
    }

    if (offersCancelled > 0 || tradesCancelled > 0) {
      this.logger.log(
        `Stock sweep: scanned ${outOfStockProducts.length} products, cancelled ${offersCancelled} offers, ${tradesCancelled} trades`,
      );
    }

    return {
      productsScanned: outOfStockProducts.length,
      offersCancelled,
      tradesCancelled,
      rejectedOffers: allRejectedOffers,
      cancelledTrades: allCancelledTrades,
    };
  }
}
