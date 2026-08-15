import { z } from "zod";
import type { Translate } from "@/types/i18n";

/**
 * Validation for the discount create/edit form. `z.infer` is structurally the
 * same shape as `DiscountFormData` (value is a number; the money/limit fields
 * stay strings, coerced at the mutation boundary). The refine enforces the one
 * cross-field rule — a product-scoped discount needs at least one product.
 *
 * A `t`-taking factory: the messages come from the shared catalog, so the schema
 * cannot be a module-level constant.
 */
export const discountSchema = (t: Translate) =>
  z
    .object({
      code: z.string(),
      name: z.string().min(1, t("validation.discountNameRequired")),
      description: z.string(),
      type: z.enum(["percentage", "fixed_amount", "bogo", "bulk_quantity"]),
      value: z.number().min(0, t("validation.enterValidValue")),
      buyQuantity: z.string(),
      getQuantity: z.string(),
      minQuantity: z.string(),
      scope: z.enum(["product", "seller"]),
      targetProductIds: z.array(z.string()),
      minCartValue: z.string(),
      maxDiscountAmount: z.string(),
      usageLimitTotal: z.string(),
      usageLimitPerUser: z.string(),
      isStackable: z.boolean(),
      isActive: z.boolean(),
      startDate: z.string().min(1, t("validation.startDateRequired")),
      endDate: z.string().min(1, t("validation.endDateRequired")),
    })
    .refine((d) => d.scope !== "product" || d.targetProductIds.length > 0, {
      message: t("validation.selectAtLeastOneProduct"),
      path: ["targetProductIds"],
    })
    .refine((d) => d.type !== "bogo" || parseInt(d.buyQuantity) >= 1, {
      message: t("validation.buyQuantityMin1"),
      path: ["buyQuantity"],
    })
    .refine((d) => d.type !== "bogo" || parseInt(d.getQuantity) >= 1, {
      message: t("validation.getQuantityMin1"),
      path: ["getQuantity"],
    })
    .refine((d) => d.type !== "bulk_quantity" || parseInt(d.minQuantity) >= 2, {
      message: t("validation.minQuantityMin2"),
      path: ["minQuantity"],
    })
    .refine(
      (d) => d.type !== "bulk_quantity" || (d.value > 0 && d.value <= 100),
      {
        message: t("validation.discountPercentRange"),
        path: ["value"],
      },
    );

export type DiscountFormValues = z.infer<ReturnType<typeof discountSchema>>;
