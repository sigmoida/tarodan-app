import {
  ADMIN_REFUNDS_PATH,
  resolveAdminRefundBucket,
  resolveAdminRefundTab,
  type AdminRefundBucket,
  type AdminRefundTab,
} from "@tarodan/types";
import { toSearchParams, type QueryInput } from "@/lib/redirect-query";

/**
 * İadeler ekranının sekme davranışı. Üst sekme (`?tab=`) ve alt sekme
 * (`?bucket=`) URL'de yaşar; adres, sözlükler, etiket anahtarları ve
 * çözücüler `@tarodan/types`'tadır (`admin-refund-list.ts`).
 */

export const REFUNDS_PATH = ADMIN_REFUNDS_PATH;

export const REFUND_TAB_PARAM = "tab";
export const REFUND_BUCKET_PARAM = "bucket";

export const DEFAULT_REFUND_TAB = "all" satisfies AdminRefundTab;
export const DEFAULT_REFUND_BUCKET = "all" satisfies AdminRefundBucket;

/**
 * Üst sekme değişince silinen parametre: alt sekme. Arama / tarih / tür
 * filtreleri dört sekmede de aynıdır, sekmeler arasında KALIR.
 */
export const REFUND_TAB_SCOPED_PARAMS = [REFUND_BUCKET_PARAM] as const;

/** Eski iade talebi durumu → yeni alt sekme (panonun kuyruk linkleri dahil). */
const LEGACY_STATUS_BUCKET: Record<string, AdminRefundBucket> = {
  pending_review: "pending_review",
  disputed: "disputed",
  rejected: "rejected",
  refunded: "completed",
};

/** Eski sorgu anahtarı → yeni anahtar (tarih aralığı). */
const LEGACY_RENAMED_PARAMS: Record<string, string> = {
  from: "dateFrom",
  to: "dateTo",
};

/** Eski ekranın artık anlamsız parametreleri (sekme / alt sekme ayrıca çözülür). */
const LEGACY_DROPPED_PARAMS: readonly string[] = [
  "view",
  "status",
  REFUND_TAB_PARAM,
  REFUND_BUCKET_PARAM,
];

/**
 * Eski adreslerin (`/operations/refund-requests`, `/operations/cancellations-
 * refunds?view=refunds`, panonun kuyruk linkleri) yeni ekrandaki karşılığı.
 * Sorgunun filtreleri korunur; `status` alt sekmeye, `from`/`to` tarih
 * aralığına çevrilir. Varsayılan sekme / alt sekme URL'ye yazılmaz.
 */
export function refundsHref(query?: QueryInput): string {
  const source = toSearchParams(query);
  const tab = resolveAdminRefundTab(source.get(REFUND_TAB_PARAM));
  const bucket =
    LEGACY_STATUS_BUCKET[source.get("status") ?? ""] ??
    resolveAdminRefundBucket(source.get(REFUND_BUCKET_PARAM));

  const params = new URLSearchParams();
  if (tab !== DEFAULT_REFUND_TAB) params.set(REFUND_TAB_PARAM, tab);
  if (bucket !== DEFAULT_REFUND_BUCKET) params.set(REFUND_BUCKET_PARAM, bucket);
  for (const [key, value] of source) {
    if (LEGACY_DROPPED_PARAMS.includes(key)) continue;
    params.append(LEGACY_RENAMED_PARAMS[key] ?? key, value);
  }
  const qs = params.toString();
  return qs ? `${REFUNDS_PATH}?${qs}` : REFUNDS_PATH;
}

/** `?view=refunds` ile açılmış eski "İptal & İade" adresi mi? */
export function isLegacyRefundsView(query: QueryInput): boolean {
  return toSearchParams(query).get("view") === "refunds";
}
