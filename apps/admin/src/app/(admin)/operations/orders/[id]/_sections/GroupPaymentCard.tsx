"use client";

import Link from "next/link";
import { ChevronRightIcon } from "@heroicons/react/24/outline";
import {
  Button,
  enumLabel,
  paymentStatusConfig,
  paymentProviderConfig,
} from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { SectionCard } from "@/components/detail/SectionCard";
import { DataList, Field } from "@/components/detail/DataList";
import { PaytrOidField } from "@/components/detail/PaytrOidField";
import { fmtDateTime, fmtTry } from "@/lib/format";
import type { OrderGroupFile } from "../_lib/fileTypes";
import { statusConfig } from "@/lib/statusLabels";
import { installmentCountLabel } from "@/lib/payment-installment";

/**
 * Grubun TEK ödemesi. Sepet ödemesinde tutar tüm sepeti kapsar — kart bunu
 * açıkça söyler ki tek siparişin yanındaki büyük tutar yanlış okunmasın (K3).
 */
export function GroupPaymentCard({ file }: { file: OrderGroupFile }) {
  const t = useTranslations();
  const { payment } = file;
  if (!payment) return null;
  // PSP scale (C): what the card was charged, like `refundedTotal`.
  const charged = payment.chargedAmount ?? payment.amount;
  const installmentCount = payment.installmentCount ?? 1;
  // In kuruş: a float sum of refund attempts can land a hair under C.
  const remainingKurus =
    Math.round(charged * 100) - Math.round(payment.refundedTotal * 100);

  return (
    <SectionCard title={t("admin.operations.orders.paymentTitle")}>
      <DataList columns={1}>
        <Field label={t("common.status")}>
          {enumLabel(statusConfig(paymentStatusConfig, t), payment.status)}
        </Field>
        <Field label={t("admin.operations.orders.file.chargedTotal")}>
          {fmtTry(charged)}
        </Field>
        {installmentCount > 1 && (
          <>
            <Field label={t("admin.finance.payments.installment.title")}>
              {installmentCountLabel(t, installmentCount)}
            </Field>
            <Field label={t("admin.finance.installments.preview.columns.fee")}>
              {fmtTry(payment.installmentFeeAmount ?? 0)}
            </Field>
          </>
        )}
        {payment.refundedTotal > 0 && (
          <Field label={t("admin.operations.orders.file.refundedTotal")}>
            <span className="text-danger-600">
              −{fmtTry(payment.refundedTotal)}
            </span>
          </Field>
        )}
        {payment.refundedTotal > 0 && remainingKurus > 0 && (
          <Field
            label={t("admin.operations.orders.file.remainingChargedTotal")}
          >
            {fmtTry(remainingKurus / 100)}
          </Field>
        )}
        <Field label={t("admin.operations.orders.provider")}>
          {enumLabel(
            statusConfig(paymentProviderConfig, t),
            payment.provider ?? "",
          )}
        </Field>
        {payment.paidAt && (
          <Field label={t("common.date")}>{fmtDateTime(payment.paidAt)}</Field>
        )}
        <PaytrOidField
          paytrOid={payment.paytrOid}
          paytrOidHistory={payment.paytrOidHistory}
        />
      </DataList>
      {payment.coversWholeGroup && file.group.itemCount > 1 && (
        <p className="mt-3 text-xs text-muted">
          {t("admin.operations.orders.file.coversGroup", {
            count: file.group.itemCount,
          })}
        </p>
      )}
      <Button asChild variant="ghost" size="sm" className="mt-3">
        <Link href={`/finance/payments/${payment.id}`}>
          {t("admin.operations.orders.viewPaymentDetail")}
          <ChevronRightIcon className="ml-1 h-4 w-4" />
        </Link>
      </Button>
    </SectionCard>
  );
}
