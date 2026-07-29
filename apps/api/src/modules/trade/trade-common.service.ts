import { Injectable, Optional } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { CacheService } from "../cache/cache.service";
import { StorageService } from "../storage/storage.service";
import { computeTradeCanCancel } from "./trade.state-machine";
import { TradeResponseDto } from "./dto";

/**
 * Takas modülü ortak yardımcıları (yanıt DTO formatlama + ürün cache
 * invalidation) — TradeService'ten birebir taşındı. Query/lifecycle/
 * reconciliation alt servisleri ve facade buraya delege eder (order
 * split'teki OrderCommonService deseniyle aynı).
 */
@Injectable()
export class TradeCommonService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    @Optional()
    private readonly storageService: StorageService,
  ) {}

  /** Invalidate product detail cache for given product IDs. */
  async invalidateProductCaches(productIds: string[]): Promise<void> {
    for (const productId of [...new Set(productIds)]) {
      await this.cache.del(`products:detail:${productId}`);
    }
    // Takas akışı stok/statü değiştirir (tükenme → inactive, geri dönüş → active,
    // rezerv). Bu, listelerdeki görünürlük ve "stokta yok" sıralamasını etkiler →
    // ürün listesi cache'ini temizle.
    if (productIds.length > 0) {
      await this.cache.delPattern("products:list:*").catch(() => {});
    }
  }

  /** Invalidate product detail cache for all products in a trade (after reserved/quantity changes). */
  async invalidateProductCachesForTrade(tradeId: string): Promise<void> {
    const items = await this.prisma.tradeItem.findMany({
      where: { tradeId },
      select: { productId: true },
    });
    await this.invalidateProductCaches(items.map((i) => i.productId));
  }

  /**
   * Resolve product image URL (S3 key -> public URL). Any non-URL key is treated as S3 key.
   */
  private resolveProductImageUrl(
    imageKeyOrUrl: string | null | undefined,
  ): string | null {
    if (!imageKeyOrUrl) return null;
    if (
      imageKeyOrUrl.startsWith("http://") ||
      imageKeyOrUrl.startsWith("https://") ||
      imageKeyOrUrl.startsWith("/")
    )
      return imageKeyOrUrl;
    return this.storageService?.getPublicAssetUrl(imageKeyOrUrl) ?? null;
  }

  private mapTradeItemToDto(item: any): {
    id: string;
    productId: string;
    productTitle: string;
    productImage?: string;
    productImages?: { cardUrl: string; detailUrl?: string }[];
    side: string;
    quantity: number;
    valueAtTrade: number;
  } {
    const firstImg = item.product?.images?.[0];
    const cardUrl = firstImg?.cardKey
      ? this.storageService.getPublicAssetUrl(firstImg.cardKey)
      : undefined;
    const detailUrl = firstImg?.detailKey
      ? this.storageService.getPublicAssetUrl(firstImg.detailKey)
      : undefined;
    const productImage = this.resolveProductImageUrl(firstImg?.cardKey);
    const productImages =
      cardUrl || detailUrl
        ? [{ cardUrl: cardUrl ?? "", detailUrl }]
        : undefined;
    return {
      id: item.id,
      productId: item.productId,
      productTitle: item.product?.title || "",
      productImage: productImage ?? undefined,
      productImages,
      side: item.side,
      quantity: item.quantity,
      valueAtTrade: parseFloat(item.valueAtTrade),
    };
  }

  async mapToResponseDto(
    trade: any,
    viewerUserId?: string | null,
  ): Promise<TradeResponseDto> {
    const initiatorShipment = trade.shipments?.find(
      (s: any) => s.shipperId === trade.initiatorId,
    );
    const receiverShipment = trade.shipments?.find(
      (s: any) => s.shipperId === trade.receiverId,
    );

    // ----------------------------------------------------------------------
    // Shipment privacy (safe-trade escrow leg visibility rules)
    //
    // to_warehouse:
    //   - User sees own tracking always.
    //   - Counterparty tracking hidden until BOTH parties have shipped.
    // from_warehouse:
    //   - Only recipient sees their own incoming shipment.
    //   - Counterparty's from_warehouse shipment is filtered out entirely.
    //   - Hidden until BOTH from_warehouse shipments are created.
    // return:
    //   - Only recipient sees their own return shipment.
    //
    // When viewerUserId is null/undefined (internal / admin context),
    // no filtering is applied.
    // ----------------------------------------------------------------------
    const rawShipments: any[] = trade.shipments || [];
    const toWarehouseShipments = rawShipments.filter(
      (s) => s.leg === "to_warehouse",
    );
    const fromWarehouseShipments = rawShipments.filter(
      (s) => s.leg === "from_warehouse",
    );
    const bothToWarehouseShipped =
      toWarehouseShipments.length >= 2 &&
      toWarehouseShipments.every((s) => s.shippedAt);
    const bothFromWarehouseCreated = fromWarehouseShipments.length >= 2;

    const applyShipmentPrivacy = (s: any): any | null => {
      if (!viewerUserId) return s; // admin/internal view — no filtering
      const leg = s.leg || "to_warehouse";

      if (leg === "to_warehouse") {
        const isMine = s.shipperId === viewerUserId;
        if (isMine || bothToWarehouseShipped) return s;
        // Hide counterparty tracking until both shipped
        return { ...s, trackingNumber: null, providerTrackingId: null };
      }

      if (leg === "from_warehouse") {
        const isForMe = s.recipientUserId === viewerUserId;
        if (!isForMe) return null; // never see counterparty's incoming leg
        if (!bothFromWarehouseCreated) return null;
        return s;
      }

      if (leg === "return") {
        const isForMe = s.recipientUserId === viewerUserId;
        if (!isForMe) return null;
        return s;
      }

      return s;
    };

    const visibleShipments = rawShipments
      .map(applyShipmentPrivacy)
      .filter((s): s is any => s !== null);

    return {
      id: trade.id,
      tradeNumber: trade.tradeNumber,
      initiatorId: trade.initiatorId,
      initiatorName: trade.initiator?.displayName || "",
      receiverId: trade.receiverId,
      receiverName: trade.receiver?.displayName || "",
      status: trade.status,
      initiatorItems: (trade.items || [])
        .filter((item: any) => item.side === "initiator")
        .map((item: any) => this.mapTradeItemToDto(item)),
      receiverItems: (trade.items || [])
        .filter((item: any) => item.side === "receiver")
        .map((item: any) => this.mapTradeItemToDto(item)),
      cashAmount: trade.cashAmount ? parseFloat(trade.cashAmount) : undefined,
      cashPayerId: trade.cashPayerId || undefined,
      cashCommission: trade.cashCommission
        ? parseFloat(trade.cashCommission)
        : undefined,
      initiatorMessage: trade.initiatorMessage || undefined,
      receiverMessage: trade.receiverMessage || undefined,
      responseDeadline: trade.responseDeadline,
      paymentDeadline: trade.paymentDeadline || undefined,
      shippingDeadline: trade.shippingDeadline || undefined,
      confirmationDeadline: trade.confirmationDeadline || undefined,
      initiatorShipment: initiatorShipment
        ? {
            id: initiatorShipment.id,
            shipperId: initiatorShipment.shipperId,
            shipperName: trade.initiator?.displayName || "",
            carrier: initiatorShipment.carrier,
            // Hide counterparty tracking until both to_warehouse shipped
            trackingNumber:
              !viewerUserId ||
              viewerUserId === initiatorShipment.shipperId ||
              bothToWarehouseShipped
                ? initiatorShipment.trackingNumber
                : null,
            cargoCode:
              !viewerUserId ||
              viewerUserId === initiatorShipment.shipperId ||
              bothToWarehouseShipped
                ? initiatorShipment.providerTrackingId || undefined
                : undefined,
            status: initiatorShipment.status,
            shippedAt: initiatorShipment.shippedAt,
            deliveredAt: initiatorShipment.deliveredAt,
            confirmedAt: initiatorShipment.confirmedAt,
          }
        : undefined,
      receiverShipment: receiverShipment
        ? {
            id: receiverShipment.id,
            shipperId: receiverShipment.shipperId,
            shipperName: trade.receiver?.displayName || "",
            carrier: receiverShipment.carrier,
            trackingNumber:
              !viewerUserId ||
              viewerUserId === receiverShipment.shipperId ||
              bothToWarehouseShipped
                ? receiverShipment.trackingNumber
                : null,
            cargoCode:
              !viewerUserId ||
              viewerUserId === receiverShipment.shipperId ||
              bothToWarehouseShipped
                ? receiverShipment.providerTrackingId || undefined
                : undefined,
            status: receiverShipment.status,
            shippedAt: receiverShipment.shippedAt,
            deliveredAt: receiverShipment.deliveredAt,
            confirmedAt: receiverShipment.confirmedAt,
          }
        : undefined,
      shipments: visibleShipments.map((shipment: any) => ({
        id: shipment.id,
        direction: shipment.leg || "to_warehouse",
        senderUserId: shipment.shipperId || undefined,
        recipientUserId: shipment.recipientUserId || undefined,
        carrier: shipment.carrier || undefined,
        trackingNumber: shipment.trackingNumber || undefined,
        // Gerçek Sürat kargo kodu (KargoTakipNo) — şubede verilen numara.
        cargoCode: shipment.providerTrackingId || undefined,
        status: shipment.status || undefined,
        shippedAt: shipment.shippedAt || undefined,
        deliveredAt: shipment.deliveredAt || undefined,
      })),
      cashPayment: trade.cashPayment
        ? {
            id: trade.cashPayment.id,
            payerId: trade.cashPayment.payerId,
            recipientId: trade.cashPayment.recipientId,
            amount: parseFloat(trade.cashPayment.amount),
            commission: parseFloat(trade.cashPayment.commission),
            totalAmount: parseFloat(trade.cashPayment.totalAmount),
            status: trade.cashPayment.status,
            paidAt: trade.cashPayment.paidAt,
          }
        : undefined,
      dispute: trade.dispute
        ? {
            id: trade.dispute.id,
            raisedById: trade.dispute.raisedById,
            reason: trade.dispute.reason,
            description: trade.dispute.description,
            resolution: trade.dispute.resolution,
            resolvedAt: trade.dispute.resolvedAt,
          }
        : undefined,
      acceptedAt: trade.acceptedAt || undefined,
      completedAt: trade.completedAt || undefined,
      cancelledAt: trade.cancelledAt || undefined,
      cancelReason: trade.cancelReason || undefined,
      firstWarehouseArrivalAt: trade.firstWarehouseArrivalAt ?? null,
      canCancel: this.computeCanCancel(trade, viewerUserId),
      version: trade.version || undefined,
      createdAt: trade.createdAt,
      updatedAt: trade.updatedAt,
    };
  }

  private computeCanCancel(trade: any, viewerUserId?: string | null): boolean {
    // Kargoya verme sinyalini shipments'tan türet (yüklüyse): to_warehouse
    // bacaklarından biri shippedAt aldıysa kullanıcı iptali kapanır.
    const handedToCargo = Array.isArray(trade?.shipments)
      ? trade.shipments.some(
          (s: any) => s?.leg === "to_warehouse" && s?.shippedAt != null,
        )
      : false;
    return computeTradeCanCancel({ ...trade, handedToCargo }, viewerUserId);
  }
}
