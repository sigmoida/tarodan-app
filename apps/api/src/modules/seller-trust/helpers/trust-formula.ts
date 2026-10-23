import type { SellerTrustComponentsV1 } from "@tarodan/types";
import { TRUST_FORMULA_V1 as F } from "./trust-formula.constants";

/**
 * The counts one seller contributes, already aggregated by SQL in the owning
 * domains. The formula below only does arithmetic on them, so every rule of
 * v1 that is not a definition of "what counts" is pinned by its spec.
 */
export interface SellerTrustInputs {
  /** Distinct givers whose ratings count (one vote per person). */
  raters: number;
  /** Sum over those givers of each giver's mean score (1 to 5). */
  sumOfGiverMeans: number;
  /** Paid orders whose first deadline passed in the window (E). */
  eligibleOrders: number;
  /** Seller-caused failures among them (F). */
  failures: number;
  /** Of E, handed to the carrier (S). */
  shipped: number;
  /** Of S, handed over after the first deadline plus the grace (L). */
  late: number;
  /** Completed sales and trades after the per-counterparty cap (N). */
  transactions: number;
  /** Distinct counterparties behind N. */
  counterparties: number;
  /** Whole days since the account was created, at `asOf`. */
  tenureDays: number;
}

export interface SellerTrustResult {
  /** 0 to 500; null when the minimum data rule is not met. */
  scoreX100: number | null;
  components: SellerTrustComponentsV1;
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/**
 * Round half up to hundredths of a point, clamped to 0..500. The epsilon
 * absorbs binary noise (4.365 * 100 = 436.49999...) so a true .5 rounds up.
 */
export function toScoreX100(score: number): number {
  return Math.min(500, Math.max(0, Math.floor(score * 100 + 0.5 + 1e-9)));
}

/** Seller trust formula v1 (`docs/SELLER_TRUST.md`). Pure. */
export function computeSellerTrust(
  inputs: SellerTrustInputs,
): SellerTrustResult {
  const smoothed =
    (F.rating.priorWeight * F.rating.priorMean + inputs.sumOfGiverMeans) /
    (F.rating.priorWeight + inputs.raters);
  const s1 = clamp01((smoothed - 1) / 4);

  const failureRate =
    (inputs.failures + F.reliability.priorWeight * F.reliability.priorRate) /
    (inputs.eligibleOrders + F.reliability.priorWeight);
  const s2 = clamp01(1 - failureRate / F.reliability.zeroAt);

  const lateRate =
    (inputs.late + F.onTime.priorWeight * F.onTime.priorRate) /
    (inputs.shipped + F.onTime.priorWeight);
  const s3 = clamp01(1 - lateRate / F.onTime.zeroAt);

  const s4 = Math.min(
    1,
    Math.log(1 + inputs.transactions) / Math.log(1 + F.volume.saturation),
  );

  const s5 = Math.min(1, inputs.tenureDays / F.tenure.fullAtDays);

  const score =
    5 *
    (F.weights.rating * s1 +
      F.weights.reliability * s2 +
      F.weights.onTime * s3 +
      F.weights.volume * s4 +
      F.weights.tenure * s5);

  const enoughData =
    inputs.transactions >= F.minimum.transactions &&
    inputs.counterparties >= F.minimum.counterparties;

  return {
    scoreX100: enoughData ? toScoreX100(score) : null,
    components: {
      version: F.version,
      rating: {
        raters: inputs.raters,
        smoothed: round4(smoothed),
        subScore: round4(s1),
      },
      reliability: {
        eligibleOrders: inputs.eligibleOrders,
        failures: inputs.failures,
        subScore: round4(s2),
      },
      onTime: {
        shipped: inputs.shipped,
        late: inputs.late,
        subScore: round4(s3),
      },
      volume: {
        transactions: inputs.transactions,
        counterparties: inputs.counterparties,
        subScore: round4(s4),
      },
      tenure: { days: inputs.tenureDays, subScore: round4(s5) },
    },
  };
}

/** Breakdown values are for display only; four decimals keep the JSON small. */
function round4(x: number): number {
  return Math.round(x * 10_000) / 10_000;
}
