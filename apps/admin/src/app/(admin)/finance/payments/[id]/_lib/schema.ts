import { z } from "zod";
import type { useTranslations } from "next-intl";
import { fmtTry } from "@/lib/format";
import { optionalReasonField, reasonField } from "@/lib/schemas/common";

type T = ReturnType<typeof useTranslations<never>>;

/** Force-cancel a stuck/failed payment — reason is required. */
export const forceCancelPaymentSchema = (t: T) =>
  z.object({
    reason: reasonField(t),
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
    reason: optionalReasonField(t),
  });
export type RefundPaymentValues = z.infer<
  ReturnType<typeof refundPaymentSchema>
>;
