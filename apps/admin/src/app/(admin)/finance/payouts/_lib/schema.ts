import { z } from "zod";
import type { useTranslations } from "next-intl";
import { reasonField } from "@/lib/schemas/common";
import { typedAmountMatches } from "./resolution";

type T = ReturnType<typeof useTranslations<never>>;

/** Release a seller payout (standard or early) — reason is required. */
export const releasePayoutSchema = (t: T) =>
  z.object({
    reason: reasonField(t),
  });
export type ReleasePayoutValues = z.infer<
  ReturnType<typeof releasePayoutSchema>
>;

/**
 * Retry of a transfer PayTR may have taken (`resolution.
 * retryRequiresProviderCheck`): the admin confirms the PayTR panel shows no
 * transfer with its transaction ID, and says why.
 */
export const retryTransferSchema = (t: T) =>
  z.object({
    confirmProviderChecked: z.boolean().refine((checked) => checked, {
      message: t(
        "admin.finance.payouts.resolution.confirmProviderCheckedRequired",
      ),
    }),
    reason: reasonField(t),
  });
export type RetryTransferValues = z.infer<
  ReturnType<typeof retryTransferSchema>
>;

/**
 * "Mark as paid": the payment reference, a reason, and the net typed again
 * as the confirmation (it must equal the net the row shows).
 */
export const markPaidSchema = (t: T, netAmount: number) =>
  z.object({
    reference: z
      .string()
      .trim()
      .min(1, t("common.required"))
      .max(120, t("admin.catalog.common.maxChars", { max: 120 })),
    reason: reasonField(t),
    typedAmount: z
      .string()
      .refine((value) => typedAmountMatches(value, netAmount), {
        message: t("admin.finance.payouts.resolution.markPaidTypedMismatch"),
      }),
  });
export type MarkPaidValues = z.infer<ReturnType<typeof markPaidSchema>>;
