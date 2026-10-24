import { isPayoutFailureReason } from "@tarodan/types";
import { payoutFailureReasonConfig } from "@tarodan/ui";
import type { Translate } from "@/lib/statusLabels";

/**
 * The text for a payout transfer's `failureReason`: the label of a
 * `PAYOUT_FAILURE_REASONS` code (shared `payoutFailureReasonConfig`), or the
 * stored text as is for rows that carry free text (written before the codes,
 * or `returned` rows with PayTR's return reference). Null when there is no
 * reason.
 */
export function failureReasonText(
  reason: string | null | undefined,
  t: Translate,
): string | null {
  const value = reason?.trim();
  if (!value) return null;
  // The same guard as the API export: only a shared code is a label.
  return isPayoutFailureReason(value)
    ? t(payoutFailureReasonConfig[value].labelKey)
    : value;
}
