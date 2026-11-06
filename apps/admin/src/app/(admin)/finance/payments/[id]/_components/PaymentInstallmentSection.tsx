"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@tarodan/ui";
import type {
  AdminPaymentChargeAttempt,
  AdminPaymentInstallment,
} from "@tarodan/types";
import { DataTable } from "@/components/DataTable";
import { DataList, Field } from "@/components/detail/DataList";
import { SectionCard } from "@/components/detail/SectionCard";
import { col } from "@/components/table";
import { fmtTry } from "@/lib/format";
import { STATUS_TONE } from "@/lib/status-tone";
import type { Translate } from "@/lib/statusLabels";
import { installmentSegmentLabel } from "@/app/(admin)/finance/installments/_lib/segments";
import { fmtShare } from "@/app/(admin)/finance/installments/_lib/preview-columns";
import {
  installmentCardLabel,
  installmentCountLabel,
  installmentRuleLabel,
  paymentInstallmentKind,
} from "../_lib/installment";

const L = "admin.finance.payments.installment";
const NOT_SORTABLE = { sortable: false } as const;

interface InstallmentProps {
  installment: AdminPaymentInstallment;
  /** The payment's `paidAt`: an unpaid payment has no count yet. */
  paidAt: string | null | undefined;
}

/** The compact line in the payment info: "Tek çekim", "3 taksit" or not captured. */
export function PaymentInstallmentField({
  installment,
  paidAt,
}: InstallmentProps) {
  const t = useTranslations();
  return (
    <Field label={t(`${L}.title`)}>
      {paymentInstallmentKind(installment, paidAt) === "notCaptured"
        ? t(`${L}.notCaptured`)
        : installmentCountLabel(t, installment.installmentCount)}
    </Field>
  );
}

/**
 * The installment block of a captured installment payment: count, the fee
 * against the goods amount and the charged total, then the pricing snapshot
 * of the captured attempt (card, user group, rule version, platform share,
 * expected platform cost). Read-only; it never reads today's rules. Nothing
 * for a single or unpaid payment: the compact line says it.
 */
export function PaymentInstallmentSection({
  installment,
  paidAt,
}: InstallmentProps) {
  const t = useTranslations();
  if (paymentInstallmentKind(installment, paidAt) !== "installment") {
    return null;
  }
  const { pricing } = installment;

  return (
    <SectionCard title={t(`${L}.title`)} bodyClassName="space-y-4">
      <DataList>
        <Field label={t("admin.finance.installments.rules.columns.counts")}>
          {installmentCountLabel(t, installment.installmentCount)}
        </Field>
        <Field label={t(`${L}.goodsAmount`)}>
          {fmtTry(installment.goodsAmount)}
        </Field>
        <Field label={t("admin.finance.installments.preview.columns.fee")}>
          {fmtTry(installment.installmentFeeAmount)}
        </Field>
        <Field label={t(`${L}.chargedAmount`)}>
          <span className="font-medium">
            {fmtTry(installment.chargedAmount)}
          </span>
        </Field>
        {pricing && (
          <>
            <Field label={t(`${L}.card`)}>
              {installmentCardLabel(t, pricing) ?? "—"}
            </Field>
            <Field label={t("admin.finance.installments.preview.segment")}>
              {installmentSegmentLabel(t, pricing.buyerSegment)}
            </Field>
            <Field label={t("admin.finance.installments.preview.columns.rule")}>
              {installmentRuleLabel(t, pricing.rule)}
            </Field>
            <Field
              label={t("admin.finance.installments.preview.columns.share")}
            >
              {fmtShare(pricing.platformSharePct)}
            </Field>
            <Field label={t(`${L}.platformCost`)}>
              {fmtTry(pricing.platformCostAmount)}
            </Field>
          </>
        )}
      </DataList>
      {!pricing && <Alert variant="warning">{t(`${L}.noPricing`)}</Alert>}
    </SectionCard>
  );
}

const attemptColumns = (t: Translate) => [
  col.text<AdminPaymentChargeAttempt>(
    t(`${L}.attempts.columns.oid`),
    (a) => a.merchantOid,
    { ...NOT_SORTABLE, minWidth: 220 },
  ),
  col.text<AdminPaymentChargeAttempt>(
    t(`${L}.attempts.columns.count`),
    (a) => installmentCountLabel(t, a.installmentCount),
    NOT_SORTABLE,
  ),
  col.money<AdminPaymentChargeAttempt>(
    t(`${L}.attempts.columns.charged`),
    (a) => a.chargedAmount,
    NOT_SORTABLE,
  ),
  col.money<AdminPaymentChargeAttempt>(
    t(`${L}.attempts.columns.fee`),
    (a) => a.installmentFeeAmount,
    NOT_SORTABLE,
  ),
  col.status<AdminPaymentChargeAttempt>(
    t(`${L}.attempts.columns.status`),
    (a) =>
      a.capturedAt
        ? { variant: STATUS_TONE.live, children: t(`${L}.attempts.captured`) }
        : {
            variant: STATUS_TONE.inactive,
            children: t(`${L}.attempts.notCaptured`),
          },
    NOT_SORTABLE,
  ),
  col.date<AdminPaymentChargeAttempt>(
    t(`${L}.attempts.columns.createdAt`),
    (a) => a.createdAt,
    { ...NOT_SORTABLE, withTime: true },
  ),
];

/** Every PayTR form signed for the payment, newest first, read-only; nothing without one. */
export function ChargeAttemptsSection({
  attempts,
}: {
  attempts: AdminPaymentChargeAttempt[];
}) {
  const t = useTranslations();
  const columns = useMemo(() => attemptColumns(t), [t]);
  if (attempts.length === 0) return null;

  return (
    <SectionCard title={t(`${L}.attempts.title`)} bodyClassName="space-y-3">
      <p className="text-sm text-muted">{t(`${L}.attempts.description`)}</p>
      <DataTable
        columns={columns}
        data={attempts}
        getRowId={(a) => a.id}
        dense
      />
    </SectionCard>
  );
}
