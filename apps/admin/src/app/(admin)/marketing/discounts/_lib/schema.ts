import { z } from "zod";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

/**
 * Discount form — validation-only. Numeric fields are kept as strings (native
 * number/date inputs return strings); the string→number/ISO conversion happens
 * in the modal's mutationFn, so the z.infer types stay honest.
 */
export const discountSchema = (t: T) =>
  z
    .object({
      code: z.string(),
      name: z
        .string()
        .min(1, t("admin.marketing.discounts.validation.nameRequired")),
      description: z.string(),
      type: z.enum(["percentage", "fixed_amount", "bogo", "bulk_quantity"]),
      value: z
        .string()
        .min(1, t("admin.marketing.discounts.validation.valueRequired")),
      scope: z.enum(["global", "category"]),
      categoryId: z.string(),
      minCartValue: z.string(),
      minQuantity: z.string(),
      buyQuantity: z.string(),
      getQuantity: z.string(),
      maxDiscountAmount: z.string(),
      usageLimitTotal: z.string(),
      usageLimitPerUser: z.string(),
      isStackable: z.boolean(),
      isActive: z.boolean(),
      isFlashSale: z.boolean(),
      startDate: z
        .string()
        .min(1, t("admin.marketing.discounts.validation.startDateRequired")),
      endDate: z
        .string()
        .min(1, t("admin.marketing.discounts.validation.endDateRequired")),
    })
    .refine((d) => d.scope !== "category" || d.categoryId.length > 0, {
      message: t("admin.marketing.discounts.selectCategory"),
      path: ["categoryId"],
    });

export type DiscountFormValues = z.infer<ReturnType<typeof discountSchema>>;
