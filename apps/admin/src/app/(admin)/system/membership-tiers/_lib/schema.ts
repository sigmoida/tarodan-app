import { z } from "zod";
import { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

/** Backend sınırı (admin-settings.service: yearly_discount_percentage 0–90). */
export const YEARLY_DISCOUNT_MAX = 90;

/** Yearly discount % — kept as a string (native number input); shaped in the mutationFn. */
export const yearlyDiscountSchema = (t: T) =>
  z.object({
    discount: z
      .string()
      .trim()
      .min(1, t("admin.tiers.validation.required"))
      .refine((v) => {
        const n = Number(v);
        return !Number.isNaN(n) && n >= 0 && n <= YEARLY_DISCOUNT_MAX;
      }, t("admin.tiers.validation.discountRange")),
  });

export type YearlyDiscountValues = z.infer<
  ReturnType<typeof yearlyDiscountSchema>
>;
