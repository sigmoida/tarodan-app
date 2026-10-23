import { z } from "zod";
import {
  REVIEW_MODERATION_REASON_MAX_LENGTH,
  REVIEW_MODERATION_REASON_MIN_LENGTH,
  type ReviewModerationRequest,
  type ReviewModerationStatus,
} from "@tarodan/types";
import type { Translate } from "@/lib/statusLabels";

export interface ReviewModerationValues {
  reason: string;
}

/**
 * Hide needs a reason of 5 to 500 characters after trimming (the API's rule,
 * same constants); showing again takes an optional note up to the same
 * maximum. The messages are the server's own catalog entries, so the modal and
 * a rejected request say the same thing.
 */
export function reviewModerationSchema(
  t: Translate,
  status: ReviewModerationStatus,
) {
  const reason = z
    .string()
    .trim()
    .max(
      REVIEW_MODERATION_REASON_MAX_LENGTH,
      t("server.admin.review.reasonTooLong", {
        max: REVIEW_MODERATION_REASON_MAX_LENGTH,
      }),
    );
  return z.object({
    reason:
      status === "hidden"
        ? reason.min(
            REVIEW_MODERATION_REASON_MIN_LENGTH,
            t("server.admin.review.reasonRequired", {
              min: REVIEW_MODERATION_REASON_MIN_LENGTH,
            }),
          )
        : reason,
  });
}

/** Request body: a blank optional note is left out. */
export function toModerationRequest(
  status: ReviewModerationStatus,
  values: ReviewModerationValues,
): ReviewModerationRequest {
  const reason = values.reason.trim();
  return reason ? { status, reason } : { status };
}
