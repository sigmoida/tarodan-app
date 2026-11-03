import type { SellerTrustInputs, SellerTrustLevel } from "@tarodan/types";

export interface SellerTrustGoldenScenario {
  /** 1 to 10, the row of the approved table. */
  id: number;
  /** Stable identifier (admin presets and their copy). */
  key: string;
  /** Short English name; A to F are the first plan's worked examples. */
  name: string;
  inputs: SellerTrustInputs;
  /** s1..s5 in component order, to 4 decimals; null where none was approved. */
  subScores: [number, number, number, number, number] | null;
  scoreX100: number | null;
  level: SellerTrustLevel;
}

/**
 * The approved intended outcomes of formula v1 (tarodan-ops plan
 * 2026-11-03-seller-trust-score-lab, section 4.5; product admin and user
 * sign-off, decision D7). The single source for the golden spec and the
 * lab's scenario presets. Synthetic inputs, no real seller.
 *
 * Never edit a value here to match a wish: a different outcome is a v2
 * input, decided through ADR 0014's process.
 */
export const SELLER_TRUST_GOLDEN_V1: readonly SellerTrustGoldenScenario[] = [
  {
    id: 1,
    key: "aNew",
    name: "A new",
    inputs: {
      raters: 2,
      sumOfGiverMeans: 2 * 5.0,
      eligibleOrders: 3,
      failures: 0,
      shipped: 3,
      late: 0,
      transactions: 3,
      counterparties: 3,
      tenureDays: 30,
    },
    subScores: null,
    scoreX100: null,
    level: "new",
  },
  {
    id: 2,
    key: "dSmallPerfect",
    name: "D small and perfect",
    inputs: {
      raters: 5,
      sumOfGiverMeans: 5 * 5.0,
      eligibleOrders: 5,
      failures: 0,
      shipped: 5,
      late: 0,
      transactions: 5,
      counterparties: 5,
      tenureDays: 60,
    },
    subScores: [0.875, 0.9467, 0.9333, 0.3882, 0.0822],
    scoreX100: 395,
    level: "fair",
  },
  {
    id: 3,
    key: "eSteady",
    name: "E steady",
    inputs: {
      raters: 12,
      sumOfGiverMeans: 12 * 4.8,
      eligibleOrders: 15,
      failures: 0,
      shipped: 15,
      late: 1,
      transactions: 15,
      counterparties: 12,
      tenureDays: 200,
    },
    subScores: [0.8912, 0.968, 0.88, 0.6008, 0.274],
    scoreX100: 417,
    level: "trusted",
  },
  {
    id: 4,
    key: "bGood",
    name: "B good",
    inputs: {
      raters: 25,
      sumOfGiverMeans: 25 * 4.8,
      eligibleOrders: 45,
      failures: 1,
      shipped: 44,
      late: 3,
      transactions: 40,
      counterparties: 30,
      tenureDays: 400,
    },
    subScores: [0.9167, 0.9127, 0.8704, 0.8047, 0.5479],
    scoreX100: 437,
    level: "trusted",
  },
  {
    id: 5,
    key: "fVeteran",
    name: "F veteran",
    inputs: {
      raters: 100,
      sumOfGiverMeans: 100 * 4.9,
      eligibleOrders: 150,
      failures: 1,
      shipped: 148,
      late: 4,
      transactions: 100,
      counterparties: 100,
      tenureDays: 1000,
    },
    subScores: [0.9643, 0.97, 0.943, 1, 1],
    scoreX100: 485,
    level: "excellent",
  },
  {
    id: 6,
    key: "cProblem",
    name: "C problem",
    inputs: {
      raters: 12,
      sumOfGiverMeans: 12 * 3.9,
      eligibleOrders: 30,
      failures: 6,
      shipped: 24,
      late: 8,
      transactions: 20,
      counterparties: 15,
      tenureDays: 300,
    },
    subScores: [0.7324, 0.38, 0.5, 0.6597, 0.411],
    scoreX100: 291,
    level: "developing",
  },
  {
    id: 7,
    key: "lovedUnreliable",
    name: "Loved but unreliable (20 % failures)",
    inputs: {
      raters: 20,
      sumOfGiverMeans: 20 * 4.9,
      eligibleOrders: 40,
      failures: 8,
      shipped: 32,
      late: 2,
      transactions: 30,
      counterparties: 25,
      tenureDays: 365,
    },
    subScores: [0.93, 0.344, 0.881, 0.7441, 0.5],
    scoreX100: 363,
    level: "fair",
  },
  {
    id: 8,
    key: "reliableUnrated",
    name: "Reliable, never rated",
    inputs: {
      raters: 0,
      sumOfGiverMeans: 0,
      eligibleOrders: 25,
      failures: 0,
      shipped: 25,
      late: 0,
      transactions: 20,
      counterparties: 18,
      tenureDays: 500,
    },
    subScores: [0.75, 0.9771, 0.9714, 0.6597, 0.6849],
    scoreX100: 412,
    level: "trusted",
  },
  {
    id: 9,
    key: "oneStarWave",
    name: "One-star wave",
    inputs: {
      raters: 15,
      sumOfGiverMeans: 15 * 1.5,
      eligibleOrders: 20,
      failures: 1,
      shipped: 19,
      late: 1,
      transactions: 15,
      counterparties: 15,
      tenureDays: 300,
    },
    subScores: [0.2813, 0.84, 0.8966, 0.6008, 0.411],
    scoreX100: 284,
    level: "developing",
  },
  {
    id: 10,
    key: "priorsOnly",
    name: "Minimum met, priors only (trades, no ratings or orders)",
    inputs: {
      raters: 0,
      sumOfGiverMeans: 0,
      eligibleOrders: 0,
      failures: 0,
      shipped: 0,
      late: 0,
      transactions: 5,
      counterparties: 3,
      tenureDays: 0,
    },
    subScores: [0.75, 0.92, 0.9, 0.3882, 0],
    scoreX100: 362,
    level: "fair",
  },
];
