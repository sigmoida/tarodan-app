"use client";

import { useTranslations } from "next-intl";
import {
  REVIEW_MODERATION_REASON_MAX_LENGTH,
  REVIEW_MODERATION_REASON_MIN_LENGTH,
} from "@tarodan/types";
import { FormModal, FormTextarea, useZodForm } from "@tarodan/ui/form";
import { reviewModerationSchema, type ReviewModerationValues } from "./schema";
import type { ModerationTarget } from "./useReviewModeration";

interface Props {
  target: ModerationTarget | null;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (values: ReviewModerationValues) => void;
}

/** Mounts the form per target so the reason field starts empty on each open. */
export function ReviewModerationModal({ target, ...rest }: Props) {
  return (
    <ReviewModerationForm
      key={target ? `${target.id}:${target.status}` : "closed"}
      target={target}
      {...rest}
    />
  );
}

/**
 * Hide: reason required (5-500). Show again: optional note. Both go to the
 * audit log; the schema and the request come from the shared constants.
 */
function ReviewModerationForm({ target, isPending, onClose, onSubmit }: Props) {
  const t = useTranslations();
  const status = target?.status ?? "hidden";
  const hiding = status === "hidden";
  const form = useZodForm(reviewModerationSchema(t, status), {
    defaultValues: { reason: "" },
  });
  const count = form.watch("reason").length;

  return (
    <FormModal
      open={!!target}
      onClose={onClose}
      title={t(
        hiding
          ? "admin.accounts.reviews.moderation.hideTitle"
          : "admin.accounts.reviews.moderation.unhideTitle",
      )}
      form={form}
      onSubmit={onSubmit}
      isSubmitting={isPending}
      submitLabel={t(
        hiding
          ? "admin.accounts.reviews.moderation.hideSubmit"
          : "admin.accounts.reviews.moderation.unhideSubmit",
      )}
      destructive={hiding}
    >
      <p className="text-sm text-muted">
        {t(
          hiding
            ? "admin.accounts.reviews.moderation.hideDescription"
            : "admin.accounts.reviews.moderation.unhideDescription",
        )}
      </p>
      <FormTextarea
        name="reason"
        rows={4}
        label={t(
          hiding
            ? "admin.accounts.reviews.moderation.hideReason"
            : "admin.accounts.reviews.moderation.unhideNote",
        )}
        placeholder={t(
          hiding
            ? "admin.accounts.reviews.moderation.hideReasonPlaceholder"
            : "admin.accounts.reviews.moderation.unhideNotePlaceholder",
          { min: REVIEW_MODERATION_REASON_MIN_LENGTH },
        )}
        helperText={t("admin.accounts.reviews.moderation.counter", {
          count,
          max: REVIEW_MODERATION_REASON_MAX_LENGTH,
        })}
      />
    </FormModal>
  );
}
