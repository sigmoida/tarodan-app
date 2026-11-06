import { ZERO_TL_AMOUNT, parseTlAmount } from "@tarodan/shared";
import type { InstallmentBuyerSegment } from "@tarodan/types";
import type { AdminInstallmentPreviewParams } from "@/lib/api/installments";
import type { InstallmentRuleDraft } from "./rule-form";

/** The highest goods total the preview prices (the API's `@Max` on `amount`). */
export const PREVIEW_AMOUNT_MAX = 1_000_000;

/** The default goods total of the preview, TL. */
export const PREVIEW_DEFAULT_AMOUNT = "1000";

export type PreviewAmount =
  | { status: "ok"; amount: number }
  | { status: "refused" | "empty" | "aboveMax" };

/**
 * The typed goods total: a TL amount above 0 and at most the maximum. A
 * well-formed 0 reads as no amount ("enter an amount"), not as a refused
 * format.
 */
export function previewAmountOf(text: string): PreviewAmount {
  const parsed = parseTlAmount(text, ZERO_TL_AMOUNT);
  if (parsed.status !== "ok") return { status: parsed.status };
  if (parsed.amount === 0) return { status: "empty" };
  if (parsed.amount > PREVIEW_AMOUNT_MAX) return { status: "aboveMax" };
  return parsed;
}

/**
 * The preview query, or null while it cannot be asked (no amount, no
 * family). With a draft, the draft rule is priced as if it were live now;
 * `replacesRuleId` leaves the version being replaced out.
 */
export function previewParamsOf(input: {
  segment: InstallmentBuyerSegment;
  amountText: string;
  family: string;
  draft?: InstallmentRuleDraft;
  replacesRuleId?: string;
}): AdminInstallmentPreviewParams | null {
  const amount = previewAmountOf(input.amountText);
  if (amount.status !== "ok" || !input.family) return null;
  const params: AdminInstallmentPreviewParams = {
    segment: input.segment,
    amount: amount.amount,
    family: input.family,
  };
  if (input.draft) {
    params.draftSegment = input.draft.segment;
    params.draftMinCount = input.draft.minCount;
    params.draftMaxCount = input.draft.maxCount;
    params.draftAllowed = input.draft.allowed;
    params.draftPlatformSharePct = input.draft.platformSharePct;
    params.draftPriority = input.draft.priority;
    if (input.replacesRuleId) params.replacesRuleId = input.replacesRuleId;
  }
  return params;
}
