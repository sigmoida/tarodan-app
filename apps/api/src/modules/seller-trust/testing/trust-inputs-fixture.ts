import type { SellerTrustInputs } from "@tarodan/types";

/** Formula inputs with every count at 0 except the ones given. */
export const trustInputs = (
  over: Partial<SellerTrustInputs> = {},
): SellerTrustInputs => ({
  raters: 0,
  sumOfGiverMeans: 0,
  eligibleOrders: 0,
  failures: 0,
  shipped: 0,
  late: 0,
  transactions: 0,
  counterparties: 0,
  tenureDays: 0,
  ...over,
});
