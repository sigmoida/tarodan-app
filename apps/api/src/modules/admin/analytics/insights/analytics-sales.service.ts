import { Injectable } from "@nestjs/common";
import { CommissionLedgerStatus, Prisma } from "@prisma/client";
import {
  ANALYTICS_PRICE_BANDS,
  type AnalyticsBreakdownRow,
  type AnalyticsLeaderRow,
  type AnalyticsMetric,
  type AnalyticsSalesResponse,
  type SalesMetricKey,
} from "@tarodan/types";
import { PrismaService } from "../../../../prisma";
import { CacheService } from "../../../cache/cache.service";
import {
  ledgerNetRevenue,
  type LedgerNetSums,
} from "../../../commission/ledger-net";
import type { DashboardDateWindow } from "../dashboard-period.helper";
import { paidOrdersCte } from "../paid-order.predicate";
import { AnalyticsTabService } from "./analytics-tab.service";
import {
  toAnalyticsRange,
  type ResolvedAnalyticsRange,
} from "./analytics-range.helper";
import {
  bucketExpr,
  metric,
  num,
  toBreakdown,
  toSeries,
  type BucketRow,
} from "./analytics-shapes.helper";

/** How many rows a leaderboard shows. */
const LEADERBOARD_LIMIT = 10;

/** The raw totals one window produces — one row, one query. */
interface SalesTotals {
  orderCount: number;
  gmv: number;
  collectedShipping: number;
  discountCost: number;
  platformFundedDiscount: number;
  feeDiscountCost: number;
  carrierCost: number;
  netRevenue: number;
  refundedAmount: number;
}

interface BreakdownSqlRow {
  key: string | null;
  label: string | null;
  count: bigint | number;
  amount: Prisma.Decimal | null;
}

/**
 * **Satış ve Gelir** — "bu dönemde ne kadar sattık, platform ondan ne kazandı,
 * ve parayı geri ne yedi".
 *
 * Her rakam kendi olayından okunur:
 * - Ciro ve sipariş sayısı `Payment.paidAt` (grup sepeti dahil), sanal
 *   siparişler hariç.
 * - Platform NET geliri `CommissionLedger.earnedAt` + {@link ledgerNetRevenue} —
 *   finans özetiyle AYNI formül. Brüt `Order.commissionAmount` artık hiçbir
 *   yerde "komisyon geliri" diye gösterilmiyor: iade edilen komisyonu içeriyor
 *   ve aynı ekranda defterle çelişiyordu.
 * - İade `RefundRequest.refundedAt` + `amount` — KISMİ iadeler dahil.
 *
 * Liderlik tabloları GERÇEK satıştan sıralanır. Eski ekran `viewCount`
 * gösteriyordu: görüntülenme tüm zamanların sayacıdır, dönemi yoktur ve satışla
 * ilgisi kanıtlanmamıştır.
 */
@Injectable()
export class AnalyticsSalesService extends AnalyticsTabService<AnalyticsSalesResponse> {
  protected readonly tab = "sales" as const;

  constructor(prisma: PrismaService, cache: CacheService) {
    super(prisma, cache);
  }

  protected async compute(
    range: ResolvedAnalyticsRange,
  ): Promise<AnalyticsSalesResponse> {
    const [current, previous] = await Promise.all([
      this.totals(range.current),
      range.previous ? this.totals(range.previous) : Promise.resolve(null),
    ]);

    const [gmvSeries, netSeries, refundSeries, breakdowns, leaders] =
      await Promise.all([
        this.paidSeries(range),
        this.netRevenueSeries(range),
        this.refundSeries(range),
        this.breakdowns(range.current),
        this.leaderboards(range.current),
      ]);

    return {
      range: toAnalyticsRange(range),
      metrics: this.metrics(current, previous),
      series: [
        toSeries("gmv", gmvSeries.gmv, range.buckets),
        toSeries("orderCount", gmvSeries.orderCount, range.buckets),
        toSeries("netRevenue", netSeries, range.buckets),
        toSeries("refundedAmount", refundSeries, range.buckets),
      ],
      ...breakdowns,
      ...leaders,
    };
  }

  private metrics(
    current: SalesTotals,
    previous: SalesTotals | null,
  ): Record<SalesMetricKey, AnalyticsMetric> {
    const basket = (totals: SalesTotals) =>
      totals.orderCount === 0 ? 0 : totals.gmv / totals.orderCount;

    const of = (key: keyof SalesTotals) =>
      metric(current[key], previous ? previous[key] : null);

    // `satisfies` is the completeness check: a key added to the catalogue
    // without a definition here fails to compile rather than reaching the
    // screen as `undefined`.
    return {
      gmv: of("gmv"),
      orderCount: of("orderCount"),
      averageBasket: metric(basket(current), previous ? basket(previous) : null),
      netRevenue: of("netRevenue"),
      discountCost: of("discountCost"),
      platformFundedDiscount: of("platformFundedDiscount"),
      feeDiscountCost: of("feeDiscountCost"),
      collectedShipping: of("collectedShipping"),
      carrierCost: of("carrierCost"),
      refundedAmount: of("refundedAmount"),
    } satisfies Record<SalesMetricKey, AnalyticsMetric>;
  }

