import { Injectable, Logger } from "@nestjs/common";
import {
  CancellationActor,
  OrderStatus,
  PaymentStatus,
  Prisma,
  RefundAttemptStatus,
  ShipmentStatus,
} from "@prisma/client";
import { PrismaService } from "../../../prisma";
import { CacheService } from "../../cache/cache.service";
import { UatProductionCopyService } from "../../admin-test-tools/uat-refresh/uat-production-copy.service";
import { errorMessage } from "../../../common/helpers/error-message";
import { PaymentRefundService } from "./payment-refund.service";
import { RefundPendingReconciliationException } from "../../payment-providers/refund-errors";
import {
  dailyAlarms,
  normalizeRefundSweepBackoff,
  pruneRefundSweepBackoff,
  recordRefundSweepFailure,
  sweepablePaymentWhere,
  waitingOrderIds,
} from "../helpers/refund-sweep-policy";

/**
 * İade sweep'inin aday satırı: siparişin kendi ödemesi (tekil) VEYA grubunun
 * ödemesi (sepet) — hangisi varsa iade kaydı orada tutulur.
 */
const REFUND_SWEEP_CANDIDATE_SELECT = {
  id: true,
  payment: { select: { metadata: true } },
  checkoutGroup: { select: { payment: { select: { metadata: true } } } },
} as const;

interface RefundSweepCandidate {
  id: string;
  payment?: { metadata: unknown } | null;
  checkoutGroup?: { payment?: { metadata: unknown } | null } | null;
}

/** Candidates per branch and run (bounded, ordered: oldest change first). */
const REFUND_SWEEP_BATCH = 50;

/**
 * Attempt states owned by someone else: the stuck-attempt recovery
 * (`prepared`, `succeeded`), the stale-submission quarantine (`submitting`),
 * the status inquiry or a person (`manual_review`). The claim would refuse the
 * sweep anyway (`RefundPendingReconciliation`), only after logging a failure.
 */
const UNRESOLVED_REFUND_ATTEMPT_STATUSES = [
  RefundAttemptStatus.prepared,
  RefundAttemptStatus.submitting,
  RefundAttemptStatus.succeeded,
  RefundAttemptStatus.manual_review,
];

/** Cache keys of the advisory sweep state (helpers/refund-sweep-policy). */
const BACKOFF_KEY = "refund-sweep:backoff";
const RETURNED_ALARM_KEY = "refund-sweep:returned-alarms";
const BACKOFF_TTL_SECONDS = 7 * 24 * 60 * 60;
const ALARM_TTL_SECONDS = 2 * 24 * 60 * 60;

/**
 * Bu sipariş için ödemede KAYITLI bir iade var mı (tam ya da kısmi)?
 *
 * Kayıt varsa iade zaten İCRA EDİLMİŞ bir karardır: kısmi tutar, satıcı kusuru
 * / kargo payı gibi bir settlement'ın sonucudur ve sipariş o kararla kapanmıştır.
 * Sweep ise her zaman TAM tutarı ister — tekrar denerse MONEY-H4 kümülatif tavanı
 * `refundAmountExceedsLimit` fırlatır ve sipariş her cron turunda sonsuza dek
 * "başarısız" loglanır (TARODAN-API-8). Başarısız kalmış bir iade metadata'ya
 * HİÇ yazılmadığından retry hedefi kaybolmaz; yalnız bitmiş işler elenir.
 */
function hasRecordedRefund(metadata: unknown, orderId: string): boolean {
  const meta = (metadata as Record<string, unknown> | null) ?? {};
  const refundedOrders =
    (meta.refundedOrders as Record<string, number> | undefined) ?? {};
  return Number(refundedOrders[orderId] ?? 0) > 0;
}

/**
 * Adayları "iadesi henüz yapılmamış" / "iadesi zaten kayıtlı" diye ayırır
 * (tekil ve grup ödemeler için ortak).
 *
 * `skipped` çağırana geri verilir çünkü atlamanın anlamı DALA GÖRE değişir:
 * terminal durumdaki (cancelled/refunded) bir siparişte iade kararı icra
 * edilmiş demektir ve sessizce elenmesi doğrudur; terminal OLMAYAN bir
 * siparişte ise sipariş takılı kalmış demektir ve görünür olmalıdır.
 */
function partitionRefundCandidates(candidates: RefundSweepCandidate[]): {
  pending: string[];
  skipped: string[];
} {
  const pending: string[] = [];
  const skipped: string[] = [];
  for (const candidate of candidates) {
    const metadata =
      candidate.payment?.metadata ?? candidate.checkoutGroup?.payment?.metadata;
    (hasRecordedRefund(metadata, candidate.id) ? skipped : pending).push(
      candidate.id,
    );
  }
  return { pending, skipped };
}

