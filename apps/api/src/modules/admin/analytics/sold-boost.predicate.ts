import { BoostSource, Prisma } from "@prisma/client";
import { col } from "../../account-lane/live-lane.where";

/**
 * "A boost sale": a boost a seller bought. A free staff grant
 * (`source = admin_grant`) is not one: no money changed hands, so it stays
 * out of the boost counts, revenue and uplift averages (decision D3, tarodan-ops
 * plan 2026-10-21-listing-boost). One rule in both forms, side by side, so the
 * Prisma and the SQL readers cannot drift.
 */
export const SOLD_BOOST = {
  source: BoostSource.purchase,
} satisfies Prisma.ProductBoostWhereInput;

/** {@link SOLD_BOOST} in SQL, for a `product_boosts` alias. */
export function soldBoostSql(alias: string): Prisma.Sql {
  return Prisma.sql`${col(alias, "source")} = ${BoostSource.purchase}::"BoostSource"`;
}
