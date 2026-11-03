/**
 * Seller trust score lab: the shapes the API and admin share to explain and
 * simulate the score (tarodan-ops plan 2026-11-03-seller-trust-score-lab).
 *
 * API and admin only. Mobile vendors `seller-trust.ts` and must NOT vendor
 * this file. A candidate parameter set is evidence for a v2 decision (ADR
 * 0014); it never changes the stored score, which v1 alone computes.
 */
import {
  SELLER_TRUST_COMPONENTS_V1,
  type SellerTrustComponentKey,
  type SellerTrustLevel,
} from "./seller-trust";

/**
 * The counts one seller contributes, already aggregated by SQL in the owning
 * domains. The formula only does arithmetic on them.
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

/**
 * What the pure formula reads, and so exactly what a lab candidate may
 * change (decision D3). The windows, the late grace and the per-counterparty
 * cap are definitions the SQL reads; they are not parameters.
 */
export interface SellerTrustFormulaParams {
  /** Weight of each sub-score; the five sum to 1. */
  weights: Record<SellerTrustComponentKey, number>;
  /** Bayesian prior of the per-giver rating mean (1 to 5). */
  rating: { priorMean: number; priorWeight: number };
  /** Failure-rate prior; `zeroAt` is the rate that gives a sub-score of 0. */
  reliability: { priorRate: number; priorWeight: number; zeroAt: number };
  /** Late-handover prior; `zeroAt` as above. */
  onTime: { priorRate: number; priorWeight: number; zeroAt: number };
  /** Counted transactions at which the volume sub-score reaches 1. */
  volume: { saturation: number };
  /** Account age, in days, at which the tenure sub-score reaches 1. */
  tenure: { fullAtDays: number };
  /** A score exists only from these counts on. */
  minimum: { transactions: number; counterparties: number };
}

/** Dotted path of one parameter, e.g. `weights.rating`, `onTime.zeroAt`. */
export type SellerTrustParamField = {
  [
    G in keyof SellerTrustFormulaParams
  ]: `${G}.${keyof SellerTrustFormulaParams[G] & string}`;
}[keyof SellerTrustFormulaParams];

export interface SellerTrustParamLimit {
  min: number;
  max: number;
  integer: boolean;
  /** At most this many decimals (weights only). */
  maxDecimals?: number;
}

const WEIGHT_LIMIT: SellerTrustParamLimit = {
  min: 0,
  max: 1,
  integer: false,
  maxDecimals: 4,
};
const PRIOR_WEIGHT_LIMIT: SellerTrustParamLimit = {
  // 0 would divide 0 by 0 for a seller with no data.
  min: 1,
  max: 100,
  integer: true,
};
const PRIOR_RATE_LIMIT: SellerTrustParamLimit = {
  min: 0,
  max: 1,
  integer: false,
};
const ZERO_AT_LIMIT: SellerTrustParamLimit = {
  // The rate is divided by it.
  min: 0.01,
  max: 1,
  integer: false,
};

/**
 * The accepted range of every parameter: one entry per field, so it is also
 * the list of fields. `minimum.counterparties` is further bounded by
 * `minimum.transactions` (issue `aboveTransactions`).
 */
export const SELLER_TRUST_PARAM_LIMITS = {
  "weights.rating": WEIGHT_LIMIT,
  "weights.reliability": WEIGHT_LIMIT,
  "weights.onTime": WEIGHT_LIMIT,
  "weights.volume": WEIGHT_LIMIT,
  "weights.tenure": WEIGHT_LIMIT,
  "rating.priorMean": { min: 1, max: 5, integer: false },
  "rating.priorWeight": PRIOR_WEIGHT_LIMIT,
  "reliability.priorRate": PRIOR_RATE_LIMIT,
  "reliability.priorWeight": PRIOR_WEIGHT_LIMIT,
  "reliability.zeroAt": ZERO_AT_LIMIT,
  "onTime.priorRate": PRIOR_RATE_LIMIT,
  "onTime.priorWeight": PRIOR_WEIGHT_LIMIT,
  "onTime.zeroAt": ZERO_AT_LIMIT,
  "volume.saturation": { min: 1, max: 10_000, integer: true },
  "tenure.fullAtDays": { min: 1, max: 3_650, integer: true },
  "minimum.transactions": { min: 1, max: 100, integer: true },
  "minimum.counterparties": { min: 1, max: 100, integer: true },
} as const satisfies Record<SellerTrustParamField, SellerTrustParamLimit>;

