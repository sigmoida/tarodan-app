import { extractErrorI18nKey, extractErrorMessage } from "@/lib/error";
import {
  REVIEW_MODERATION_REASON_MAX_LENGTH,
  REVIEW_MODERATION_REASON_MIN_LENGTH,
} from "@tarodan/types";
import type { Translate } from "@/lib/statusLabels";

export const REVIEW_REASON_REQUIRED_KEY = "server.admin.review.reasonRequired";
export const REVIEW_REASON_TOO_LONG_KEY = "server.admin.review.reasonTooLong";
export const REVIEW_STATUS_CHANGED_KEY = "server.admin.review.statusChanged";

/** The review's status changed under the admin (409): the list is stale. */
export const isReviewStatusChanged = (error: unknown): boolean =>
  extractErrorI18nKey(error) === REVIEW_STATUS_CHANGED_KEY;

/**
 * Message for a failed moderation call. The reason rules carry their limits
 * from the shared constants; every other error keeps the server's text, or the
 * generic fallback.
 */
export function reviewModerationError(
  error: unknown,
  t: Translate,
  fallback: string,
): string {
  switch (extractErrorI18nKey(error)) {
    case REVIEW_REASON_REQUIRED_KEY:
      return t(REVIEW_REASON_REQUIRED_KEY, {
        min: REVIEW_MODERATION_REASON_MIN_LENGTH,
      });
    case REVIEW_REASON_TOO_LONG_KEY:
      return t(REVIEW_REASON_TOO_LONG_KEY, {
        max: REVIEW_MODERATION_REASON_MAX_LENGTH,
      });
    default:
      return extractErrorMessage(error, fallback);
  }
}
