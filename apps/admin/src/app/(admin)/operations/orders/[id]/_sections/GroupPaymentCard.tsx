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
import { fmtDateTime, fmtTry } from "@/lib/format";
import type { OrderGroupFile } from "../_lib/fileTypes";

/**
 * Grubun TEK ödemesi. Sepet ödemesinde tutar tüm sepeti kapsar — kart bunu
 * açıkça söyler ki tek siparişin yanındaki büyük tutar yanlış okunmasın (K3).
 */
export function GroupPaymentCard({ file }: { file: OrderGroupFile }) {
  const t = useTranslations();
  const { payment } = file;
  if (!payment) return null;

  return (
    <SectionCard title={t("admin.operations.orders.paymentTitle")}>
      <DataList columns={1}>
        <Field label={t("common.status")}>
          {enumLabel(paymentStatusConfig, payment.status)}
        </Field>
        <Field label={t("common.amount")}>{fmtTry(payment.amount)}</Field>
        {payment.refundedTotal > 0 && (
          <Field label={t("admin.operations.orders.file.refundedTotal")}>
            <span className="text-danger-600">
              −{fmtTry(payment.refundedTotal)}
            </span>
          </Field>
        )}
        <Field label={t("admin.operations.orders.provider")}>
          {enumLabel(paymentProviderConfig, payment.provider ?? "")}
        </Field>
        {payment.paidAt && (
          <Field label={t("common.date")}>{fmtDateTime(payment.paidAt)}</Field>
        )}
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
