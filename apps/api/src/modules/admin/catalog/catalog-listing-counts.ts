import type { Prisma } from "@prisma/client";
import type { PrismaService } from "../../../prisma";
import {
  paginateComputedRows,
  type ListQuery,
  type PaginatedResult,
  type SortDirection,
} from "../../../common/list";
import { activeListingWhere } from "../../product/helpers/active-listing-where";
import { catalogProductWhere } from "../../product/helpers/catalog-product-where";

/**
 * Admin marka/üretici listelerindeki ilan sayaçları.
 *
 * - `listingCount`: toplam ilan (her statü) — Prisma `_count` ile gelir,
 *   `products._count` üzerinden DB'de sıralanır.
 * - `activeListingCount`: vitrinin saydığı aktif ilan (`activeListingWhere`,
 *   mağazadaki sayaçla AYNI predikat). Prisma `orderBy._count` ilişkiye filtre
 *   uygulayamadığından bu kolonla sıralama tüm satırlar üzerinde bellekte
 *   yapılır (`paginateComputedRows`) — katalog taksonomisi küçük bir tablo.
 */
export const LISTING_COUNT_SORT = "listingCount";
export const ACTIVE_LISTING_COUNT_SORT = "activeListingCount";

/** Ürünü sahibine bağlayan kolon. */
export type ListingOwnerField = "brandId" | "manufacturerId";

export interface ListingCounts {
  listingCount: number;
  activeListingCount: number;
}

type CountedItem = { id: string; _count: { products: number } };

/** `include`: toplam ilan sayacı (yalnız katalog ilanları, ödeme ürünleri hariç). */
export function listingCountInclude() {
  return {
    _count: { select: { products: { where: catalogProductWhere() } } },
  };
}

/** `resolveOrderBy` sortMap girdisi: toplam ilan sayısına göre DB sıralaması. */
export function listingCountSortMap<TOrderBy>(): Record<
  string,
  (direction: SortDirection) => TOrderBy
> {
  return {
    [LISTING_COUNT_SORT]: (direction) =>
      ({ products: { _count: direction } }) as TOrderBy,
  };
}

/** Verilen sahiplerin aktif ilan sayıları — tek `groupBy`. */
export async function activeListingCounts(
  prisma: Pick<PrismaService, "product">,
  owner: ListingOwnerField,
  ids: readonly string[],
): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const ownerWhere: Prisma.ProductWhereInput =
    owner === "brandId"
      ? { brandId: { in: [...ids] } }
      : { manufacturerId: { in: [...ids] } };
  const groups = await prisma.product.groupBy({
    by: [owner],
    where: { ...activeListingWhere(), ...ownerWhere },
    _count: { _all: true },
  });
  const counts = new Map<string, number>();
  for (const group of groups) {
    const ownerId = group[owner];
    if (ownerId) counts.set(ownerId, group._count._all);
  }
  return counts;
}

/**
 * Sayfayı (ya da `activeListingCount` sıralamasında tüm satırları) getirir ve
 * her satıra `listingCount` + `activeListingCount` ekler.
 */
export async function paginateWithListingCounts<TItem extends CountedItem>(
  prisma: Pick<PrismaService, "product">,
  owner: ListingOwnerField,
  query: ListQuery,
  fetch: {
    page: () => Promise<PaginatedResult<TItem>>;
    all: () => Promise<TItem[]>;
  },
): Promise<PaginatedResult<TItem & ListingCounts>> {
  const withCounts = async (items: TItem[]) => {
    const active = await activeListingCounts(
      prisma,
      owner,
      items.map((item) => item.id),
    );
    return items.map((item) => ({
      ...item,
      listingCount: item._count.products,
      activeListingCount: active.get(item.id) ?? 0,
    }));
  };

  if (query.sortBy === ACTIVE_LISTING_COUNT_SORT) {
    return paginateComputedRows(
      await withCounts(await fetch.all()),
      (row) => row.activeListingCount,
      { ...query, sortType: "number" },
    );
  }

  const result = await fetch.page();
  return { ...result, data: await withCounts(result.data) };
}
