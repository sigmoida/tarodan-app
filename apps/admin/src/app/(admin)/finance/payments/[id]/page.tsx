"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowUturnLeftIcon,
  ChevronRightIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import {
  Alert,
  Button,
  StatusBadge,
  enumLabel,
  paymentProviderConfig,
  paymentStatusConfig,
  paymentHoldStatusConfig,
  orderStatusConfig,
} from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import { DetailPage } from "@/components/detail/DetailPage";
import { SectionCard } from "@/components/detail/SectionCard";
import { PartyCard } from "@/components/detail/PartyCard";
import { DataList, Field } from "@/components/detail/DataList";
import { Panel } from "@/components/detail/Panel";
import { DetailLayout } from "@/components/detail/DetailLayout";
import { TextLink } from "@/components/TextLink";
import { fmtTry, fmtDate, fmtDateTime } from "@/lib/format";
import { type PaymentDetail } from "./types";
import { RefundPaymentModal } from "./_modals/RefundPaymentModal";
import { ForceCancelPaymentModal } from "./_modals/ForceCancelPaymentModal";
import { TradePaymentSection } from "./_components/TradePaymentSection";
import { useTranslations } from "next-intl";
import { statusConfig } from "@/lib/statusLabels";

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
        p.trade?.tradeNumber
          ? t("admin.finance.payments.tradeSubtitle", {
              number: p.trade.tradeNumber,
            })
          : (p.group?.groupNumber ?? p.orderNumber)
            ? t("admin.finance.payments.orderSubtitle", {
                number: p.group?.groupNumber ?? p.orderNumber,
              })
            : t("admin.finance.payments.paymentSubtitle", {
                id: p.id?.slice(0, 8) ?? "",
              })
      }
      badge={(p) => (
        <StatusBadge
          status={p.status}
          config={statusConfig(paymentStatusConfig, t)}
        />
      )}
      actions={(p) => (
        <>
          {p.status === "completed" &&
            !p.group &&
            (!p.trade || p.trade.refundableTotal > 0) && (
              <Button
                variant="danger"
                leftIcon={<ArrowUturnLeftIcon className="h-5 w-5" />}
                onClick={() => setRefundOpen(true)}
              >
                {p.trade
                  ? t("admin.finance.payments.refundWholeTrade")
                  : t("admin.finance.payments.manualRefund")}
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
          <DetailLayout
            main={
              <>
                <SectionCard title={t("admin.finance.payments.paymentInfo")}>
                  <DataList>
                    <Field label={t("admin.finance.payments.paymentId")} mono>
                      {p.id}
                    </Field>
                    <Field label={t("common.amount")}>{fmtTry(p.amount)}</Field>
                    {(p.refundedTotal ?? 0) > 0 && (
                      <Field label={t("admin.finance.payments.refundedTotal")}>
                        <span className="text-danger-600">
                          −{fmtTry(p.refundedTotal ?? 0)}
                        </span>
                      </Field>
                    )}
                    <Field label={t("admin.finance.payments.currency")}>
                      {p.currency}
                    </Field>
                    <Field label={t("admin.finance.payments.provider")}>
                      {enumLabel(
                        statusConfig(paymentProviderConfig, t),
                        p.provider,
                      )}
                    </Field>
                    <Field label="Transaction ID" mono>
                      {p.providerPaymentId || p.providerConversationId || "N/A"}
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
                    <Alert variant="danger" className="mt-4">
                      <p>
                        <strong>
                          {t("admin.finance.payments.failureReason")}:
                        </strong>{" "}
                        {p.failureReason}
                      </p>
                    </Alert>
                  )}
                </SectionCard>

                {p.trade ? (
                  <TradePaymentSection trade={p.trade} />
                ) : p.group ? (
                  <SectionCard
                    title={t("admin.finance.payments.cartInfo")}
                    actions={
                      p.group.orders[0] && (
                        <Button asChild variant="ghost" size="sm">
                          <Link
                            href={`/operations/orders/${p.group.orders[0].id}`}
                          >
                            #{p.group.groupNumber}
                            <ChevronRightIcon className="ml-1 h-4 w-4" />
                          </Link>
                        </Button>
                      )
                    }
                  >
                    {/* Kapsanan siparişler — her satır grup dosyasına çözülür. */}
                    <div className="space-y-2">
                      {p.group.orders.map((o) => (
                        <Panel
                          key={o.id}
                          tone="muted"
                          padding="sm"
                          className="flex flex-wrap items-center justify-between gap-2 text-sm"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <TextLink href={`/operations/orders/${o.id}`} mono>
                              #{o.orderNumber}
                            </TextLink>
                            <span className="min-w-0 truncate text-muted">
                              {o.productTitle ?? "—"}
                              {o.sellerName ? ` · ${o.sellerName}` : ""}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <StatusBadge
                              status={o.status}
                              config={statusConfig(orderStatusConfig, t)}
                              size="sm"
                            />
                            {o.refundedTotal > 0 && (
                              <span className="text-xs text-danger-600">
                                −{fmtTry(o.refundedTotal)}
                              </span>
                            )}
                            <span className="font-medium tabular-nums">
                              {fmtTry(o.totalAmount)}
                            </span>
                          </div>
                        </Panel>
                      ))}
                    </div>
                    {p.status === "completed" && (
                      <p className="mt-3 text-xs text-muted">
                        {t("admin.finance.payments.manualRefundGroupHint")}
                      </p>
                    )}
                  </SectionCard>
                ) : (
                  <SectionCard title={t("admin.finance.payments.orderInfo")}>
                    {p.order ? (
                      <DataList>
                        <Field label={t("admin.finance.common.orderNumber")}>
                          <TextLink href={`/operations/orders/${p.orderId}`}>
                            #{p.order.orderNumber}
                          </TextLink>
                        </Field>
                        <Field label={t("admin.finance.payments.product")}>
                          {p.order.product?.title ?? "—"}
                        </Field>
                        <Field label={t("admin.finance.payments.orderStatus")}>
                          {enumLabel(
                            statusConfig(orderStatusConfig, t),
                            p.order.status,
                          )}
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
                )}

                {!p.trade && !p.order && p.group?.buyer && (
                  <PartyCard
                    title={t("admin.finance.common.buyer")}
                    name={p.group.buyer.displayName ?? "—"}
                    userHref={`/accounts/users/${p.group.buyer.id}`}
                    email={p.group.buyer.email}
                  />
                )}
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
                      <Panel key={hold.id} tone="muted" padding="sm">
                        <DataList columns={1}>
                          {hold.orderNumber && (
                            <Field
                              label={t("admin.finance.common.orderNumber")}
                            >
                              <TextLink
                                href={`/operations/orders/${hold.orderId}`}
                                mono
                              >
                                #{hold.orderNumber}
                              </TextLink>
                            </Field>
                          )}
                          {hold.sellerName && (
                            <Field label={t("admin.finance.common.seller")}>
                              <TextLink
                                href={`/accounts/users/${hold.sellerId}`}
                              >
                                {hold.sellerName}
                              </TextLink>
                            </Field>
                          )}
                          <Field label={t("common.amount")}>
                            {fmtTry(hold.amount)}
                          </Field>
                          {hold.refundedAmount > 0 && (
                            <Field
                              label={t("admin.finance.payments.refundedTotal")}
                            >
                              <span className="text-danger-600">
                                −{fmtTry(hold.refundedAmount)}
                              </span>
                            </Field>
                          )}
                          <Field label={t("common.status")}>
                            {enumLabel(
                              statusConfig(paymentHoldStatusConfig, t),
                              hold.status,
                            )}
                          </Field>
                          {hold.frozenByRefundId && (
                            <Field label={t("common.status")}>
                              <span className="text-xs font-medium text-danger-600">
                                {t("admin.operations.orders.file.escrowFrozen")}
                              </span>
                            </Field>
                          )}
                          {hold.releaseAt && (
                            <Field label={t("admin.finance.payments.release")}>
                              {fmtDate(hold.releaseAt)}
                            </Field>
                          )}
                        </DataList>
                      </Panel>
                    ))}
                  </SectionCard>
                )}
              </>
            }
            aside={
              <>
                {p.metadata && Object.keys(p.metadata).length > 0 && (
                  <SectionCard title="Metadata">
                    <Panel tone="muted" padding="sm">
                      <pre className="overflow-auto text-xs">
                        {JSON.stringify(p.metadata, null, 2)}
                      </pre>
                    </Panel>
                  </SectionCard>
                )}
              </>
            }
          />

          {refundOpen && (
            <RefundPaymentModal
              paymentId={p.id}
              amount={p.amount}
              trade={
                p.trade
                  ? {
                      tradeNumber: p.trade.tradeNumber,
                      refundableTotal: p.trade.refundableTotal,
                    }
                  : undefined
              }
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
