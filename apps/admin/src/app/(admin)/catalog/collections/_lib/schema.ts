import { z } from "zod";
import { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export const collectionSchema = (t: T) =>
  z.object({
    name: z
      .string()
      .trim()
      .min(1, t("admin.catalog.collections.nameRequired"))
      .max(120, t("admin.catalog.common.maxChars", { max: 120 })),
    description: z.string().trim().max(1000).optional().or(z.literal("")),
    coverImageUrl: z.string().trim().optional().or(z.literal("")),
    isPublic: z.boolean(),
    isFeatured: z.boolean(),
  });

export type CollectionFormValues = z.infer<ReturnType<typeof collectionSchema>>;
