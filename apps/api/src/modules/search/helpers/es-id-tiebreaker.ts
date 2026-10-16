/**
 * ES sıralamasının sonuna deterministik eşitlik bozucu ekler: `id` keyword
 * alanı (mapping'de var, ek indeks gerekmez). Eşit skor/fiyat/başlıkta sayfalar
 * arası tekrar ve kayıp ilanı önler. Zaten ekliyse dokunmaz.
 */
export function withEsIdTiebreaker<T extends Record<string, unknown>>(
  sort: T[],
): (T | { id: "asc" })[] {
  const last = sort[sort.length - 1];
  if (last && "id" in last) return sort;
  return [...sort, { id: "asc" }];
}
