import { CheckCircleIcon, EyeSlashIcon } from "@heroicons/react/24/outline";
import type { RatingStatusCode, ReviewModerationStatus } from "@tarodan/types";

/**
 * Moderation targets for a review, read by the row menu and the detail drawer.
 * Post-moderation has no pending state, so there is no way back to it: an admin
 * only hides a review or shows it again.
 *  - `approved` (show again): any review that is not public
 *  - `hidden` (hide): any review that is not already hidden
 * A row without a status (old seller rating) counts as approved.
 */
export function reviewTransitions(
  status: RatingStatusCode | undefined,
): ReviewModerationStatus[] {
  const s = status ?? "approved";
  const targets: ReviewModerationStatus[] = [];
  if (s !== "approved") targets.push("approved");
  if (s !== "hidden") targets.push("hidden");
  return targets;
}

/** Target -> button / menu label (i18n key). */
export const REVIEW_TRANSITION_LABEL_KEY = {
  approved: "admin.accounts.reviews.unhide",
  hidden: "admin.accounts.reviews.hide",
} as const satisfies Record<ReviewModerationStatus, string>;

/** Target -> button / menu icon. */
export const REVIEW_TRANSITION_ICON = {
  approved: CheckCircleIcon,
  hidden: EyeSlashIcon,
} as const satisfies Record<ReviewModerationStatus, unknown>;
