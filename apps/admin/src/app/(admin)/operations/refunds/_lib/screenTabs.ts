import {
  ADMIN_REFUND_BUCKETS,
  ADMIN_REFUND_TABS,
  type AdminRefundBucket,
  type AdminRefundTab,
} from "@tarodan/types";
import { toSearchParams, type QueryInput } from "@/lib/redirect-query";

/**
 * İadeler ekranının adresi ve sekme davranışı. Üst sekme (`?tab=`) ve alt
 * sekme (`?bucket=`) URL'de yaşar; sözlükleri `@tarodan/types`'tan gelir.
 */

export const REFUNDS_PATH = "/operations/refunds";

export const REFUND_TAB_PARAM = "tab";
export const REFUND_BUCKET_PARAM = "bucket";

export const DEFAULT_REFUND_TAB = "all" satisfies AdminRefundTab;
export const DEFAULT_REFUND_BUCKET = "all" satisfies AdminRefundBucket;

export const REFUND_TAB_I18N_KEYS = {
  all: "admin.operations.refunds.tabs.all",
  direct: "admin.operations.refunds.tabs.direct",
  offer: "admin.operations.refunds.tabs.offer",
  trade: "admin.operations.refunds.tabs.trade",
} as const satisfies Record<AdminRefundTab, string>;

/**
 * Üst sekme değişince silinen parametre: alt sekme. Arama / tarih / tür
 * filtreleri dört sekmede de aynıdır, sekmeler arasında KALIR.
 */
export const REFUND_TAB_SCOPED_PARAMS = [REFUND_BUCKET_PARAM] as const;

export function resolveRefundTab(value: unknown): AdminRefundTab {
  return (ADMIN_REFUND_TABS as readonly unknown[]).includes(value)
    ? (value as AdminRefundTab)
    : DEFAULT_REFUND_TAB;
}

export function resolveRefundBucket(value: unknown): AdminRefundBucket {
  return (ADMIN_REFUND_BUCKETS as readonly unknown[]).includes(value)
    ? (value as AdminRefundBucket)
    : DEFAULT_REFUND_BUCKET;
}

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
  const tab = resolveRefundTab(source.get(REFUND_TAB_PARAM));
  const bucket =
    LEGACY_STATUS_BUCKET[source.get("status") ?? ""] ??
    resolveRefundBucket(source.get(REFUND_BUCKET_PARAM));

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
