/**
 * Prisma `notIn` filtresi: liste boşsa `undefined` döner (Prisma alanı yok
 * sayar). Gizli-kullanıcı listesini where'e ekleyen her okuma bunu kullanır:
 * `sellerId: excludeIds(hidden)` — boş-liste koruması tek yerde.
 */
export function excludeIds(ids: string[]): { notIn: string[] } | undefined {
  return ids.length > 0 ? { notIn: ids } : undefined;
}
