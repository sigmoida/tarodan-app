import { Injectable } from "@nestjs/common";
import { OfferStatus, OrderOrigin, Prisma } from "@prisma/client";
import {
  type AnalyticsMetric,
  type AnalyticsTradeResponse,
  type TradeMetricKey,
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
  rateMetric,
  toBreakdown,
  toFunnel,
  toSeries,
  type BucketRow,
} from "./analytics-shapes.helper";

/** The counts one window produces, for the funnels and their rates. */
interface TradeTotals {
  tradesCreated: number;
  tradesAccepted: number;
  tradesCompleted: number;
  tradesRejected: number;
  tradesCancelled: number;
  averageTradeValue: number;
  tradeFeeRevenue: number;
  offersCreated: number;
  offersResponded: number;
  offersAccepted: number;
  offerOrders: number;
}

/**
 * **Takas ve Teklif** — "takas hunisi nerede tıkanıyor, teklifler siparişe
 * dönüyor mu".
 *
 * Huninin adımları KENDİ damgalarından sayılır (`createdAt`, `acceptedAt`,
 * `completedAt`), bu yüzden bir adım kendinden öncekini geçebilir: mart'ta
 * açılıp nisanda tamamlanan takas nisanın tamamlanmasıdır ama nisanın açılışı
 * değildir. Düşüş oranı bu durumda sıfıra kırpılır, negatif kayıp gösterilmez.
 *
 * Ret ile iptal AYRI çıkışlardır. Ret `rejectedAt` damgasını yazarken
 * `cancelledAt`i de yazar (para/stok akışı iptal yoluyla çözülür), bu yüzden
 * "iptal" çıkışı `rejectedAt IS NULL` ile daraltılır — yoksa aynı takas iki
 * kez sayılırdı.
 *
 * Teklif hunisi ise KOHORT'tur: bu dönemde AÇILAN tekliflerin akıbeti izlenir
 * (cevap dönem dışına düşse bile). "Bu dönemde kaç teklif cevaplandı" ile "bu
 * dönemde açılan teklifler cevaplandı mı" farklı sorulardır ve cevap oranı
 * ancak ikincisiyle anlamlıdır.
 */
@Injectable()
export class AnalyticsTradeService extends AnalyticsTabService<AnalyticsTradeResponse> {
  protected readonly tab = "trade" as const;

  constructor(prisma: PrismaService, cache: CacheService) {
    super(prisma, cache);
  }

  protected async compute(
    range: ResolvedAnalyticsRange,
  ): Promise<AnalyticsTradeResponse> {
    const [current, previous, series, byPricingVersion] = await Promise.all([
      this.totals(range.current),
      range.previous ? this.totals(range.previous) : Promise.resolve(null),
      this.series(range),
      this.byPricingVersion(range.current),
    ]);

    return {
      range: toAnalyticsRange(range),
      metrics: this.metrics(current, previous),
      series: [
        toSeries("tradesCreated", series.created, range.buckets),
        toSeries("tradesCompleted", series.completed, range.buckets),
        toSeries("tradeFeeRevenue", series.feeRevenue, range.buckets),
      ],
      funnel: toFunnel([
        { key: "created", count: current.tradesCreated },
        { key: "accepted", count: current.tradesAccepted },
        { key: "completed", count: current.tradesCompleted },
      ]),
      exits: toBreakdown(
        [
          {
            key: "rejected",
            label: "rejected",
            count: current.tradesRejected,
            amount: 0,
          },
          {
            key: "cancelled",
            label: "cancelled",
            count: current.tradesCancelled,
            amount: 0,
          },
        ],
        "count",
      ),
      byPricingVersion,
      truncations: stampTruncations(range.current, [
        "tradeRejectedAt",
        "offerRespondedAt",
      ]),
      offerFunnel: toFunnel([
        { key: "created", count: current.offersCreated },
        { key: "responded", count: current.offersResponded },
        { key: "accepted", count: current.offersAccepted },
        { key: "ordered", count: current.offerOrders },
      ]),
    };
  }

  private metrics(
    current: TradeTotals,
    previous: TradeTotals | null,
  ): Record<TradeMetricKey, AnalyticsMetric> {
    const of = (key: keyof TradeTotals) =>
      metric(current[key], previous ? previous[key] : null);

    return {
      averageTradeValue: of("averageTradeValue"),
      tradeFeeRevenue: of("tradeFeeRevenue"),
      offersCreated: of("offersCreated"),
      offersResponded: of("offersResponded"),
      offersAccepted: of("offersAccepted"),
      offerOrders: of("offerOrders"),
      offerResponseRate: rateMetric(
        current.offersResponded,
        current.offersCreated,
        previous ? previous.offersResponded : null,
        previous ? previous.offersCreated : null,
      ),
      offerConversionRate: rateMetric(
        current.offerOrders,
        current.offersAccepted,
        previous ? previous.offerOrders : null,
        previous ? previous.offersAccepted : null,
      ),
    } satisfies Record<TradeMetricKey, AnalyticsMetric>;
  }

  /**
   * Bir teklifin KABUL edilmiş sayılması: ya hâlâ `accepted` duruyordur ya da
   * ondan bir sipariş doğmuştur. Yalnız duruma bakmak yetmez — kabul edilip
   * ödeme penceresi dolan ya da iadeyle kapanan teklif durumunu değiştirir ama
   * kabul GERÇEKLEŞMİŞTİR.
   */
  private acceptedOfferWhere(
    window: DashboardDateWindow,
  ): Prisma.OfferWhereInput {
    return {
      createdAt: window,
      OR: [{ status: OfferStatus.accepted }, { order: { isNot: null } }],
    };
  }

