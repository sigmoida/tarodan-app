import type {
  SellerTrustComponentKey,
  SellerTrustComponentsV1,
  SellerTrustFormulaParams,
  SellerTrustInputs,
} from "@tarodan/types";
import { TRUST_FORMULA_V1 } from "./trust-formula.constants";

// The type moved to @tarodan/types (shared with the admin lab); re-exported so
// the module's existing imports keep one path.
export type { SellerTrustInputs } from "@tarodan/types";

export interface SellerTrustResult {
  /** 0 to 500; null when the minimum data rule is not met. */
  scoreX100: number | null;
  components: SellerTrustComponentsV1;
}

/**
 * The unrounded intermediate values of one computation. The score and its
 * explanation are both built from these, so they cannot drift apart.
 */
export interface SellerTrustTerms {
  /** Smoothed per-giver rating mean, 1 to 5. */
  smoothed: number;
  failureRate: number;
  lateRate: number;
  /** Each 0 to 1. */
  subScores: Record<SellerTrustComponentKey, number>;
  /** `weight x subScore` of each component: the terms the score adds up. */
  weighted: Record<SellerTrustComponentKey, number>;
  /** `5 x` the sum of the weighted terms, before rounding. */
  score: number;
  /** The minimum data rule is met. */
  enoughData: boolean;
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/**
 * Round half up to hundredths of a point, clamped to 0..500. The epsilon
 * absorbs binary noise (4.365 * 100 = 436.49999...) so a true .5 rounds up.
 */
export function toScoreX100(score: number): number {
  return Math.min(500, Math.max(0, Math.floor(score * 100 + 0.5 + 1e-9)));
}

/**
 * The formula's arithmetic, once (`docs/SELLER_TRUST.md`). Pure. The order of
 * operations is part of v1: the stored scores and the v1 pin depend on the
 * exact doubles, so do not regroup a term.
 */
export function computeTrustTerms(
  inputs: SellerTrustInputs,
  p: SellerTrustFormulaParams,
): SellerTrustTerms {
  const smoothed =
    (p.rating.priorWeight * p.rating.priorMean + inputs.sumOfGiverMeans) /
    (p.rating.priorWeight + inputs.raters);
  const s1 = clamp01((smoothed - 1) / 4);

  const failureRate =
    (inputs.failures + p.reliability.priorWeight * p.reliability.priorRate) /
    (inputs.eligibleOrders + p.reliability.priorWeight);
  const s2 = clamp01(1 - failureRate / p.reliability.zeroAt);

  const lateRate =
    (inputs.late + p.onTime.priorWeight * p.onTime.priorRate) /
    (inputs.shipped + p.onTime.priorWeight);
  const s3 = clamp01(1 - lateRate / p.onTime.zeroAt);

  const s4 = Math.min(
    1,
    Math.log(1 + inputs.transactions) / Math.log(1 + p.volume.saturation),
  );

  const s5 = Math.min(1, inputs.tenureDays / p.tenure.fullAtDays);

  const weighted = {
    rating: p.weights.rating * s1,
    reliability: p.weights.reliability * s2,
    onTime: p.weights.onTime * s3,
    volume: p.weights.volume * s4,
    tenure: p.weights.tenure * s5,
  };
  // Summed left to right in component order, exactly as v1 always did.
  const score =
    5 *
    (weighted.rating +
      weighted.reliability +
      weighted.onTime +
      weighted.volume +
      weighted.tenure);

  const enoughData =
    inputs.transactions >= p.minimum.transactions &&
    inputs.counterparties >= p.minimum.counterparties;

  return {
    smoothed,
    failureRate,
    lateRate,
    subScores: {
      rating: s1,
      reliability: s2,
      onTime: s3,
      volume: s4,
      tenure: s5,
    },
    weighted,
    score,
    enoughData,
  };
}

/**
 * Seller trust formula v1 (`docs/SELLER_TRUST.md`). Pure. The nightly batch
 * calls it with the inputs only, so it always computes v1. The admin lab
 * passes a validated candidate (`validateSellerTrustParams`); the breakdown
 * shape stays `SellerTrustComponentsV1`, so `components.version` is 1 even
 * for a candidate. A candidate result is never stored or cached; the lab
 * labels it, and shows candidates through `explainSellerTrust`, which
 * carries no version.
 */
export function computeSellerTrust(
  inputs: SellerTrustInputs,
  params: SellerTrustFormulaParams = TRUST_FORMULA_V1,
): SellerTrustResult {
  const t = computeTrustTerms(inputs, params);
  const s = t.subScores;

  return {
    scoreX100: t.enoughData ? toScoreX100(t.score) : null,
    components: {
      version: TRUST_FORMULA_V1.version,
      rating: {
        raters: inputs.raters,
        smoothed: round4(t.smoothed),
        subScore: round4(s.rating),
      },
      reliability: {
        eligibleOrders: inputs.eligibleOrders,
        failures: inputs.failures,
        subScore: round4(s.reliability),
      },
      onTime: {
        shipped: inputs.shipped,
        late: inputs.late,
        subScore: round4(s.onTime),
      },
      volume: {
        transactions: inputs.transactions,
        counterparties: inputs.counterparties,
        subScore: round4(s.volume),
      },
      tenure: { days: inputs.tenureDays, subScore: round4(s.tenure) },
    },
  };
}

/** Breakdown values are for display only; four decimals keep the JSON small. */
function round4(x: number): number {
  return Math.round(x * 10_000) / 10_000;
}
