/**
 * Seller trust score: the stored, behaviour-based 0.00 to 5.00 rating.
 *
 * The API computes it nightly (`seller-trust-refresh`) and stores it in integer
 * hundredths (`score_x100`, 0 to 500, null when there is not enough data). The
 * formula itself is an API helper; this file holds what every client must agree
 * on: the version, the components and their weights (the API computes with
 * them, admin shows them), the levels and their thresholds, the read shapes and
 * the formatter. Durable reference: `docs/SELLER_TRUST.md`.
 */

/** Bumped by any change to a constant or a definition of the formula. */
export const SELLER_TRUST_FORMULA_VERSION = 1;

export const SELLER_TRUST_LEVELS = [
  "excellent",
  "trusted",
  "fair",
  "developing",
  "new",
] as const;
export type SellerTrustLevel = (typeof SELLER_TRUST_LEVELS)[number];

/** Lowest `score_x100` of each scored level; below `fair` is `developing`. */
export const SELLER_TRUST_LEVEL_MIN_X100 = {
  excellent: 450,
  trusted: 400,
  fair: 300,
} as const;

/** A score exists only from this many counted (capped) completed transactions. */
export const SELLER_TRUST_MIN_TRANSACTIONS = 5;

/** ...and from this many distinct counterparties. */
export const SELLER_TRUST_MIN_COUNTERPARTIES = 3;

/** The five components of formula v1, in formula (and display) order. */
export const SELLER_TRUST_COMPONENTS_V1 = [
  "rating",
  "reliability",
  "onTime",
  "volume",
  "tenure",
] as const;
export type SellerTrustComponentKey =
  (typeof SELLER_TRUST_COMPONENTS_V1)[number];

/**
 * Weight of each formula v1 sub-score; they sum to 1. The single source: the
 * API formula computes with it and admin shows it in the breakdown. Changing a
 * value bumps `SELLER_TRUST_FORMULA_VERSION`.
 */
export const SELLER_TRUST_WEIGHTS_V1 = {
  rating: 0.4,
  reliability: 0.25,
  onTime: 0.15,
  volume: 0.15,
  tenure: 0.05,
} as const satisfies Record<SellerTrustComponentKey, number>;

/** The level is derived, never stored: one function for every surface. */
export function sellerTrustLevel(scoreX100: number | null): SellerTrustLevel {
  if (scoreX100 === null) return "new";
  if (scoreX100 >= SELLER_TRUST_LEVEL_MIN_X100.excellent) return "excellent";
  if (scoreX100 >= SELLER_TRUST_LEVEL_MIN_X100.trusted) return "trusted";
  if (scoreX100 >= SELLER_TRUST_LEVEL_MIN_X100.fair) return "fair";
  return "developing";
}

/** Catalog key of each level's label (`packages/i18n`). */
export const SELLER_TRUST_LEVEL_I18N_KEYS = {
  excellent: "seller.trustScore.levels.excellent",
  trusted: "seller.trustScore.levels.trusted",
  fair: "seller.trustScore.levels.fair",
  developing: "seller.trustScore.levels.developing",
  new: "seller.trustScore.levels.new",
} as const satisfies Record<SellerTrustLevel, string>;

/** What a profile shows. `rating` is null exactly when `level` is `new`. */
export interface SellerTrustView {
  /** 0.00 to 5.00, two decimals. */
  rating: number | null;
  level: SellerTrustLevel;
  formulaVersion: number;
}

/**
 * Formula v1 breakdown stored with each score (admin support). Counts and
 * sub-scores only: no ids, names or other personal data.
 */
export interface SellerTrustComponentsV1 {
  version: 1;
  /** Ratings received as seller and on completed trades, one vote per giver. */
  rating: {
    raters: number;
    /** Smoothed mean on the 1 to 5 scale (prior 4.0, weight 5). */
    smoothed: number;
    subScore: number;
  };
  /** Paid orders whose first deadline passed in the window. */
  reliability: { eligibleOrders: number; failures: number; subScore: number };
  /** Of those, handed to the carrier, and handed over after the first deadline. */
  onTime: { shipped: number; late: number; subScore: number };
  /** Completed sales and trades, at most 3 per counterparty. */
  volume: { transactions: number; counterparties: number; subScore: number };
  tenure: { days: number; subScore: number };
}

export interface AdminSellerTrustView extends SellerTrustView {
  components: SellerTrustComponentsV1 | null;
  computedAt: string | null;
}

/** `score_x100` to the 0.00 to 5.00 rating. */
export function sellerTrustRatingFromX100(scoreX100: number): number {
  return scoreX100 / 100;
}

/** Locale-aware, always exactly two decimals: "3,74" (tr), "3.74" (en). */
export function formatTrustRating(rating: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rating);
}
