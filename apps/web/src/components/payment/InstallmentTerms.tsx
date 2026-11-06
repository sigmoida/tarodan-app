/** @format */

"use client";

import { useTranslations } from "next-intl";
import type { InstallmentOption } from "@tarodan/types";
import { formatTL } from "@/lib/format";

/**
 * Pre-information of an installment payment (plan AS-L1): the count, the
 * monthly amount, the installment fee and the total charged, stated next to
 * the distance sales consent before the buyer pays, with the bank refund
 * note. Shown only for a chosen count above 1; the same text as mobile.
 */
export default function InstallmentTerms({
  option,
}: {
  option: InstallmentOption | null;
}) {
  const t = useTranslations();
  if (!option || option.count <= 1) return null;
  return (
    <p
      className="rounded-xl border border-border bg-surface p-3 text-xs text-body"
      data-testid="installment-terms"
    >
      {t("payment.installments.terms", {
        count: option.count,
        monthly: formatTL(option.monthlyAmount),
        fee: formatTL(option.feeAmount),
        total: formatTL(option.totalAmount),
      })}{" "}
      {t("payment.installments.refundNote")}
    </p>
  );
}
