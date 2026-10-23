"use client";

import { useTranslations } from "next-intl";
import { DataList, Field } from "@/components/detail/DataList";
import { Panel } from "@/components/detail/Panel";
import { SectionTitle } from "@/components/detail/SectionTitle";
import { fmtDateTime, fmtTry } from "@/lib/format";
import { failureReasonText } from "../_lib/failureReason";
import type { PayoutTransferRow } from "../_lib/types";
import { TransferTotalBreakdown } from "./TransferTotalBreakdown";

/**
 * The expanded row of the transfer list: what an admin needs to resolve a
 * transfer (PayTR transaction ID, reason, PayTR's message, the transfer-total
 * breakdown) and, on a row marked as paid, how it was settled.
 */
export function TransferDetails({ row }: { row: PayoutTransferRow }) {
  const t = useTranslations();
  const reason = failureReasonText(row.failureReason, t);
  const settlement = row.manualSettlement;
  return (
    <div className="grid gap-4 p-4 md:grid-cols-2">
      <Panel tone="muted" className="space-y-2">
        <DataList columns={1}>
          <Field label={t("admin.finance.payouts.resolution.transId")}>
            {row.transId}
          </Field>
          {reason && (
            <Field label={t("admin.finance.payouts.resolution.failureReason")}>
              {reason}
            </Field>
          )}
          {row.providerMessage && (
            <Field label={t("admin.finance.payouts.resolution.paytrMessage")}>
              {row.providerMessage}
            </Field>
          )}
          {row.submittedTotalAmount != null && (
            <Field label={t("admin.finance.payouts.resolution.submittedTotal")}>
              {fmtTry(row.submittedTotalAmount)}
            </Field>
          )}
        </DataList>
      </Panel>

      {row.transferTotal && (
        <Panel tone="muted">
          <TransferTotalBreakdown total={row.transferTotal} />
        </Panel>
      )}

      {settlement && (
        <Panel tone="muted" className="space-y-2">
          <SectionTitle size="sm" as="h4">
            {t("admin.finance.payouts.resolution.manualSettlementTitle")}
          </SectionTitle>
          <DataList columns={1}>
            <Field label={t("admin.finance.payouts.resolution.markPaidMethod")}>
              {t(
                `admin.finance.payouts.resolution.method.${settlement.method}`,
              )}
            </Field>
            <Field label={t("admin.finance.payouts.resolution.reference")}>
              {settlement.reference}
            </Field>
            <Field label={t("admin.finance.payouts.resolution.markPaidNet")}>
              {fmtTry(settlement.netAmount)}
            </Field>
            {settlement.platformFundedAmount > 0 && (
              <Field
                label={t("admin.finance.payouts.resolution.platformFunded")}
              >
                {fmtTry(settlement.platformFundedAmount)}
              </Field>
            )}
            <Field label={t("admin.finance.payouts.resolution.settledAt")}>
              {fmtDateTime(settlement.settledAt)}
            </Field>
          </DataList>
        </Panel>
      )}
    </div>
  );
}
