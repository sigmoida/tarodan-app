import { z } from "zod";
import type { useTranslations } from "next-intl";
import { fmtTry } from "@/lib/format";

type T = ReturnType<typeof useTranslations<never>>;

/** Force-cancel a stuck/failed payment — reason is required. */
export const forceCancelPaymentSchema = (t: T) =>
  z.object({
    reason: z
      .string()
      .trim()
      .min(1, t("common.required"))
      .max(500, t("admin.catalog.common.maxChars", { max: 500 })),
  });
export type ForceCancelPaymentValues = z.infer<
  ReturnType<typeof forceCancelPaymentSchema>
>;

/**
 * Manual refund — amount is optional (blank = full refund) but must be a
 * positive number within the refundable total when provided.
 */
export const refundPaymentSchema = (t: T, maxAmount: number) =>
  z.object({
    amount: z
      .string()
      .trim()
      .optional()
      .refine(
        (v) => {
          if (!v) return true;
          const n = Number(v);
          return !Number.isNaN(n) && n > 0 && n <= maxAmount;
        },
        t("admin.finance.payments.refundAmountInvalid", {
          max: fmtTry(maxAmount),
        }),
      ),
    reason: z
      .string()
      .trim()
      .max(500, t("admin.catalog.common.maxChars", { max: 500 }))
      .optional(),
  });
export type RefundPaymentValues = z.infer<
  ReturnType<typeof refundPaymentSchema>
>;
