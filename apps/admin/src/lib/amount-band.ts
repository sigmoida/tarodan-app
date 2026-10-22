import { fmtTry } from "./format";

/**
 * Amount bands (commission rules, ad package tiers) are half-open on the API:
 * `minAmount <= amount < maxAmount`, and a null `maxAmount` has no upper bound.
 * Forms take the upper bound as it is stored (exclusive, so the next band
 * starts at the same value and the bands touch without a gap). Read-only UI
 * shows the last cent inside the band, so 1000-5000 reads 1.000,00-4.999,99.
 */
export function inclusiveBandMaximum(maxAmount: number | null): number | null {
  if (maxAmount == null) return null;
  return Math.max(0, Math.round(maxAmount * 100 - 1) / 100);
}

/** A band for a table cell: "₺1.000,00 – ₺4.999,99", or "₺5.000,00 – ∞". */
export function amountBandLabel(
  minAmount: number,
  maxAmount: number | null,
): string {
  const inclusiveMax = inclusiveBandMaximum(maxAmount);
  return `${fmtTry(minAmount)} – ${inclusiveMax == null ? "∞" : fmtTry(inclusiveMax)}`;
}
