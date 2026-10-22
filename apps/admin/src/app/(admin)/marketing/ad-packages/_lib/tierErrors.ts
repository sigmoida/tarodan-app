import { extractErrorI18nKey } from "@/lib/error";

/** The tier field a refused save is about. */
export type RefusedTierField = "minAmount" | "maxAmount";

/**
 * The tier rows a refused package save names, or null for any other error.
 * The API's 400 for a band whose upper bound is not above its lower bound
 * (`server.admin.commission.maxAboveMin`) and for overlapping bands of one
 * duration (`server.admin.adPackage.tierOverlap`) carries `tierIndexes`: the
 * rows' positions in the sent `tiers`, which are the form's rows in order
 * (`packageFormToPayload`). Indexes outside the form are dropped.
 */
export function refusedTierRows(
  error: unknown,
  rowCount: number,
): { indexes: number[]; field: RefusedTierField } | null {
  const raw = (error as { response?: { data?: { tierIndexes?: unknown } } })
    ?.response?.data?.tierIndexes;
  if (!Array.isArray(raw)) return null;
  const indexes = raw.filter(
    (index): index is number =>
      Number.isInteger(index) && index >= 0 && index < rowCount,
  );
  if (indexes.length === 0) return null;
  const field: RefusedTierField =
    extractErrorI18nKey(error) === "server.admin.commission.maxAboveMin"
      ? "maxAmount"
      : "minAmount";
  return { indexes, field };
}
