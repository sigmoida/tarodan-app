import { z } from "zod";
import { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export const manufacturerSchema = (t: T) =>
  z.object({
    name: z
      .string()
      .trim()
      .min(1, t("admin.catalog.manufacturers.nameRequired"))
      .max(120, t("admin.catalog.common.maxChars", { max: 120 })),
    logo: z.string().trim().optional().or(z.literal("")),
    website: z.string().trim().optional().or(z.literal("")),
    country: z.string().trim().max(80).optional().or(z.literal("")),
    foundedYear: z.string().optional().or(z.literal("")),
    description: z.string().trim().max(1000).optional().or(z.literal("")),
    isActive: z.boolean(),
  });

export type ManufacturerFormValues = z.infer<
  ReturnType<typeof manufacturerSchema>
>;
