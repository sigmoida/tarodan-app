import { Prisma, ProductKind } from "@prisma/client";

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
