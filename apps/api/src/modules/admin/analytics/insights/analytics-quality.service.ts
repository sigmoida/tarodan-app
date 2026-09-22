import { Injectable } from "@nestjs/common";
import { OrderOrigin, PaymentStatus, Prisma } from "@prisma/client";
import {
  type AnalyticsMetric,
  type AnalyticsQualityResponse,
  type QualityMetricKey,
} from "@tarodan/types";
import { PrismaService } from "../../../../prisma";
import { CacheService } from "../../../cache/cache.service";
import type { DashboardDateWindow } from "../dashboard-period.helper";
import { paidAtLateral, paidOrderWhere } from "../paid-order.predicate";
import {
  LIVE_ORDER,
  LIVE_PAYMENT,
  LIVE_REFUND_REQUEST,
  col,
  liveOrderRefSql,
  liveRowSql,
} from "../../../account-lane/live-lane.where";
import { AnalyticsTabService } from "./analytics-tab.service";
import {
  toAnalyticsRange,
  type ResolvedAnalyticsRange,
} from "./analytics-range.helper";
import { stampTruncations } from "./analytics-truncation.helper";
import {
  bucketExpr,
  metric,
  num,
  rateMetric,
  round2,
  toBreakdown,
  toSeries,
  type BucketRow,
} from "./analytics-shapes.helper";

interface QualityTotals {
  paidOrders: number;
  refundedOrders: number;
  refundedAmount: number;
  cancelledOrders: number;
  paymentAttempts: number;
  failedPayments: number;
  medianPaidToShippedHours: number;
  medianShippedToDeliveredHours: number;
  medianPaidToDeliveredHours: number;
}

interface BreakdownSqlRow {
  key: string | null;
  count: bigint | number;
  amount: unknown;
}

/**
 * **Kalite ve Operasyon** — "para geri gidiyor mu, sipariş takılıyor mu, ödeme
 * geçiyor mu".
 *
 * Kırılımların anahtarı ENUM değeridir, etiketi ekranda çevrilir: sunucudan
 * hazır Türkçe dize göndermek i18n'i atlamak olurdu.
 *
 * Süreler MEDYANDIR. Bir tek takılı sipariş ortalamayı günlerce kaydırır ve
 * "teslimat yavaşladı" diye okunur; medyan tipik siparişi anlatır.
 */
@Injectable()
export class AnalyticsQualityService extends AnalyticsTabService<AnalyticsQualityResponse> {
  protected readonly tab = "quality" as const;

  constructor(prisma: PrismaService, cache: CacheService) {
    super(prisma, cache);
  }

  protected async compute(
    range: ResolvedAnalyticsRange,
  ): Promise<AnalyticsQualityResponse> {
    const [current, previous, series, breakdowns] = await Promise.all([
      this.totals(range.current),
      range.previous ? this.totals(range.previous) : Promise.resolve(null),
      this.series(range),
      this.breakdowns(range.current),
    ]);

    return {
      range: toAnalyticsRange(range),
      metrics: this.metrics(current, previous),
      series: [
        toSeries("refundedOrders", series.refunded, range.buckets),
        toSeries("cancelledOrders", series.cancelled, range.buckets),
        toSeries("failedPayments", series.failed, range.buckets),
      ],
      ...breakdowns,
      truncations: stampTruncations(range.current, ["orderCancelledAt"]),
    };
  }

  private metrics(
    current: QualityTotals,
    previous: QualityTotals | null,
  ): Record<QualityMetricKey, AnalyticsMetric> {
    const of = (key: keyof QualityTotals) =>
      metric(current[key], previous ? previous[key] : null);

    const rate = (
      part: keyof QualityTotals,
      whole: keyof QualityTotals,
    ): AnalyticsMetric =>
      rateMetric(
        current[part],
        current[whole],
        previous ? previous[part] : null,
        previous ? previous[whole] : null,
      );

    return {
      paidOrders: of("paidOrders"),
      refundedOrders: of("refundedOrders"),
      // İade ve iptal oranlarının paydası AYNI: bu pencerede ÖDENEN sipariş.
      // Tek payda, tek yüklem (`paidOrderWhere`) — iki oran birbiriyle ve satış
      // sekmesinin sipariş sayısıyla karşılaştırılabilir kalır. Sayaçların
      // kendi olayı başka bir döneme ait olabilir; bunlar kohort değil, dönem
      // YÜKÜ göstergesidir ve kart etiketi paydayı açıkça yazar.
      refundRate: rate("refundedOrders", "paidOrders"),
      refundedAmount: of("refundedAmount"),
      cancelledOrders: of("cancelledOrders"),
      cancellationRate: rate("cancelledOrders", "paidOrders"),
      paymentAttempts: of("paymentAttempts"),
      failedPayments: of("failedPayments"),
      paymentFailureRate: rate("failedPayments", "paymentAttempts"),
      medianPaidToShippedHours: of("medianPaidToShippedHours"),
      medianShippedToDeliveredHours: of("medianShippedToDeliveredHours"),
      medianPaidToDeliveredHours: of("medianPaidToDeliveredHours"),
    } satisfies Record<QualityMetricKey, AnalyticsMetric>;
  }

