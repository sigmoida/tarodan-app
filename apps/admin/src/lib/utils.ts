import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
  }).format(amount);
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('tr-TR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(date));
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('tr-TR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('tr-TR').format(num);
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + '...';
}

/**
 * Map a raw order/trade cancelReason (set by the API) to a short translated
 * label for the admin UI. Falls back to the raw reason when unmapped. The
 * MATCH patterns below (STOCKOUT / startsWith / exact-equals) are backend data
 * — the literal Turkish strings emitted by product-lock.service / payment /
 * order / refund flows — and stay as-is regardless of locale; only the
 * returned LABEL is translated via `t`.
 */
export function cancelReasonLabel(reason: string | null | undefined, t: T): string | null {
  if (!reason) return null;
  /* eslint-disable @tarodan/no-hardcoded-turkish -- backend data match patterns (see docblock), not display copy */
  const STOCKOUT = [
    'Stok tükendi',
    'Stok tükendiği için otomatik iptal edildi',
    'Stok takas icin ayrildi',
  ];
  if (STOCKOUT.includes(reason)) return t('admin.shared.cancelReason.stockout');
  if (reason.startsWith('Ödeme süresi')) return t('admin.shared.cancelReason.paymentExpired');
  if (reason === 'Alıcı tarafından iptal edildi') return t('admin.shared.cancelReason.buyerCancelled');
  if (reason.startsWith('Satıcı belirlenen süre')) return t('admin.shared.cancelReason.sellerMissedShipping');
  if (reason.startsWith('Süre dolumu')) return t('admin.shared.cancelReason.deadlineExpired');
  /* eslint-enable @tarodan/no-hardcoded-turkish */
  return reason;
}

/**
 * Human label for an order's origin: offer-based orders carry an offerId,
 * everything else is a direct purchase.
 */
export function orderOriginLabel(offerId: string | null | undefined, t: T): string {
  return offerId ? t('admin.shared.orderOrigin.offer') : t('admin.shared.orderOrigin.directSale');
}

/**
 * Derives { value, label } options for a list filter from a status config
 * (a StatusConfig map); prepends an "all" (Tümü) entry. Labels always come from
 * the config → filter options stay perfectly consistent with the badges.
 *
 * - If `keys` is omitted, ALL statuses in the config are listed (full enum coverage).
 * - If `keys` is given, ONLY those statuses (in that order) are listed — the badge
 *   config stays complete, but this hides unnecessary/intermediate statuses from the
 *   filter (e.g. per-side intermediate statuses in trades).
 *
 * NOTE (#222): the `allLabel` default below is still hardcoded Turkish ('Tümü').
 * Translating it would mean requiring `t` here, which forces every caller —
 * including several out-of-scope operations/catalog pages — to pass one even
 * when they already override `allLabel` themselves. Left as-is; only
 * `cancelReasonLabel`/`orderOriginLabel` (this file's explicit #222 scope)
 * were converted. Flagged for a follow-up.
 */
export function statusFilterOptions(
  config: Record<string, { label: string }>,
  opts: { keys?: string[]; allLabel?: string } = {},
): { value: string; label: string }[] {
  // eslint-disable-next-line @tarodan/no-hardcoded-turkish -- default for out-of-slice callers (finance/marketing); dönüşecek onlarla birlikte
  const { keys, allLabel = 'Tümü' } = opts;
  const entries = keys
    ? keys.map((k) => [k, config[k]] as const).filter(([, v]) => Boolean(v))
    : (Object.entries(config) as [string, { label: string }][]);
  return [
    { value: 'all', label: allLabel },
    ...entries.map(([value, cfg]) => ({ value, label: cfg!.label })),
  ];
}
