import { Prisma, ProductKind, ProductStatus } from "@prisma/client";
import { saleCapableSellerWhere } from "../../membership/helpers/membership.util";
import type { AccountLane } from "../../account-lane/account-lane";

/**
 * Canonical public-catalog boundary.
 *
 * Payment-only membership and boost products deliberately remain in Product so
 * their orders, payments and accounting relations stay intact. Every public
 * catalog read must compose this predicate instead of inferring visibility from
 * an ID prefix.
 */
export function catalogProductWhere(): Prisma.ProductWhereInput {
  return { kind: ProductKind.listing };
}

/**
 * "Stokta" koşulu: quantity > 0 ya da null (= sınırsız). `status=active` listesi
 * (buildProductWhere) ile marka/üretici/kategori sayımları AYNI koşulu kullanır —
 * sayım "N ilan" derken liste boş çıkmasın.
 */
export function inStockWhere(): Prisma.ProductWhereInput {
  return { OR: [{ quantity: { gt: 0 } }, { quantity: null }] };
}

/**
 * Bir markada/üreticide/kategoride müşterinin GÖRECEĞİ ilan kümesi: katalog
 * ilanı + aktif + stoklu + satıcısı şu an satış yapabilir. Public `_count` ve
 * admin "İlan" kolonu bu tek kuraldan beslenir (`status=active` listesiyle aynı).
 */
export function publicListingWhere(
  lane?: AccountLane,
): Prisma.ProductWhereInput {
  return {
    ...catalogProductWhere(),
    status: ProductStatus.active,
    seller: saleCapableSellerWhere(undefined, lane),
    AND: [inStockWhere()],
  };
}
