import {
  sellerTrustLevel,
  type SellerTrustExplanation,
  type SellerTrustFormulaParams,
  type SellerTrustInputs,
} from "@tarodan/types";
import { computeTrustTerms, toScoreX100 } from "./trust-formula";
import { TRUST_FORMULA_V1 } from "./trust-formula.constants";

/**
 * Every intermediate value behind one score, for the admin lab. Pure. It reads
 * the same terms as `computeSellerTrust`, so `scoreX100` here is always the
 * score the batch would store with the same inputs and parameters.
 */
export function explainSellerTrust(
  inputs: SellerTrustInputs,
  params: SellerTrustFormulaParams = TRUST_FORMULA_V1,
): SellerTrustExplanation {
  const t = computeTrustTerms(inputs, params);
  const s = t.subScores;
  const w = params.weights;
  const roundedX100 = toScoreX100(t.score);

  return {
    rating: {
      raters: inputs.raters,
      sumOfGiverMeans: inputs.sumOfGiverMeans,
      priorMean: params.rating.priorMean,
      priorWeight: params.rating.priorWeight,
      smoothed: t.smoothed,
      subScore: s.rating,
      weight: w.rating,
      contribution: 5 * t.weighted.rating,
    },
    reliability: {
      eligibleOrders: inputs.eligibleOrders,
      failures: inputs.failures,
      priorRate: params.reliability.priorRate,
      priorWeight: params.reliability.priorWeight,
      zeroAt: params.reliability.zeroAt,
      failureRate: t.failureRate,
      subScore: s.reliability,
      weight: w.reliability,
      contribution: 5 * t.weighted.reliability,
    },
    onTime: {
      shipped: inputs.shipped,
      late: inputs.late,
      priorRate: params.onTime.priorRate,
      priorWeight: params.onTime.priorWeight,
      zeroAt: params.onTime.zeroAt,
      lateRate: t.lateRate,
      subScore: s.onTime,
      weight: w.onTime,
      contribution: 5 * t.weighted.onTime,
    },
    volume: {
      transactions: inputs.transactions,
      counterparties: inputs.counterparties,
      saturation: params.volume.saturation,
      subScore: s.volume,
      weight: w.volume,
      contribution: 5 * t.weighted.volume,
    },
    tenure: {
      days: inputs.tenureDays,
      fullAtDays: params.tenure.fullAtDays,
      subScore: s.tenure,
      weight: w.tenure,
      contribution: 5 * t.weighted.tenure,
    },
    score: t.score,
    roundedX100,
    scoreX100: t.enoughData ? roundedX100 : null,
    level: sellerTrustLevel(t.enoughData ? roundedX100 : null),
    minimum: {
      transactions: params.minimum.transactions,
      counterparties: params.minimum.counterparties,
      met: t.enoughData,
    },
  };
}
