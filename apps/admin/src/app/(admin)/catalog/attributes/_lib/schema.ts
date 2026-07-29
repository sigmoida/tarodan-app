import { z } from "zod";
import { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export const attributeGroupSchema = (t: T) =>
  z.object({
    name: z
      .string()
      .trim()
      .min(1, t("admin.catalog.attributes.groupNameRequired"))
      .max(120, t("admin.catalog.common.maxChars", { max: 120 })),
    description: z.string().trim().max(500).optional().or(z.literal("")),
    sortOrder: z.string().optional().or(z.literal("")),
    isRequired: z.boolean(),
    isActive: z.boolean(),
  });
export type AttributeGroupFormValues = z.infer<
  ReturnType<typeof attributeGroupSchema>
>;

export const attributeSchema = (t: T) =>
  z.object({
    value: z
      .string()
      .trim()
      .min(1, t("admin.catalog.attributes.valueRequired"))
      .max(120, t("admin.catalog.common.maxChars", { max: 120 })),
    displayValue: z.string().trim().max(120).optional().or(z.literal("")),
    color: z.string().optional().or(z.literal("")),
    sortOrder: z.string().optional().or(z.literal("")),
    isActive: z.boolean(),
  });
export type AttributeFormValues = z.infer<ReturnType<typeof attributeSchema>>;
