import { PrismaService } from "../../../prisma";
import { publicListingWhere } from "../../product/helpers/catalog-product-where";

/** Admin tablosunun "İlan" kolonunun sıralama anahtarı (`sortBy`). */
export const LISTING_COUNT_SORT = "listingCount";

/**
 * Marka/üretici başına müşterinin GÖRECEĞİ ilan sayısı (id → sayı). Public
 * `_count.products` ile aynı kural (`publicListingWhere`) — admin kolonu ile
 * mağaza sayısı ayrışmaz. İlanı olmayan satırlar haritada yoktur (0 sayılır).
 *
 * Prisma `orderBy._count` ilişki filtresi alamaz (filtresiz sayıya göre sıralar),
 * bu yüzden sayılar `groupBy` ile alınır. `ids` verilirse yalnız o satırlar
 * sayılır (sayfa satırları); verilmezse tüm tablo (yalnız sayıya göre sıralamada
 * gerekir, bellekte sıralanır).
 */
export async function countPublicListingsBy(
  prisma: PrismaService,
  field: "brandId" | "manufacturerId",
  ids?: string[],
): Promise<Map<string, number>> {
  if (ids && ids.length === 0) return new Map();
  const where = publicListingWhere();
  const idFilter = ids ? { in: ids } : { not: null };
  const rows =
    field === "brandId"
      ? (
          await prisma.product.groupBy({
            by: ["brandId"],
            where: { ...where, brandId: idFilter },
            _count: { _all: true },
          })
        ).map((g) => ({ id: g.brandId, count: g._count._all }))
      : (
          await prisma.product.groupBy({
            by: ["manufacturerId"],
            where: { ...where, manufacturerId: idFilter },
            _count: { _all: true },
          })
        ).map((g) => ({ id: g.manufacturerId, count: g._count._all }));
  const counts = new Map<string, number>();
  for (const row of rows) if (row.id) counts.set(row.id, row.count);
  return counts;
}

/**
 * `hasListings` filtresi: true → ilanı olanlar, false → olmayanlar, yok → filtre yok.
 * İlişki filtresi (id listesi yok) — marka/üretici sayısından bağımsız, sınırsız IN yok.
 */
export function hasListingsWhere(hasListings: boolean | undefined): {
  products?: { some: object } | { none: object };
} {
  if (hasListings === undefined) return {};
  const listing = publicListingWhere();
  return { products: hasListings ? { some: listing } : { none: listing } };
}
