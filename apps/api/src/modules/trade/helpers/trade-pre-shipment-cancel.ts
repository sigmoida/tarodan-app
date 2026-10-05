import {
  CancellationActor,
  PaymentStatus,
  Prisma,
  ProductStatus,
  TradeStatus,
} from "@prisma/client";
import type { Logger } from "@nestjs/common";
import { safeDecrementReserved } from "../../product/helpers/product-availability.helper";
import { errorMessage } from "../../../common/helpers/error-message";
import { tradeCancelledData } from "./trade-cancellation";
import type { PaymentService } from "../../payment/payment.service";
import type { TradeCommonService } from "../trade-common.service";
import type { TradeShipmentService } from "../lifecycle/trade-shipment.service";

/**
 * KARGO ÖNCESİ TAKAS İPTALİNİN ÇEKİRDEĞİ — süre dolumu taraması
 * (`autoCancelExpiredTrades`) ile birebir aynı adımlar, tek yerde.
 *
 * Çağıran takas satırını FOR UPDATE ile kilitlemiş ve taze okumuş olmalıdır.
 * Çekirdek, kilitli satırda kargo kilidini yeniden doğrular (koli bu arada
 * kargoya verildiyse ya da depoya vardıysa iptal ETMEZ, `null` döner), kabulde
 * yapılan rezervasyonu çözer, takası iptal eder ve kusursuz ödemeleri işaretler.
 * Para hareketi YOKTUR: iade commit SONRASI `settlePreShipmentCancellation` ile
 * izlenen yoldan yapılır (iade sağlayıcıda patlarsa iptal geri alınmaz;
 * `refundFailureReason` + retry yolu toparlar).
 */

/** Kabulde rezervasyon yapılmış statüler — iptal bu rezervasyonu çözer. */
export const PRE_SHIPMENT_RESERVED_STATUSES: readonly TradeStatus[] = [
  TradeStatus.accepted,
  TradeStatus.awaiting_payment,
  TradeStatus.shipping_to_warehouse,
];

/**
 * Kusur ataması (bkz. `trade-refund-policy`):
 * - `none`: kimse kusursuz değil (kargolama süresi aşımı, hiçbir koli verilmedi).
 * - `paid`: ödemesini tamamlamış taraf kusursuz (ödeme süresi aşımı). Callback'i
 *   taramadan SONRA gelen ödeme burada işaretlenemez; ödeme tamamlama yolu onu
 *   kusursuz işaretler (`isPaymentExpiryCancellation`, karar 2026-10-05,
 *   docs/PAYMENTS.md §8).
 * - `all`: iki taraf da kusursuz (platform iptali — kimsenin kusuru değil).
 *   Ödemesi henüz tamamlanmamış satır da işaretlenir: callback iptalden sonra
 *   gelip satırı tamamlarsa ödeme tamamlama yolu takasın iptal edildiğini
 *   görüp ödemeyi izlenen iadeye verir (`payment-fulfillment` →
 *   `trade.cancelled_payment_refund`); tutar bu bayrak sayesinde tamdır.
 */
export type PreShipmentFaultless = "none" | "paid" | "all";

export interface PreShipmentCancelInput {
  /** Kilitli satırın taze hâli. */
  trade: {
    id: string;
    status: TradeStatus;
    firstWarehouseArrivalAt: Date | null;
  };
  actor: CancellationActor;
  reason: string;
  at: Date;
  faultless: PreShipmentFaultless;
  /** Platform iptalinin katalog kodu — yalnız admin yolu yazar. */
  adminCancelReasonCode?: string;
}

export interface PreShipmentCancelOutcome {
  /** Rezervasyonu çözülen ürünler (ürün başına toplam adet). */
  releasedReservations: Array<{ productId: string; quantity: number }>;
}

/**
 * @returns İptal yazıldıysa sonucu; kargo kilidi (koli taşıyıcıda / depoda)
 *   yüzünden atlandıysa `null`.
 */
