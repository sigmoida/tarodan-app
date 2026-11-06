import { Prisma } from "@prisma/client";
import type { PaymentInstallmentFields } from "@tarodan/types";
import { chargedAmountOf } from "./charged-amount";

/**
 * The installment fields of a payment in the PAYER's own views (ADR 0019,
 * plan 5.2): `GET /payments/:id/status`, `GET /payments/my-payments`, the
 * order detail payment block. Never for the seller: the card and the fee
 * are the buyer's. Additive and optional for old clients.
 */

/** Include it next to the payment's scalars to also show the card. */
export const PAYMENT_CHARGE_CARD_INCLUDE = {
  chargeAttempt: { select: { cardFamily: true, cardBank: true } },
} satisfies Prisma.PaymentInclude;

export interface PaymentInstallmentSource {
  amount: Prisma.Decimal;
  chargedAmount: Prisma.Decimal | null;
  installmentCount: number;
  /** Present when `PAYMENT_CHARGE_CARD_INCLUDE` was loaded. */
  chargeAttempt?: { cardFamily: string | null; cardBank: string | null } | null;
}

export function paymentInstallmentFieldsOf(
  payment: PaymentInstallmentSource,
): PaymentInstallmentFields {
  // Read models hand over Prisma rows, some views plain numbers.
  const amount = new Prisma.Decimal(payment.amount);
  const charged = new Prisma.Decimal(chargedAmountOf(payment));
  const fields: PaymentInstallmentFields = {
    installmentCount: payment.installmentCount,
    installmentFeeAmount: charged.minus(amount).toNumber(),
    chargedAmount: charged.toNumber(),
  };
  const card = payment.chargeAttempt;
  if (card?.cardFamily) fields.cardFamily = card.cardFamily;
  if (card?.cardBank) fields.cardBank = card.cardBank;
  return fields;
}
