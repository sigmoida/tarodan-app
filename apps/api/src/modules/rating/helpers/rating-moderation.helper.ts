import { BadRequestException } from "@nestjs/common";
import { RatingStatus } from "@prisma/client";
import {
  REVIEW_MODERATION_REASON_MAX_LENGTH,
  REVIEW_MODERATION_REASON_MIN_LENGTH,
  type ReviewModerationStatus,
} from "@tarodan/types";
import { i18nMessage } from "../../i18n";

/**
 * The reason text an admin moderation stores, trimmed. Hiding requires
 * 5-500 characters; showing again takes an optional note (audit only) of at
 * most 500. An empty note is `null`. The bounds come from `@tarodan/types` so
 * the admin form validates the same way.
 */
export function normalizeModerationReason(
  status: ReviewModerationStatus,
  reason: string | null | undefined,
): string | null {
  const text = reason?.trim() ?? "";
  if (text.length > REVIEW_MODERATION_REASON_MAX_LENGTH) {
    throw new BadRequestException(
      i18nMessage("server.admin.review.reasonTooLong", {
        max: REVIEW_MODERATION_REASON_MAX_LENGTH,
      }),
    );
  }
  if (
    status === RatingStatus.hidden &&
    text.length < REVIEW_MODERATION_REASON_MIN_LENGTH
  ) {
    throw new BadRequestException(
      i18nMessage("server.admin.review.reasonRequired", {
        min: REVIEW_MODERATION_REASON_MIN_LENGTH,
      }),
    );
  }
  return text.length > 0 ? text : null;
}

/** The moderation columns a status change writes. */
export interface RatingModerationData {
  status: ReviewModerationStatus;
  moderatedAt: Date;
  moderatedByAdminId: string;
  /** Set only when hiding; showing again keeps the last hide reason. */
  moderationReason?: string;
}

export function ratingModerationData(
  status: ReviewModerationStatus,
  reason: string | null,
  moderatorAdminId: string,
  now: Date,
): RatingModerationData {
  return {
    status,
    moderatedAt: now,
    moderatedByAdminId: moderatorAdminId,
    ...(status === RatingStatus.hidden && reason !== null
      ? { moderationReason: reason }
      : {}),
  };
}