export async function cancelPreShipmentTradeInTx(
  tx: Prisma.TransactionClient,
  input: PreShipmentCancelInput,
): Promise<PreShipmentCancelOutcome | null> {
  const { trade } = input;

  // Kargo kilidi anlık görüntüde DEĞİL, kilitli tx içinde doğrulanır:
  // koli bu arada kargoya verildiyse ya da depoya vardıysa iptal etme —
  // takas stuck kümesine düşer, admin/kayıp-koli akışı ilgilenir.
  if (trade.status === TradeStatus.shipping_to_warehouse) {
    if (trade.firstWarehouseArrivalAt) return null;
    const shippedLeg = await tx.tradeShipment.findFirst({
      where: {
        tradeId: trade.id,
        leg: "to_warehouse",
        shippedAt: { not: null },
      },
      select: { id: true },
    });
    if (shippedLeg) return null;
  }

  const allItems = await tx.tradeItem.findMany({
    where: { tradeId: trade.id },
  });

  // Release reservations for any non-pending trade being cancelled
  const releasedReservations: PreShipmentCancelOutcome["releasedReservations"] =
    [];
  if (
    PRE_SHIPMENT_RESERVED_STATUSES.includes(trade.status) &&
    allItems.length > 0
  ) {
    const byProduct = new Map<string, number>();
    for (const item of allItems) {
      byProduct.set(
        item.productId,
        (byProduct.get(item.productId) ?? 0) + item.quantity,
      );
    }
    // Kabul anında yapılan rezervasyonu geri al
    for (const [productId, qty] of byProduct) {
      await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId} FOR UPDATE`;
      const prod = await tx.product.findUnique({
        where: { id: productId },
        select: { reservedQuantity: true },
      });
      if (prod) {
        const newReserved = safeDecrementReserved(prod.reservedQuantity, qty);
        await tx.product.update({
          where: { id: productId },
          data: {
            reservedQuantity: newReserved,
            status:
              newReserved > 0 ? ProductStatus.reserved : ProductStatus.active,
          },
        });
        releasedReservations.push({ productId, quantity: qty });
      }
    }
  }

  await tx.trade.update({
    where: { id: trade.id },
    data: {
      ...tradeCancelledData(input.actor, input.at),
      cancelReason: input.reason,
      ...(input.adminCancelReasonCode
        ? { adminCancelReasonCode: input.adminCancelReasonCode }
        : {}),
    },
  });

  if (input.faultless === "paid") {
    // Tamamlanmış her ödeme satırı, üstüne düşeni yapmış tarafa aittir.
    await tx.tradeCashPayment.updateMany({
      where: { tradeId: trade.id, status: PaymentStatus.completed },
      data: { fullRefundEntitled: true },
    });
  } else if (input.faultless === "all") {
    await tx.tradeCashPayment.updateMany({
      where: { tradeId: trade.id },
      data: { fullRefundEntitled: true },
    });
  }

  return { releasedReservations };
}

/** Commit sonrası adımların bağımlılıkları (servisler çağırandan gelir). */
export interface PreShipmentSettleDeps {
  paymentService: Pick<PaymentService, "refundTradeCashTracked">;
  tradeCommon: Pick<TradeCommonService, "invalidateProductCachesForTrade">;
  tradeShipment: Pick<TradeShipmentService, "cancelSuratShipmentsForTrade">;
  logger: Pick<Logger, "warn">;
}

/**
 * İptal COMMIT olduktan sonraki adımlar, taramayla aynı sırada: izlenen iade
 * (asla fırlatmaz; hata `refundFailureReason` yazar), ürün önbelleği, ve
 * taşıyıcıya geçmemiş Sürat etiketlerinin iptali (asla fırlatmaz).
 *
 * Önbellek tazelemesi best-effort'tur (TTL kendiliğinden düzeltir): hatası
 * etiket iptalini atlatmamalı ve commit olmuş bir iptali çağırana hata olarak
 * döndürmemeli.
 */
export async function settlePreShipmentCancellation(
  deps: PreShipmentSettleDeps,
  tradeId: string,
): Promise<Awaited<ReturnType<PaymentService["refundTradeCashTracked"]>>> {
  const refund = await deps.paymentService.refundTradeCashTracked(tradeId);
  try {
    await deps.tradeCommon.invalidateProductCachesForTrade(tradeId);
  } catch (error: unknown) {
    deps.logger.warn(
      `takas ${tradeId} iptali: ürün önbelleği tazelenemedi: ${errorMessage(error)}`,
    );
  }
  await deps.tradeShipment.cancelSuratShipmentsForTrade(tradeId);
  return refund;
}
