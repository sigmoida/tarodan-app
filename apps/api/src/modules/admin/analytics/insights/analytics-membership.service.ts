import { Injectable } from "@nestjs/common";
import { PaymentStatus, SubscriptionStatus } from "@prisma/client";
import {
  type AnalyticsMembershipResponse,
  type AnalyticsMetric,
  type MembershipMetricKey,
} from "@tarodan/types";
import { PrismaService } from "../../../../prisma";
import { CacheService } from "../../../cache/cache.service";
import type { DashboardDateWindow } from "../dashboard-period.helper";
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
  toBreakdown,
  toSeries,
  type BucketRow,
} from "./analytics-shapes.helper";

interface MembershipTotals {
  newMemberships: number;
  renewals: number;
  churned: number;
  pastDue: number;
  pastDueNow: number;
  membershipRevenue: number;
}

/**
 * **Üyelik** — "kaç yeni üye geldi, kaçı yenilendi, kaçı düştü".
 *
 * Yeni ile yenileme `MembershipPayment.orderId` ile ayrılır: İLK satın alma bir
 * sipariş üzerinden geçer (`orderId` dolu), otomatik yenileme saklı kartla
 * doğrudan çekilir ve siparişi yoktur. Bu ayrım olmadan "üye sayısı arttı" ile
 * "aynı üyeler ödemeye devam etti" aynı rakama düşer.
 *
 * Üyelik geliri TEK kaynaktan — `MembershipPayment` — okunur. Üyelik siparişi
 * `origin = platform_service` olduğu için satış cirosundan zaten dışlanmıştır;
 * burada çifte sayım olmaz.
 */
@Injectable()
export class AnalyticsMembershipService extends AnalyticsTabService<AnalyticsMembershipResponse> {
  protected readonly tab = "membership" as const;

  constructor(prisma: PrismaService, cache: CacheService) {
    super(prisma, cache);
  }

  protected async compute(
    range: ResolvedAnalyticsRange,
  ): Promise<AnalyticsMembershipResponse> {
    const [current, previous, series, byTier] = await Promise.all([
      this.totals(range.current),
      range.previous ? this.totals(range.previous) : Promise.resolve(null),
      this.series(range),
      this.byTier(range.current),
    ]);

    return {
      range: toAnalyticsRange(range),
      metrics: this.metrics(current, previous),
      series: [
        toSeries("newMemberships", series.fresh, range.buckets),
        toSeries("renewals", series.renewals, range.buckets),
        toSeries("membershipRevenue", series.revenue, range.buckets),
      ],
      byTier,
      truncations: stampTruncations(range.current, ["membershipPastDueAt"]),
    };
  }

  private metrics(
    current: MembershipTotals,
    previous: MembershipTotals | null,
  ): Record<MembershipMetricKey, AnalyticsMetric> {
    const of = (key: keyof MembershipTotals) =>
      metric(current[key], previous ? previous[key] : null);

    return {
      newMemberships: of("newMemberships"),
      renewals: of("renewals"),
      churned: of("churned"),
      pastDue: of("pastDue"),
      pastDueNow: of("pastDueNow"),
      membershipRevenue: of("membershipRevenue"),
    } satisfies Record<MembershipMetricKey, AnalyticsMetric>;
  }

  private async totals(
    window: DashboardDateWindow,
  ): Promise<MembershipTotals> {
    const paid = { status: PaymentStatus.completed, createdAt: window };

    const [fresh, renewals, revenue, churned, pastDue, pastDueNow] =
      await Promise.all([
        this.prisma.membershipPayment.count({
          where: { ...paid, orderId: { not: null } },
        }),
        this.prisma.membershipPayment.count({
          where: { ...paid, orderId: null },
        }),
        this.prisma.membershipPayment.aggregate({
          _sum: { amount: true },
          where: paid,
        }),
        // İPTAL ANI damgalıdır; "şu an iptal" değil "bu dönemde iptal edildi".
        this.prisma.userMembership.count({
          where: { cancelledAt: window },
        }),
        // AKIŞ: dönem içinde ödemesiz KALAN üyelik (düşüş anı). Bir ay boyunca
        // düşüp geri toparlanan üyelik dönem sonu fotoğrafında hiç görünmüyordu.
        this.prisma.userMembership.count({ where: { pastDueAt: window } }),
        // STOK: şu an `past_due` duran üyelik. Damga bu göçle geldiği için eski
        // düşüşler akış rakamında YOK; fotoğraf onları da kapsıyor, bu yüzden
        // ikisi birlikte gösterilir ve kart hangisinin ne olduğunu yazar.
        this.prisma.userMembership.count({
          where: { status: SubscriptionStatus.past_due },
        }),
      ]);

    return {
      newMemberships: fresh,
      renewals,
      churned,
      pastDue,
      pastDueNow,
      membershipRevenue: num(revenue._sum.amount),
    };
  }

  private async series(range: ResolvedAnalyticsRange) {
    const window = range.current;
    const bucket = bucketExpr('"created_at"', range.groupBy);

    const [fresh, renewals, revenue] = await Promise.all([
      this.prisma.$queryRaw<BucketRow[]>`
        SELECT ${bucket} AS bucket, COUNT(*)::bigint AS value
        FROM "membership_payments"
        WHERE "status" = ${PaymentStatus.completed}::"PaymentStatus"
          AND "created_at" >= ${window.gte} AND "created_at" <= ${window.lte}
          AND "order_id" IS NOT NULL
        GROUP BY 1`,
      this.prisma.$queryRaw<BucketRow[]>`
        SELECT ${bucket} AS bucket, COUNT(*)::bigint AS value
        FROM "membership_payments"
        WHERE "status" = ${PaymentStatus.completed}::"PaymentStatus"
          AND "created_at" >= ${window.gte} AND "created_at" <= ${window.lte}
          AND "order_id" IS NULL
        GROUP BY 1`,
      this.prisma.$queryRaw<BucketRow[]>`
        SELECT ${bucket} AS bucket, COALESCE(SUM("amount"), 0) AS value
        FROM "membership_payments"
        WHERE "status" = ${PaymentStatus.completed}::"PaymentStatus"
          AND "created_at" >= ${window.gte} AND "created_at" <= ${window.lte}
        GROUP BY 1`,
    ]);

    return { fresh, renewals, revenue };
  }

  /** Gelirin hangi katmandan geldiği — ödemenin HEDEF katmanından okunur. */
  private async byTier(window: DashboardDateWindow) {
    const rows = await this.prisma.$queryRaw<
      Array<{ key: string | null; label: string | null; count: bigint; amount: unknown }>
    >`
      SELECT COALESCE(t."type"::text, '') AS key,
             COALESCE(t."name", '') AS label,
             COUNT(*)::bigint AS count,
             COALESCE(SUM(mp."amount"), 0) AS amount
      FROM "membership_payments" mp
      LEFT JOIN "membership_tiers" t ON t."id" = mp."target_tier_id"
      WHERE mp."status" = ${PaymentStatus.completed}::"PaymentStatus"
        AND mp."created_at" >= ${window.gte}
        AND mp."created_at" <= ${window.lte}
      GROUP BY 1, 2`;

    return toBreakdown(
      rows.map((row) => ({
        key: row.key ?? "",
        label: row.label ?? "",
        count: num(row.count),
        amount: num(row.amount),
      })),
    );
  }
}
