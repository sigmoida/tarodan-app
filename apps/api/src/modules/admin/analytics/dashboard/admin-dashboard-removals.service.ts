import { Injectable } from "@nestjs/common";
import { ListingRemovalReason, Prisma } from "@prisma/client";
import {
  LISTING_REMOVAL_PLATFORMS,
  LISTING_REMOVAL_REASONS,
  isListingRemovalPlatform,
  listingRemovalActorOf,
  type DashboardListingRemovalsResponse,
  type DashboardPeriodQuery,
  type ListingRemovalPlatform,
} from "@tarodan/types";
import { PrismaService } from "../../../../prisma";
import { CacheService } from "../../../cache/cache.service";
import { LIVE_PRODUCT } from "../../../account-lane/live-lane.where";
import {
  dashboardPeriodCacheSlot,
  resolveDashboardRange,
  type ResolvedDashboardRange,
} from "../dashboard-period.helper";

/** Gruplanmış satırın sayısı — `groupBy` `_count: { _all: true }` şekli. */
interface CountedRow {
  _count: { _all: number };
}

/**
 * Ham grup satırlarından dashboard sözleşmesi — saf hesap, Nest'siz test edilir.
 *
 * - `byReason`: katalogdaki HER neden, sıfırlar dahil (kart sabit bir düzende
 *   kalır, "bu dönem hiç yok" da bir bilgidir).
 * - `soldElsewhereByPlatform`: her platform, sıfırlar dahil; katalog dışı/boş
 *   platform `other`a eklenir (kural `sold_elsewhere`de platformu zorunlu
 *   tutar, bu yalnız katalogdan çıkarılmış eski kodlara karşı emniyet).
 * - `byViolation`: yalnız görülen ihlal kodları, çoktan aza; `null` = kodsuz
 *   (eski istemciden) red.
 */
export function buildListingRemovalBreakdown(
  range: ResolvedDashboardRange,
  rows: {
    byReason: ReadonlyArray<{ reason: string } & CountedRow>;
    byPlatform: ReadonlyArray<{ platform: string | null } & CountedRow>;
    byViolation: ReadonlyArray<{ violationCode: string | null } & CountedRow>;
  },
): DashboardListingRemovalsResponse {
  const reasonCounts = new Map(
    rows.byReason.map((row) => [row.reason, row._count._all]),
  );
  const byReason = LISTING_REMOVAL_REASONS.map((reason) => ({
    reason,
    actor: listingRemovalActorOf(reason),
    count: reasonCounts.get(reason) ?? 0,
  }));

  const platformCounts = new Map<ListingRemovalPlatform, number>();
  for (const row of rows.byPlatform) {
    const platform: ListingRemovalPlatform = isListingRemovalPlatform(
      row.platform,
    )
      ? row.platform
      : "other";
    platformCounts.set(
      platform,
      (platformCounts.get(platform) ?? 0) + row._count._all,
    );
  }

  return {
    range: {
      type: range.type,
      from: range.current.gte.toISOString(),
      to: range.current.lte.toISOString(),
    },
    total: byReason.reduce((sum, row) => sum + row.count, 0),
    byReason,
    soldElsewhereByPlatform: LISTING_REMOVAL_PLATFORMS.map((platform) => ({
      platform,
      count: platformCounts.get(platform) ?? 0,
    })),
    byViolation: rows.byViolation
      .map((row) => ({
        violationCode: row.violationCode,
        count: row._count._all,
      }))
      .filter((row) => row.count > 0)
      .sort((a, b) => b.count - a.count),
  };
}

/**
 * Zone C — "Dönem özeti"nin kaldırılan ilan kırılımı.
 *
 * Neden Zone C: bu bir AKIŞTIR (seçili dönemde kaç ilan, hangi nedenle
 * vitrinden düştü), bekleyen iş (A), uyarı (B) ya da bakiye (D) değil. Zone
 * C'nin kuralını aynen izler: aynı dönem seçicisi ve aynı pencere çözümü
 * (`resolveDashboardRange`), OLAY damgası (`ProductRemovalEvent.createdAt` —
 * kaldırmanın gerçekleştiği an, ilanın bugünkü statüsü değil), sunucu tarafı
 * gruplama ve test şeridi hariç (`LIVE_PRODUCT`). Kaldırılıp yeniden açılıp
 * tekrar kaldırılan ilan iki olaydır.
 *
 * Dönem kartlarının dört rakamlı (dönem/dün/bu ay/tüm zamanlar) biçimini
 * taşımaz: bir kırılımda tek pencere okunur; kartlar kendi uçlarında kalır.
 * Bu özellikten önceki kaldırmaların kaydı olmadığı için sayılmaz (geri
 * doldurma yok).
 */
@Injectable()
export class AdminDashboardRemovalsService {
  /** Canlı pencere: dönem kartlarıyla aynı 5 dk. */
  static readonly PERIOD_CACHE_TTL_SECONDS = 5 * 60;
  /** Tamamen geçmişte kalan özel aralık değişmez. */
  static readonly CLOSED_RANGE_CACHE_TTL_SECONDS = 6 * 60 * 60;
  static readonly CACHE_PREFIX = "admin:dashboard:removals:v1:";

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async getRemovals(
    query?: DashboardPeriodQuery,
  ): Promise<DashboardListingRemovalsResponse> {
    const now = new Date();
    const range = resolveDashboardRange(query, now);
    const { slot, closed } = dashboardPeriodCacheSlot(
      range,
      now,
      AdminDashboardRemovalsService.PERIOD_CACHE_TTL_SECONDS,
    );
    return this.cache.getOrSet(
      `${AdminDashboardRemovalsService.CACHE_PREFIX}${slot}`,
      () => this.compute(range),
      {
        ttl: closed
          ? AdminDashboardRemovalsService.CLOSED_RANGE_CACHE_TTL_SECONDS
          : AdminDashboardRemovalsService.PERIOD_CACHE_TTL_SECONDS,
      },
    );
  }

  /** Ekrandaki "yenile": kırılımın önbelleğini düşürür. */
  async invalidate(): Promise<void> {
    await this.cache.delPattern(`${AdminDashboardRemovalsService.CACHE_PREFIX}*`);
  }

  private async compute(
    range: ResolvedDashboardRange,
  ): Promise<DashboardListingRemovalsResponse> {
    const where = {
      createdAt: range.current,
      product: LIVE_PRODUCT,
    } satisfies Prisma.ProductRemovalEventWhereInput;

    // Sorgular $transaction dizisinin dışında kurulur: dizi içinde yazıldığında
    // Prisma'nın groupBy generic'i çözülmüyor (bkz. AdminDashboardStockService).
    // PrismaPromise tembel olduğundan yürütme yine transaction içindedir.
    const byReasonQuery = this.prisma.productRemovalEvent.groupBy({
      by: ["reason"],
      where,
      _count: { _all: true },
    });
    const byPlatformQuery = this.prisma.productRemovalEvent.groupBy({
      by: ["platform"],
      where: { ...where, reason: ListingRemovalReason.sold_elsewhere },
      _count: { _all: true },
    });
    const byViolationQuery = this.prisma.productRemovalEvent.groupBy({
      by: ["violationCode"],
      where: { ...where, reason: ListingRemovalReason.policy_violation },
      _count: { _all: true },
    });

    const [byReason, byPlatform, byViolation] = await this.prisma.$transaction(
      [byReasonQuery, byPlatformQuery, byViolationQuery],
    );

    return buildListingRemovalBreakdown(range, {
      byReason,
      byPlatform,
      byViolation,
    });
  }
}
