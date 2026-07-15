import { z } from "zod";
import { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

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

/** Product reject — required reason. */
export const productRejectSchema = (t: T) =>
  z.object({
    reason: z
      .string()
      .trim()
      .min(1, t("admin.catalog.products.rejectNoteRequired"))
      .max(500, t("admin.catalog.common.maxChars", { max: 500 })),
  });
export type ProductRejectValues = z.infer<
  ReturnType<typeof productRejectSchema>
>;
