/** @format */

import { z } from "zod";
import type { MessageKey } from "@tarodan/i18n";
import {
  LISTING_REMOVAL_DETAIL_MAX_LENGTH,
  listingRemovalIssue,
  listingRemovalIssueI18nKey,
  type ListingRemovalIssue,
} from "@tarodan/types";
import type { ListingRemovalPayload } from "@/lib/api";
import type { Translate } from "@/types/i18n";

/** The seller's two ways of taking a listing off the storefront. */
export type SellerRemovalAction = "delete" | "deactivate";

/** Raw form state — every control is a string (empty = not chosen). */
export interface ListingRemovalValues {
  reason: string;
  platform: string;
  detail: string;
}

export const EMPTY_LISTING_REMOVAL: ListingRemovalValues = {
  reason: "",
  platform: "",
  detail: "",
};

/**
 * Form values → API payload. The platform only belongs to "sold elsewhere": a
 * platform picked before the seller switched reasons is dropped, not sent.
 * Text is trimmed and an empty string becomes `undefined`.
 */
export function toListingRemovalPayload(
  values: ListingRemovalValues,
): ListingRemovalPayload {
  const reason = values.reason.trim();
  const platform = reason === "sold_elsewhere" ? values.platform.trim() : "";
  const detail = values.detail.trim();
  return {
    removalReason: reason || undefined,
    removalPlatform: platform || undefined,
    removalDetail: detail || undefined,
  };
}

/** Which control shows the rule's complaint. */
const ISSUE_FIELD: Record<ListingRemovalIssue, keyof ListingRemovalValues> = {
  reason_required: "reason",
  reason_not_allowed: "reason",
  platform_required: "platform",
  platform_invalid: "platform",
  platform_not_allowed: "platform",
  // Sellers never send a violation code; mapped for completeness.
  violation_required: "reason",
  violation_invalid: "reason",
  violation_not_allowed: "reason",
  detail_required: "detail",
  detail_too_long: "detail",
};

/**
 * The seller's removal form. Validation is the SHARED rule from
 * `@tarodan/types` (`listingRemovalIssue`) applied to exactly what the API will
 * receive — the API runs the same rule, so the form cannot accept something the
 * server rejects (or the other way round).
 */
export const listingRemovalSchema = (
  t: Translate,
  action: SellerRemovalAction,
) =>
  z
    .object({
      reason: z.string(),
      platform: z.string(),
      detail: z.string(),
    })
    .superRefine((values, ctx) => {
      const payload = toListingRemovalPayload(values);
      const issue = listingRemovalIssue(
        { actor: "seller", action },
        {
          reason: payload.removalReason,
          platform: payload.removalPlatform,
          detail: payload.removalDetail,
        },
      );
      if (!issue) return;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [ISSUE_FIELD[issue]],
        message: t(listingRemovalIssueI18nKey(issue) as MessageKey, {
          max: LISTING_REMOVAL_DETAIL_MAX_LENGTH,
        }),
      });
    });
