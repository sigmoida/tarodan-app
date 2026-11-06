import { Prisma } from "@prisma/client";
import { defaultLocale, type Locale } from "@tarodan/i18n";
import { formatEmailPrice } from "../../../common/helpers/email-template-renderer";
import { translateMessage } from "../../i18n/translate";
import { chargedAmountOf, type ChargedAmountSource } from "./charged-amount";

/**
 * The installment line of the buyer's payment e-mail (ADR 0019, plan 6.6;
 * AS-L1: the buyer gets the installment terms in writing): "3 taksit: aylık
 * 355,46 TL, vade farkı 66,38 TL, toplam 1.066,38 TL". From the captured
 * payment only (count, C, F); nothing for a single payment. The order e-mails
 * are written in the default locale, so is this line.
 */
export interface InstallmentMailLine {
  label: string;
  summary: string;
  /** C: what the card was charged, for the "paid" row. */
  chargedAmount: number;
}

export interface InstallmentMailSource extends ChargedAmountSource {
  installmentCount: number;
}

export function installmentMailLineOf(
  payment: InstallmentMailSource,
  locale: Locale = defaultLocale,
): InstallmentMailLine | null {
  const count = payment.installmentCount;
  if (!(count > 1)) return null;
  const charged = chargedAmountOf(payment);
  const fee = charged.minus(payment.amount);
  // Equal installments when there is a fee; the bank rounds when there is none.
  const monthly = charged
    .div(count)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  return {
    label: translateMessage("server.payment.installmentMail.label", locale),
    summary: translateMessage(
      "server.payment.installmentMail.summary",
      locale,
      {
        count,
        monthly: formatEmailPrice(monthly.toNumber()),
        fee: formatEmailPrice(fee.toNumber()),
        total: formatEmailPrice(charged.toNumber()),
      },
    ),
    chargedAmount: charged.toNumber(),
  };
}
