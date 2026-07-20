"use client";

import Link from "next/link";
import {
  enumLabel,
  paymentStatusConfig,
  paymentProviderConfig,
} from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { SectionCard } from "@/components/detail/SectionCard";
import { DataList, Field } from "@/components/detail/DataList";
import { fmtTry } from "@/lib/format";
import type { OrderDetail } from "../types";

export function PaymentSection({
  payment,
}: {
  payment: NonNullable<OrderDetail["payment"]>;
}) {
  const t = useTranslations();
  return (
    <SectionCard title={t("admin.operations.orders.paymentTitle")}>
      <DataList columns={1}>
        <Field label={t("common.status")}>
          {enumLabel(paymentStatusConfig, payment.status)}
        </Field>
        <Field label={t("common.amount")}>{fmtTry(payment.amount)}</Field>
        <Field label={t("admin.operations.orders.provider")}>
          {enumLabel(paymentProviderConfig, payment.provider)}
        </Field>
      </DataList>
      <Link
        href={`/finance/payments/${payment.id}`}
        className="mt-3 block text-sm text-primary-600 hover:text-primary-700"
      >
        {t("admin.operations.orders.viewPaymentDetail")} →
      </Link>
    </SectionCard>
  );
}
