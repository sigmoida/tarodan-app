/** @format */

"use client";

import { Fragment, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { PaymentInstallmentFields } from "@tarodan/types";
import { formatTL } from "@/lib/format";
import { paidInstallmentOf } from "@/lib/installments";

/**
 * The installment lines of a paid payment, for its payer (plan 6.2: payment
 * result, My payments, the order's payment block): the count, the
 * installment fee ("Vade farksız" when 0) and the amount charged to the card.
 * Nothing for a single payment, an older API or a view without the fields
 * (the seller). `countOnly` keeps the count alone where the fee and the
 * charged total would not belong to the amount shown (one order of a cart).
 * The amounts are the server's; the row layout is the caller's.
 */
export default function InstallmentPaidLines({
  payment,
  countOnly = false,
  renderRow,
}: {
  payment: PaymentInstallmentFields | null | undefined;
  countOnly?: boolean;
  renderRow: (row: { key: string; label: string; value: string }) => ReactNode;
}) {
  const t = useTranslations();
  const paid = paidInstallmentOf(payment);
  if (!paid) return null;
  const rows = [
    {
      key: "count",
      label: t("payment.summary.installments"),
      value: t("payment.installments.count", { count: paid.count }),
    },
  ];
  if (!countOnly) {
    if (paid.feeAmount !== null) {
      rows.push({
        key: "fee",
        label: t("payment.summary.installmentFee"),
        value:
          paid.feeAmount > 0
            ? formatTL(paid.feeAmount)
            : t("payment.installments.noFee"),
      });
    }
    rows.push({
      key: "charged",
      label: t("payment.summary.chargedTotal"),
      value: formatTL(paid.chargedAmount),
    });
  }
  return (
    <>
      {rows.map((row) => (
        <Fragment key={row.key}>{renderRow(row)}</Fragment>
      ))}
    </>
  );
}
