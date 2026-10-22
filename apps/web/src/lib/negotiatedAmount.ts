/** @format */

import { parseTlAmount } from "@tarodan/shared";
import {
  exceedsTlNegotiatedAmountMax,
  TL_NEGOTIATED_AMOUNT_MAX,
} from "@tarodan/types";
import type { Translate } from "@/types/i18n";

/**
 * An amount two users agree on, typed into a text field: an offer, a
 * counter-offer, the cash part of a trade. The text is read by the shared TL
 * amount parser, and the amount has the API's ceiling
 * (`TL_NEGOTIATED_AMOUNT_MAX` in `@tarodan/types`): the field refuses a larger
 * amount and blocks sending, as it does for text that is not an amount, so
 * the API's 400 is never the first the user hears of it.
 */

/** The field error for an amount above the ceiling. */
export function amountAboveMaxMessage(t: Translate): string {
  return t("validation.amountAboveMax", { max: TL_NEGOTIATED_AMOUNT_MAX });
}

/**
 * The field error that blocks sending, or undefined: text that is not an
 * amount (`validation.amountFormatRefused`) or an amount above the ceiling.
 * Blank text is no error here; a required field says so itself.
 */
export function negotiatedAmountError(
  raw: string,
  t: Translate,
): string | undefined {
  const parsed = parseTlAmount(raw);
  if (parsed.status === "refused") return t("validation.amountFormatRefused");
  if (parsed.status === "ok" && exceedsTlNegotiatedAmountMax(parsed.amount)) {
    return amountAboveMaxMessage(t);
  }
  return undefined;
}
