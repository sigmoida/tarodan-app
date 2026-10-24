import { z } from "zod";
import { useTranslations } from "next-intl";
import { amountField } from "@/lib/schemas/amount";

type T = ReturnType<typeof useTranslations<never>>;

/** Backend sınırı (admin-settings.service: yearly_discount_percentage 0–90). */
export const YEARLY_DISCOUNT_MAX = 90;

/**
 * Yearly discount % — the field text, read by the shared amount parser (a
 * decimal comma, at most two decimals); shaped in the mutationFn.
 */
export const yearlyDiscountSchema = (t: T) =>
  z.object({
    discount: amountField(t, {
      required: t("admin.tiers.validation.required"),
      // A percent, not TL: the range copy, not the kurus format copy.
      refused: t("admin.tiers.validation.discountRange"),
      check: {
        test: (n) => n <= YEARLY_DISCOUNT_MAX,
        message: t("admin.tiers.validation.discountRange"),
      },
    }),
  });

export type YearlyDiscountValues = z.infer<
  ReturnType<typeof yearlyDiscountSchema>
>;
