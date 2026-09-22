import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../prisma";
import { AnalyticsQueryDto } from "../dto";
import {
  BoostStatus,
  CommissionLedgerStatus,
  OrderStatus,
  PaymentStatus,
  Prisma,
  ProductKind,
  ProductStatus,
  RefundAttemptStatus,
} from "@prisma/client";
import {
  DASHBOARD_METRIC_KEYS,
  type DashboardMetric,
  type DashboardMetricKey,
  type DashboardPeriodQuery,
  type DashboardStatsResponse,
} from "@tarodan/types";
import { AdminAnalyticsCommonService } from "./admin-analytics-common.service";
import { CacheService } from "../../cache/cache.service";
import {
  resolveDashboardRange,
  resolveThisMonthWindow,
  resolveYesterdayWindow,
  type DashboardDateWindow,
  type ResolvedDashboardRange,
} from "./dashboard-period.helper";
import { trCalendarDate } from "../../../common/helpers/tr-calendar";
import {
  ledgerNetRevenue,
  type LedgerNetSums,
} from "../../commission/ledger-net";
import { paidOrderWhere } from "./paid-order.predicate";
import {
  completedPayoutAmountSql,
  completedPayoutWhere,
} from "./completed-payout.predicate";

type LedgerAggregate = { _sum: LedgerNetSums };

/**
 * Bir dashboard metriğinin TEK tanımı. `window` verilmediğinde sorgu tarih
 * filtresi uygulamaz — yani "tüm zamanlar" da aynı tanımdan okunur.
 */
interface DashboardMetricDefinition {
  query: (
    window: DashboardDateWindow | undefined,
  ) => Prisma.PrismaPromise<unknown>;
  /** Ham sonucu sayıya çevirir; varsayılan: `count` sonucu. */
  toValue?: (raw: unknown) => number;
}

const countValue = (raw: unknown): number => Number(raw ?? 0);

/** `aggregate` sonucundaki `_sum` alanlarını toplar. */
const sumOf =
  (...fields: string[]) =>
  (raw: unknown): number => {
    const sums = (raw as { _sum: Record<string, unknown> })?._sum ?? {};
    return fields.reduce((total, field) => total + Number(sums[field] ?? 0), 0);
  };

/**
 * `aggregate` sonucundaki `_sum` alanlarını AYRI AYRI sayıya çevirir — brüt −
 * iade edilen gibi işaretli birleşimler `sumOf` gibi düz toplamla ifade
 * edilemediğinde (7 ve 8 numaralı kartlar) kullanılır.
 */
const sumFields = (
  raw: unknown,
  fields: readonly string[],
): Record<string, number> => {
  const sums = (raw as { _sum: Record<string, unknown> })?._sum ?? {};
  return Object.fromEntries(
    fields.map((field) => [field, Number(sums[field] ?? 0)]),
  );
};

const roundMetric = (value: number): number => Math.round(value * 100) / 100;

/**
 * Bir olay damgası filtresi. Pencere yoksa "damga var" koşuluna düşer; böylece
 * "tüm zamanlar" da AYNI olaydan sayılır, `createdAt`e kaymaz.
 */
const stamped = (
  window: DashboardDateWindow | undefined,
): DashboardDateWindow | { not: null } => window ?? { not: null };

/** Teslim edilmiş siparişlerin ortak yüklemi — adet ve tutar aynı satırları okur. */
const deliveredOrderWhere = (
  window: DashboardDateWindow | undefined,
): Prisma.OrderWhereInput => ({ deliveredAt: stamped(window) });

/** Tamamlanmış üyelik ödemesinin ortak yüklemi — gelir ve adet aynı satırları okur. */
const membershipPaymentWhere = (
  window: DashboardDateWindow | undefined,
): Prisma.MembershipPaymentWhereInput => ({
  status: PaymentStatus.completed,
  createdAt: window,
});

/** Geçerli (başarısız olmayan) öne çıkarmanın ortak yüklemi. */
const boostWhere = (
  window: DashboardDateWindow | undefined,
): Prisma.ProductBoostWhereInput => ({
  purchasedAt: stamped(window),
  status: { not: BoostStatus.failed },
});

/**
 * Hak ediş defteri satırlarının ortak yüklemi (feragat edilmemiş, hak ediş
 * ANI pencerede) — net gelir, net gelir adedi, hizmet bedeli ve komisyon
 * kartlarının HEPSİ aynı satır kümesini okur.
 */
