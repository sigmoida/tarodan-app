import { z } from "zod";
import {
  ZERO_TL_AMOUNT,
  parseTlAmount,
  tlAmountInputValue,
} from "@tarodan/shared";
import { validateInstallmentMinAmount } from "@tarodan/types";
import { fmtNumber } from "@/lib/format";
import type { Translate } from "@/lib/statusLabels";

/**
 * The minimum amount form. The field is TL text read by the shared TL
 * parser (0 is a real minimum); the bounds come from
 * `validateInstallmentMinAmount` in `@tarodan/types`, the check the API runs.
 */
export interface MinAmountFormValues {
  minAmount: string;
}

export const minAmountFormValues = (
  minAmount: number,
): MinAmountFormValues => ({
  minAmount: tlAmountInputValue(minAmount, ZERO_TL_AMOUNT),
});

/** The amount to send; the schema has refused anything else before this runs. */
export function minAmountOf(values: MinAmountFormValues): number {
  const parsed = parseTlAmount(values.minAmount, ZERO_TL_AMOUNT);
  if (parsed.status !== "ok") throw new Error("minAmount is not a TL amount");
  return parsed.amount;
}

export const minAmountSchema = (t: Translate) =>
  z.object({ minAmount: z.string() }).superRefine(({ minAmount }, ctx) => {
    const fail = (message: string) =>
      ctx.addIssue({ code: "custom", path: ["minAmount"], message });
    const parsed = parseTlAmount(minAmount, ZERO_TL_AMOUNT);
    if (parsed.status === "empty") return fail(t("validation.required"));
    if (parsed.status === "refused") {
      return fail(t("validation.amountFormatRefused"));
    }
    const violation = validateInstallmentMinAmount(parsed.amount);
    if (!violation) return;
    if (violation.code === "outOfRange") {
      return fail(
        t("server.admin.installments.minAmount.outOfRange", {
          min: fmtNumber(violation.min) ?? String(violation.min),
          max: fmtNumber(violation.max) ?? String(violation.max),
        }),
      );
    }
    if (violation.code === "tooManyDecimals") {
      return fail(
        t("server.admin.installments.minAmount.tooManyDecimals", {
          decimals: violation.decimals,
        }),
      );
    }
    fail(t("server.admin.installments.minAmount.notANumber"));
  });

/** An API 400 on the minimum amount (`server.admin.installments.minAmount.*`). */
export const isMinAmountErrorKey = (key: string | null) =>
  !!key?.startsWith("server.admin.installments.minAmount.");
