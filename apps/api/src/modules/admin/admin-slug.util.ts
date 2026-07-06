/**
 * Ad'dan slug üretir — AdminService'in private generateSlug gövdesinden
 * birebir taşındı (ortak serbest fonksiyon). CATEGORY / COLLECTION /
 * ATTRIBUTE bölümlerinin taşındığı admin servisleri bunu kullanır.
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
