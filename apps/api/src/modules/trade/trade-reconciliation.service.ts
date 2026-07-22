import { Injectable, Optional, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { CacheService } from "../cache/cache.service";
import { NotificationService } from "../notification/notification.service";
import { NotificationType } from "../notification/dto";
import { EventService } from "../events";
import {
  TradeStatus,
  ProductStatus,
  ShipmentStatus,
  PaymentStatus,
} from "@prisma/client";
import { safeDecrementReserved } from "../product/helpers/product-availability.helper";
import { getProductStatusFromQuantity } from "../product/helpers/product-status.helper";
import { PaymentService } from "../payment/payment.service";
import { TradeShipmentService } from "./trade-shipment.service";
import { TradeCommonService } from "./trade-common.service";

/**
 * Zamanlanmış (cron) takas mutabakat işleri — TradeService'ten birebir taşındı.
 * auto-cancel / auto-confirm / eksik inbound kargo telafisi. Facade aynı
 * public imzalarla delege eder (order/trade split desenindeki gibi).
 */
@Injectable()
export class TradeReconciliationService {
  private readonly logger = new Logger(TradeReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly notificationService: NotificationService,
    private readonly paymentService: PaymentService,
    @Optional()
    private readonly eventService: EventService,
    private readonly tradeShipment: TradeShipmentService,
    private readonly tradeCommon: TradeCommonService,
  ) {}

  // ==========================================================================
  // AUTO-CANCEL EXPIRED TRADES (Scheduled job)
  // ==========================================================================
  /**
   * Depoya ulaşıp süresi dolduğu için otomatik iptal edilemeyen ("stuck") takaslar
   * için aktif admin'lere in-app bildirim gönderir. Her takas için 24s cache dedup
   * uygular: cron 5 dk'da bir çalıştığından spam olmaz, ama çözülmeyen takas TTL
   * dolunca tekrar hatırlatılır. Tamamen non-blocking — hata cron'u bozmaz.
   */
  private async notifyAdminsOfStuckTrades(
    stuckTrades: Array<{
      id: string;
      tradeNumber: string;
      shippingDeadline: Date | null;
      firstWarehouseArrivalAt: Date | null;
    }>,
  ): Promise<void> {
    try {
      const fresh: typeof stuckTrades = [];
      for (const t of stuckTrades) {
        const key = `stuck-trade-alerted:${t.id}`;
        const already = await this.cache.get<boolean>(key);
        if (already) continue;
        fresh.push(t);
        await this.cache.set(key, true, { ttl: 24 * 60 * 60 });
      }
      if (fresh.length === 0) return;

      const admins = await this.prisma.adminUser.findMany({
        where: { isActive: true },
        select: { userId: true },
      });
      for (const t of fresh) {
        for (const a of admins) {
          try {
            await this.notificationService.createInAppNotification(
              a.userId,
              NotificationType.TRADE_STUCK_AT_WAREHOUSE,
              {
                tradeId: t.id,
                tradeNumber: t.tradeNumber,
                arrivedAt: t.firstWarehouseArrivalAt?.toISOString(),
                deadline: t.shippingDeadline?.toISOString(),
              },
            );
          } catch (err: any) {
            this.logger.error(
              `Stuck-trade admin bildirimi başarısız (trade=${t.id}, admin=${a.userId}): ${err?.message}`,
            );
          }
        }
      }
    } catch (err: any) {
      this.logger.error(`notifyAdminsOfStuckTrades failed: ${err?.message}`);
    }
  }

  async autoCancelExpiredTrades(): Promise<number> {
    const now = new Date();

    // Find trades that have passed their deadlines
    const expiredPendingTrades = await this.prisma.trade.findMany({
      where: {
        status: TradeStatus.pending,
        responseDeadline: { lt: now },
      },
    });

    const expiredAcceptedTrades = await this.prisma.trade.findMany({
      where: {
        status: TradeStatus.accepted,
        shippingDeadline: { lt: now },
      },
    });

    // Safe-trade: cash payment timeout
    const expiredPaymentTrades = await this.prisma.trade.findMany({
      where: {
        status: TradeStatus.awaiting_payment,
        paymentDeadline: { lt: now },
      },
    });

    // Safe-trade: shipping-to-warehouse timeout. Once any to_warehouse
    // shipment has been received, an item is already in the warehouse and
    // auto-cancel would orphan it. Admin must resolve those manually
    // (reject or force-cancel-stuck).
    const expiredShippingTrades = await this.prisma.trade.findMany({
      where: {
        status: TradeStatus.shipping_to_warehouse,
        shippingDeadline: { lt: now },
        firstWarehouseArrivalAt: null,
      },
    });

    // Stuck trades surface: deadline passed AND one item already arrived.
    // These need manual admin action (force-cancel-stuck); we log them every
    // run so they don't sit silent.
    const stuckTrades = await this.prisma.trade.findMany({
      where: {
        status: TradeStatus.shipping_to_warehouse,
        shippingDeadline: { lt: now },
        firstWarehouseArrivalAt: { not: null },
      },
      select: {
        id: true,
        tradeNumber: true,
        shippingDeadline: true,
        firstWarehouseArrivalAt: true,
      },
    });
    if (stuckTrades.length > 0) {
      this.logger.warn(
        `Stuck trades requiring admin force-cancel-stuck: ${stuckTrades
          .map(
            (t) =>
              `${t.tradeNumber}(id=${t.id} arrived=${t.firstWarehouseArrivalAt?.toISOString()} deadline=${t.shippingDeadline?.toISOString()})`,
          )
          .join(", ")}`,
      );
      // Loglar sessiz kalmasın diye admin'lere bildirim de gönder. Cron her 5 dk
      // çalıştığından her takas için 24s cache dedup ile spam'i engelle; çözülmeyen
      // takas ertesi gün tekrar hatırlatılır (TTL dolunca). Non-blocking.
      await this.notifyAdminsOfStuckTrades(stuckTrades);
    }

    let cancelledCount = 0;

    for (const trade of [
      ...expiredPendingTrades,
      ...expiredAcceptedTrades,
      ...expiredPaymentTrades,
      ...expiredShippingTrades,
    ]) {
      try {
        try {
          await this.paymentService.refundTradeCashPaymentIfCompleted(trade.id);
        } catch (refundErr: any) {
          this.logger.error(
            `autoCancelExpiredTrades: PayTR nakit iade başarısız trade=${trade.id} — iptal atlandı: ${refundErr?.message}`,
          );
          continue;
        }

        await this.prisma.$transaction(async (tx) => {
          // FOR UPDATE: trade satırını kilitle; başka bir işlem (örn. acceptTrade)
          // bu trade'i aynı anda değiştirmeye çalışırsa bekler.
          await tx.$queryRaw`SELECT id FROM trades WHERE id = ${trade.id} FOR UPDATE`;

          // Kilitleme sonrası en güncel statüyü oku
          const freshTrade = await tx.trade.findUnique({
            where: { id: trade.id },
            select: { status: true },
          });
          // Başka bir akış zaten işleme almışsa bu trade'i atla
          if (!freshTrade || freshTrade.status !== trade.status) {
            return;
          }

          const allItems = await tx.tradeItem.findMany({
            where: { tradeId: trade.id },
          });

          // Release reservations for any non-pending trade being auto-cancelled
          const statusesWithReservation: TradeStatus[] = [
            TradeStatus.accepted,
            TradeStatus.awaiting_payment,
            TradeStatus.shipping_to_warehouse,
          ];
          if (
            statusesWithReservation.includes(trade.status) &&
            allItems.length > 0
          ) {
            const byProduct = new Map<string, number>();
            for (const item of allItems) {
              byProduct.set(
                item.productId,
                (byProduct.get(item.productId) ?? 0) + item.quantity,
              );
            }
            // Auto-cancel: kabul anında yapılan rezervasyonu geri al
            for (const [productId, qty] of byProduct) {
              await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId} FOR UPDATE`;
              const prod = await tx.product.findUnique({
                where: { id: productId },
                select: { reservedQuantity: true },
              });
              if (prod) {
                const newReserved = safeDecrementReserved(
                  prod.reservedQuantity,
                  qty,
                );
                await tx.product.update({
                  where: { id: productId },
                  data: {
                    reservedQuantity: newReserved,
                    status:
                      newReserved > 0
                        ? ProductStatus.reserved
                        : ProductStatus.active,
                  },
                });
              }
            }
          }

          await tx.trade.update({
            where: { id: trade.id },
            data: {
              status: TradeStatus.cancelled,
              cancelReason: "Süre dolumu nedeniyle otomatik iptal",
              cancelledAt: now,
            },
          });
        });
        await this.tradeCommon.invalidateProductCachesForTrade(trade.id);

        // Cancel Sürat shipments if any (best-effort)
        await this.tradeShipment.cancelSuratShipmentsForTrade(trade.id);

        cancelledCount++;

        // Transaction commit sonrası: iptal edilen takas katılımcılarına bildirim
        if (this.eventService) {
          try {
            await this.eventService.emitTradeAutoCancelled({
              tradeId: trade.id,
              initiatorId: trade.initiatorId,
              receiverId: trade.receiverId,
              reason: "Takas süresi dolduğu için otomatik iptal edildi",
            });
          } catch (err) {
            this.logger.error(
              `Failed to emit trade.auto-cancelled for trade ${trade.id}: ${err}`,
            );
          }
        }
      } catch (error) {
        this.logger.error("Failed to auto-cancel trade");
      }
    }

    return cancelledCount;
  }

  /**
   * O11: shipping_to_warehouse durumundaki ama `to_warehouse` kargo etiketleri OLUŞMAMIŞ
   * takasları bul ve createInboundTradeShipments'i yeniden çağır (idempotent). Post-payment/
   * post-accept fire-and-forget kargo oluşturma hata verirse (para alındı ama etiket yok)
   * güvenilir bir telafi sağlar.
   */
  async reconcileMissingInboundShipments(): Promise<{ fixed: number }> {
    const trades = await this.prisma.trade.findMany({
      where: {
        status: TradeStatus.shipping_to_warehouse,
        shipments: { none: { leg: "to_warehouse" } },
      },
      select: { id: true },
      take: 50,
    });

    let fixed = 0;
    for (const t of trades) {
      try {
        await this.tradeShipment.createInboundTradeShipments(t.id);
        fixed++;
      } catch (e: any) {
        this.logger.error(
          `reconcileMissingInboundShipments: takas ${t.id} inbound kargo telafisi başarısız: ${e?.message}`,
        );
      }
    }
    return { fixed };
  }

  /**
   * MONEY-H2: PayTR nakit iadesi başarısız olup `refundFailureReason` marker'ı
   * yazılmış takasları periyodik olarak yeniden dener. cancelTrade / resolveDispute /
   * rejectWarehouseTrade / retryTradeRefund akışlarında iade PayTR'da patlarsa para
   * alıcıda kalır; admin elle müdahale etmese bile bu süpürme onu toparlar.
   * `refundTradeCashTracked` başarıda marker'ı temizler, tekrar patlarsa mesajı
   * tazeler (kalıcı hatada döngü zararsızdır: aynı takas her turda yeniden denenir
   * ama çift-iade guard'ları PayTR'yi bir kez çağırır).
   */
  async retryFailedTradeRefunds(): Promise<{
    retried: number;
    recovered: number;
  }> {
    const stuck = await this.prisma.trade.findMany({
      where: {
        refundFailureReason: { not: null },
        status: {
          in: [
            TradeStatus.cancelled,
            TradeStatus.returning,
            TradeStatus.disputed,
          ],
        },
      },
      select: { id: true },
      take: 50,
    });

    let recovered = 0;
    for (const t of stuck) {
      const res = await this.paymentService.refundTradeCashTracked(t.id);
      // "recovered" = marker artık temizlenmiş demektir (iade yapıldı VEYA iade
      // edilecek tamamlanmış ödeme kalmadı). Yalnız `failed` olanlar marker'da kalır.
      if (!res.failed) recovered++;
    }

    if (stuck.length > 0) {
      this.logger.log(
        `retryFailedTradeRefunds: ${stuck.length} takas denendi, ${recovered} toparlandı`,
      );
    }
    return { retried: stuck.length, recovered };
  }

  /**
   * Auto-confirm receipt for trades stuck in shipping_to_recipients
   * when confirmationDeadline has passed.
   */
  async autoConfirmExpiredReceipts(): Promise<number> {
    const now = new Date();

    const expiredTrades = await this.prisma.trade.findMany({
      where: {
        status: TradeStatus.shipping_to_recipients,
        confirmationDeadline: { lt: now },
      },
      include: {
        shipments: {
          where: { leg: "from_warehouse" },
        },
      },
    });

    let confirmedCount = 0;

    for (const trade of expiredTrades) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM trades WHERE id = ${trade.id} FOR UPDATE`;

          const freshTrade = await tx.trade.findUnique({
            where: { id: trade.id },
            select: { status: true, version: true },
          });
          if (
            !freshTrade ||
            freshTrade.status !== TradeStatus.shipping_to_recipients
          ) {
            return;
          }

          // Auto-confirm all unconfirmed from_warehouse shipments
          const unconfirmedShipments = await tx.tradeShipment.findMany({
            where: {
              tradeId: trade.id,
              leg: "from_warehouse",
              confirmedAt: null,
            },
          });

          for (const shipment of unconfirmedShipments) {
            await tx.tradeShipment.update({
              where: { id: shipment.id },
              data: {
                status: ShipmentStatus.delivered,
                deliveredAt: now,
                confirmedAt: now,
              },
            });
          }

          // Complete the trade
          await tx.trade.update({
            where: { id: trade.id, version: freshTrade.version },
            data: {
              status: TradeStatus.completed,
              completedAt: now,
              version: { increment: 1 },
            },
          });

          // Decrement product quantities (same as confirmReceipt)
          const allItems = await tx.tradeItem.findMany({
            where: { tradeId: trade.id },
          });
          const products = await tx.product.findMany({
            where: { id: { in: allItems.map((i) => i.productId) } },
          });

          const qtyByProduct = new Map<string, number>();
          for (const item of allItems) {
            qtyByProduct.set(
              item.productId,
              (qtyByProduct.get(item.productId) ?? 0) + item.quantity,
            );
          }

          for (const product of products) {
            const tradedQty = qtyByProduct.get(product.id) ?? 1;
            let newQuantity: number | null;
            if (product.quantity !== null && product.quantity > 0) {
              newQuantity = Math.max(0, product.quantity - tradedQty);
            } else if (product.quantity === null) {
              newQuantity = null;
            } else {
              newQuantity = 0;
            }

            const updateData: any = {
              status: getProductStatusFromQuantity(newQuantity),
              reservedQuantity: safeDecrementReserved(
                product.reservedQuantity,
                tradedQty,
              ),
            };
            if (product.quantity !== null && product.quantity > 0) {
              updateData.quantity = newQuantity;
            }

            await tx.product.update({
              where: { id: product.id },
              data: updateData,
            });
          }

          // Set escrow hold for cash payment
          const cashPayment = await tx.tradeCashPayment.findUnique({
            where: { tradeId: trade.id },
          });
          if (cashPayment && cashPayment.status === PaymentStatus.completed) {
            const holdDaysSetting = await tx.platformSetting.findUnique({
              where: { settingKey: "payment_hold_days" },
            });
            const holdDays = parseInt(holdDaysSetting?.settingValue ?? "7");
            const holdReleaseAt = new Date();
            holdReleaseAt.setDate(holdReleaseAt.getDate() + holdDays);

            await tx.tradeCashPayment.update({
              where: { tradeId: trade.id },
              data: { holdReleaseAt },
            });
          }
        });

        await this.tradeCommon.invalidateProductCachesForTrade(trade.id);
        confirmedCount++;

        this.logger.log(
          `Auto-confirmed receipt for trade ${trade.id} (confirmationDeadline passed)`,
        );
      } catch (error: any) {
        this.logger.error(
          `Failed to auto-confirm trade ${trade.id}: ${error.message}`,
        );
      }
    }

    if (confirmedCount > 0) {
      this.logger.log(
        `Auto-confirmed ${confirmedCount} expired trade receipt(s)`,
      );
    }
    return confirmedCount;
  }
}
