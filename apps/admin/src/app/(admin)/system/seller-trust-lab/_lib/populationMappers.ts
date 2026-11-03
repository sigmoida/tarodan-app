import type {
  SellerTrustLabHistogramBucket,
  SellerTrustLabMover,
  SellerTrustLabPopulationFilters,
  SellerTrustLabPopulationSummary,
  SellerTrustLevel,
} from "@tarodan/types";
import {
  SELLER_TRUST_LEVELS,
  SELLER_TRUST_LEVEL_I18N_KEYS,
} from "@tarodan/types";
import { fmtDecimal } from "@/lib/format";
import type { Translate } from "@/lib/statusLabels";

/** Display order of the levels, best first (the shared order). */
export const LEVEL_ORDER = SELLER_TRUST_LEVELS;

export interface LevelCountRow {
  level: SellerTrustLevel;
  label: string;
  stored: number;
  candidate: number;
}

export function levelCountRows(
  levels: SellerTrustLabPopulationSummary["levels"],
  t: Translate,
): LevelCountRow[] {
  return LEVEL_ORDER.map((level) => ({
    level,
    label: t(SELLER_TRUST_LEVEL_I18N_KEYS[level]),
    stored: levels.stored[level],
    candidate: levels.candidate[level],
  }));
}

export type LevelMatrixRow = {
  level: SellerTrustLevel;
  label: string;
} & Record<SellerTrustLevel, number>;

/** Rows are the stored level, columns the candidate level. */
export function levelMatrixRows(
  matrix: SellerTrustLabPopulationSummary["levelMatrix"],
  t: Translate,
): LevelMatrixRow[] {
  return LEVEL_ORDER.map((level) => ({
    level,
    label: t(SELLER_TRUST_LEVEL_I18N_KEYS[level]),
    ...matrix[level],
  }));
}

/** "3,0 - 3,5" for the half-open bucket; the last one also holds 5,0. */
export function bucketLabel(bucket: SellerTrustLabHistogramBucket): string {
  return `${fmtDecimal(bucket.fromX100 / 100, 1)} - ${fmtDecimal(bucket.toX100 / 100, 1)}`;
}

export interface HistogramBar {
  label: string;
  stored: number;
  candidate: number;
}

/** The score buckets, then the sellers without a score as the last bar. */
export function histogramBars(
  histogram: SellerTrustLabPopulationSummary["histogram"],
  t: Translate,
): HistogramBar[] {
  return [
    ...histogram.buckets.map((bucket) => ({
      label: bucketLabel(bucket),
      stored: bucket.stored,
      candidate: bucket.candidate,
    })),
    {
      label: t(SELLER_TRUST_LEVEL_I18N_KEYS.new),
      stored: histogram.new.stored,
      candidate: histogram.new.candidate,
    },
  ];
}

export interface MoverRow {
  id: string;
  userId: string;
  username: string;
  stored: string;
  candidate: string;
}

const score = (x100: number) => fmtDecimal(x100 / 100) ?? "";

/** "4,10 (rank 12)" for stored and candidate. */
export function moverRows(movers: SellerTrustLabMover[]): MoverRow[] {
  return movers.map((m) => ({
    id: m.userId,
    userId: m.userId,
    username: m.username,
    stored: `${score(m.storedX100)} (#${m.storedRank})`,
    candidate: `${score(m.candidateX100)} (#${m.candidateRank})`,
  }));
}

/**
 * The request filters from the form: levels only when some but not all are
 * ticked (all or none means every level), minimum transactions only when set.
 */
export function buildFilters(
  levels: Record<SellerTrustLevel, boolean>,
  minTransactions: string,
): SellerTrustLabPopulationFilters {
  const picked = LEVEL_ORDER.filter((level) => levels[level]);
  const filters: SellerTrustLabPopulationFilters = {};
  if (picked.length > 0 && picked.length < LEVEL_ORDER.length) {
    filters.levels = [...picked];
  }
  if (minTransactions.trim() !== "") {
    filters.minTransactions = Number(minTransactions.trim());
  }
  return filters;
}

export const hasFilters = (filters: SellerTrustLabPopulationFilters) =>
  filters.levels !== undefined || filters.minTransactions !== undefined;

/** A nightly run was in progress when the compared rows were computed. */
export const isRunInProgress = (summary: SellerTrustLabPopulationSummary) =>
  summary.computedAt.min !== null &&
  summary.computedAt.min !== summary.computedAt.max;