  /** Every money figure of one window. Four queries, no row ever loaded. */
  private async totals(window: DashboardDateWindow): Promise<SalesTotals> {
    const cte = paidOrdersCte(window);

    const [orders, carrier, ledger, refunds] = await Promise.all([
      this.prisma.$queryRaw<
        Array<Record<string, unknown>>
      >`WITH ${cte} SELECT
          COUNT(*)::bigint AS order_count,
          COALESCE(SUM("total_amount"), 0) AS gmv,
          COALESCE(SUM("shipping_cost"), 0) AS collected_shipping,
          COALESCE(SUM("discount_amount"), 0) AS discount_cost,
          COALESCE(SUM("platform_funded_discount"), 0) AS platform_funded_discount,
          COALESCE(SUM("buyer_fee_discount_amount" + "seller_fee_discount_amount"), 0) AS fee_discount_cost
        FROM paid_orders`,

      // Kargonun GERÇEKTE faturaladığı tutar, tahsil edilenin karşısına konur.
      // `carrier_actual_cost` mutabakat sonrası dolar; henüz dolmamış gönderi
      // sıfır sayılır — abartmaktansa eksik göstermek dürüst olan.
      this.prisma.$queryRaw<
        Array<Record<string, unknown>>
      >`WITH ${cte} SELECT COALESCE(SUM(s."carrier_actual_cost"), 0) AS carrier_cost
        FROM paid_orders po
        JOIN "shipments" s ON s."order_id" = po."id"`,

      this.prisma.commissionLedger.aggregate({
        _sum: {
          sellerCommission: true,
          refundedSellerCommission: true,
          buyerFee: true,
          refundedBuyerFee: true,
        },
        where: {
          earnedAt: window,
          status: { not: CommissionLedgerStatus.waived },
        },
      }),

      this.prisma.refundRequest.aggregate({
        _sum: { amount: true },
        where: { refundedAt: window },
      }),
    ]);

    const row = orders[0] ?? {};

    return {
      orderCount: num(row.order_count),
      gmv: num(row.gmv),
      collectedShipping: num(row.collected_shipping),
      discountCost: num(row.discount_cost),
      platformFundedDiscount: num(row.platform_funded_discount),
      feeDiscountCost: num(row.fee_discount_cost),
      carrierCost: num(carrier[0]?.carrier_cost),
      netRevenue: ledgerNetRevenue(ledger._sum as LedgerNetSums),
      refundedAmount: num(refunds._sum.amount),
    };
  }

  private async paidSeries(range: ResolvedAnalyticsRange) {
    const rows = await this.prisma.$queryRaw<
      Array<{ bucket: string; order_count: bigint; gmv: Prisma.Decimal }>
    >`WITH ${paidOrdersCte(range.current)} SELECT
        ${bucketExpr('"paid_at"', range.groupBy)} AS bucket,
        COUNT(*)::bigint AS order_count,
        COALESCE(SUM("total_amount"), 0) AS gmv
      FROM paid_orders
      GROUP BY 1`;

    return {
      gmv: rows.map((row) => ({ bucket: row.bucket, value: row.gmv })),
      orderCount: rows.map((row) => ({
        bucket: row.bucket,
        value: row.order_count,
      })),
    };
  }

  /**
   * Net gelir kovaları defterin HAK EDİŞ anından okunur — ödeme anından değil.
   * Komisyon teslimle hak edilir; ödemeyle değil.
   */
  private netRevenueSeries(range: ResolvedAnalyticsRange): Promise<BucketRow[]> {
    return this.prisma.$queryRaw<BucketRow[]>`
      SELECT ${bucketExpr('"earned_at"', range.groupBy)} AS bucket,
             COALESCE(
               SUM("seller_commission" - "refunded_seller_commission"
                 + "buyer_fee" - "refunded_buyer_fee"),
               0
             ) AS value
      FROM "commission_ledger"
      WHERE "earned_at" >= ${range.current.gte}
        AND "earned_at" <= ${range.current.lte}
        AND "status" <> ${CommissionLedgerStatus.waived}::"CommissionLedgerStatus"
      GROUP BY 1`;
  }

  private refundSeries(range: ResolvedAnalyticsRange): Promise<BucketRow[]> {
    return this.prisma.$queryRaw<BucketRow[]>`
      SELECT ${bucketExpr('"refunded_at"', range.groupBy)} AS bucket,
             COALESCE(SUM("amount"), 0) AS value
      FROM "refund_requests"
      WHERE "refunded_at" >= ${range.current.gte}
        AND "refunded_at" <= ${range.current.lte}
      GROUP BY 1`;
  }

