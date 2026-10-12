/**
 * `id`'yi `delta` (-1 yukarı, +1 aşağı) kadar kaydırır; sınırda ya da
 * bilinmeyen id'de listeyi olduğu gibi döner. Sıralama uçları `{ ids }` bekler.
 */
export function moveId(ids: readonly string[], id: string, delta: -1 | 1): string[] {
  const from = ids.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return [...ids];
  const next = [...ids];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
