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
  outboxStaleProcessingMs,
  type AlertThresholdContext,
} from "../../../../config/alert-thresholds";
import {
  LIVE_ORDER,
  LIVE_TRADE,
  livePayoutTransferSql,
  liveRowSql,
} from "../../../account-lane/live-lane.where";

/**
 * Zone B — "Uyarılar". Normalde OLMAMASI gereken durumlar; sıfırsa satır hiç
 * çizilmez.
 *
 * Her eşik kendi sahibinin okuduğu kaynaktan gelir (Süreler ve Kurallar
 * değerleri `ctx.timing`, teknik eşikler `ctx.config`) — burada hiçbir gün/saat
 * sayısı yazılı DEĞİLDİR. Panel "10 günden uzun" derken cron 14 günü bekliyor
 * olamaz.
 *
 * Test şeridi hiçbir uyarıya girmez: test kolisi taşıyıcıya gitmez (hep
 * "kargoda" kalır), test ödemesi PayTR dökümünde yoktur, test transferi hiç
 * açılmaz — sayılsalar kalıcı sahte alarm olurlardı.
 */

export interface AlertReading {
  count: number;
  amount?: number;
}

export interface AlertDefinition {
  severity: DashboardAlertSeverity;
  threshold?: (ctx: AlertThresholdContext) => DashboardAlertThreshold;
  query: (
    prisma: PrismaService,
    now: Date,
    ctx: AlertThresholdContext,
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
    threshold: (ctx) => ({
      value: ctx.timing.shippedStaleAlertDays,
      unit: "days",
    }),
    query: (prisma, now, ctx) =>
      prisma.order.count({
        where: {
          ...LIVE_ORDER,
          status: OrderStatus.shipped,
          shipment: {
            is: {
              shippedAt: {
                lt: daysAgo(now, ctx.timing.shippedStaleAlertDays),
              },
            },
          },
        },
      }),
    read: count,
  },

  /** Kargoya verilmiş ama depoya HİÇ varmamış takas girişi (kayıp koli adayı). */
  stuckWarehouseTrades: {
    severity: "critical",
    threshold: (ctx) => ({
      value: ctx.timing.tradeLostParcelGraceDays,
      unit: "days",
    }),
    query: (prisma, now, ctx) =>
      prisma.trade.count({
        where: {
          ...LIVE_TRADE,
          status: TradeStatus.shipping_to_warehouse,
          shippingDeadline: {
            lt: daysAgo(now, ctx.timing.tradeLostParcelGraceDays),
          },
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
    threshold: (ctx) => ({
      value: ctx.timing.tradeLostParcelGraceDays,
      unit: "days",
    }),
    query: (prisma, now, ctx) =>
      prisma.trade.count({
        where: {
          ...LIVE_TRADE,
          status: TradeStatus.shipping_to_recipients,
          confirmationDeadline: null,
          shipments: {
            some: {
              leg: "from_warehouse",
              shippedAt: {
                lt: daysAgo(now, ctx.timing.tradeLostParcelGraceDays),
              },
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
          AND ${liveRowSql("p")}
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
    threshold: (ctx) => ({
      value: Math.round(outboxStaleProcessingMs(ctx.config) / 60000),
      unit: "minutes",
    }),
    query: (prisma, now, ctx) =>
      prisma.outboxEvent.count({
        where: {
          status: OutboxStatus.processing,
          updatedAt: {
            lt: new Date(now.getTime() - outboxStaleProcessingMs(ctx.config)),
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
          AND ${liveRowSql("o")}
      `,
    read: (raw) => ({
      count: Number((raw as Array<{ count: bigint }>)?.[0]?.count ?? 0),
    }),
  },

  /** Panelden elle kapatılması gereken, bayatlamış taşıyıcı iptal görevleri. */
  agedCarrierCancellations: {
    severity: "warning",
    threshold: (ctx) => ({
      value: ctx.timing.carrierCancellationAlertHours,
      unit: "hours",
    }),
    query: (prisma, now, ctx) =>
      prisma.carrierCancellationTask.count({
        where: {
          status: "pending",
          requestedAt: {
            lt: new Date(
              now.getTime() -
                ctx.timing.carrierCancellationAlertHours * 60 * 60 * 1000,
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
          AND ${livePayoutTransferSql("payout_transfers")}
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
          ...LIVE_ORDER,
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