/** The five weights may miss 1 by at most this (binary noise). */
export const SELLER_TRUST_WEIGHT_SUM_TOLERANCE = 1e-9;

export type SellerTrustParamIssueCode =
  /** The value (or the whole set, `field: ""`) is not an object. */
  | "notAnObject"
  /** A key that is not a parameter, e.g. `onTime.graceMinutes`, `windows`. */
  | "unknownField"
  /** Missing, not a number, NaN or Infinity. */
  | "invalidNumber"
  | "notInteger"
  | "tooManyDecimals"
  /** Outside `SELLER_TRUST_PARAM_LIMITS[field]`. */
  | "outOfRange"
  /** `field: "weights"`: the five weights do not sum to 1. */
  | "weightsSum"
  /** `minimum.counterparties` is above `minimum.transactions`. */
  | "aboveTransactions";

export interface SellerTrustParamIssue {
  /**
   * Dotted path of the offending value: a `SellerTrustParamField`, a group
   * (`weights` for the sum, or a group that is not an object), an unknown
   * key's path, or `""` for the set itself.
   */
  field: string;
  code: SellerTrustParamIssueCode;
}

// A Map, not an object: `key in {}` is also true for inherited keys such as
// `constructor`, which would then pass as a known group.
const GROUPS = new Map<string, string[]>();
for (const path of Object.keys(SELLER_TRUST_PARAM_LIMITS)) {
  const [group, key] = path.split(".");
  GROUPS.set(group, [...(GROUPS.get(group) ?? []), key]);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function numberIssue(
  value: unknown,
  limit: SellerTrustParamLimit,
): SellerTrustParamIssueCode | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "invalidNumber";
  }
  if (limit.integer && !Number.isInteger(value)) return "notInteger";
  if (limit.maxDecimals !== undefined) {
    const scaled = value * 10 ** limit.maxDecimals;
    if (Math.abs(scaled - Math.round(scaled)) > 1e-6) return "tooManyDecimals";
  }
  if (value < limit.min || value > limit.max) return "outOfRange";
  return null;
}

/**
 * Checks a candidate parameter set. Pure; takes `unknown` so the API DTO and
 * the admin zod schema both call it on raw input. Returns every issue (one
 * per field at most, in `SELLER_TRUST_PARAM_LIMITS` order, then the
 * cross-field rules); an empty list means `p` is a valid
 * `SellerTrustFormulaParams` with no extra keys.
 */
export function validateSellerTrustParams(p: unknown): SellerTrustParamIssue[] {
  if (!isRecord(p)) return [{ field: "", code: "notAnObject" }];

  const issues: SellerTrustParamIssue[] = [];
  const valid = new Map<string, number>();

  for (const key of Object.keys(p)) {
    if (!GROUPS.has(key)) issues.push({ field: key, code: "unknownField" });
  }
  for (const [group, keys] of GROUPS) {
    const values = p[group];
    if (!isRecord(values)) {
      issues.push({ field: group, code: "notAnObject" });
      continue;
    }
    for (const key of Object.keys(values)) {
      if (!keys.includes(key)) {
        issues.push({ field: `${group}.${key}`, code: "unknownField" });
      }
    }
    for (const key of keys) {
      const field = `${group}.${key}` as SellerTrustParamField;
      const code = numberIssue(values[key], SELLER_TRUST_PARAM_LIMITS[field]);
      if (code) issues.push({ field, code });
      else valid.set(field, values[key] as number);
    }
  }

  const weightFields = SELLER_TRUST_COMPONENTS_V1.map(
    (key) => `weights.${key}`,
  );
  if (weightFields.every((field) => valid.has(field))) {
    const sum = weightFields.reduce((acc, f) => acc + (valid.get(f) ?? 0), 0);
    if (Math.abs(sum - 1) > SELLER_TRUST_WEIGHT_SUM_TOLERANCE) {
      issues.push({ field: "weights", code: "weightsSum" });
    }
  }

  const transactions = valid.get("minimum.transactions");
  const counterparties = valid.get("minimum.counterparties");
  if (
    transactions !== undefined &&
    counterparties !== undefined &&
    counterparties > transactions
  ) {
    issues.push({ field: "minimum.counterparties", code: "aboveTransactions" });
  }

  return issues;
}