  private async totals(window: DashboardDateWindow): Promise<TradeTotals> {
    const [
      tradesCreated,
      tradesAccepted,
      tradesCompleted,
      tradesRejected,
      tradesCancelled,
      value,
      fees,
      offersCreated,
      offersResponded,
      offersAccepted,
      offerOrders,
    ] = await Promise.all([
      this.prisma.trade.count({ where: { createdAt: window } }),
      this.prisma.trade.count({ where: { acceptedAt: window } }),
      this.prisma.trade.count({ where: { completedAt: window } }),
      this.prisma.trade.count({ where: { rejectedAt: window } }),
      // Ret de bir iptaldir; çıkışlar birbirini saymasın diye ayrılır.
      this.prisma.trade.count({
        where: { cancelledAt: window, rejectedAt: null },
      }),
      this.averageTradeValue(window),
      // v2 sabit hizmet bedeli + v1'in yüzde bazlı komisyonu (KDV'siyle) —
      // aynı satırda ikisi birden dolu olamaz, bu yüzden toplamak çifte
      // saymaz ve `pricingVersion`a göre dallanmaya gerek kalmaz.
      this.prisma.tradeCashPayment.aggregate({
        _sum: {
          tradeFeeAmount: true,
          commission: true,
          commissionTaxAmount: true,
        },
        where: { paidAt: window },
      }),
      this.prisma.offer.count({ where: { createdAt: window } }),
      this.prisma.offer.count({
        where: { createdAt: window, respondedAt: { not: null } },
      }),
      this.prisma.offer.count({ where: this.acceptedOfferWhere(window) }),
      this.prisma.order.count({
        where: {
          origin: OrderOrigin.offer,
          offer: { is: { createdAt: window } },
        },
      }),
    ]);

    return {
      tradesCreated,
      tradesAccepted,
      tradesCompleted,
      tradesRejected,
      tradesCancelled,
      averageTradeValue: value,
      tradeFeeRevenue:
        num(fees._sum.tradeFeeAmount) +
        num(fees._sum.commission) +
        num(fees._sum.commissionTaxAmount),
      offersCreated,
      offersResponded,
      offersAccepted,
      offerOrders,
    };
  }

  /**
   * Bir takasın DEĞERİ = iki tarafın koyduğu ürünlerin ortalaması, yani
   * `SUM(valueAtTrade) / 2`. Takas iki yönlü bir değişimdir; tek tarafı almak
   * yarısını, ikisini toplamak iki katını gösterirdi.
   *
   * v1 ve v2 aynı `TradeItem` satırlarını yazar, bu yüzden tanım fiyatlama
   * sürümünden bağımsızdır — ücretlendirme farkı `byPricingVersion`da görünür.
   * Eski ekran bu rakamı sabit `0` döndürüyordu.
   */
  private async averageTradeValue(
    window: DashboardDateWindow,
  ): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ value: unknown }>>`
      SELECT COALESCE(AVG(per_trade.value), 0) AS value
      FROM (
        SELECT SUM(ti."value_at_trade") / 2.0 AS value
        FROM "trades" t
        JOIN "trade_items" ti ON ti."trade_id" = t."id"
        WHERE t."completed_at" >= ${window.gte}
          AND t."completed_at" <= ${window.lte}
        GROUP BY t."id"
      ) per_trade`;

    return num(rows[0]?.value);
  }

  private async series(range: ResolvedAnalyticsRange) {
    const [created, completed, feeRevenue] = await Promise.all([
      this.prisma.$queryRaw<BucketRow[]>`
        SELECT ${bucketExpr('"created_at"', range.groupBy)} AS bucket,
               COUNT(*)::bigint AS value
        FROM "trades"
        WHERE "created_at" >= ${range.current.gte}
          AND "created_at" <= ${range.current.lte}
        GROUP BY 1`,
      this.prisma.$queryRaw<BucketRow[]>`
        SELECT ${bucketExpr('"completed_at"', range.groupBy)} AS bucket,
               COUNT(*)::bigint AS value
        FROM "trades"
        WHERE "completed_at" >= ${range.current.gte}
          AND "completed_at" <= ${range.current.lte}
        GROUP BY 1`,
      this.prisma.$queryRaw<BucketRow[]>`
        SELECT ${bucketExpr('"paid_at"', range.groupBy)} AS bucket,
               COALESCE(
                 SUM("trade_fee_amount" + "commission" + "commission_tax_amount"),
                 0
               ) AS value
        FROM "trade_cash_payments"
        WHERE "paid_at" >= ${range.current.gte}
          AND "paid_at" <= ${range.current.lte}
        GROUP BY 1`,
    ]);

    return { created, completed, feeRevenue };
  }

  /**
   * v1 yüzde bazlı komisyon alıyordu, v2 iki taraftan sabit hizmet bedeli.
   * Ücret gelirinin hangi modelden geldiğini ayırmadan "takas geliri düştü"
   * yorumu yapılamaz.
   */
  private async byPricingVersion(window: DashboardDateWindow) {
    const rows = await this.prisma.$queryRaw<
      Array<{ key: string; count: bigint; amount: unknown }>
    >`
      SELECT t."pricing_version" AS key,
             COUNT(DISTINCT t."id")::bigint AS count,
             COALESCE(
               SUM(p."trade_fee_amount" + p."commission" + p."commission_tax_amount"),
               0
             ) AS amount
      FROM "trades" t
      LEFT JOIN "trade_cash_payments" p
        ON p."trade_id" = t."id" AND p."paid_at" IS NOT NULL
      WHERE t."completed_at" >= ${window.gte}
        AND t."completed_at" <= ${window.lte}
      GROUP BY 1`;

    return toBreakdown(
      rows.map((row) => ({
        key: row.key,
        label: row.key,
        count: num(row.count),
        amount: num(row.amount),
      })),
      "count",
    );
  }
}
