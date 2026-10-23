"use client";

import { Alert } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { DataList, Field } from "@/components/detail/DataList";
import { SectionTitle } from "@/components/detail/SectionTitle";
import { fmtTry } from "@/lib/format";
import type { PayoutTransferTotal } from "../_lib/types";

/**
 * Why a transfer did not fit: the net against the highest total the payment
 * can still carry (`allowedTotal = min(ownAllowed, oidRemaining)`), as the
 * processor computed it (API `transferTotal`).
 */
export function TransferTotalBreakdown({
  total,
}: {
  total: PayoutTransferTotal;
}) {
  const t = useTranslations();
  return (
    <div className="space-y-2">
      <SectionTitle size="sm" as="h4">
        {t("admin.finance.payouts.resolution.breakdownTitle")}
      </SectionTitle>
      <DataList columns={1}>
        <Field label={t("admin.finance.payouts.resolution.breakdownNet")}>
          {fmtTry(total.net)}
        </Field>
        <Field
          label={t("admin.finance.payouts.resolution.breakdownOwnAllowed")}
        >
          {fmtTry(total.ownAllowed)}
        </Field>
        <Field
          label={t("admin.finance.payouts.resolution.breakdownOidRemaining")}
        >
          {fmtTry(total.oidRemaining)}
        </Field>
        <Field
          label={t("admin.finance.payouts.resolution.breakdownAllowedTotal")}
        >
          {fmtTry(total.allowedTotal)}
        </Field>
      </DataList>
      {total.missingInput && (
        <Alert variant="warning">
          {t("admin.finance.payouts.resolution.breakdownMissingInput", {
            input: total.missingInput,
          })}
        </Alert>
      )}
    </div>
  );
}
