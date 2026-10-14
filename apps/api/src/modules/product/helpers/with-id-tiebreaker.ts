/**
 * Her sıralamanın sonuna deterministik `id` eşitlik bozucu ekler. Tekil
 * `price`/`title`/`viewCount` gibi sütunlarda eşit satırların sırası sorgudan
 * sorguya değişir → sayfalar arasında tekrar eden ve kaybolan ilanlar olur.
 * Zaten `id` ile bitiyorsa dokunmaz (idempotent).
 */
export function withIdTiebreaker<T extends Record<string, unknown>>(
  orderBy: T[],
  direction: "asc" | "desc" = "asc",
): (T | { id: "asc" | "desc" })[] {
  const last = orderBy[orderBy.length - 1];
  if (last && "id" in last) return orderBy;
  return [...orderBy, { id: direction }];
}
