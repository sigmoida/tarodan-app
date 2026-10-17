const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * `?shippedBefore=<iso>` (dashboard "uzun süredir kargoda" uyarısı) → o anın
 * bugünden kaç GÜN önce olduğu. Çip etiketi tarihi değil süreyi söyler
 * ("10 günden uzun süredir kargoda"). Geçersiz / boş değer `null`.
 */
export function shippedBeforeDays(
  iso: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!iso) return null;
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.round((now.getTime() - at) / DAY_MS));
}
