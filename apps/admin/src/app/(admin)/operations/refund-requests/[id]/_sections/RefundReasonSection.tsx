"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  StatusBadge,
  refundReasonConfig,
  orderStatusConfig,
} from "@tarodan/ui";
import { SectionCard } from "@/components/detail/SectionCard";
import type { RefundRequestDetail } from "../types";
import { fmtTry } from "../_lib/format";
import { Field } from "../_components/Field";
import { statusConfig } from "@/lib/statusLabels";

export function RefundReasonSection({ rr }: { rr: RefundRequestDetail }) {
  const t = useTranslations();
  const orderQty = rr.order.quantity != null ? Number(rr.order.quantity) : 1;
  const refundQty =
    rr.refundQuantity != null ? Number(rr.refundQuantity) : orderQty;
  const isPartialQty = orderQty > 1 && refundQty < orderQty;
  const unitPrice =
    rr.order.unitPrice != null
      ? Number(rr.order.unitPrice)
      : rr.order.subtotal != null && orderQty > 0
        ? Number(rr.order.subtotal) / orderQty
        : null;

  return (
    <SectionCard
      title={t("admin.operations.refundRequests.reasonSectionTitle")}
      bodyClassName="space-y-4"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-alt">
          {rr.order.product.images?.[0]?.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={rr.order.product.images[0].url}
              alt={rr.order.product.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-2xl">📦</span>
          )}
        </div>
        <div className="min-w-0">
          <div className="truncate font-medium text-body">
            {rr.order.product.title}
          </div>
          <Link
            href={`/operations/orders/${rr.order.id}`}
            className="font-mono text-sm text-primary-600 hover:underline"
          >
            {rr.order.orderNumber}
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm md:grid-cols-2">
        <Field label={t("admin.operations.refundRequests.refundReason")}>
          <StatusBadge
            status={rr.reason}
            config={statusConfig(refundReasonConfig, t)}
          />
        </Field>
        <Field label={t("admin.operations.refundRequests.orderStatus")}>
          <StatusBadge
            status={rr.order.status}
            config={statusConfig(orderStatusConfig, t)}
          />
        </Field>
        <Field label={t("admin.operations.refundRequests.orderAmount")}>
          {fmtTry(rr.order.totalAmount)}
        </Field>
        <Field label={t("admin.operations.refundRequests.refundAmount")}>
          <span className="font-semibold">{fmtTry(rr.amount)}</span>
        </Field>
        <Field label={t("admin.operations.refundRequests.refundQuantity")}>
          <span
            className={isPartialQty ? "font-semibold text-warning-700" : ""}
          >
            {t("admin.operations.refundRequests.quantityOfTotal", {
              refund: refundQty,
              total: orderQty,
            })}
            {isPartialQty &&
              t("admin.operations.refundRequests.partialRefundSuffix")}
          </span>
        </Field>
        {unitPrice != null && (
          <Field label={t("admin.operations.refundRequests.unitPrice")}>
            {fmtTry(unitPrice)}
          </Field>
        )}
      </div>

      {isPartialQty && unitPrice != null && (
        <div className="space-y-1 rounded-lg border border-warning-200 bg-warning-50 p-3 text-sm">
          <div className="font-medium text-warning-800">
            {t("admin.operations.refundRequests.partialBreakdownTitle")}
          </div>
          <div className="flex justify-between text-warning-900">
            <span>
              {t("admin.operations.refundRequests.partialRefundedLine", {
                qty: refundQty,
                price: fmtTry(unitPrice),
              })}
            </span>
            <span className="font-semibold">
              {fmtTry(unitPrice * refundQty)}
            </span>
          </div>
          <div className="flex justify-between text-muted">
            <span>
              {t("admin.operations.refundRequests.partialRemainingLine", {
                qty: orderQty - refundQty,
                price: fmtTry(unitPrice),
              })}
            </span>
            <span>{fmtTry(unitPrice * (orderQty - refundQty))}</span>
          </div>
          <p className="pt-1 text-xs text-warning-700">
            {t("admin.operations.refundRequests.partialExplain", {
              total: orderQty,
              refund: refundQty,
              remaining: orderQty - refundQty,
            })}
          </p>
        </div>
      )}

      {rr.description && (
        <div className="text-sm">
          <span className="font-medium text-body">
            {t("admin.operations.refundRequests.buyerDescription")}
          </span>
          <p className="mt-1 whitespace-pre-wrap text-muted">
            {rr.description}
          </p>
        </div>
      )}

      {rr.evidencePhotoUrls && rr.evidencePhotoUrls.length > 0 && (
        <div>
          <span className="mb-2 block font-medium text-body">
            {t("admin.operations.refundRequests.evidencePhotos")}
          </span>
          <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
            {rr.evidencePhotoUrls.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={t("admin.operations.refundRequests.evidenceAlt", {
                    index: i + 1,
                  })}
                  className="h-24 w-full rounded border border-border object-cover transition-opacity hover:opacity-90"
                />
              </a>
            ))}
          </div>
        </div>
      )}
    </SectionCard>
  );
}
