import {
  CommissionRuleSetStatus,
  CouponReservationStatus,
  OrderStatus,
  OutboxStatus,
  PaymentHoldStatus,
  PayoutStatus,
  PaytrMatchStatus,
  Prisma,
  ShippingTariffStatus,
  TradeStatus,
} from "@prisma/client";
import type {
  DashboardAlertKey,
  DashboardAlertSeverity,
  DashboardAlertThreshold,
} from "@tarodan/types";
import type { PrismaService } from "../../../../prisma";
import {
  carrierCancellationAlertHours,
  outboxStaleProcessingMs,
  shippedStaleAlertDays,
  type ThresholdConfigReader,
} from "../../../../config/alert-thresholds";
import { tradeLostParcelGraceDays } from "../../../../common/helpers/trade-escrow";

/**
 * Zone B — "Uyarılar". Normalde OLMAMASI gereken durumlar; sıfırsa satır hiç
 * çizilmez.
 *
 * Her eşik kendi sahibinin okuduğu kaynaktan gelir (env/config/policy helper) —
 * burada hiçbir gün/saat sayısı yazılı DEĞİLDİR. Panel "10 günden uzun" derken
 * cron 14 günü bekliyor olamaz.
 */

export interface AlertReading {
  count: number;
  amount?: number;
}

export interface AlertDefinition {
  severity: DashboardAlertSeverity;
  threshold?: (config?: ThresholdConfigReader) => DashboardAlertThreshold;
  query: (
    prisma: PrismaService,
    now: Date,
    config?: ThresholdConfigReader,
  ) => Prisma.PrismaPromise<unknown>;
  read: (raw: unknown) => AlertReading;
}

const count = (raw: unknown): AlertReading => ({ count: Number(raw ?? 0) });

/** Yapılandırma EKSİKSE uyarır: aktif kayıt sayısı sıfır olduğunda tek satır. */
const missingConfig = (raw: unknown): AlertReading => ({
  count: Number(raw ?? 0) === 0 ? 1 : 0,
});

const daysAgo = (now: Date, days: number) =>
  new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

/**
 * Bu üç uyarı PayTR/defter mutabakatının `diagnostics` çıktısından gelir
 * (RevenueSplitService.compute) — sorgusu burada değil, servistedir.
 */
export const DIAGNOSTIC_ALERT_KEYS = [
  "commissionLedgerDrift",
  "paymentsWithoutOrders",
  "ordersWithoutHold",
] as const satisfies readonly DashboardAlertKey[];

export type QueryableAlertKey = Exclude<
  DashboardAlertKey,
  (typeof DIAGNOSTIC_ALERT_KEYS)[number]
>;

