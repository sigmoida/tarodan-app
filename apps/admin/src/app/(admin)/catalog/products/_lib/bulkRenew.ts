import { canRenewExpiredListing } from "../[id]/_lib/renewal";

/** Toplu yenilemenin seçimden okuduğu en küçük satır şekli. */
export interface RenewTarget {
  id: string;
  status: string;
  inactiveReason?: string | null;
  title?: string;
  productCode?: string;
}

/** `POST /admin/products/bulk-renew` ilan başına sonuç. */
export type RenewItemResult =
  | { id: string; ok: true }
  | {
      id: string;
      ok: false;
      errorKey: string;
      errorParams?: Record<string, unknown>;
      /**
       * İstek yanıtsız düştü (zaman aşımı / ağ / 5xx) ve sonradan durum da
       * doğrulanamadı: sunucu ilanı yenilemiş olabilir, bilinmiyor.
       */
      unknown?: true;
    };

export interface RenewBatchResult {
  results: RenewItemResult[];
  renewed: number;
  /** Kesin başarısız (sunucu reddetti ya da yeniden okununca hâlâ süresi dolmuş). */
  failed: number;
  /** Sonucu doğrulanamayan ilanlar (`unknown`). */
  unknown: number;
}

/** Sunucu DTO'su (`MAX_RENEW_BATCH`) ile aynı: istek başına en çok ilan. */
export const BULK_RENEW_MAX = 100;

/** Genel hata anahtarı: sunucu nedeni vermediğinde ya da anahtar katalogda yokken. */
export const RENEW_FAILED_KEY = "server.product.renewFailed";

/** Yanıtsız düşen istekte durumu doğrulanamayan ilanın nedeni. */
export const RENEW_UNKNOWN_KEY =
  "admin.catalog.products.bulkRenewUnknownReason";

/**
 * Seçimden yenilenebilir (süresi dolmuş) satırlar — kural tek yerde:
 * `canRenewExpiredListing`. Tablo yalnız bu satırların seçilmesine izin verir;
 * burada yine süzülür (savunma: eski bir seçim ya da başka bir çağıran).
 */
export function renewableRows<T extends RenewTarget>(rows: readonly T[]): T[] {
  return rows.filter(canRenewExpiredListing);
}

/** Eylem yalnız yenilenebilir satır varken açıktır ve bir istek sürerken kapanır. */
export function canBulkRenew(
  rows: readonly RenewTarget[],
  isPending: boolean,
): boolean {
  return !isPending && renewableRows(rows).length > 0;
}

/** İstekleri `size`'lık parçalara böler (sunucu üst sınırı aşan isteği reddeder). */
export function chunkIds(ids: readonly string[], size = BULK_RENEW_MAX) {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size)
    chunks.push(ids.slice(i, i + size));
  return chunks;
}

/** İstek düştü ve durum doğrulanamadı. */
export function isUnknown(item: RenewItemResult): boolean {
  return item.ok === false && item.unknown === true;
}

function summarize(results: RenewItemResult[]): RenewBatchResult {
  const renewed = results.filter((r) => r.ok).length;
  const unknown = results.filter(isUnknown).length;
  return {
    results,
    renewed,
    unknown,
    failed: results.length - renewed - unknown,
  };
}

/** Yanıt zarflı (`{ data }`) ya da düz gelebilir. */
export function readRenewBatch(raw: unknown): RenewBatchResult {
  const body = raw as { data?: RenewBatchResult } & Partial<RenewBatchResult>;
  const batch = body?.data?.results ? body.data : body;
  return summarize(batch?.results ?? []);
}

/** Parça sonuçlarını sırayla tek sonuca birleştirir. */
export function mergeRenewBatches(
  batches: readonly RenewBatchResult[],
): RenewBatchResult {
  return summarize(batches.flatMap((b) => b.results));
}

/**
 * İsteği yanıtsız düşen bir parçadaki ilanlar "bilinmiyor" sayılır: sunucu bir
 * kısmını yenilemiş olabilir. `reconcileUnknown` durumu yeniden okuyup çözer.
 */
export function unknownChunk(ids: readonly string[]): RenewBatchResult {
  return summarize(
    ids.map((id) => ({
      id,
      ok: false,
      unknown: true,
      errorKey: RENEW_UNKNOWN_KEY,
    })),
  );
}

/** Yeniden okunan ilanın güncel durumu (okunamadıysa `null`). */
export type CurrentListing = {
  status: string;
  inactiveReason?: string | null;
} | null;

/**
 * "Bilinmiyor" ilanları güncel durumlarıyla sınıflar: yayında → yenilendi,
 * hâlâ süresi dolmuş → başarısız, başka bir durum → başarısız, okunamadı →
 * bilinmiyor kalır. Diğer sonuçlara dokunmaz.
 */
export function reconcileUnknown(
  batch: RenewBatchResult,
  current: ReadonlyMap<string, CurrentListing>,
): RenewBatchResult {
  return summarize(
    batch.results.map((item): RenewItemResult => {
      if (!isUnknown(item)) return item;
      const now = current.get(item.id);
      if (!now) return item;
      if (now.status === "active") return { id: item.id, ok: true };
      return { id: item.id, ok: false, errorKey: RENEW_FAILED_KEY };
    }),
  );
}

/** Sunucunun döndürdüğü neden anahtarı katalogda yoksa genel nedene düşer. */
export function resolveErrorKey(
  key: string,
  has: (key: string) => boolean,
): string {
  return has(key) ? key : RENEW_FAILED_KEY;
}

/** `t()` yalnız ilkel parametre alır: iç içe nesne/dizi/null elenir. */
export function primitiveParams(
  params: Record<string, unknown> | undefined,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(params ?? {})) {
    if (typeof v === "string" || typeof v === "number") out[k] = v;
  }
  return out;
}

export interface RenewFailureRow {
  id: string;
  title: string;
  productCode?: string;
  errorKey: string;
  errorParams: Record<string, string | number>;
}

/** Sonuç diyaloğunun satırları: başarısız ilan + neden anahtarı (metni çağıran çizer). */
export function renewFailureRows(
  result: RenewBatchResult,
  targets: readonly RenewTarget[],
): RenewFailureRow[] {
  const byId = new Map(targets.map((row) => [row.id, row]));
  return result.results.flatMap((item) => {
    if (item.ok === true) return [];
    const row = byId.get(item.id);
    return [
      {
        id: item.id,
        title: row?.title ?? item.id,
        productCode: row?.productCode,
        errorKey: item.errorKey,
        errorParams: primitiveParams(item.errorParams),
      },
    ];
  });
}
