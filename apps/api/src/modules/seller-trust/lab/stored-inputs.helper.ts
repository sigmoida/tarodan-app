import {
  validateSellerTrustInputs,
  type SellerTrustComponentsV1,
  type SellerTrustInputs,
  type SellerTrustLabInputChange,
} from "@tarodan/types";
import { TRUST_FORMULA_V1 as F } from "../helpers/trust-formula.constants";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const numberAt = (
  components: Record<string, unknown>,
  group: string,
  key: string,
): number | undefined => {
  const values = components[group];
  if (!isRecord(values)) return undefined;
  const value = values[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
};

/**
 * Formula inputs rebuilt from a stored v1 breakdown (the lab's population
 * runs on stored rows, decision D2). Every count is stored as is; only the
 * rating sum is not, and is rebuilt from the stored smoothed mean through
 * the v1 prior: `smoothed x (C + raters) - C x m`, kept inside
 * `[raters, 5 x raters]`. The smoothed mean is stored to 4 decimals, so the
 * rebuilt score can miss the stored one by 0.01 at an exact rounding
 * boundary; the population's v1 consistency check reports it.
 *
 * Null for a row that is not a readable v1 breakdown.
 */
export function storedTrustInputs(
  components: unknown,
): SellerTrustInputs | null {
  if (!isRecord(components) || components.version !== F.version) return null;
  const at = (group: string, key: string) => numberAt(components, group, key);
  const raters = at("rating", "raters");
  const smoothed = at("rating", "smoothed");
  if (raters === undefined || smoothed === undefined) return null;

  const { priorMean, priorWeight } = F.rating;
  const rebuilt = smoothed * (priorWeight + raters) - priorWeight * priorMean;
  const inputs = {
    raters,
    sumOfGiverMeans:
      raters === 0 ? 0 : Math.min(5 * raters, Math.max(raters, rebuilt)),
    eligibleOrders: at("reliability", "eligibleOrders"),
    failures: at("reliability", "failures"),
    shipped: at("onTime", "shipped"),
    late: at("onTime", "late"),
    transactions: at("volume", "transactions"),
    counterparties: at("volume", "counterparties"),
    tenureDays: at("tenure", "days"),
  };
  return validateSellerTrustInputs(inputs).length === 0
    ? (inputs as SellerTrustInputs)
    : null;
}

/** Stored breakdown path of each compared input. */
const COMPARED: ReadonlyArray<
  [SellerTrustLabInputChange["field"], keyof SellerTrustComponentsV1, string]
> = [
  ["raters", "rating", "raters"],
  ["smoothed", "rating", "smoothed"],
  ["eligibleOrders", "reliability", "eligibleOrders"],
  ["failures", "reliability", "failures"],
  ["shipped", "onTime", "shipped"],
  ["late", "onTime", "late"],
  ["transactions", "volume", "transactions"],
  ["counterparties", "volume", "counterparties"],
  ["tenureDays", "tenure", "days"],
];

/**
 * The inputs that differ between the stored breakdown and the v1 breakdown
 * of a live read (what the batch would store now). Explains a recompute
 * that differs from the stored score: the data changed after `computedAt`.
 * A value missing from the stored row counts as changed (stored null).
 */
export function changedTrustInputs(
  stored: unknown,
  recomputed: SellerTrustComponentsV1,
): SellerTrustLabInputChange[] {
  const storedRecord = isRecord(stored) ? stored : {};
  const live = recomputed as unknown as Record<string, unknown>;
  const changes: SellerTrustLabInputChange[] = [];
  for (const [field, group, key] of COMPARED) {
    const before = numberAt(storedRecord, group, key) ?? null;
    const after = numberAt(live, group, key) ?? 0;
    if (before !== after) changes.push({ field, stored: before, live: after });
  }
  return changes;
}