export const ALERT_DEFINITIONS: Record<QueryableAlertKey, AlertDefinition> = {
  /** Kargo poll'u teslimatı hiç raporlamazsa sipariş asla faturalanamaz. */
  stuckShippedOrders: {
    severity: "critical",
    threshold: (config) => ({
      value: shippedStaleAlertDays(config),
      unit: "days",
    }),
    query: (prisma, now, config) =>
      prisma.order.count({
        where: {
          status: OrderStatus.shipped,
          shipment: {
            is: {
              shippedAt: { lt: daysAgo(now, shippedStaleAlertDays(config)) },
            },
          },
        },
      }),
    read: count,
  },

  /** Kargoya verilmiş ama depoya HİÇ varmamış takas girişi (kayıp koli adayı). */
  stuckWarehouseTrades: {
    severity: "critical",
    threshold: () => ({ value: tradeLostParcelGraceDays(), unit: "days" }),
    query: (prisma, now) =>
      prisma.trade.count({
        where: {
          status: TradeStatus.shipping_to_warehouse,
          shippingDeadline: { lt: daysAgo(now, tradeLostParcelGraceDays()) },
          firstWarehouseArrivalAt: null,
          shipments: {
            some: { leg: "to_warehouse", shippedAt: { not: null } },
          },
        },
      }),
    read: count,
  },

  /**
   * Depodan çıkmış ama teslim raporu hiç gelmemiş takas (çıkış bacağı).
   * trade-reconciliation cron'unun TRADE_OUTBOUND_DELIVERY_MISSING alarmıyla
   * aynı küme: teslim damgası gelmediği için onay penceresi hiç açılmamıştır
   * (`confirmationDeadline` null).
   */
  stuckOutboundTrades: {
    severity: "warning",
    threshold: () => ({ value: tradeLostParcelGraceDays(), unit: "days" }),
    query: (prisma, now) =>
      prisma.trade.count({
        where: {
          status: TradeStatus.shipping_to_recipients,
          confirmationDeadline: null,
          shipments: {
            some: {
              leg: "from_warehouse",
              shippedAt: { lt: daysAgo(now, tradeLostParcelGraceDays()) },
            },
          },
        },
      }),
    read: count,
  },

  /**
   * PayTR dökümünde karşılığı bulunamayan tahsilat. Ödeme ile döküm satırı
   * arasında ilişki tanımlı olmadığı için (payment_id düz kolon) tek `NOT
   * EXISTS` ham sorgusuyla sayılır — bellekte eşleştirme yapılmaz.
   *
   * Pencere: son 30 gün, son 2 gün HARİÇ. Döküm bir iki gün gecikmeyle gelir;
   * dünün tahsilatını "eksik" diye alarma sokmak yalnız gürültü üretir.
   */
  paymentsMissingFromStatement: {
    severity: "warning",
    threshold: () => ({ value: 48, unit: "hours" }),
    query: (prisma, now) => {
      const from = daysAgo(now, 30);
      const to = new Date(now.getTime() - 48 * 60 * 60 * 1000);
      return prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM "payments" p
        WHERE p."status" = 'completed'
          AND p."paid_at" >= ${from}
          AND p."paid_at" < ${to}
          AND NOT EXISTS (
            SELECT 1 FROM "paytr_statement_lines" l
            WHERE l."payment_id" = p."id"
          )
      `;
    },
    read: (raw) => ({
      count: Number((raw as Array<{ count: bigint }>)?.[0]?.count ?? 0),
    }),
  },

  /** Eşleşmemiş / tutarı tutmayan, kimsenin kapatmadığı döküm satırları. */
  unresolvedStatementLines: {
    severity: "warning",
    query: (prisma) =>
      prisma.paytrStatementLine.count({
        where: {
          matchStatus: {
            in: [PaytrMatchStatus.unmatched, PaytrMatchStatus.amount_mismatch],
          },
          resolvedAt: null,
        },
      }),
    read: count,
  },

  /** DLQ: deneme bütçesi tükenmiş yan etkiler (fatura, defter, bildirim). */
  outboxDead: {
    severity: "critical",
    query: (prisma) =>
      prisma.outboxEvent.count({ where: { status: OutboxStatus.dead } }),
    read: count,
  },

  /** Drainer'ın kurtarma eşiğini aşmış `processing` claim'i — süreç çökmüş. */
  outboxStuckProcessing: {
    severity: "warning",
    threshold: (config) => ({
      value: Math.round(outboxStaleProcessingMs(config) / 60000),
      unit: "minutes",
    }),
    query: (prisma, now, config) =>
      prisma.outboxEvent.count({
        where: {
          status: OutboxStatus.processing,
          updatedAt: {
            lt: new Date(now.getTime() - outboxStaleProcessingMs(config)),
          },
        },
      }),
    read: count,
  },

  /**
   * Aktif komisyon kural seti YOKSA checkout KAPALI hata verir (catch-all kural
   * bulunamaz). Sessiz kalması satışın tamamen durması demektir.
   */
  noActiveCommissionRuleSet: {
    severity: "critical",
    query: (prisma) =>
      prisma.commissionRuleSet.count({
        where: { status: CommissionRuleSetStatus.ACTIVE },
      }),
    read: missingConfig,
  },

  /** Aktif kargo tarifesi yoksa kargo bedeli hesaplanamaz. */
  noActiveShippingTariff: {
    severity: "critical",
    query: (prisma) =>
      prisma.shippingTariff.count({
        where: { status: ShippingTariffStatus.active },
      }),
    read: missingConfig,
  },

  /** Süresi dolmuş ama hâlâ `active` kupon rezervasyonu = kilitli kampanya bütçesi. */
  staleCouponReservations: {
    severity: "warning",
    query: (prisma, now) =>
      prisma.couponReservation.count({
        where: {
          status: CouponReservationStatus.active,
          expiresAt: { lt: now },
        },
      }),
    read: count,
  },

  /**
   * Teslim edilmiş siparişin escrow'u tutuluyor ama serbest bırakma TARİHİ hiç
   * yazılmamış: hiçbir cron bu hold'u açamaz, satıcı süresiz bekler.
   */
  deliveredHoldsWithoutRelease: {
    severity: "critical",
    // PaymentHold'un Order'a Prisma ilişkisi yok (order_id düz kolon), bu yüzden
    // tek JOIN'lik ham sorgu — iki listeyi bellekte kesiştirmek yerine.
    query: (prisma) =>
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM "payment_holds" h
        JOIN "orders" o ON o."id" = h."order_id"
        WHERE h."status" = ${PaymentHoldStatus.held}::"PaymentHoldStatus"
          AND h."release_at" IS NULL
          AND o."status" IN ('delivered', 'completed')
      `,
    read: (raw) => ({
      count: Number((raw as Array<{ count: bigint }>)?.[0]?.count ?? 0),
    }),
  },

  /** Panelden elle kapatılması gereken, bayatlamış taşıyıcı iptal görevleri. */
  agedCarrierCancellations: {
    severity: "warning",
    threshold: (config) => ({
      value: carrierCancellationAlertHours(config),
      unit: "hours",
    }),
    query: (prisma, now, config) =>
      prisma.carrierCancellationTask.count({
        where: {
          status: "pending",
          requestedAt: {
            lt: new Date(
              now.getTime() -
                carrierCancellationAlertHours(config) * 60 * 60 * 1000,
            ),
          },
        },
      }),
    read: count,
  },

  /** Deneme hakkı bitmiş ama hâlâ `retry_pending` bekleyen transfer talimatı. */
  exhaustedPayoutRetries: {
    severity: "critical",
    query: (prisma) =>
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM "payout_transfers"
        WHERE "status" = ${PayoutStatus.retry_pending}::"PayoutStatus"
          AND "retry_count" >= "max_retries"
      `,
    read: (raw) => ({
      count: Number((raw as Array<{ count: bigint }>)?.[0]?.count ?? 0),
    }),
  },

  /**
   * ERKEN UYARI (henüz hata değil): önümüzdeki 24 saatte hazırlama süresi
   * dolacak siparişler. Dolduğunda sipariş otomatik iptal olur.
   */
  preparingDeadlineWithin24h: {
    severity: "info",
    threshold: () => ({ value: 24, unit: "hours" }),
    query: (prisma, now) =>
      prisma.order.count({
        where: {
          status: OrderStatus.paid,
          preparingDeadline: {
            gte: now,
            lt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          },
        },
      }),
    read: count,
  },
};

/** Mutabakat teşhislerinin ağırlığı — tanım tek yerde kalsın diye burada. */
export const DIAGNOSTIC_ALERT_SEVERITY: Record<
  (typeof DIAGNOSTIC_ALERT_KEYS)[number],
  DashboardAlertSeverity
> = {
  commissionLedgerDrift: "critical",
  paymentsWithoutOrders: "critical",
  ordersWithoutHold: "critical",
};
