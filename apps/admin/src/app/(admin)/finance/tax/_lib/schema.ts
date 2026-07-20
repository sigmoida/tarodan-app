import { z } from "zod";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

/** A VAT rate 0..100, kept as a string (native number input); shaped in the mutationFn. */
const rateField = (t: T) =>
  z
    .string()
    .trim()
    .min(1, t("common.required"))
    .refine((v) => {
      const n = Number(v);
      return !Number.isNaN(n) && n >= 0 && n <= 100;
    }, t("admin.finance.tax.validation.rateRange"));

/** Default VAT rate form. */
export const vatDefaultSchema = (t: T) => z.object({ rate: rateField(t) });
export type VatDefaultValues = z.infer<ReturnType<typeof vatDefaultSchema>>;

/** Per-category VAT override form. */
export const vatOverrideSchema = (t: T) =>
  z.object({
    categoryId: z
      .string()
      .min(1, t("admin.finance.tax.validation.selectCategory")),
    rate: rateField(t),
  });
export type VatOverrideValues = z.infer<ReturnType<typeof vatOverrideSchema>>;
