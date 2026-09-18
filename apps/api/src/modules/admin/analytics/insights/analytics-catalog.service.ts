import { Injectable } from "@nestjs/common";
import { BoostStatus, Prisma, ProductKind } from "@prisma/client";
import {
  ANALYTICS_PRICE_BANDS,
  type AnalyticsBoostPackageRow,
  type AnalyticsCatalogResponse,
  type AnalyticsMetric,
  type CatalogMetricKey,
} from "@tarodan/types";
import { PrismaService } from "../../../../prisma";
import { CacheService } from "../../../cache/cache.service";
import { catalogProductWhere } from "../../../product/helpers/catalog-product-where";
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
  percent,
  round2,
  toBreakdown,
  toFunnel,
  toSeries,
  type BucketRow,
} from "./analytics-shapes.helper";

interface CatalogTotals {
  listingsCreated: number;
  listingsPublished: number;
  listingsSold: number;
  averagePrice: number;
  medianTimeToSellDays: number;
  medianSellerTimeToFirstSaleDays: number;
  boostRevenue: number;
  boostCount: number;
  averageBoostViewUplift: number;
}

interface BreakdownSqlRow {
  key: string | null;
  label: string | null;
  count: bigint | number;
  amount: unknown;
}

/**
 * **Katalog ve Satıcı** — "ilan açılıyor mu, yayına giriyor mu, satılıyor mu;
 * ve öne çıkarma bunun neresinde".
 *
 * STOK sayıları (şu an kaç aktif ilan var, kaçı onay bekliyor) burada YOK:
 * onlar bir anın fotoğrafı ve dashboard'un işi. Bu sekme yalnız AKIŞ gösterir.
 * Eski ekran ikisini yan yana koyuyordu — "toplam ürün" tüm zamanlardan,
 * "kategori dağılımı" dönemden geliyordu ve aynı kart içinde çelişiyorlardı.
 *
 * Ortalama fiyat `publishedAt`ten okunur ve DURUM FİLTRESİ YOKTUR. Eski hâli
 * `status = active` idi: dönem içinde yayınlanıp satılan ilan ortalamadan
 * düşüyordu, yani ölçüm "yayınlanan ilanların fiyatı" değil "hâlâ satılmamış
 * olanların fiyatı" oluyordu.
 *
 * DİKKAT — `Product.soldAt` bu göçten sonra yazılmaya başladı; daha eski
 * satışlar hiçbir dönemde görünmez.
 */
@Injectable()
export class AnalyticsCatalogService extends AnalyticsTabService<AnalyticsCatalogResponse> {
  protected readonly tab = "catalog" as const;

  constructor(prisma: PrismaService, cache: CacheService) {
    super(prisma, cache);
  }

  protected async compute(
    range: ResolvedAnalyticsRange,
  ): Promise<AnalyticsCatalogResponse> {
    const [current, previous, series, breakdowns, boostPackages] =
      await Promise.all([
        this.totals(range.current),
        range.previous ? this.totals(range.previous) : Promise.resolve(null),
        this.series(range),
        this.breakdowns(range.current),
        this.boostPackages(range.current),
      ]);

    return {
      range: toAnalyticsRange(range),
      metrics: this.metrics(current, previous),
      series: [
        toSeries("listingsPublished", series.published, range.buckets),
        toSeries("listingsSold", series.sold, range.buckets),
        toSeries("boostRevenue", series.boostRevenue, range.buckets),
      ],
      funnel: toFunnel([
        { key: "created", count: current.listingsCreated },
        { key: "published", count: current.listingsPublished },
        { key: "sold", count: current.listingsSold },
      ]),
      ...breakdowns,
      boostPackages,
      truncations: stampTruncations(range.current, ["productSoldAt"]),
    };
  }

  private metrics(
    current: CatalogTotals,
    previous: CatalogTotals | null,
  ): Record<CatalogMetricKey, AnalyticsMetric> {
    const of = (key: keyof CatalogTotals) =>
      metric(current[key], previous ? previous[key] : null);

    return {
      listingsCreated: of("listingsCreated"),
      listingsPublished: of("listingsPublished"),
      listingsSold: of("listingsSold"),
      averagePrice: of("averagePrice"),
      medianTimeToSellDays: of("medianTimeToSellDays"),
      medianSellerTimeToFirstSaleDays: of("medianSellerTimeToFirstSaleDays"),
      boostRevenue: of("boostRevenue"),
      boostCount: of("boostCount"),
      averageBoostViewUplift: of("averageBoostViewUplift"),
    } satisfies Record<CatalogMetricKey, AnalyticsMetric>;
  }