/**
 * Retry sweep of order refunds that did not go through (cron
 * `payment-expired`, every 5 minutes; `PaymentReconciliationService`
 * delegates here).
 *
 * İptal/iade edilmiş ama ödemesi hâlâ `completed` olan siparişleri bulup PayTR
 * iadesini GÜVENİLİR şekilde tamamlar. Tek bir DB-tabanlı, idempotent,
 * crash'e dayanıklı sweep şu boşlukları birden yedekler:
 *  - K3: alıcı iptali → OrderService.cancel order'ı `refunded` yapar ama iade tetiklemezdi.
 *  - Y9: handleExpiredPreparingOrders order'ı `cancelled` yapıp tx-dışı processRefund çağırır;
 *        başarısızsa eskiden yalnız "MANUAL INTERVENTION" log'u kalırdı — artık burada retry edilir.
 *  - Y7: processSuccessfulPayment cron-yarışı dalındaki tx-dışı iade başarısızlığı.
 * processRefund order'ı `cancelled` + payment'ı `refunded` yaptığından (ve payout
 * tamamlandıysa K1 guard'ı bloke ettiğinden) sweep idempotenttir: işlenen sipariş bir
 * daha eşleşmez. Tek istisna KISMİ iadedir — payment `completed` kalır — bu yüzden
 * her üç dal da `hasRecordedRefund` ile elenir: iadesi bir kez icra edilmiş sipariş
 * sweep'in işi değildir (kalan bakiye admin kararıdır).
 *
 * D1 (Sentry TARODAN-API-3M/3N/3P): a refund the provider keeps refusing is
 * not resent on every run. A failing order waits longer after every failure
 * and is left out of the queries meanwhile; its alarm (error,
 * `REFUND_MANUAL_REVIEW`, one line per order) goes out once a day. An order
 * whose refund has an unresolved attempt belongs to the attempt recovery or
 * to a person. On staging, orders paid before the last production copy are
 * left out (`UatProductionCopyService`).
 */
@Injectable()
export class RefundOrderSweepService {
  private readonly logger = new Logger(RefundOrderSweepService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentRefund: PaymentRefundService,
    private readonly cache: CacheService,
    private readonly productionCopy: UatProductionCopyService,
  ) {}