  /** Fiyat bandı CASE'i TEK kaynaktan (`ANALYTICS_PRICE_BANDS`) üretilir. */
  private priceBandExpr(): Prisma.Sql {
    const branches = ANALYTICS_PRICE_BANDS.map((band) =>
      band.max === null
        ? Prisma.sql`WHEN po."total_amount" >= ${band.min} THEN ${band.key}`
        : Prisma.sql`WHEN po."total_amount" >= ${band.min} AND po."total_amount" < ${band.max} THEN ${band.key}`,
    );
    return Prisma.sql`CASE ${Prisma.join(branches, " ")} END`;
  }

  private async breakdowns(window: DashboardDateWindow): Promise<{
    byCategory: AnalyticsBreakdownRow[];
    byBrand: AnalyticsBreakdownRow[];
    byPriceBand: AnalyticsBreakdownRow[];
  }> {
    const cte = paidOrdersCte(window);

    const [categories, brands, bands] = await Promise.all([
      this.prisma.$queryRaw<BreakdownSqlRow[]>`WITH ${cte} SELECT
          c."id" AS key, c."name" AS label,
          COUNT(*)::bigint AS count, COALESCE(SUM(po."total_amount"), 0) AS amount
        FROM paid_orders po
        JOIN "products" p ON p."id" = po."product_id"
        LEFT JOIN "categories" c ON c."id" = p."category_id"
        GROUP BY 1, 2`,

      this.prisma.$queryRaw<BreakdownSqlRow[]>`WITH ${cte} SELECT
          b."id" AS key, b."name" AS label,
          COUNT(*)::bigint AS count, COALESCE(SUM(po."total_amount"), 0) AS amount
        FROM paid_orders po
        JOIN "products" p ON p."id" = po."product_id"
        LEFT JOIN "brands" b ON b."id" = p."brand_id"
        GROUP BY 1, 2`,

      this.prisma.$queryRaw<BreakdownSqlRow[]>`WITH ${cte} SELECT
          ${this.priceBandExpr()} AS key, ${this.priceBandExpr()} AS label,
          COUNT(*)::bigint AS count, COALESCE(SUM(po."total_amount"), 0) AS amount
        FROM paid_orders po
        GROUP BY 1, 2`,
    ]);

    return {
      byCategory: this.toRows(categories),
      byBrand: this.toRows(brands),
      byPriceBand: this.toRows(bands),
    };
  }

  /**
   * Kategorisiz/markasız satır KAYBEDİLMEZ: `key` boş kalır ve etiketi ekranda
   * çevrilir. Sunucudan Türkçe bir dize göndermek i18n'i atlamak olurdu.
   */
  private toRows(rows: BreakdownSqlRow[]): AnalyticsBreakdownRow[] {
    return toBreakdown(
      rows.map((row) => ({
        key: row.key ?? "",
        label: row.label ?? "",
        count: num(row.count),
        amount: num(row.amount),
      })),
    );
  }

  private async leaderboards(window: DashboardDateWindow): Promise<{
    topSellers: AnalyticsLeaderRow[];
    topProducts: AnalyticsLeaderRow[];
  }> {
    const cte = paidOrdersCte(window);

    const [sellers, products] = await Promise.all([
      this.prisma.$queryRaw<BreakdownSqlRow[]>`WITH ${cte} SELECT
          po."seller_id" AS key, u."display_name" AS label,
          COUNT(*)::bigint AS count, COALESCE(SUM(po."total_amount"), 0) AS amount
        FROM paid_orders po
        JOIN "users" u ON u."id" = po."seller_id"
        GROUP BY 1, 2
        ORDER BY amount DESC
        LIMIT ${LEADERBOARD_LIMIT}`,

      this.prisma.$queryRaw<BreakdownSqlRow[]>`WITH ${cte} SELECT
          po."product_id" AS key, p."title" AS label,
          COUNT(*)::bigint AS count, COALESCE(SUM(po."total_amount"), 0) AS amount
        FROM paid_orders po
        JOIN "products" p ON p."id" = po."product_id"
        GROUP BY 1, 2
        ORDER BY amount DESC
        LIMIT ${LEADERBOARD_LIMIT}`,
    ]);

    const toLeaders = (rows: BreakdownSqlRow[]): AnalyticsLeaderRow[] =>
      rows.map((row) => ({
        id: row.key ?? "",
        label: row.label ?? "",
        orderCount: num(row.count),
        gmv: num(row.amount),
      }));

    return { topSellers: toLeaders(sellers), topProducts: toLeaders(products) };
  }
}
