import {
  LISTING_REMOVAL_ACTORS,
  listingRemovalActorOf,
  type DashboardListingRemovalsResponse,
  type ListingRemovalActor,
  type ListingRemovalPlatform,
  type ListingRemovalReason,
} from "@tarodan/types";

/**
 * "Vitrinden düşen ilanlar" kırılımının ekran şekli — saf türetme, panel
 * yalnız çizer. Sayım kuralı API'dedir (olay damgası = kaldırma anı, dönem
 * seçicisiyle aynı pencere); burada yalnız hangi satırın görüneceği ve payı
 * hesaplanır.
 */

export interface RemovalShareRow<K> {
  key: K;
  count: number;
  /** Bölümün toplamına göre yüzde (tam sayı). */
  share: number;
}

export interface RemovalActorGroup {
  actor: ListingRemovalActor;
  count: number;
  reasons: RemovalShareRow<ListingRemovalReason>[];
}

export interface ListingRemovalsView {
  total: number;
  isEmpty: boolean;
  /** Kaldıran grubu → nedenler; sıfır olan grup/neden gösterilmez. */
  byActor: RemovalActorGroup[];
  /** Başka platformda satışların toplamı ve platform payları (çoktan aza). */
  soldElsewhereTotal: number;
  platforms: RemovalShareRow<ListingRemovalPlatform>[];
  /** Kural ihlalleri: ihlal kodu payları (`null` = kodsuz red). */
  violationTotal: number;
  violations: RemovalShareRow<string | null>[];
}

const toCount = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Pay yüzdesi; boş bölümde 0. */
export function shareOf(count: number, total: number): number {
  return total > 0 ? Math.round((count * 100) / total) : 0;
}

function withShares<K>(rows: Array<{ key: K; count: number }>): {
  total: number;
  rows: RemovalShareRow<K>[];
} {
  const visible = rows.filter((row) => row.count > 0);
  const total = visible.reduce((sum, row) => sum + row.count, 0);
  return {
    total,
    rows: visible
      .map((row) => ({ ...row, share: shareOf(row.count, total) }))
      .sort((a, b) => b.count - a.count),
  };
}

/**
 * Yanıt → ekran. Eksik/boş yanıt (yükleniyor, hata) boş görünüme düşer;
 * sayılar sayıya zorlanır.
 */
export function toListingRemovalsView(
  data: Partial<DashboardListingRemovalsResponse> | null | undefined,
): ListingRemovalsView {
  const reasonRows = (data?.byReason ?? []).map((row) => ({
    reason: row.reason,
    count: toCount(row.count),
  }));
  const total = reasonRows.reduce((sum, row) => sum + row.count, 0);

  const byActor = LISTING_REMOVAL_ACTORS.map((actor) => {
    const reasons = reasonRows
      .filter(
        (row) => row.count > 0 && listingRemovalActorOf(row.reason) === actor,
      )
      .map((row) => ({
        key: row.reason,
        count: row.count,
        share: shareOf(row.count, total),
      }))
      .sort((a, b) => b.count - a.count);
    return {
      actor,
      count: reasons.reduce((sum, row) => sum + row.count, 0),
      reasons,
    };
  }).filter((group) => group.count > 0);

  const platforms = withShares(
    (data?.soldElsewhereByPlatform ?? []).map((row) => ({
      key: row.platform,
      count: toCount(row.count),
    })),
  );
  const violations = withShares(
    (data?.byViolation ?? []).map((row) => ({
      key: row.violationCode,
      count: toCount(row.count),
    })),
  );

  return {
    total,
    // Platform kırılımı toplamdan bağımsız büyüyebilir (geç gelen "başka
    // platformda sattım" cevapları): yalnız o varsa ekran boş sayılmaz.
    isEmpty: total === 0 && platforms.total === 0,
    byActor,
    soldElsewhereTotal: platforms.total,
    platforms: platforms.rows,
    violationTotal: violations.total,
    violations: violations.rows,
  };
}