const ledgerEarnedWhere = (
  window: DashboardDateWindow | undefined,
): Prisma.CommissionLedgerWhereInput => ({
  earnedAt: stamped(window),
  status: { not: CommissionLedgerStatus.waived },
});

/**
 * Hizmet bedeli/komisyon ADEDİ, kırılımı SIFIR OLMAYAN satırları sayar —
 * `componentBreakdownComplete = false` eski satırlarda bu alanlar 0'dır,
 * yani eski dönemler bu kartlarda dürüstçe eksik görünür (bkz. noteKey).
 */
const serviceFeeCountWhere = (
  window: DashboardDateWindow | undefined,
): Prisma.CommissionLedgerWhereInput => ({
  ...ledgerEarnedWhere(window),
  OR: [
    { buyerPlatformFeeAmount: { gt: 0 } },
    { sellerPlatformFeeAmount: { gt: 0 } },
  ],
});

const commissionCountWhere = (
  window: DashboardDateWindow | undefined,
): Prisma.CommissionLedgerWhereInput => ({
  ...ledgerEarnedWhere(window),
  OR: [
    { buyerCommissionAmount: { gt: 0 } },
    { sellerCommissionAmount: { gt: 0 } },
  ],
});

/**
 * Sonuçlanmış (finalized) iade denemeleri — TAKAS iadeleri hariç (`orderId`
 * dolu satırlar). `delivered` ayrımı RefundAttempt'te kendi başına
 * tutulmuyor: karar, siparişin TESLİM EDİLMİŞ olup olmamasından türetilir
 * (teslim edilmişse İADE, edilmemişse İPTAL — 2026 karar).
 */
const finalizedOrderRefundWhere = (
  window: DashboardDateWindow | undefined,
  delivered: boolean,
): Prisma.RefundAttemptWhereInput => ({
  status: RefundAttemptStatus.finalized,
  finalizedAt: stamped(window),
  orderId: { not: null },
  order: { is: { deliveredAt: delivered ? { not: null } : null } },
});

/**
 * Ödenmiş kolinin yüklemi: kolinin EN AZ BİR siparişi pencerede ödenmiş
 * olmalı (aynı `paidOrderWhere`, platform_service hariç). Koli bazında
 * sayıldığı için birden çok siparişi olan bir koli tek sefer sayılır —
 * `orders: { some: … }` `Order` değil `OrderPackage` satırlarını döner.
 */
const paidPackageWhere = (
  window: DashboardDateWindow | undefined,
): Prisma.OrderPackageWhereInput => ({
  orders: { some: paidOrderWhere(window) },
});

/**
 * Analitik & dashboard grubu (dönem özeti, snapshot, satış/gelir/kullanıcı
 * analitiği, komisyon geliri, son siparişler) — AdminAnalyticsService'ten
 * birebir taşındı. Bekleyen işler ve uyarılar artık burada DEĞİL: onlar
 * `dashboard/admin-dashboard-worklist.service.ts`in işi.
 */