  private async totals(window: DashboardDateWindow): Promise<QualityTotals> {
    const [
      paidOrders,
      refunds,
      cancelledOrders,
      paymentAttempts,
      failedPayments,
      durations,
    ] = await Promise.all([
      this.prisma.order.count({ where: paidOrderWhere(window) }),
      this.prisma.refundRequest.aggregate({
        _count: { _all: true },
        _sum: { amount: true },
        where: { ...LIVE_REFUND_REQUEST, refundedAt: window },
      }),
      this.prisma.order.count({
        where: {
          ...LIVE_ORDER,
          cancelledAt: window,
          origin: { not: OrderOrigin.platform_service },
        },
      }),
      // Ödeme DENEMESİ `createdAt`ten sayılır: başarısız ödeme hiç
      // `paidAt` almaz, `paidAt` üzerinden bakan bir oran paydayı kaybederdi.
      this.prisma.payment.count({
        where: {
          ...LIVE_PAYMENT,
          createdAt: window,
          status: { in: [PaymentStatus.completed, PaymentStatus.failed] },
        },
      }),
      this.prisma.payment.count({
        where: {
          ...LIVE_PAYMENT,
          createdAt: window,
          status: PaymentStatus.failed,
        },
      }),
      this.durations(window),
    ]);

    return {
      paidOrders,
      refundedOrders: refunds._count._all,
      refundedAmount: num(refunds._sum.amount),
      cancelledOrders,
      paymentAttempts,
      failedPayments,
      ...durations,
    };
  }

