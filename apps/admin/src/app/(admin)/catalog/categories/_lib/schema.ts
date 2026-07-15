import { z } from "zod";
import { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

/** Category create/edit form — validation only; payload shaping stays in the mutationFn. */
export const categorySchema = (t: T) =>
  z.object({
    name: z
      .string()
      .trim()
      .min(1, t("admin.catalog.categories.nameRequired"))
      .max(120, t("admin.catalog.common.maxChars", { max: 120 })),
    description: z
      .string()
      .trim()
      .max(500, t("admin.catalog.common.maxChars", { max: 500 }))
      .optional()
      .or(z.literal("")),
    isActive: z.boolean(),
  });

export type CategoryFormValues = z.infer<ReturnType<typeof categorySchema>>;
