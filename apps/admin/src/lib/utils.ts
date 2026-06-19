import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

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
 * Map a raw order/trade cancelReason (set by the API) to a short Turkish
 * label for the admin UI. Falls back to the raw reason when unmapped.
 * Reason strings are emitted by product-lock.service / payment / order / refund
 * flows on the backend.
 */
export function cancelReasonLabel(reason?: string | null): string | null {
  if (!reason) return null;
  const STOCKOUT = [
    'Stok tükendi',
    'Stok tükendiği için otomatik iptal edildi',
    'Stok takas icin ayrildi',
  ];
  if (STOCKOUT.includes(reason)) return 'Stok bitti';
  if (reason.startsWith('Ödeme süresi')) return 'Ödeme süresi doldu';
  if (reason === 'Alıcı tarafından iptal edildi') return 'Alıcı iptal etti';
  if (reason.startsWith('Satıcı belirlenen süre')) return 'Satıcı kargolamadı';
  if (reason.startsWith('Süre dolumu')) return 'Süre doldu';
  return reason;
}

/**
 * Human label for an order's origin: offer-based orders carry an offerId,
 * everything else is a direct purchase.
 */
export function orderOriginLabel(offerId?: string | null): 'Teklif' | 'Doğrudan Satış' {
  return offerId ? 'Teklif' : 'Doğrudan Satış';
}

/**
 * Bir status config'inden (StatusConfig map'i) liste filtresi için { value, label }
 * seçenekleri türetir; başa "Tümü" (all) eklenir. Etiketler hep config'ten gelir →
 * filtre seçenekleri badge'lerle birebir tutarlı kalır.
 *
 * - `keys` verilmezse config'teki TÜM durumlar listelenir (enum tam kapsanır).
 * - `keys` verilirse SADECE o durumlar (o sırayla) listelenir — badge config tam kalır
 *   ama filtreden gereksiz/ara durumları (örn. takasta per-side ara durumlar) gizlemek için.
 */
export function statusFilterOptions(
  config: Record<string, { label: string }>,
  opts: { keys?: string[]; allLabel?: string } = {},
): { value: string; label: string }[] {
  const { keys, allLabel = 'Tümü' } = opts;
  const entries = keys
    ? keys.map((k) => [k, config[k]] as const).filter(([, v]) => Boolean(v))
    : (Object.entries(config) as [string, { label: string }][]);
  return [
    { value: 'all', label: allLabel },
    ...entries.map(([value, cfg]) => ({ value, label: cfg!.label })),
  ];
}