  /**
   * Teslim süreleri, TESLİM ANI pencerelenerek ölçülür: "bu dönemde teslim
   * edilen siparişler ne kadar sürdü". Ödeme anına göre pencerelenseydi henüz
   * teslim edilmemiş siparişler sessizce dışarıda kalır ve süre kısa görünürdü.
   */
  private async durations(window: DashboardDateWindow) {
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT
        PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (s."shipped_at" - paid."paid_at")) / 3600.0
        ) AS paid_to_shipped,
        PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (s."delivered_at" - s."shipped_at")) / 3600.0
        ) AS shipped_to_delivered,
        PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (s."delivered_at" - paid."paid_at")) / 3600.0
        ) AS paid_to_delivered
      FROM "orders" o
      JOIN "shipments" s ON s."order_id" = o."id"
      ${paidAtLateral("o")}
      WHERE o."origin" <> ${OrderOrigin.platform_service}::"OrderOrigin"
        AND s."delivered_at" >= ${window.gte}
        AND s."delivered_at" <= ${window.lte}
        AND s."shipped_at" IS NOT NULL`;

    const row = rows[0] ?? {};
    return {
      medianPaidToShippedHours: round2(num(row.paid_to_shipped)),
      medianShippedToDeliveredHours: round2(num(row.shipped_to_delivered)),
      medianPaidToDeliveredHours: round2(num(row.paid_to_delivered)),
    };
  }

  private async series(range: ResolvedAnalyticsRange) {
    const [refunded, cancelled, failed] = await Promise.all([
      this.prisma.$queryRaw<BucketRow[]>`
        SELECT ${bucketExpr('"refunded_at"', range.groupBy)} AS bucket,
               COUNT(*)::bigint AS value
        FROM "refund_requests"
        WHERE "refunded_at" >= ${range.current.gte}
          AND "refunded_at" <= ${range.current.lte}
          AND ${liveOrderRefSql(col("refund_requests", "order_id"))}
        GROUP BY 1`,
      this.prisma.$queryRaw<BucketRow[]>`
        SELECT ${bucketExpr('"cancelled_at"', range.groupBy)} AS bucket,
               COUNT(*)::bigint AS value
        FROM "orders"
        WHERE "cancelled_at" >= ${range.current.gte}
          AND "cancelled_at" <= ${range.current.lte}
          AND "origin" <> ${OrderOrigin.platform_service}::"OrderOrigin"
          AND ${liveRowSql("orders")}
        GROUP BY 1`,
      this.prisma.$queryRaw<BucketRow[]>`
        SELECT ${bucketExpr('"created_at"', range.groupBy)} AS bucket,
               COUNT(*)::bigint AS value
        FROM "payments"
        WHERE "created_at" >= ${range.current.gte}
          AND "created_at" <= ${range.current.lte}
          AND "status" = ${PaymentStatus.failed}::"PaymentStatus"
          AND ${liveRowSql("payments")}
        GROUP BY 1`,
    ]);

    return { refunded, cancelled, failed };
  }

  private async breakdowns(window: DashboardDateWindow) {
    const refunded = Prisma.sql`
      FROM "refund_requests" r
      WHERE r."refunded_at" >= ${window.gte}
        AND r."refunded_at" <= ${window.lte}
        AND ${liveOrderRefSql(col("r", "order_id"))}`;

    const cancelled = Prisma.sql`
      FROM "orders" o
      WHERE o."cancelled_at" >= ${window.gte}
        AND o."cancelled_at" <= ${window.lte}
        AND o."origin" <> ${OrderOrigin.platform_service}::"OrderOrigin"
        AND ${liveRowSql("o")}`;

    const [
      reasons,
      faults,
      components,
      cancelReasons,
      cancelTypes,
      installments,
    ] = await Promise.all([
      // `resolvedReason` incelemenin SONUCU; `reason` yalnız alıcının iddiası.
      // Karara varılmamış satırlarda iddiaya düşülür ki satır kaybolmasın.
      this.prisma.$queryRaw<BreakdownSqlRow[]>`
        SELECT COALESCE(r."resolved_reason", r."reason")::text AS key,
               COUNT(*)::bigint AS count, COALESCE(SUM(r."amount"), 0) AS amount
        ${refunded}
        GROUP BY 1`,
      this.prisma.$queryRaw<BreakdownSqlRow[]>`
        SELECT COALESCE(r."fault_party"::text, '') AS key,
               COUNT(*)::bigint AS count, COALESCE(SUM(r."amount"), 0) AS amount
        ${refunded}
        GROUP BY 1`,
      // Paranın hangi KALEMDEN geri gittiği: ürün mü, kargo mu, komisyon mu.
      this.prisma.$queryRaw<BreakdownSqlRow[]>`
        SELECT fc."component_code"::text AS key,
               COUNT(*)::bigint AS count,
               COALESCE(SUM(fc."gross_amount"), 0) AS amount
        FROM "refund_financial_components" fc
        JOIN "refund_requests" r ON r."id" = fc."refund_request_id"
        WHERE r."refunded_at" >= ${window.gte}
          AND r."refunded_at" <= ${window.lte}
          AND ${liveOrderRefSql(col("r", "order_id"))}
        GROUP BY 1`,
      this.prisma.$queryRaw<BreakdownSqlRow[]>`
        SELECT COALESCE(o."cancellation_reason_code"::text, '') AS key,
               COUNT(*)::bigint AS count, COALESCE(SUM(o."total_amount"), 0) AS amount
        ${cancelled}
        GROUP BY 1`,
      this.prisma.$queryRaw<BreakdownSqlRow[]>`
        SELECT COALESCE(o."cancellation_type"::text, '') AS key,
               COUNT(*)::bigint AS count, COALESCE(SUM(o."total_amount"), 0) AS amount
        ${cancelled}
        GROUP BY 1`,
      this.prisma.$queryRaw<BreakdownSqlRow[]>`
        SELECT "installment_count"::text AS key,
               COUNT(*)::bigint AS count, COALESCE(SUM("amount"), 0) AS amount
        FROM "payments"
        WHERE "status" = ${PaymentStatus.completed}::"PaymentStatus"
          AND "paid_at" >= ${window.gte}
          AND "paid_at" <= ${window.lte}
          AND ${liveRowSql("payments")}
        GROUP BY 1`,
    ]);

    const rows = (source: BreakdownSqlRow[]) =>
      source.map((row) => ({
        key: row.key ?? "",
        // Etiket anahtarın kendisidir; çeviri ekranın işi.
        label: row.key ?? "",
        count: num(row.count),
        amount: num(row.amount),
      }));

    return {
      refundsByReason: toBreakdown(rows(reasons), "count"),
      refundsByFault: toBreakdown(rows(faults), "count"),
      refundComponents: toBreakdown(rows(components)),
      cancellationsByReason: toBreakdown(rows(cancelReasons), "count"),
      cancellationsByType: toBreakdown(rows(cancelTypes), "count"),
      installmentMix: toBreakdown(rows(installments), "count"),
    };
  }
}
