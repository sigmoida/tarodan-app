import {
  SELLER_TRUST_LAB_HISTOGRAM_STEP_X100,
  SELLER_TRUST_LAB_MOVERS,
  SELLER_TRUST_LEVELS,
  sellerTrustLevel,
  type SellerTrustFormulaParams,
  type SellerTrustLabEnvironment,
  type SellerTrustLabHistogramBucket,
  type SellerTrustLabLevelCounts,
  type SellerTrustLabMover,
  type SellerTrustLabPopulationFilters,
  type SellerTrustLabPopulationSummary,
  type SellerTrustLabProposal,
  type SellerTrustLevel,
} from "@tarodan/types";
import { TRUST_FORMULA_V1 as F } from "../helpers/trust-formula.constants";

/** One compared stored row of a population run. */
export interface PopulationRow {
  userId: string;
  computedAt: Date;
  /** The stored `score_x100`. */
  storedX100: number | null;
  /** v1 recomputed from the stored breakdown (consistency check). */
  v1X100: number | null;
  candidateX100: number | null;
}

/** Rows read but not compared. */
export interface PopulationSkips {
  rowsRead: number;
  skippedOtherVersion: number;
  skippedUnreadable: number;
}

/** A mover before its username is read. */
export type MoverDraft = Omit<SellerTrustLabMover, "username">;

const MAX_X100 = 500;

const levelCounts = (): SellerTrustLabLevelCounts =>
  Object.fromEntries(SELLER_TRUST_LEVELS.map((l) => [l, 0])) as Record<
    SellerTrustLevel,
    number
  >;

/** Dense rank (1 = highest) of every distinct score. */
function denseRanks(scores: Array<number | null>): Map<number, number> {
  const distinct = [
    ...new Set(scores.filter((s): s is number => s !== null)),
  ].sort((a, b) => b - a);
  return new Map(distinct.map((score, i) => [score, i + 1]));
}

function emptyBuckets(): SellerTrustLabHistogramBucket[] {
  const buckets: SellerTrustLabHistogramBucket[] = [];
  for (
    let from = 0;
    from < MAX_X100;
    from += SELLER_TRUST_LAB_HISTOGRAM_STEP_X100
  ) {
    buckets.push({
      fromX100: from,
      toX100: from + SELLER_TRUST_LAB_HISTOGRAM_STEP_X100,
      stored: 0,
      candidate: 0,
    });
  }
  return buckets;
}

const bucketOf = (x100: number): number =>
  Math.min(
    MAX_X100 / SELLER_TRUST_LAB_HISTOGRAM_STEP_X100 - 1,
    Math.floor(x100 / SELLER_TRUST_LAB_HISTOGRAM_STEP_X100),
  );

/**
 * The aggregates of a population run and its top movers. Pure. The summary
 * holds counts only; seller identifiers appear only in the movers, which
 * the proposal export leaves out.
 */