export function isValidSellerTrustParams(
  p: unknown,
): p is SellerTrustFormulaParams {
  return validateSellerTrustParams(p).length === 0;
}

/**
 * Copies exactly the parameter fields of a superset (the API's
 * `TRUST_FORMULA_V1` also holds the version, windows, grace and cap), e.g.
 * to serve v1 as a lab default or to pass a validated candidate on with no
 * extra keys.
 */
export function pickSellerTrustFormulaParams(
  p: SellerTrustFormulaParams,
): SellerTrustFormulaParams {
  return {
    weights: {
      rating: p.weights.rating,
      reliability: p.weights.reliability,
      onTime: p.weights.onTime,
      volume: p.weights.volume,
      tenure: p.weights.tenure,
    },
    rating: {
      priorMean: p.rating.priorMean,
      priorWeight: p.rating.priorWeight,
    },
    reliability: {
      priorRate: p.reliability.priorRate,
      priorWeight: p.reliability.priorWeight,
      zeroAt: p.reliability.zeroAt,
    },
    onTime: {
      priorRate: p.onTime.priorRate,
      priorWeight: p.onTime.priorWeight,
      zeroAt: p.onTime.zeroAt,
    },
    volume: { saturation: p.volume.saturation },
    tenure: { fullAtDays: p.tenure.fullAtDays },
    minimum: {
      transactions: p.minimum.transactions,
      counterparties: p.minimum.counterparties,
    },
  };
}

/** Every value is unrounded; display rounds. */
interface ComponentTerms {
  /** 0 to 1. */
  subScore: number;
  weight: number;
  /**
   * `5 x (weight x subScore)`, in points: the weighted term the score adds
   * up. The five add up to `score` up to binary noise; rounded one by one
   * for display, their sum may miss the rounded score by a few hundredths.
   */
  contribution: number;
}

/**
 * Every intermediate value of one computation, so a product admin can recheck
 * the score by hand. Built from the same terms as the score itself
 * (`computeTrustTerms` in the API), so the two cannot drift. It carries no
 * formula version: the caller labels it v1 or "candidate".
 */
export interface SellerTrustExplanation {
  rating: ComponentTerms & {
    raters: number;
    sumOfGiverMeans: number;
    priorMean: number;
    priorWeight: number;
    /** Smoothed mean on the 1 to 5 scale. */
    smoothed: number;
  };
  reliability: ComponentTerms & {
    eligibleOrders: number;
    failures: number;
    priorRate: number;
    priorWeight: number;
    zeroAt: number;
    failureRate: number;
  };
  onTime: ComponentTerms & {
    shipped: number;
    late: number;
    priorRate: number;
    priorWeight: number;
    zeroAt: number;
    lateRate: number;
  };
  volume: ComponentTerms & {
    transactions: number;
    counterparties: number;
    saturation: number;
  };
  tenure: ComponentTerms & { days: number; fullAtDays: number };
  /** 0 to 5 before rounding. */
  score: number;
  /** `score` rounded half up and clamped, whether or not the minimum is met. */
  roundedX100: number;
  /** The stored value: `roundedX100`, or null below the minimum. */
  scoreX100: number | null;
  level: SellerTrustLevel;
  minimum: { transactions: number; counterparties: number; met: boolean };
}
