import type { RatingStatusCode } from "@tarodan/types";
import type { StatusConfig } from "@tarodan/ui";
import { STATUS_TONE, type TableBadgeVariant } from "@/lib/status-tone";
import type { Translate as T } from "@/lib/statusLabels";

/** One tone per status, from the shared admin rule (`STATUS_TONE`). */
export const REVIEW_STATUS_TONE = {
  approved: STATUS_TONE.live,
  hidden: STATUS_TONE.failed,
  pending: STATUS_TONE.pending,
  rejected: STATUS_TONE.failed,
  spam: STATUS_TONE.failed,
  deleted: STATUS_TONE.inactive,
} as const satisfies Record<RatingStatusCode, TableBadgeVariant>;

/** approved reads as "Visible": the status the public sees. */
export const reviewStatusLabel = (t: T, status: RatingStatusCode): string =>
  t(
    `admin.accounts.reviews.status.${status === "approved" ? "visible" : status}`,
  );

export const reviewStatusConfig = (t: T): Record<string, StatusConfig> =>
  Object.fromEntries(
    (Object.keys(REVIEW_STATUS_TONE) as RatingStatusCode[]).map((status) => [
      status,
      {
        label: reviewStatusLabel(t, status),
        variant: REVIEW_STATUS_TONE[status],
      },
    ]),
  );