export function summarisePopulation(
  rows: readonly PopulationRow[],
  skips: PopulationSkips,
): {
  summary: SellerTrustLabPopulationSummary;
  movers: { up: MoverDraft[]; down: MoverDraft[] };
} {
  const consistency = { matched: 0, offByOne: 0, mismatched: 0 };
  const levels = { stored: levelCounts(), candidate: levelCounts() };
  const buckets = emptyBuckets();
  const unscored = { stored: 0, candidate: 0 };
  const levelMatrix = Object.fromEntries(
    SELLER_TRUST_LEVELS.map((l) => [l, levelCounts()]),
  ) as Record<SellerTrustLevel, SellerTrustLabLevelCounts>;
  let newToScored = 0;
  let scoredToNew = 0;
  let bothScored = 0;
  let changed = 0;
  let absSum = 0;
  let absMax = 0;
  let min: Date | null = null;
  let max: Date | null = null;

  for (const r of rows) {
    if (r.storedX100 === r.v1X100) consistency.matched += 1;
    else if (
      r.storedX100 !== null &&
      r.v1X100 !== null &&
      Math.abs(r.storedX100 - r.v1X100) === 1
    ) {
      consistency.offByOne += 1;
    } else consistency.mismatched += 1;

    const storedLevel = sellerTrustLevel(r.storedX100);
    const candidateLevel = sellerTrustLevel(r.candidateX100);
    levels.stored[storedLevel] += 1;
    levels.candidate[candidateLevel] += 1;
    levelMatrix[storedLevel][candidateLevel] += 1;

    if (r.storedX100 === null) unscored.stored += 1;
    else buckets[bucketOf(r.storedX100)].stored += 1;
    if (r.candidateX100 === null) unscored.candidate += 1;
    else buckets[bucketOf(r.candidateX100)].candidate += 1;

    if (r.storedX100 === null && r.candidateX100 !== null) newToScored += 1;
    if (r.storedX100 !== null && r.candidateX100 === null) scoredToNew += 1;
    if (r.storedX100 !== null && r.candidateX100 !== null) {
      bothScored += 1;
      const abs = Math.abs(r.candidateX100 - r.storedX100);
      if (abs > 0) changed += 1;
      absSum += abs;
      absMax = Math.max(absMax, abs);
    }

    if (min === null || r.computedAt < min) min = r.computedAt;
    if (max === null || r.computedAt > max) max = r.computedAt;
  }

  const storedRanks = denseRanks(rows.map((r) => r.storedX100));
  const candidateRanks = denseRanks(rows.map((r) => r.candidateX100));
  const moved: MoverDraft[] = [];
  for (const r of rows) {
    if (
      r.storedX100 === null ||
      r.candidateX100 === null ||
      r.storedX100 === r.candidateX100
    ) {
      continue;
    }
    moved.push({
      userId: r.userId,
      storedX100: r.storedX100,
      candidateX100: r.candidateX100,
      storedRank: storedRanks.get(r.storedX100) ?? 0,
      candidateRank: candidateRanks.get(r.candidateX100) ?? 0,
    });
  }
  const delta = (m: MoverDraft) => m.candidateX100 - m.storedX100;
  const byId = (a: MoverDraft, b: MoverDraft) =>
    a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
  const up = moved
    .filter((m) => delta(m) > 0)
    .sort((a, b) => delta(b) - delta(a) || byId(a, b))
    .slice(0, SELLER_TRUST_LAB_MOVERS);
  const down = moved
    .filter((m) => delta(m) < 0)
    .sort((a, b) => delta(a) - delta(b) || byId(a, b))
    .slice(0, SELLER_TRUST_LAB_MOVERS);

  return {
    summary: {
      rowsRead: skips.rowsRead,
      skippedOtherVersion: skips.skippedOtherVersion,
      skippedUnreadable: skips.skippedUnreadable,
      rowsCompared: rows.length,
      computedAt: {
        min: min?.toISOString() ?? null,
        max: max?.toISOString() ?? null,
      },
      v1Consistency: consistency,
      levels,
      histogram: { buckets, new: unscored },
      levelMatrix,
      newToScored,
      scoredToNew,
      changes: {
        bothScored,
        changed,
        meanAbsX100: bothScored === 0 ? 0 : absSum / bothScored,
        maxAbsX100: absMax,
      },
    },
    movers: { up, down },
  };
}

/**
 * The downloadable proposal of a population run: params, filters and
 * aggregates, never a seller identifier. Pure.
 */
export function buildProposal(input: {
  params: SellerTrustFormulaParams;
  filters: SellerTrustLabPopulationFilters;
  summary: SellerTrustLabPopulationSummary;
  environment: SellerTrustLabEnvironment;
  generatedAt: Date;
}): SellerTrustLabProposal {
  return {
    kind: "seller-trust-candidate-proposal",
    baseVersion: F.version,
    generatedAt: input.generatedAt.toISOString(),
    environment: input.environment,
    params: input.params,
    filters: input.filters,
    summary: input.summary,
  };
}
