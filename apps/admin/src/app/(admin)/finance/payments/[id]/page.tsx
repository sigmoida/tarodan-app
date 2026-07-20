"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowUturnLeftIcon, XCircleIcon } from "@heroicons/react/24/outline";
import {
  Button,
  StatusBadge,
  enumLabel,
  paymentProviderConfig,
  paymentHoldStatusConfig,
  orderStatusConfig,
} from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import { DetailPage } from "@/components/detail/DetailPage";
import { SectionCard } from "@/components/detail/SectionCard";
import { PartyCard } from "@/components/detail/PartyCard";
import { DataList, Field } from "@/components/detail/DataList";
import { fmtTry, fmtDateTime } from "@/lib/format";
import { paymentStatusConfig } from "../_lib/types";
import { type PaymentDetail } from "./types";
import { RefundPaymentModal } from "./_modals/RefundPaymentModal";
import { ForceCancelPaymentModal } from "./_modals/ForceCancelPaymentModal";
import { useTranslations } from "next-intl";

export default function PaymentDetailPage() {
  const t = useTranslations();
  const { id } = useParams<{ id: string }>();
  const [refundOpen, setRefundOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  return (
    <DetailPage<PaymentDetail>
      resource="payments"
      id={id}
      fetcher={(pid) => adminApi.getPayment(pid).then((r) => r.data)}
      backHref="/finance/payments"
      emptyTitle={t("admin.finance.payments.empty")}
      title={() => t("admin.finance.payments.detailTitle")}
      subtitle={(p) =>
        p.orderNumber
          ? t("admin.finance.payments.orderSubtitle", { number: p.orderNumber })
          : t("admin.finance.payments.paymentSubtitle", {
              id: p.id?.slice(0, 8) ?? "",
            })
      }
      badge={(p) => (
        <StatusBadge status={p.status} config={paymentStatusConfig(t)} />
      )}
      actions={(p) => (
        <>
          {p.status === "completed" && (
            <Button
              variant="danger"
              leftIcon={<ArrowUturnLeftIcon className="h-5 w-5" />}
              onClick={() => setRefundOpen(true)}
            >
              {t("admin.finance.payments.manualRefund")}
            </Button>
          )}
          {p.status !== "completed" && p.status !== "refunded" && (
            <Button
              variant="primary"
              leftIcon={<XCircleIcon className="h-5 w-5" />}
              onClick={() => setCancelOpen(true)}
            >
              {t("admin.finance.payments.forceCancel")}
            </Button>
          )}
        </>
      )}
    >
      {(p) => (
        <>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <SectionCard title={t("admin.finance.payments.paymentInfo")}>
                <DataList>
                  <Field label={t("admin.finance.payments.paymentId")}>
                    <span className="font-mono text-xs">{p.id}</span>
                  </Field>
                  <Field label={t("common.amount")}>{fmtTry(p.amount)}</Field>
                  <Field label={t("admin.finance.payments.currency")}>
                    {p.currency}
                  </Field>
                  <Field label={t("admin.finance.payments.provider")}>
                    {enumLabel(paymentProviderConfig, p.provider)}
                  </Field>
                  <Field label="Transaction ID">
                    <span className="font-mono text-xs">
                      {p.providerPaymentId || p.providerConversationId || "N/A"}
                    </span>
                  </Field>
                  <Field label={t("admin.finance.common.createdAt")}>
                    {fmtDateTime(p.createdAt)}
                  </Field>
                  {p.paidAt && (
                    <Field label={t("admin.finance.payments.paymentDate")}>
                      {fmtDateTime(p.paidAt)}
                    </Field>
                  )}
                </DataList>
                {p.failureReason && (
                  <div className="mt-4 rounded-lg border border-danger-200 bg-danger-50 p-3">
                    <p className="text-sm text-danger-800">
                      <strong>
                        {t("admin.finance.payments.failureReason")}:
                      </strong>{" "}
                      {p.failureReason}
                    </p>
                  </div>
                )}
              </SectionCard>

              <SectionCard title={t("admin.finance.payments.orderInfo")}>
                {p.order ? (
                  <DataList>
                    <Field label={t("admin.finance.common.orderNumber")}>
                      <Link
                        href={`/operations/orders/${p.orderId}`}
                        className="text-primary-600 hover:text-primary-700"
                      >
                        #{p.order.orderNumber}
                      </Link>
                    </Field>
                    <Field label={t("admin.finance.payments.product")}>
                      {p.order.product?.title ?? "—"}
                    </Field>
                    <Field label={t("admin.finance.payments.orderStatus")}>
                      {enumLabel(orderStatusConfig, p.order.status)}
                    </Field>
                    <Field label={t("admin.finance.payments.totalAmount")}>
                      {fmtTry(p.order.totalAmount)}
                    </Field>
                    <Field label={t("admin.finance.payments.commission")}>
                      {fmtTry(p.order.commissionAmount)}
                    </Field>
                  </DataList>
                ) : (
                  <p className="text-sm text-muted">
                    {t("admin.finance.payments.notLinkedToOrder")}
                  </p>
                )}
              </SectionCard>

              {p.order && (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <PartyCard
                    title={t("admin.finance.common.buyer")}
                    name={p.order.buyer?.displayName ?? "—"}
                    userHref={
                      p.order.buyer?.id
                        ? `/accounts/users/${p.order.buyer.id}`
                        : undefined
                    }
                    email={p.order.buyer?.email}
                  />
                  <PartyCard
                    title={t("admin.finance.common.seller")}
                    name={p.order.seller?.displayName ?? "—"}
                    userHref={
                      p.order.seller?.id
                        ? `/accounts/users/${p.order.seller.id}`
                        : undefined
                    }
                    email={p.order.seller?.email}
                  />
                </div>
              )}

              {p.paymentHolds && p.paymentHolds.length > 0 && (
                <SectionCard
                  title={t("admin.finance.payments.holds")}
                  bodyClassName="space-y-3"
                >
                  {p.paymentHolds.map((hold) => (
                    <div
                      key={hold.id}
                      className="rounded-lg bg-surface-alt p-3"
                    >
                      <DataList columns={1}>
                        <Field label={t("common.amount")}>
                          {fmtTry(hold.amount)}
                        </Field>
                        <Field label={t("common.status")}>
                          {enumLabel(paymentHoldStatusConfig, hold.status)}
                        </Field>
                        {hold.releaseAt && (
                          <Field label={t("admin.finance.payments.release")}>
                            {new Date(hold.releaseAt).toLocaleDateString(
                              t("common.dateLocale"),
                            )}
                          </Field>
                        )}
                      </DataList>
                    </div>
                  ))}
                </SectionCard>
              )}
            </div>

            <div className="space-y-6">
              {p.metadata && Object.keys(p.metadata).length > 0 && (
                <SectionCard title="Metadata">
                  <pre className="overflow-auto rounded-lg bg-surface-alt p-3 text-xs">
                    {JSON.stringify(p.metadata, null, 2)}
                  </pre>
                </SectionCard>
              )}
            </div>
          </div>

          {refundOpen && (
            <RefundPaymentModal
              paymentId={p.id}
              amount={p.amount}
              onClose={() => setRefundOpen(false)}
            />
          )}
          {cancelOpen && (
            <ForceCancelPaymentModal
              paymentId={p.id}
              onClose={() => setCancelOpen(false)}
            />
          )}
        </>
      )}
    </DetailPage>
  );
}
