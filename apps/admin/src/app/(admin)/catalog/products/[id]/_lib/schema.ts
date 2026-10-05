import { z } from "zod";
import { useTranslations } from "next-intl";
import {
  LISTING_REMOVAL_DETAIL_MAX_LENGTH,
  listingRemovalIssue,
  type ListingRemovalAction,
} from "@tarodan/types";
import { removalIssueMessage } from "@/lib/listing-removal";

type T = ReturnType<typeof useTranslations<never>>;

/**
 * Yönetici kaldırmasının (red / kaldırma) PAYLAŞILAN kuralı: neden her zaman
 * `policy_violation`; ihlal kodu zorunlu ve katalogda olmalı, `other` kodu
 * açıklama ister, açıklama sınırı aşamaz (`listingRemovalIssue`, API ile aynı
 * kural). Sorun alanına yazılır: kodla ilgili olan `violationCode`a,
 * açıklamayla ilgili olan formun açıklama alanına.
 */
function refineAdminRemoval(
  t: T,
  action: Extract<ListingRemovalAction, "reject" | "delete">,
  detailField: "reason" | "note",
) {
  return (values: Record<string, string | undefined>, ctx: z.RefinementCtx) => {
    const issue = listingRemovalIssue(
      { actor: "admin", action },
      {
        reason: "policy_violation",
        violationCode: values.violationCode,
        detail: values[detailField],
      },
    );
    if (!issue) return;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [issue.startsWith("detail_") ? detailField : "violationCode"],
      message: removalIssueMessage(issue, t),
    });
  };
}

/** Product approve — optional admin note. */
export const productApproveSchema = (t: T) =>
  z.object({
    note: z
      .string()
      .trim()
      .max(500, t("admin.catalog.common.maxChars", { max: 500 }))
      .optional()
      .or(z.literal("")),
  });
export type ProductApproveValues = z.infer<
  ReturnType<typeof productApproveSchema>
>;

/**
 * Product reject — required reason (shown to the seller) + required violation
 * code (recorded as the removal reason; admin-only).
 */
export const productRejectSchema = (t: T) =>
  z
    .object({
      reason: z
        .string()
        .trim()
        .min(1, t("admin.catalog.products.rejectNoteRequired"))
        .max(500, t("admin.catalog.common.maxChars", { max: 500 })),
      violationCode: z.string(),
    })
    .superRefine(refineAdminRemoval(t, "reject", "reason"));
export type ProductRejectValues = z.infer<
  ReturnType<typeof productRejectSchema>
>;

/**
 * Product remove (admin soft delete) — required violation code, optional note
 * (required when the code is `other`).
 */
export const productRemoveSchema = (t: T) =>
  z
    .object({
      violationCode: z.string(),
      note: z
        .string()
        .trim()
        .max(
          LISTING_REMOVAL_DETAIL_MAX_LENGTH,
          t("admin.catalog.common.maxChars", {
            max: LISTING_REMOVAL_DETAIL_MAX_LENGTH,
          }),
        ),
    })
    .superRefine(refineAdminRemoval(t, "delete", "note"));
export type ProductRemoveValues = z.infer<
  ReturnType<typeof productRemoveSchema>
>;
