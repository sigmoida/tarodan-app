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
 * bu yüzden sayılar tek `groupBy` ile alınır; sıralama/filtre bu haritadan yapılır.
 */
export async function countPublicListingsBy(
  prisma: PrismaService,
  field: "brandId" | "manufacturerId",
): Promise<Map<string, number>> {
  const where = publicListingWhere();
  const rows =
    field === "brandId"
      ? (
          await prisma.product.groupBy({
            by: ["brandId"],
            where: { ...where, brandId: { not: null } },
            _count: { _all: true },
          })
        ).map((g) => ({ id: g.brandId, count: g._count._all }))
      : (
          await prisma.product.groupBy({
            by: ["manufacturerId"],
            where: { ...where, manufacturerId: { not: null } },
            _count: { _all: true },
          })
        ).map((g) => ({ id: g.manufacturerId, count: g._count._all }));
  const counts = new Map<string, number>();
  for (const row of rows) if (row.id) counts.set(row.id, row.count);
  return counts;
}

/** `hasListings` filtresi: true → ilanı olanlar, false → olmayanlar, yok → filtre yok. */
export function hasListingsWhere(
  hasListings: boolean | undefined,
  counts: ReadonlyMap<string, number>,
): { id?: { in: string[] } | { notIn: string[] } } {
  if (hasListings === undefined) return {};
  const ids = [...counts.keys()];
  return { id: hasListings ? { in: ids } : { notIn: ids } };
}