@Injectable()
export class AdminAnalyticsDashboardService {
  /**
   * Seçili dönem (filtreyle değişen pencere): 5 dk. Anahtar, ölçülen
   * pencereyi birebir taşır. "Bu ay" (bkz. aşağı) de büyümeye devam ettiği
   * için aynı TTL'i paylaşır.
   */
  static readonly PERIOD_CACHE_TTL_SECONDS = 5 * 60;
  /**
   * Tamamen GEÇMİŞTE kalan özel aralık bir daha değişmez (yeni satır o
   * pencereye düşemez), bu yüzden çok daha uzun tutulabilir. "Dün" + "tüm
   * zamanlar" sabit üçlüsü de aynı süreyi paylaşır (bkz. aşağı).
   */
  static readonly CLOSED_RANGE_CACHE_TTL_SECONDS = 6 * 60 * 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly common: AdminAnalyticsCommonService,
    private readonly cache: CacheService,
  ) {}

  // ==================== ANALYTICS & REPORTS ====================

  /**
   * Zone C — "Dönem özeti" (dashboard'un TEK tarih filtreli bölgesi).
   *
   * Her metrik TEK yerde tanımlanır ({@link metricDefinitions}). Her kart DÖRT
   * rakam gösterir: filtrenin değiştirdiği TEK sayı (`period`) + filtreden
   * TAMAMEN bağımsız üç sabit değer (`yesterday`, `thisMonth`, `allTime`).
   * Dördü de aynı tanımdan okunur — "dönem" ile "tüm zamanlar" arasında sessiz
   * bir formül ayrışması olamaz — ama İKİ AYRI önbellekte tutulur (bkz.
   * {@link getPeriodMetrics}, {@link getClosedFixedMetrics},
   * {@link getThisMonthMetrics}): filtreyi değiştirmek sabit üçlüyü yeniden
   * hesaplatmaz.
   *
   * Ölçüm OLAY damgalarından yapılır (ödeme anı, teslim anı, iptal anı, iade
   * anı, hak ediş anı) — `status + createdAt` değil. Her tarih sınırı Türkiye
   * takvimine göre çözülür (bkz. `dashboard-period.helper.ts`).
   */
  async getDashboardStats(
    query?: DashboardPeriodQuery,
  ): Promise<DashboardStatsResponse> {
    const now = new Date();
    const range = resolveDashboardRange(query, now);

    const [period, closed, thisMonth] = await Promise.all([
      this.getPeriodMetrics(range, now),
      this.getClosedFixedMetrics(now),
      this.getThisMonthMetrics(now),
    ]);

    const metrics = {} as Record<DashboardMetricKey, DashboardMetric>;
    DASHBOARD_METRIC_KEYS.forEach((key) => {
      metrics[key] = {
        period: period[key],
        yesterday: closed[key].yesterday,
        thisMonth: thisMonth[key],
        allTime: closed[key].allTime,
      };
    });

    return {
      range: {
        type: range.type,
        from: range.current.gte.toISOString(),
        to: range.current.lte.toISOString(),
      },
      metrics,
    };
  }

  /**
   * Dönem özetinin önbelleğini düşürür (ekrandaki "yenile") — seçili dönemin
   * önbelleğini VE sabit üçlünün önbelleğini birlikte temizler; biri
   * unutulursa "yenile" yarım iş yapmış olur.
   */
  async invalidatePeriodCache(): Promise<void> {
    await Promise.all([
      this.cache.delPattern("admin:dashboard:period:*"),
      this.cache.delPattern("admin:dashboard:fixed:*"),
    ]);
  }

  /** Seçili dönem — filtre değiştikçe okunan TEK pencere, TEK `$transaction`. */
  private async getPeriodMetrics(
    range: ResolvedDashboardRange,
    now: Date,
  ): Promise<Record<DashboardMetricKey, number>> {
    const { key, ttl } = this.periodCacheKey(range, now);
    return this.cache.getOrSet(key, () => this.computeWindow(range.current), {
      ttl,
    });
  }

  /**
   * "Dün" + "tüm zamanlar" — filtreden TAMAMEN bağımsız, Türkiye gününe göre
   * anahtarlanır. İkisi de fiilen kapanmış sayılır (dün asla değişmez, tüm
   * zamanlar günün geri kalanında sadece büyür ama ekranda hafif bayat kalması
   * kabul edilebilir), bu yüzden uzun TTL'i paylaşırlar ve TEK `$transaction`
   * içinde okunurlar.
   */
  private async getClosedFixedMetrics(
    now: Date,
  ): Promise<
    Record<DashboardMetricKey, { yesterday: number; allTime: number }>
  > {
    const key = `admin:dashboard:fixed:v1:closed:${trCalendarDate(now)}`;
    return this.cache.getOrSet(key, () => this.computeClosedFixed(now), {
      ttl: AdminAnalyticsDashboardService.CLOSED_RANGE_CACHE_TTL_SECONDS,
    });
  }

  /**
   * "Bu ay" — filtreden bağımsız ama üst sınırı "şimdi" olduğundan gün
   * boyunca büyümeye devam eder; seçili dönemle AYNI kısa TTL'i ve aynı
   * zaman-kovası anahtarlama tekniğini kullanır (aksi halde her istek yeni
   * anahtar üretir ve önbellek hiç tutmazdı).
   */
  private async getThisMonthMetrics(
    now: Date,
  ): Promise<Record<DashboardMetricKey, number>> {
    const ttl = AdminAnalyticsDashboardService.PERIOD_CACHE_TTL_SECONDS;
    const bucket = Math.floor(now.getTime() / (ttl * 1000));
    const key = `admin:dashboard:fixed:v1:month:${trCalendarDate(now)}:${bucket}`;
    return this.cache.getOrSet(
      key,
      () => this.computeWindow(resolveThisMonthWindow(now)),
      { ttl },
    );
  }

  /**
   * Önbellek anahtarı ölçülen pencereyi taşımalı, yoksa iki farklı dönem aynı
   * satırı okur. Canlı pencerenin `lte`si "şimdi" olduğundan anahtar TTL
   * boyutunda kovalara yuvarlanır — aksi halde her istek yeni anahtar üretir
   * ve önbellek hiç tutmazdı.
   */
  private periodCacheKey(
    range: ResolvedDashboardRange,
    now: Date,
  ): { key: string; ttl: number } {
    const from = range.current.gte.toISOString();
    const closed =
      range.type === "custom" && range.current.lte.getTime() < now.getTime();

    if (closed) {
      return {
        // v3: dönem sözleşmesi "önceki dönem" trendini (previous/changePercent)
        // kaybetti, sabit Dün/Bu ay üçlüsü eklendi — eski anahtarın
        // önbelleğinde eski şekilli bir satır kalmasın diye sürüm arttı.
        key: `admin:dashboard:period:v3:custom:${from}:${range.current.lte.toISOString()}`,
        ttl: AdminAnalyticsDashboardService.CLOSED_RANGE_CACHE_TTL_SECONDS,
      };
    }

    const ttl = AdminAnalyticsDashboardService.PERIOD_CACHE_TTL_SECONDS;
    const bucket = Math.floor(now.getTime() / (ttl * 1000));
    return {
      key: `admin:dashboard:period:v3:${range.type}:${from}:${bucket}`,
      ttl,
    };
  }

  /** Bir pencereyi TEK `$transaction` içinde her metrik tanımından okur. */
  private async computeWindow(
    window: DashboardDateWindow | undefined,
  ): Promise<Record<DashboardMetricKey, number>> {
    const definitions = this.metricDefinitions();
    const rows = await this.prisma.$transaction(
      DASHBOARD_METRIC_KEYS.map((key) => definitions[key].query(window)),
    );

    const result = {} as Record<DashboardMetricKey, number>;
    DASHBOARD_METRIC_KEYS.forEach((key, index) => {
      const toValue = definitions[key].toValue ?? countValue;
      result[key] = roundMetric(toValue(rows[index]));
    });
    return result;
  }

  /** "Dün" + "tüm zamanlar", İKİ pencere TEK `$transaction` içinde. */
  private async computeClosedFixed(
    now: Date,
  ): Promise<
    Record<DashboardMetricKey, { yesterday: number; allTime: number }>
  > {
    const definitions = this.metricDefinitions();
    // `undefined` pencere = tarih filtresi yok = tüm zamanlar.
    const windows: Array<DashboardDateWindow | undefined> = [
      resolveYesterdayWindow(now),
      undefined,
    ];

    const rows = await this.prisma.$transaction(
      DASHBOARD_METRIC_KEYS.flatMap((key) =>
        windows.map((window) => definitions[key].query(window)),
      ),
    );

    const result = {} as Record<
      DashboardMetricKey,
      { yesterday: number; allTime: number }
    >;
    DASHBOARD_METRIC_KEYS.forEach((key, index) => {
      const toValue = definitions[key].toValue ?? countValue;
      const offset = index * windows.length;
      result[key] = {
        yesterday: roundMetric(toValue(rows[offset])),
        allTime: roundMetric(toValue(rows[offset + 1])),
      };
    });
    return result;
  }

  /**
   * Metrik kataloğu: anahtar → o metriğin TEK sorgu tanımı.
   *
   * Tanım bir pencere alır; `undefined` geldiğinde tarih filtresi uygulanmaz.
   */
  private metricDefinitions(): Record<
    DashboardMetricKey,
    DashboardMetricDefinition
  > {
    return {
      paidOrders: {
        query: (window) =>
          this.prisma.order.count({ where: paidOrderWhere(window) }),
      },
      paidAmount: {
        query: (window) =>
          this.prisma.order.aggregate({
            _sum: { totalAmount: true },
            where: paidOrderWhere(window),
          }),
        toValue: sumOf("totalAmount"),
      },
      // Kullanıcılara ödenen hak ediş: satıcı escrow'u + takas nakit hak
      // edişi AYNI tabloda (`PayoutTransfer`), tek yüklem ikisini kapsar.
      sellerPayoutCount: {
        query: (window) =>
          this.prisma.payoutTransfer.count({
            where: completedPayoutWhere(window),
          }),
      },
      sellerPayoutAmount: {
        // COALESCE(submittedAmount, netAmount) satır satır seçim gerektirir;
        // Prisma `_sum` tek kolon topladığı için ham SQL (bkz. predicate).
        query: (window) =>
          this.prisma.$queryRaw<
            Array<{ total: unknown }>
          >`${completedPayoutAmountSql(window)}`,
        toValue: (raw) =>
          Number((raw as Array<{ total: unknown }>)[0]?.total ?? 0),
      },
      // Kullanıcılara ödenen İADE: teslim edilmiş siparişin finalize iadesi.
      returnRefundCount: {
        query: (window) =>
          this.prisma.refundAttempt.count({
            where: finalizedOrderRefundWhere(window, true),
          }),
      },
      returnRefundAmount: {
        query: (window) =>
          this.prisma.refundAttempt.aggregate({
            _sum: { amount: true },
            where: finalizedOrderRefundWhere(window, true),
          }),
        toValue: sumOf("amount"),
      },
      // Kullanıcılara ödenen İPTAL: teslim edilMEMİŞ siparişin finalize iadesi.
      cancelRefundCount: {
        query: (window) =>
          this.prisma.refundAttempt.count({
            where: finalizedOrderRefundWhere(window, false),
          }),
      },
      cancelRefundAmount: {
        query: (window) =>
          this.prisma.refundAttempt.aggregate({
            _sum: { amount: true },
            where: finalizedOrderRefundWhere(window, false),
          }),
        toValue: sumOf("amount"),
      },
      cancelledOrders: {
        // DİKKAT: `cancelledAt` bu göçten sonra yazılmaya başladı; daha eski
        // iptaller hiçbir dönemde görünmez (dürüst backfill yok).
        query: (window) =>
          this.prisma.order.count({ where: { cancelledAt: stamped(window) } }),
      },
      completedTrades: {
        query: (window) =>
          this.prisma.trade.count({ where: { completedAt: stamped(window) } }),
      },
      completedTradeAmount: {
        // Takas ÜCRETİ değil, takasın kendisi için İKİ TARAFTAN toplam
        // tahsil edilen nakit. `Trade.completedAt`e göre pencerelenir —
        // ödemenin kendi `paidAt`i değil, takasın TAMAMLANMA anı.
        query: (window) =>
          this.prisma.tradeCashPayment.aggregate({
            _sum: { totalAmount: true },
            where: {
              status: PaymentStatus.completed,
              trade: { completedAt: stamped(window) },
            },
          }),
        toValue: sumOf("totalAmount"),
      },
      tradeFeeRevenue: {
        // v2 sabit hizmet bedeli + v1'in yüzde bazlı komisyonu (KDV'siyle) —
        // ikisi de BRÜT. Aynı satırda ikisi birden dolu olamaz, bu yüzden
        // toplamak çifte saymaz; `pricingVersion`a göre dallanmaya gerek yok.
        query: (window) =>
          this.prisma.tradeCashPayment.aggregate({
            _sum: {
              tradeFeeAmount: true,
              commission: true,
              commissionTaxAmount: true,
            },
            where: { paidAt: stamped(window) },
          }),
        toValue: sumOf("tradeFeeAmount", "commission", "commissionTaxAmount"),
      },
      netRevenue: {
        query: (window) =>
          this.prisma.commissionLedger.aggregate({
            _sum: {
              sellerCommission: true,
              refundedSellerCommission: true,
              buyerFee: true,
              refundedBuyerFee: true,
            },
            where: ledgerEarnedWhere(window),
          }),
        // TEK formül (ledgerNetRevenue) — finans özetiyle aynı kaynak. Brüt
        // `Order.commissionAmount` kartı KALDIRILDI: aynı ekranda bu sayıyla
        // çelişen ikinci bir "komisyon geliri" gösteriyordu.
        toValue: (raw) => ledgerNetRevenue((raw as LedgerAggregate)._sum),
      },
      netRevenueCount: {
        query: (window) =>
          this.prisma.commissionLedger.count({
            where: ledgerEarnedWhere(window),
          }),
      },
      // Tarodan hizmet bedelleri (alıcı + satıcı, iadeler düşülmüş). `sellerCommission`/
      // `buyerFee` (yukarıdaki `netRevenue`) TÜM satırlarda dolu tutulan
      // toplam kolonlardır; bu kart yalnız v2 kırılımını (component split)
      // okur — `componentBreakdownComplete = false` eski satırlarda 0'dır,
      // yani eski dönemler için 7+8 toplamı 6'ya (netRevenue) eşit olmayabilir
      // (bkz. admin kartındaki noteKey).
      serviceFeeCount: {
        query: (window) =>
          this.prisma.commissionLedger.count({
            where: serviceFeeCountWhere(window),
          }),
      },
      serviceFeeAmount: {
        query: (window) =>
          this.prisma.commissionLedger.aggregate({
            _sum: {
              buyerPlatformFeeAmount: true,
              sellerPlatformFeeAmount: true,
              refundedBuyerPlatformFeeAmount: true,
              refundedSellerPlatformFeeAmount: true,
            },
            where: ledgerEarnedWhere(window),
          }),
        toValue: (raw) => {
          const s = sumFields(raw, [
            "buyerPlatformFeeAmount",
            "sellerPlatformFeeAmount",
            "refundedBuyerPlatformFeeAmount",
            "refundedSellerPlatformFeeAmount",
          ]);
          return (
            s.buyerPlatformFeeAmount +
            s.sellerPlatformFeeAmount -
            s.refundedBuyerPlatformFeeAmount -
            s.refundedSellerPlatformFeeAmount
          );
        },
      },
      // Tarodan komisyonları (alıcı + satıcı, iadeler düşülmüş) — aynı v2
      // kırılımı kısıtı `serviceFee*` için yazılan notla burada da geçerli.
      commissionCount: {
        query: (window) =>
          this.prisma.commissionLedger.count({
            where: commissionCountWhere(window),
          }),
      },
      commissionAmount: {
        query: (window) =>
          this.prisma.commissionLedger.aggregate({
            _sum: {
              buyerCommissionAmount: true,
              sellerCommissionAmount: true,
              refundedBuyerCommissionAmount: true,
              refundedSellerCommissionAmount: true,
            },
            where: ledgerEarnedWhere(window),
          }),
        toValue: (raw) => {
          const s = sumFields(raw, [
            "buyerCommissionAmount",
            "sellerCommissionAmount",
            "refundedBuyerCommissionAmount",
            "refundedSellerCommissionAmount",
          ]);
          return (
            s.buyerCommissionAmount +
            s.sellerCommissionAmount -
            s.refundedBuyerCommissionAmount -
            s.refundedSellerCommissionAmount
          );
        },
      },
      // Toplam kargo: paket başına TAM bedel (alıcı+satıcı payı birlikte),
      // pencerede ÖDENMİŞ en az bir siparişi olan kolilerden. Koli bazında
      // sayıldığı için birden çok siparişi olan koli çift sayılmaz.
      shippingCount: {
        query: (window) =>
          this.prisma.orderPackage.count({ where: paidPackageWhere(window) }),
      },
      shippingAmount: {
        query: (window) =>
          this.prisma.orderPackage.aggregate({
            _sum: { fullShippingAmount: true },
            where: paidPackageWhere(window),
          }),
        toValue: sumOf("fullShippingAmount"),
      },
      deliveredOrders: {
        query: (window) =>
          this.prisma.order.count({ where: deliveredOrderWhere(window) }),
      },
      deliveredAmount: {
        query: (window) =>
          this.prisma.order.aggregate({
            _sum: { totalAmount: true },
            where: deliveredOrderWhere(window),
          }),
        toValue: sumOf("totalAmount"),
      },
      membershipRevenue: {
        // MembershipPayment TEK kaynaktır. Üyelik siparişi (origin =
        // platform_service) ödenen sipariş tutarından zaten dışlandığı için
        // burada çifte sayım olmaz.
        query: (window) =>
          this.prisma.membershipPayment.aggregate({
            _sum: { amount: true },
            where: membershipPaymentWhere(window),
          }),
        toValue: sumOf("amount"),
      },
      membershipCount: {
        query: (window) =>
          this.prisma.membershipPayment.count({
            where: membershipPaymentWhere(window),
          }),
      },
      boostRevenue: {
        // `purchasedAt` aktivasyon anında damgalanır — satın alma olayı budur.
        query: (window) =>
          this.prisma.productBoost.aggregate({
            _sum: { price: true },
            where: boostWhere(window),
          }),
        toValue: sumOf("price"),
      },
      boostCount: {
        query: (window) =>
          this.prisma.productBoost.count({ where: boostWhere(window) }),
      },
      newUsers: {
        query: (createdAt) => this.prisma.user.count({ where: { createdAt } }),
      },
      newListings: {
        query: (window) =>
          this.prisma.product.count({
            where: { kind: ProductKind.listing, publishedAt: stamped(window) },
          }),
      },
      signedInUsers: {
        // DİKKAT — bu "ziyaretçi" DEĞİL: `lastActivityAt` yalnız BAŞARILI
        // GİRİŞTE damgalanıyor (auth/utils/login-stamp.ts), yani "son girişi bu
        // pencereye düşen kayıtlı kullanıcı" demek. Anonim trafik hiçbir yerde
        // ölçülmüyor. Tek bir "son" damga tutulduğu için iki dönemde de aktif
        // olan kullanıcı yalnız SONRAKİ pencerede sayılır — geçmiş pencereler
        // olduğundan düşük görünür, bu yüzden trend satırı gösterilmez.
        query: (lastActivityAt) =>
          this.prisma.user.count({
            where: { lastActivityAt: stamped(lastActivityAt) },
          }),
      },
    };
  }

  /**
   * Get recent orders for dashboard
   * Requirement: Recent Orders Panel (7.1)
   */
  async getRecentOrders(limit: number = 10) {
    const orders = await this.prisma.order.findMany({
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        buyer: { select: { id: true, displayName: true } },
        product: { select: { id: true, title: true } },
      },
    });

    return orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      buyerName: o.buyer.displayName,
      productTitle: o.product.title,
      amount: Number(o.totalAmount),
      status: o.status,
      createdAt: o.createdAt,
    }));
  }

  /**
   * Get top-N most-viewed products for the dashboard widget.
   * Ordered by viewCount desc; returns display fields consumed by the admin table
   * (id, title, thumbnail, viewCount, seller name, status, price).
   */
  async getTopProducts(limit: number = 10) {
    const products = await this.prisma.product.findMany({
      where: { kind: ProductKind.listing },
      take: limit,
      orderBy: [{ viewCount: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        title: true,
        viewCount: true,
        status: true,
        price: true,
        seller: { select: { id: true, displayName: true } },
        images: {
          orderBy: { sortOrder: "asc" },
          take: 1,
          select: { cardKey: true },
        },
      },
    });

    return products.map((p) => ({
      id: p.id,
      title: p.title,
      thumbnail: this.common.resolveProductImageUrl(p.images[0]?.cardKey),
      viewCount: p.viewCount,
      sellerId: p.seller.id,
      sellerName: p.seller.displayName,
      status: p.status,
      price: Number(p.price),
    }));
  }

  /**
   * Get top-N most-viewed sellers for the dashboard widget.
   * Ordered by storeViewCount desc across seller accounts (excluding banned
   * and deleted); returns display fields the admin table shows: id, name,
   * avatar, storeViewCount, product count, and active listings count.
   */
  async getTopSellers(limit: number = 10) {
    const sellers = await this.prisma.user.findMany({
      take: limit,
      where: { isSeller: true, isBanned: false, deletedAt: null },
      orderBy: [{ storeViewCount: "desc" }, { createdAt: "asc" }],
      select: {
        id: true,
        displayName: true,
        avatarUrl: true,
        storeViewCount: true,
        _count: {
          select: {
            products: { where: { kind: ProductKind.listing } },
          },
        },
      },
    });

    const sellerIds = sellers.map((s) => s.id);
    const activeCounts = sellerIds.length
      ? await this.prisma.product.groupBy({
          by: ["sellerId"],
          where: {
            kind: ProductKind.listing,
            sellerId: { in: sellerIds },
            status: ProductStatus.active,
          },
          _count: { id: true },
        })
      : [];
    const activeMap = new Map(
      activeCounts.map((row) => [row.sellerId, row._count.id]),
    );

    return sellers.map((s) => ({
      id: s.id,
      displayName: s.displayName,
      avatarUrl: this.common.resolveProductImageUrl(s.avatarUrl),
      storeViewCount: s.storeViewCount,
      productCount: s._count.products,
      activeListings: activeMap.get(s.id) ?? 0,
    }));
  }

  /**
   * Get commission revenue summary
   * Requirement: GET /admin/commission/revenue (project.txt)
   */
  async getCommissionRevenue(query: AnalyticsQueryDto) {
    const endDate = query.endDate ? new Date(query.endDate) : new Date();
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalCommission,
      totalFees,
      commissionByMonth,
      commissionByCategory,
    ] = await Promise.all([
      // Total commission in period
      this.prisma.order.aggregate({
        _sum: { commissionAmount: true },
        where: {
          createdAt: { gte: startDate, lte: endDate },
          status: { in: [OrderStatus.completed, OrderStatus.delivered] },
        },
      }),
      // Paranın tam dağılımı: platformda kalan ücretler, devlete giden vergi,
      // taşıyıcıya giden kargo ve bunların oranlandığı ürün cirosu. Ekran
      // "Tarodan'a ne kaldı" sorusunu ancak dördü birlikte yanıtlayabiliyor.
      this.prisma.order.aggregate({
        _sum: {
          buyerFeeAmount: true,
          sellerFeeAmount: true,
          subtotal: true,
          buyerServiceTaxAmount: true,
          sellerServiceTaxAmount: true,
          withholdingTaxAmount: true,
          buyerShippingAmount: true,
          sellerShippingAmount: true,
        },
        where: {
          createdAt: { gte: startDate, lte: endDate },
          status: { in: [OrderStatus.completed, OrderStatus.delivered] },
        },
      }),
      // Commission grouped by month
      this.prisma.$queryRaw`
        SELECT 
          DATE_TRUNC('month', created_at) as month,
          SUM(commission_amount) as total
        FROM orders
        WHERE created_at >= ${startDate} 
          AND created_at <= ${endDate}
          AND status IN ('completed', 'delivered')
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY month DESC
      ` as Promise<Array<{ month: Date; total: number }>>,
      // Commission by category
      this.prisma.order.findMany({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          status: { in: [OrderStatus.completed, OrderStatus.delivered] },
        },
        include: {
          product: {
            select: {
              category: { select: { id: true, name: true } },
            },
          },
        },
      }),
    ]);

    // Group commission by category
    const categoryMap = new Map<
      string,
      { name: string; commission: number; count: number }
    >();
    commissionByCategory.forEach((order) => {
      const catId = order.product.category?.id || "uncategorized";
      const catName = order.product.category?.name || "Kategorisiz";
      const existing = categoryMap.get(catId) || {
        name: catName,
        commission: 0,
        count: 0,
      };
      categoryMap.set(catId, {
        name: catName,
        commission: existing.commission + Number(order.commissionAmount),
        count: existing.count + 1,
      });
    });

    return {
      totalCommission: Number(totalCommission._sum.commissionAmount || 0),
      totalBuyerFee: Number(totalFees._sum.buyerFeeAmount || 0),
      totalSellerFee: Number(totalFees._sum.sellerFeeAmount || 0),
      // Ürün cirosu (GMV) — Tarodan payının oranlandığı taban.
      totalSubtotal: Number(totalFees._sum.subtotal || 0),
      // Devlete giden: iki taraf hizmet KDV'si + stopaj.
      totalTax:
        Number(totalFees._sum.buyerServiceTaxAmount || 0) +
        Number(totalFees._sum.sellerServiceTaxAmount || 0) +
        Number(totalFees._sum.withholdingTaxAmount || 0),
      // Taşıyıcıya giden: iki tarafın kargo payı.
      totalShipping:
        Number(totalFees._sum.buyerShippingAmount || 0) +
        Number(totalFees._sum.sellerShippingAmount || 0),
      byMonth: commissionByMonth.map((m) => ({
        month: m.month,
        total: Number(m.total || 0),
      })),
      byCategory: Array.from(categoryMap.entries())
        .map(([id, data]) => ({
          categoryId: id,
          categoryName: data.name,
          commission: Math.round(data.commission * 100) / 100,
          orderCount: data.count,
        }))
        .sort((a, b) => b.commission - a.commission),
      period: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
    };
  }
}