  async processRefundedOrders(
    now = new Date(),
  ): Promise<{ refunded: number; failed: number }> {
    const [storedBackoff, storedReturnedAlarms, copiedBefore] =
      await Promise.all([
        this.readState(BACKOFF_KEY),
        this.readState(RETURNED_ALARM_KEY),
        this.productionCopy.copiedBefore(now),
      ]);
    const backoff = pruneRefundSweepBackoff(
      normalizeRefundSweepBackoff(storedBackoff),
      now,
    );
    const waiting = waitingOrderIds(backoff, now);
    const sweepable = sweepablePaymentWhere(copiedBefore);

    // Common to the three branches: not while the order waits after a
    // failure, not while another process owns its refund.
    const findCandidates = (where: Prisma.OrderWhereInput) =>
      this.prisma.order.findMany({
        where: {
          ...where,
          ...(waiting.length > 0 ? { id: { notIn: waiting } } : {}),
          refundAttempts: {
            none: { status: { in: UNRESOLVED_REFUND_ATTEMPT_STATUSES } },
          },
        },
        select: REFUND_SWEEP_CANDIDATE_SELECT,
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        take: REFUND_SWEEP_BATCH,
      });

    // 1) Tekil (order-bazlı) ödemeler — Order.payment doğrudan siparişe bağlı.
    // Kısmi iade sonrası payment `completed` KALIR (MONEY-H4: sonraki kısmi iadeler
    // mümkün olsun diye), o yüzden bu sorgu iadesi çoktan bitmiş siparişi de görür →
    // `hasRecordedRefund` ile elenir (grup dalıyla aynı kural).
    const orders = await findCandidates({
      status: { in: [OrderStatus.refunded, OrderStatus.cancelled] },
      payment: { is: { status: PaymentStatus.completed, ...sweepable } },
    });

    // 2) MONEY-H5: GRUP (sepet) siparişleri. Grup ödemesinde Order.payment NULL'dur —
    // ödeme CheckoutGroup'a bağlıdır — bu yüzden yukarıdaki `payment.is.status`
    // filtresi sepet siparişlerini HİÇ görmez ve iptal edilen sepet siparişi asla
    // iade edilmezdi. Grup ödemesi ancak grubun TÜM siparişleri iade edilince
    // `refunded` olduğundan, hâlâ `completed` olan gruptaki iptal/iade siparişleri
    // henüz iade edilmemiş adaylardır. Zaten iade edilmişleri (grup payment
    // metadata.refundedOrders) app tarafında eleriz — aksi halde processRefund
    // `orderAlreadyRefunded` fırlatıp her turda gürültülü REFUND_MANUAL_REVIEW üretir.
    const groupOrders = await findCandidates({
      status: { in: [OrderStatus.refunded, OrderStatus.cancelled] },
      payment: { is: null },
      checkoutGroupId: { not: null },
      checkoutGroup: {
        is: {
          payment: { is: { status: PaymentStatus.completed, ...sweepable } },
        },
      },
    });

    // 3) SEAM-B3 recovery: outbound paket göndericiye İADE DÖNMÜŞ (shipment.status=returned)
    // ama processRefund başarısız olduğu için `refund_requested`'da TAKILI siparişler.
    // surat-tracking `applyTrackingUpdate` bunları refund_requested yapıp processRefund'ı
    // dener; başarısız olursa poller terminal (returned) shipment'ı ARTIK POLLAMADIĞINDAN
    // kendi retry EDEMEZ → burada güvenilir retry. `shipment.status=returned` bunları
    // normal-akış refund_requested siparişlerinden (outbound `delivered`, iade RefundRequest'te
    // ayrı izlenir) ayıran güvenli ayraçtır. processRefund başarınca order=cancelled → bir
    // daha eşleşmez (idempotent).
    const returnedStuckOrders = await findCandidates({
      status: OrderStatus.refund_requested,
      shipment: { is: { status: ShipmentStatus.returned } },
      ...(copiedBefore
        ? {
            OR: [
              { payment: { is: sweepable } },
              { checkoutGroup: { is: { payment: { is: sweepable } } } },
            ],
          }
        : {}),
    });

    // Dal 1 ve 2'de atlananlar TERMİNAL durumdadır (cancelled/refunded): iade
    // kararı icra edilmiş, sipariş kapanmıştır → sessizce elenirler. Dal 3'te ise
    // sipariş `refund_requested`, yani terminal DEĞİL: iadesi kısmen kaydedilmiş
    // ama sipariş kapanmamış bir paket bu sweep dışında hiçbir yerden ilerlemez
    // (poller terminal shipment'ı artık pollamaz) → sessiz kalmasın, günde bir
    // kez (sipariş başına) uyar.
    const returnedCandidates = partitionRefundCandidates(returnedStuckOrders);
    const returnedAlarms = dailyAlarms(
      storedReturnedAlarms,
      returnedCandidates.skipped,
      now,
    );
    for (const orderId of returnedAlarms.due) {
      this.logger.warn(
        `REFUND_MANUAL_REVIEW: order ${orderId} has a recorded refund but is still refund_requested; ` +
          `the refund sweep cannot close it, manual review needed`,
      );
    }

    const allOrderIds = [
      ...partitionRefundCandidates(orders).pending,
      ...partitionRefundCandidates(groupOrders).pending,
      ...returnedCandidates.pending,
    ];

    let refunded = 0;
    let failed = 0;
    for (const orderId of allOrderIds) {
      try {
        // Dal 1-2: sipariş zaten iptal (aktörü korunur). Dal 3: paket
        // göndericiye iade döndü — kimse "iptal et" demedi, sistem kapatır.
        await this.paymentRefund.processRefund(orderId, undefined, {
          cancelledBy: CancellationActor.system,
        });
        refunded++;
        delete backoff[orderId];
      } catch (error) {
        failed++;
        if (error instanceof RefundPendingReconciliationException) {
          // The refund now has an unresolved attempt (e.g. PayTR said nothing
          // is left, or the outcome is unknown): the next runs leave the order
          // out, and the manual review alarm names that attempt.
          this.logger.warn(
            `Auto-refund of order ${orderId} handed to refund attempt reconciliation: ${errorMessage(error)}`,
          );
          delete backoff[orderId];
          continue;
        }
        const { entry, alarm } = recordRefundSweepFailure(
          backoff[orderId],
          now,
        );
        backoff[orderId] = entry;
        // One line per order (the Sentry repeat throttle keys it by the
        // order id). Stock is restored at cancel time, so a stuck refund
        // only holds the buyer's money.
        const line =
          `REFUND_MANUAL_REVIEW: auto-refund of order ${orderId} failed: ${errorMessage(error)} ` +
          `(failure ${entry.failures} since ${entry.firstFailedAt}, next try after ${entry.nextAttemptAt})`;
        if (alarm) {
          this.logger.error(line);
        } else {
          this.logger.warn(line);
        }
      }
    }

    await this.writeState(
      BACKOFF_KEY,
      storedBackoff,
      backoff,
      BACKOFF_TTL_SECONDS,
    );
    await this.writeState(
      RETURNED_ALARM_KEY,
      storedReturnedAlarms,
      returnedAlarms.stamps,
      ALARM_TTL_SECONDS,
    );
    return { refunded, failed };
  }

  /** The cache is advisory: unreadable means "no state", the old behaviour. */
  private async readState(key: string): Promise<unknown> {
    try {
      return await this.cache.get<unknown>(key);
    } catch (error) {
      this.logger.warn(
        `Refund sweep state ${key} unreadable, sweeping without it: ${errorMessage(error)}`,
      );
      return null;
    }
  }

  private async writeState(
    key: string,
    previous: unknown,
    next: object,
    ttlSeconds: number,
  ): Promise<void> {
    const unchanged =
      JSON.stringify(previous ?? {}) === JSON.stringify(next) &&
      Object.keys(next).length === 0;
    if (unchanged) return;
    try {
      await this.cache.set(key, next, { ttl: ttlSeconds });
    } catch (error) {
      this.logger.warn(
        `Refund sweep state ${key} not saved: ${errorMessage(error)}`,
      );
    }
  }
}
