import { z } from "zod";
import type { useTranslations } from "next-intl";
import {
  ZERO_TL_AMOUNT,
  parseTlAmount,
  tlAmountInputValue,
  type TlAmountRules,
} from "@tarodan/shared";

type T = ReturnType<typeof useTranslations<never>>;

/**
 * Admin money and percent fields: a `type="text" inputMode="decimal"` input
 * whose text is read by the shared `parseTlAmount` ("1.000" is refused, never
 * read as 1). A `type="number"` input hands "1.000" over as 1 before any
 * parser sees it. Unless a field says otherwise, 0 is a real value here
 * (`ZERO_TL_AMOUNT`): settings and lower bounds, where admins type 0 on
 * purpose; a bare separator (",", "50,") is refused. Refunds use
 * `isOptionalTlAmountWithin` instead.
 */
export interface AmountFieldOptions {
  /** Parser rules; default `ZERO_TL_AMOUNT`. */
  rules?: TlAmountRules;
  /** Blank text is an error with this copy; leave out for an optional field. */
  required?: string;
  /** A bound on the amount (a percent's 0..100, a price above 0) and its copy. */
  check?: { test: (amount: number) => boolean; message: string };
  /** Copy for text that is not an amount; default `validation.amountFormatRefused`. */
  refused?: string;
}

/** The text field schema for one amount (see {@link AmountFieldOptions}). */
export function amountField(t: T, options: AmountFieldOptions = {}) {
  return z.string().superRefine((text, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    const parsed = parseTlAmount(text, options.rules ?? ZERO_TL_AMOUNT);
    if (parsed.status === "refused") {
      issue(options.refused ?? t("validation.amountFormatRefused"));
    } else if (parsed.status === "empty") {
      if (options.required) issue(options.required);
    } else if (options.check && !options.check.test(parsed.amount)) {
      issue(options.check.message);
    }
  });
}

/**
 * The amount to send; null for blank text. The schema has already refused
 * text that is not an amount.
 */
export function amountOrNull(
  text: string,
  rules: TlAmountRules = ZERO_TL_AMOUNT,
): number | null {
  const parsed = parseTlAmount(text, rules);
  return parsed.status === "ok" ? parsed.amount : null;
}

/** The amount to send where a blank field means 0. */
export function amountOrZero(
  text: string,
  rules: TlAmountRules = ZERO_TL_AMOUNT,
): number {
  return amountOrNull(text, rules) ?? 0;
}

/** The field text for an amount on record: a decimal comma, "" for none. */
export function amountInputValue(amount: number | string | null | undefined) {
  if (amount == null || amount === "") return "";
  return tlAmountInputValue(Number(amount), ZERO_TL_AMOUNT);
}
