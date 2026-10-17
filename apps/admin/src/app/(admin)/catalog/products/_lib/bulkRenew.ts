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
    };

export interface RenewBatchResult {
  results: RenewItemResult[];
  renewed: number;
  failed: number;
}

/** Sunucu DTO'su (`MAX_RENEW_BATCH`) ile aynı: istek başına en çok ilan. */
export const BULK_RENEW_MAX = 100;

/** Genel hata anahtarı: istek düştüğünde ilan başına neden bilinmez. */
export const RENEW_FAILED_KEY = "server.product.renewFailed";

/** Seçimden yenilenebilir (süresi dolmuş) satırlar — kural tek yerde: `canRenewExpiredListing`. */
export function renewableRows<T extends RenewTarget>(rows: readonly T[]): T[] {
  return rows.filter(canRenewExpiredListing);
}

/** Seçimde olup yenilenemeyecek (atlanacak) satır sayısı. */
export function skippedCount(rows: readonly RenewTarget[]): number {
  return rows.length - renewableRows(rows).length;
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

function summarize(results: RenewItemResult[]): RenewBatchResult {
  const failed = results.filter((r) => !r.ok).length;
  return { results, renewed: results.length - failed, failed };
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

/** İsteği düşen bir parçadaki tüm ilanlar genel nedenle başarısız sayılır. */
export function failedChunk(ids: readonly string[]): RenewBatchResult {
  return summarize(
    ids.map((id) => ({ id, ok: false, errorKey: RENEW_FAILED_KEY })),
  );
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
        errorParams: (item.errorParams ?? {}) as Record<
          string,
          string | number
        >,
      },
    ];
  });
}
