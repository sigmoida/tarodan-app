import { ADMIN_CANCELLATIONS_REFUNDS_PATH } from "@tarodan/types";

/**
 * "İptal & İade" ekranının adresi ve iki üst sekmesi (İptaller | İadeler).
 * Üst sekme `?view=` parametresinde yaşar; eski iade listesi adresi ve panoya
 * bağlanan kuyruk linkleri buraya yönlenir.
 */

/** Tek kaynak `@tarodan/types` (panonun kuyruk linkleri de oradan okur). */
export const CANCELLATIONS_REFUNDS_PATH = ADMIN_CANCELLATIONS_REFUNDS_PATH;

export const CANCELLATION_REFUND_VIEWS = ["cancellations", "refunds"] as const;

export type CancellationRefundView = (typeof CANCELLATION_REFUND_VIEWS)[number];

export const DEFAULT_CANCELLATION_REFUND_VIEW =
  "cancellations" satisfies CancellationRefundView;

export const CANCELLATION_REFUND_VIEW_PARAM = "view";

export function resolveCancellationRefundView(
  value: unknown,
): CancellationRefundView {
  return (CANCELLATION_REFUND_VIEWS as readonly unknown[]).includes(value)
    ? (value as CancellationRefundView)
    : DEFAULT_CANCELLATION_REFUND_VIEW;
}

/**
 * Bir sekmenin sahip olduğu URL parametreleri — sekme değişince silinir, ki
 * İadeler'in `status` filtresi İptaller'e (ya da İptaller'in alt sekmesi
 * İadeler'e) taşınmasın. Liste altyapısının kendi parametreleri (sayfa,
 * arama, sıralama, sayfa boyu) de sekmeye aittir.
 */
export const VIEW_SCOPED_PARAMS = [
  // liste altyapısı (useAdminResource)
  "page",
  "q",
  "sort",
  "dir",
  "sortType",
  "size",
  // İptaller
  "tab",
  "bucket",
  "orderNumber",
  "cargoCode",
  "groupNumber",
  "party",
  "startDate",
  "endDate",
  // İadeler
  "status",
  "kind",
  "from",
  "to",
] as const;

type QueryInput =
  URLSearchParams | Record<string, string | string[] | undefined> | undefined;

function toSearchParams(query: QueryInput): URLSearchParams {
  if (query instanceof URLSearchParams) return new URLSearchParams(query);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      params.append(key, item);
    }
  }
  return params;
}

/**
 * İadeler sekmesinin adresi. Verilen sorgu (eski `/operations/refund-requests`
 * bağlantısının filtreleri — `status`, `from`, `to`, `q`…) aynen korunur;
 * yalnız `view` bu sekmeye sabitlenir.
 */
export function refundsViewHref(query?: QueryInput): string {
  const params = toSearchParams(query);
  params.delete(CANCELLATION_REFUND_VIEW_PARAM);
  const rest = params.toString();
  return `${CANCELLATIONS_REFUNDS_PATH}?${CANCELLATION_REFUND_VIEW_PARAM}=refunds${
    rest ? `&${rest}` : ""
  }`;
}
