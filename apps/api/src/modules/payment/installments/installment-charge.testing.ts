import type { InstallmentBuyerSegment } from "@tarodan/types";
import {
  singleChargeQuote,
  type ChargeQuoteInput,
} from "./installment-charge.service";

/**
 * A stand-in `InstallmentChargeService` for specs of the card form that are
 * not about installments: every form is quoted as a single payment of the
 * target total (what an old client without `installment` gets). Specs of the
 * pricing itself use the real service (`installment-charge.service.spec.ts`).
 */
export function singlePaymentChargeStub(
  segment: InstallmentBuyerSegment = "free",
) {
  return {
    quoteCharge: jest.fn(async (input: ChargeQuoteInput) =>
      singleChargeQuote(input.targetTotal, segment, input.savedCardId),
    ),
  };
}
