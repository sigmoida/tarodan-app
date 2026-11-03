import type { SellerTrustFormulaParams } from "@tarodan/types";

/**
 * A valid candidate whose every value differs from v1 and from the other
 * values of its kind. v1 has equal values in places (onTime and volume both
 * weigh 0.15, both prior weights are 10), so a term wired to the wrong
 * parameter still passes on v1; with this set it cannot.
 */
export const DISTINCT_TRUST_CANDIDATE: SellerTrustFormulaParams = {
  weights: {
    rating: 0.31,
    reliability: 0.27,
    onTime: 0.19,
    volume: 0.13,
    tenure: 0.1,
  },
  rating: { priorMean: 3.3, priorWeight: 7 },
  reliability: { priorRate: 0.07, priorWeight: 4, zeroAt: 0.33 },
  onTime: { priorRate: 0.11, priorWeight: 13, zeroAt: 0.61 },
  volume: { saturation: 37 },
  tenure: { fullAtDays: 400 },
  minimum: { transactions: 7, counterparties: 4 },
};
