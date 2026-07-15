import { z } from "zod";
import { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

/** Car model create/edit. Years kept as strings (native number input); shaped in mutationFn. */
export const carModelSchema = (t: T) =>
  z.object({
    brandId: z.string().min(1, t("admin.catalog.carModels.selectBrand")),
    name: z
      .string()
      .trim()
      .min(1, t("admin.catalog.carModels.nameRequired"))
      .max(120, t("admin.catalog.common.maxChars", { max: 120 })),
    yearStart: z.string().optional().or(z.literal("")),
    yearEnd: z.string().optional().or(z.literal("")),
    isActive: z.boolean(),
  });

export type CarModelFormValues = z.infer<ReturnType<typeof carModelSchema>>;
