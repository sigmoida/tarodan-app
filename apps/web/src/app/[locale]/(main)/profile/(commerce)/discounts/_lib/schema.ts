import { z } from "zod";
import type { Translate } from "@/types/i18n";
import { parseTlAmount } from "@/lib/tlAmount";

/**
 * Validation for the discount create/edit form. `z.infer` is structurally the
 * same shape as `DiscountFormData` (value and the money/limit fields stay the
 * raw field text, read at the mutation boundary). The value and the TL amounts
 * are read by the shared TL amount parser: "1.000" is refused, never 1 TL. The
 * refines enforce the cross-field rules (a product-scoped discount needs at
 * least one product, quantity campaigns need their quantities).
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
      value: z.string(),
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
    .superRefine((d, ctx) => {
      const refuse = (
        path: "value" | "minCartValue" | "maxDiscountAmount",
        message: string,
      ) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
      // bogo has no value. The value is TL only for a fixed amount; a
      // percentage gets the generic copy (the format copy speaks of kurus).
      // The API checks the percent range only for bulk campaigns, so the form
      // keeps every percentage within 0-100 and every value above zero.
      if (d.type !== "bogo") {
        const parsed = parseTlAmount(d.value);
        const isPercent = d.type !== "fixed_amount";
        if (parsed.status === "refused") {
          refuse(
            "value",
            isPercent
              ? t("validation.enterValidValue")
              : t("trade.cashFormatRefused"),
          );
        } else if (isPercent) {
          const percent = parsed.status === "ok" ? parsed.amount : 0;
          if (percent <= 0 || percent > 100) {
            refuse("value", t("validation.discountPercentRange"));
          }
        } else if (parsed.status === "empty") {
          refuse("value", t("validation.enterValidValue"));
        }
      }
      for (const path of ["minCartValue", "maxDiscountAmount"] as const) {
        if (parseTlAmount(d[path]).status === "refused") {
          refuse(path, t("trade.cashFormatRefused"));
        }
      }
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
    });

export type DiscountFormValues = z.infer<ReturnType<typeof discountSchema>>;
