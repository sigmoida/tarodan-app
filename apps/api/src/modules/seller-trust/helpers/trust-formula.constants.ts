import {
  SELLER_TRUST_FORMULA_VERSION,
  SELLER_TRUST_MIN_COUNTERPARTIES,
  SELLER_TRUST_MIN_TRANSACTIONS,
  SELLER_TRUST_WEIGHTS_V1,
} from "@tarodan/types";

/**
 * Seller trust formula v1 constants (tarodan-ops ADR 0014; reference
 * `docs/SELLER_TRUST.md`). Changing any value is a product decision and bumps
 * `SELLER_TRUST_FORMULA_VERSION` in `@tarodan/types`.
 */
export const TRUST_FORMULA_V1 = {
  version: SELLER_TRUST_FORMULA_VERSION,

  /** Rolling windows, in days, all ending at the run's `asOf`. */
  windows: {
    ratingDays: 730,
    operationsDays: 365,
    volumeDays: 730,
  },

  /** Weights of the five sub-scores; they sum to 1 (shared with admin). */
  weights: SELLER_TRUST_WEIGHTS_V1,

  /** Bayesian prior of the per-giver rating mean: `m` with weight `C`. */
  rating: { priorMean: 4.0, priorWeight: 5 },

  /** Failure rate prior; `zeroAt` is the rate that gives a sub-score of 0. */
  reliability: { priorRate: 0.02, priorWeight: 10, zeroAt: 0.25 },

  /**
   * Late-handover prior. `graceMinutes` absorbs the carrier sync lag:
   * `shipments.shipped_at` is stamped by the 30-minute Surat tracking poll.
   */
  onTime: { priorRate: 0.05, priorWeight: 10, zeroAt: 0.5, graceMinutes: 120 },

  /** Each counterparty counts at most `perCounterpartyCap` times. */
  volume: { perCounterpartyCap: 3, saturation: 100 },

  tenure: { fullAtDays: 730 },

  minimum: {
    transactions: SELLER_TRUST_MIN_TRANSACTIONS,
    counterparties: SELLER_TRUST_MIN_COUNTERPARTIES,
  },
} as const;
