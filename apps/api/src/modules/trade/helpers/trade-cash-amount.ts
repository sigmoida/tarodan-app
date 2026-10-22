import { BadRequestException } from "@nestjs/common";
import {
  exceedsTlNegotiatedAmountMax,
  TL_NEGOTIATED_AMOUNT_MAX,
} from "@tarodan/types";
import { isSignedTlAmount } from "../../../common/validators/tl-amount";
import { i18nMessage } from "../../i18n";

/**
 * The cash part of a trade proposal (create, counter and the unsaved preview)
 * as the client sends it: a signed TL amount, positive when the proposer pays
 * and negative when the other side pays. Its magnitude is stored in
 * `Trade.cashAmount` and charged in `TradeCashPayment.totalAmount` with fees
 * and shipping on top (both `Decimal(10, 2)`), so it has at most two decimals
 * and at most `TL_NEGOTIATED_AMOUNT_MAX`, the ceiling an offer has too.
 * Without this check a third decimal was rounded silently and an overflow
 * failed in the database as a generic 500.
 *
 * Checked in the service, not the DTO, so the 400 carries a catalog key in the
 * request locale; the DTO's `@IsNumber()` keeps text, NaN and Infinity out.
 * A missing amount is no cash part.
 */
export function assertTradeCashAmount(cashAmount: number | null | undefined) {
  if (cashAmount == null) return;
  if (
    !isSignedTlAmount(cashAmount) ||
    exceedsTlNegotiatedAmountMax(cashAmount)
  ) {
    throw new BadRequestException(
      i18nMessage("server.trade.invalidCashAmount", {
        max: TL_NEGOTIATED_AMOUNT_MAX,
      }),
    );
  }
}

/** What a trade row stores for the cash part: the magnitude and who pays it. */
export interface TradeCashTerms {
  cashAmount: number | null;
  cashPayerId: string | null;
}

/**
 * The stored cash terms of a proposal: no cash part (missing or 0) is null on
 * both columns; otherwise the magnitude, paid by `positivePayerId` for a
 * positive amount and by `negativePayerId` for a negative one. On create the
 * positive payer is the initiator; on a counter it is the counter-offerer,
 * who becomes the initiator.
 */
export function tradeCashTerms(
  cashAmount: number | null | undefined,
  payers: { positivePayerId: string; negativePayerId: string },
): TradeCashTerms {
  if (!cashAmount) return { cashAmount: null, cashPayerId: null };
  return {
    cashAmount: Math.abs(cashAmount),
    cashPayerId:
      cashAmount > 0 ? payers.positivePayerId : payers.negativePayerId,
  };
}