  private async totals(window: DashboardDateWindow): Promise<CatalogTotals> {
    const listing = catalogProductWhere();

    const [created, published, sold, price, timings, boosts, uplift] =
      await Promise.all([
        this.prisma.product.count({ where: { ...listing, createdAt: window } }),
        this.prisma.product.count({
          where: { ...listing, publishedAt: window },
        }),
        this.prisma.product.count({ where: { ...listing, soldAt: window } }),
        // Durum filtresi YOK — bkz. sınıf başlığı.
        this.prisma.product.aggregate({
          _avg: { price: true },
          where: { ...listing, publishedAt: window },
        }),
        this.medians(window),
        this.prisma.productBoost.aggregate({
          _sum: { price: true },
          _count: { _all: true },
          where: { purchasedAt: window, status: { not: BoostStatus.failed } },
        }),
        this.boostUplift(window),
      ]);

    return {
      listingsCreated: created,
      listingsPublished: published,
      listingsSold: sold,
      averagePrice: num(price._avg.price),
      medianTimeToSellDays: timings.timeToSell,
      medianSellerTimeToFirstSaleDays: timings.timeToFirstSale,
      boostRevenue: num(boosts._sum.price),
      boostCount: boosts._count._all,
      averageBoostViewUplift: uplift,
    };
  }

  /**
   * MEDYAN, ortalama değil. Bir tek "iki yıldır duran" ilan ortalamayı
   * tanınmaz hâle getirir; medyan tipik ilanı anlatır.
   *
   * Sürenin başlangıcı yayın anıdır; `publishedAt` null olan eski kayıtlarda
   * oluşturma anına düşülür (aynı geri düşüş sıralama tarafında da var).
   */
  private async medians(window: DashboardDateWindow): Promise<{
    timeToSell: number;
    timeToFirstSale: number;
  }> {
    const [sell, firstSale] = await Promise.all([
      this.prisma.$queryRaw<Array<{ value: unknown }>>`
        SELECT COALESCE(
          PERCENTILE_CONT(0.5) WITHIN GROUP (
            ORDER BY EXTRACT(EPOCH FROM ("sold_at" - COALESCE("published_at", "created_at"))) / 86400.0
          ), 0) AS value
        FROM "products"
        WHERE "kind" = ${ProductKind.listing}::"ProductKind"
          AND "sold_at" >= ${window.gte}
          AND "sold_at" <= ${window.lte}`,

      // Satıcının İLK satışı: ilanlarının en erken `sold_at`i bu döneme
      // düşenler. Ölçüm kaydolma anından başlar — "kaydoldum, ne kadar sonra
      // ilk paramı kazandım".
      this.prisma.$queryRaw<Array<{ value: unknown }>>`
        SELECT COALESCE(
          PERCENTILE_CONT(0.5) WITHIN GROUP (
            ORDER BY EXTRACT(EPOCH FROM (first_sale.at - u."created_at")) / 86400.0
          ), 0) AS value
        FROM (
          SELECT "seller_id", MIN("sold_at") AS at
          FROM "products"
          WHERE "kind" = ${ProductKind.listing}::"ProductKind"
            AND "sold_at" IS NOT NULL
          GROUP BY "seller_id"
        ) first_sale
        JOIN "users" u ON u."id" = first_sale."seller_id"
        WHERE first_sale.at >= ${window.gte}
          AND first_sale.at <= ${window.lte}`,
    ]);

    return {
      timeToSell: round2(num(sell[0]?.value)),
      timeToFirstSale: round2(num(firstSale[0]?.value)),
    };
  }

