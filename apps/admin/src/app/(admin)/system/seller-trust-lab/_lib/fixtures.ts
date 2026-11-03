import type {
  SellerTrustExplanation,
  SellerTrustFormulaParams,
  SellerTrustLabPopulation,
  SellerTrustLabSeller,
} from "@tarodan/types";

/** Test-only: a v1-shaped parameter set (the real one comes from the API). */
export const V1_PARAMS: SellerTrustFormulaParams = {
  weights: {
    rating: 0.4,
    reliability: 0.25,
    onTime: 0.15,
    volume: 0.1,
    tenure: 0.1,
  },
  rating: { priorMean: 4, priorWeight: 5 },
  reliability: { priorRate: 0.05, priorWeight: 10, zeroAt: 0.5 },
  onTime: { priorRate: 0.1, priorWeight: 10, zeroAt: 0.5 },
  volume: { saturation: 50 },
  tenure: { fullAtDays: 365 },
  minimum: { transactions: 3, counterparties: 3 },
};

/** Test-only explanation with every field the tables read. */
export function explanation(
  overrides: Partial<SellerTrustExplanation> = {},
): SellerTrustExplanation {
  const terms = (subScore: number, weight: number) => ({
    subScore,
    weight,
    contribution: 5 * weight * subScore,
  });
  return {
    rating: {
      ...terms(0.875, 0.4),
      raters: 12,
      sumOfGiverMeans: 57.6,
      priorMean: 4,
      priorWeight: 5,
      smoothed: 4.5,
    },
    reliability: {
      ...terms(0.9, 0.25),
      eligibleOrders: 15,
      failures: 1,
      priorRate: 0.05,
      priorWeight: 10,
      zeroAt: 0.5,
      failureRate: 0.08,
    },
    onTime: {
      ...terms(0.8, 0.15),
      shipped: 14,
      late: 2,
      priorRate: 0.1,
      priorWeight: 10,
      zeroAt: 0.5,
      lateRate: 0.12,
    },
    volume: {
      ...terms(0.5, 0.1),
      transactions: 25,
      counterparties: 20,
      saturation: 50,
    },
    tenure: { ...terms(0.27, 0.1), days: 100, fullAtDays: 365 },
    score: 3.7412,
    roundedX100: 374,
    scoreX100: 374,
    level: "fair",
    minimum: { transactions: 3, counterparties: 3, met: true },
    ...overrides,
  };
}

export const WINDOWS: SellerTrustLabSeller["windows"] = {
  rating: {
    since: "2025-11-01T00:00:00.000Z",
    until: "2026-11-01T00:00:00.000Z",
  },
  operations: {
    since: "2026-08-01T00:00:00.000Z",
    until: "2026-11-01T00:00:00.000Z",
  },
  volume: {
    since: "2025-11-01T00:00:00.000Z",
    until: "2026-11-01T00:00:00.000Z",
  },
};

export function population(
  overrides: Partial<SellerTrustLabPopulation["summary"]> = {},
): SellerTrustLabPopulation {
  const counts = { excellent: 1, trusted: 2, fair: 3, developing: 4, new: 5 };
  const summary: SellerTrustLabPopulation["summary"] = {
    rowsRead: 15,
    skippedOtherVersion: 0,
    skippedUnreadable: 0,
    rowsCompared: 15,
    computedAt: {
      min: "2026-11-02T00:30:00.000Z",
      max: "2026-11-02T00:30:00.000Z",
    },
    v1Consistency: { matched: 15, offByOne: 0, mismatched: 0 },
    levels: { stored: counts, candidate: counts },
    histogram: {
      buckets: [
        { fromX100: 0, toX100: 50, stored: 1, candidate: 2 },
        { fromX100: 50, toX100: 100, stored: 3, candidate: 2 },
      ],
      new: { stored: 5, candidate: 5 },
    },
    levelMatrix: {
      excellent: { ...counts },
      trusted: { ...counts },
      fair: { ...counts },
      developing: { ...counts },
      new: { ...counts },
    },
    newToScored: 0,
    scoredToNew: 0,
    changes: { bothScored: 10, changed: 4, meanAbsX100: 12, maxAbsX100: 40 },
    ...overrides,
  };
  return {
    params: V1_PARAMS,
    filters: {},
    summary,
    movers: {
      up: [
        {
          userId: "11111111-1111-4111-8111-111111111111",
          username: "riser",
          storedX100: 300,
          candidateX100: 340,
          storedRank: 9,
          candidateRank: 4,
        },
      ],
      down: [],
    },
    proposal: {
      kind: "seller-trust-candidate-proposal",
      baseVersion: 1,
      generatedAt: "2026-11-03T10:00:00.000Z",
      environment: { env: "staging", isProd: false },
      params: V1_PARAMS,
      filters: {},
      summary,
    },
  };
}
