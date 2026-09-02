import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { useTranslations } from "next-intl";
import type { StatusConfig, StatusConfigDefMap } from "@tarodan/shared";
import { fmtTry } from "@/lib/format";

type T = ReturnType<typeof useTranslations<never>>;

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return fmtTry(amount) ?? "—";
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("tr-TR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(date));
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat("tr-TR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat("tr-TR").format(num);
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + "...";
}

/**
 * Map a raw order/trade cancelReason (set by the API) to a short translated
 * label for the admin UI. Falls back to the raw reason when unmapped. The
 * MATCH patterns below (STOCKOUT / startsWith / exact-equals) are backend data
 * — the literal Turkish strings emitted by product-lock.service / payment /
 * order / refund flows — and stay as-is regardless of locale; only the
 * returned LABEL is translated via `t`.
 */
export function cancelReasonLabel(
  reason: string | null | undefined,
  t: T,
): string | null {
  if (!reason) return null;
  /* eslint-disable @tarodan/no-hardcoded-turkish -- backend data match patterns (see docblock), not display copy */
  const STOCKOUT = [
    "Stok tükendi",
    "Stok tükendiği için otomatik iptal edildi",
    "Stok takas icin ayrildi",
  ];
  if (STOCKOUT.includes(reason)) return t("admin.shared.cancelReason.stockout");
  if (reason.startsWith("Ödeme süresi"))
    return t("admin.shared.cancelReason.paymentExpired");
  if (reason === "Alıcı tarafından iptal edildi")
    return t("admin.shared.cancelReason.buyerCancelled");
  if (reason.startsWith("Satıcı belirlenen süre"))
    return t("admin.shared.cancelReason.sellerMissedShipping");
  if (reason.startsWith("Süre dolumu"))
    return t("admin.shared.cancelReason.deadlineExpired");
  // Teklif gerekçeleri (OFFER_CANCEL_REASON / offerAdminCancelReason)
  if (reason === "Satıcı karşı teklif verdiği için kapatıldı")
    return t("admin.shared.cancelReason.supersededBySellerCounter");
  if (reason === "Alıcı yeni teklif verdiği için kapatıldı")
    return t("admin.shared.cancelReason.supersededByBuyerCounter");
  if (reason === "Bağlı sipariş iptal edildiği için teklif kapatıldı")
    return t("admin.shared.cancelReason.orderCancelled");
  if (reason === "Bağlı sipariş iade edildiği için teklif kapatıldı")
    return t("admin.shared.cancelReason.orderRefunded");
  if (reason === "İlan satıcı tarafından kaldırıldığı için teklif kapatıldı")
    return t("admin.shared.cancelReason.listingDeleted");
  if (reason === "Hesap askıya alındığı için teklif kapatıldı")
    return t("admin.shared.cancelReason.accountBanned");
  if (reason.startsWith("Yönetici tarafından iptal edildi"))
    return `${t("admin.shared.cancelReason.adminCancelled")}${reason.includes(":") ? reason.slice(reason.indexOf(":")) : ""}`;
  /* eslint-enable @tarodan/no-hardcoded-turkish */
  return reason;
}

export type OrderOrigin = "direct_sale" | "offer" | "platform_service";

/** Sipariş kaynağı etiketleri — filtre seçenekleri ve rozet aynı haritayı kullanır. */
export const ORDER_ORIGIN_LABEL_KEYS: Record<
  OrderOrigin,
  | "admin.shared.orderOrigin.directSale"
  | "admin.shared.orderOrigin.offer"
  | "admin.shared.orderOrigin.platformService"
> = {
  direct_sale: "admin.shared.orderOrigin.directSale",
  offer: "admin.shared.orderOrigin.offer",
  platform_service: "admin.shared.orderOrigin.platformService",
};

/** Human label for an order's origin (`Order.origin` is NOT NULL). */
export function orderOriginLabel(origin: OrderOrigin, t: T): string {
  return t(ORDER_ORIGIN_LABEL_KEYS[origin]);
}

/**
 * Derives { value, label } options for a list filter from a shared status map;
 * prepends an "all" entry. Labels always come from the same map the badges use →
 * filter options stay perfectly consistent with them.
 *
 * - If `keys` is omitted, ALL statuses in the map are listed (full enum coverage).
 * - If `keys` is given, ONLY those statuses (in that order) are listed — the badge
 *   map stays complete, but this hides unnecessary/intermediate statuses from the
 *   filter (e.g. per-side intermediate statuses in trades).
 *
 * `t` is required: the shared map carries catalog KEYS, not labels, and the
 * default "all" label comes from the catalog too.
 */
export function statusFilterOptions(
  def: StatusConfigDefMap,
  t: T,
  opts: { keys?: string[]; allLabel?: string } = {},
): { value: string; label: string }[] {
  const { keys, allLabel = t("common.all") } = opts;
  const entries = keys
    ? keys.map((k) => [k, def[k]] as const).filter(([, v]) => Boolean(v))
    : Object.entries(def);
  return [
    { value: "all", label: allLabel },
    ...entries.map(([value, entry]) => ({ value, label: t(entry!.labelKey) })),
  ];
}

/**
 * Aynı işin ÇÖZÜLMÜŞ harita sürümü — sayfanın paylaşılan haritanın üstüne kendi
 * etiketlerini yazdığı yerler için (ör. destek talebi kategorileri).
 */
export function resolvedFilterOptions(
  config: Record<string, StatusConfig>,
  opts: { keys?: string[]; allLabel: string },
): { value: string; label: string }[] {
  const { keys, allLabel } = opts;
  const entries = keys
    ? keys.map((k) => [k, config[k]] as const).filter(([, v]) => Boolean(v))
    : Object.entries(config);
  return [
    { value: "all", label: allLabel },
    ...entries.map(([value, entry]) => ({ value, label: entry!.label })),
  ];
}
