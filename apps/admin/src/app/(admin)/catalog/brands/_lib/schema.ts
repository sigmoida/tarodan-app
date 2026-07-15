import { z } from "zod";
import { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

/** Brand create/edit. Numeric/url fields kept as strings; shaped in the mutationFn. */
export const brandSchema = (t: T) =>
  z.object({
    name: z
      .string()
      .trim()
      .min(1, t("admin.catalog.brands.nameRequired"))
      .max(120, t("admin.catalog.common.maxChars", { max: 120 })),
    logo: z.string().trim().optional().or(z.literal("")),
    website: z.string().trim().optional().or(z.literal("")),
    description: z
      .string()
      .trim()
      .max(1000, t("admin.catalog.common.maxChars", { max: 1000 }))
      .optional()
      .or(z.literal("")),
    country: z.string().trim().max(80).optional().or(z.literal("")),
    foundedYear: z.string().optional().or(z.literal("")),
    sortOrder: z.string().optional().or(z.literal("")),
    isActive: z.boolean(),
  });

export type BrandFormValues = z.infer<ReturnType<typeof brandSchema>>;