  /**
   * Öne çıkarmanın ETKİSİ: paket boyunca biriken görüntülenme
   * (`finalViewCount − baselineViewCount`). Ölçümü bitmemiş boost'lar
   * (`final` hâlâ null) ortalamaya girmez — sıfır sayılsalardı etkiyi
   * sistematik olarak küçük gösterirlerdi.
   */
  private async boostUplift(window: DashboardDateWindow): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ value: unknown }>>`
      SELECT COALESCE(AVG("final_view_count" - "baseline_view_count"), 0) AS value
      FROM "product_boosts"
      WHERE "purchased_at" >= ${window.gte}
        AND "purchased_at" <= ${window.lte}
        AND "final_view_count" IS NOT NULL
        AND "baseline_view_count" IS NOT NULL`;

    return round2(num(rows[0]?.value));
  }

  private async series(range: ResolvedAnalyticsRange) {
    const [published, sold, boostRevenue] = await Promise.all([
      this.prisma.$queryRaw<BucketRow[]>`
        SELECT ${bucketExpr('"published_at"', range.groupBy)} AS bucket,
               COUNT(*)::bigint AS value
        FROM "products"
        WHERE "kind" = ${ProductKind.listing}::"ProductKind"
          AND "published_at" >= ${range.current.gte}
          AND "published_at" <= ${range.current.lte}
        GROUP BY 1`,
      this.prisma.$queryRaw<BucketRow[]>`
        SELECT ${bucketExpr('"sold_at"', range.groupBy)} AS bucket,
               COUNT(*)::bigint AS value
        FROM "products"
        WHERE "kind" = ${ProductKind.listing}::"ProductKind"
          AND "sold_at" >= ${range.current.gte}
          AND "sold_at" <= ${range.current.lte}
        GROUP BY 1`,
      this.prisma.$queryRaw<BucketRow[]>`
        SELECT ${bucketExpr('"purchased_at"', range.groupBy)} AS bucket,
               COALESCE(SUM("price"), 0) AS value
        FROM "product_boosts"
        WHERE "purchased_at" >= ${range.current.gte}
          AND "purchased_at" <= ${range.current.lte}
          AND "status" <> ${BoostStatus.failed}::"BoostStatus"
        GROUP BY 1`,
    ]);

    return { published, sold, boostRevenue };
  }

  /** Fiyat bandı CASE'i TEK kaynaktan (`ANALYTICS_PRICE_BANDS`) üretilir. */
  private priceBandExpr(): Prisma.Sql {
    const branches = ANALYTICS_PRICE_BANDS.map((band) =>
      band.max === null
        ? Prisma.sql`WHEN p."price" >= ${band.min} THEN ${band.key}`
        : Prisma.sql`WHEN p."price" >= ${band.min} AND p."price" < ${band.max} THEN ${band.key}`,
    );
    return Prisma.sql`CASE ${Prisma.join(branches, " ")} END`;
  }

  /** Dönem içinde YAYINA GİREN ilanların dağılımı. */
  private async breakdowns(window: DashboardDateWindow) {
    // Kategori adı yalnız ilk sorguda kullanılıyor ama join tek parçada
    // duruyor: üç kırılımın da AYNI evreni saydığından emin olmanın yolu bu.
    const published = Prisma.sql`
      FROM "products" p
      LEFT JOIN "categories" c ON c."id" = p."category_id"
      WHERE p."kind" = ${ProductKind.listing}::"ProductKind"
        AND p."published_at" >= ${window.gte}
        AND p."published_at" <= ${window.lte}`;

    const [categories, bands, conditions] = await Promise.all([
      this.prisma.$queryRaw<BreakdownSqlRow[]>`
        SELECT c."id" AS key, c."name" AS label,
               COUNT(*)::bigint AS count, COALESCE(SUM(p."price"), 0) AS amount
        ${published}
        GROUP BY 1, 2`,
      this.prisma.$queryRaw<BreakdownSqlRow[]>`
        SELECT ${this.priceBandExpr()} AS key, ${this.priceBandExpr()} AS label,
               COUNT(*)::bigint AS count, COALESCE(SUM(p."price"), 0) AS amount
        ${published}
        GROUP BY 1, 2`,
      this.prisma.$queryRaw<BreakdownSqlRow[]>`
        SELECT p."condition"::text AS key, p."condition"::text AS label,
               COUNT(*)::bigint AS count, COALESCE(SUM(p."price"), 0) AS amount
        ${published}
        GROUP BY 1, 2`,
    ]);

    const rows = (source: BreakdownSqlRow[]) =>
      source.map((row) => ({
        key: row.key ?? "",
        label: row.label ?? "",
        count: num(row.count),
        amount: num(row.amount),
      }));

    return {
      byCategory: toBreakdown(rows(categories), "count"),
      byPriceBand: toBreakdown(rows(bands), "count"),
      byCondition: toBreakdown(rows(conditions), "count"),
    };
  }

  /**
   * Paket kırılımı: kaç kez satın alındı, ne kadar getirdi, ne kadar
   * görüntülenme kazandırdı. Paket satırı silinmiş olabilir (`packageId` SetNull
   * ile boşalır), bu yüzden anlık ad `packageName` anlık görüntüsünden okunur.
   */
  private async boostPackages(
    window: DashboardDateWindow,
  ): Promise<AnalyticsBoostPackageRow[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        key: string | null;
        label: string | null;
        count: bigint;
        amount: unknown;
        uplift: unknown;
      }>
    >`
      SELECT COALESCE(b."package_id", '') AS key,
             COALESCE(b."package_name", '') AS label,
             COUNT(*)::bigint AS count,
             COALESCE(SUM(b."price"), 0) AS amount,
             AVG(b."final_view_count" - b."baseline_view_count") AS uplift
      FROM "product_boosts" b
      WHERE b."purchased_at" >= ${window.gte}
        AND b."purchased_at" <= ${window.lte}
        AND b."status" <> ${BoostStatus.failed}::"BoostStatus"
      GROUP BY 1, 2`;

    const total = rows.reduce((sum, row) => sum + num(row.amount), 0);

    return rows
      .map((row) => ({
        key: row.key ?? "",
        label: row.label ?? "",
        count: num(row.count),
        amount: round2(num(row.amount)),
        share: percent(num(row.amount), total),
        // Hiçbir boost ölçümünü bitirmediyse NULL — sıfır "etkisi yok"
        // demektir, "henüz ölçülmedi" değil.
        averageViewUplift: row.uplift == null ? null : round2(num(row.uplift)),
      }))
      .sort((a, b) => b.amount - a.amount);
  }
}
