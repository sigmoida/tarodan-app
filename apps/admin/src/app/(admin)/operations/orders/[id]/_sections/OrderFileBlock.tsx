"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ChevronRightIcon,
  PrinterIcon,
  TruckIcon,
} from "@heroicons/react/24/outline";
import {
  Badge,
  Button,
  StatusBadge,
  paymentHoldStatusConfig,
  refundRequestStatusConfig,
} from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { SectionCard } from "@/components/detail/SectionCard";
import { DataList, Field } from "@/components/detail/DataList";
import { fmtDate, fmtDateTime, fmtTry } from "@/lib/format";
import { useSession } from "@/context/SessionContext";
import {
  canManuallyUpdateOrderStatus,
  getOrderStatusInfo,
} from "../_lib/status";
import { printOrderInvoice } from "../_lib/printInvoice";
import { activeRefundOf, type OrderFileEntry } from "../_lib/fileTypes";
import { StatusUpdateModal } from "../_modals/StatusUpdateModal";
import { AddTrackingModal } from "../_modals/AddTrackingModal";

/**
 * Grup dosyasında TEK siparişin tam bölümü: statü + tarihler, ürün, tam finansal
 * kırılım (stopaj/KDV dahil), GERÇEK escrow hold'u, iade talepleri, komisyon
 * defteri ve sipariş-başına admin aksiyonları. Ayrı sipariş detay ekranı yoktur —
 * her şey burada, grup çatısının altında.
 */
export function OrderFileBlock({ entry }: { entry: OrderFileEntry }) {
  const t = useTranslations();
  const { user } = useSession();
  const [statusOpen, setStatusOpen] = useState(false);
  const [trackingOpen, setTrackingOpen] = useState(false);
  const canManage = user.role === "super_admin" || user.role === "admin";

  const status = getOrderStatusInfo(
    { ...entry, activeRefundRequest: activeRefundOf(entry) },
    t,
  );
  const f = entry.finance;

  return (
    <SectionCard
      title={
        <span className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-base">#{entry.orderNumber}</span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${status.color} ${status.bg}`}
          >
            {status.label}
          </span>
        </span>
      }
      actions={
        <div className="flex flex-wrap gap-2">
          {canManage && canManuallyUpdateOrderStatus(entry.status) && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setStatusOpen(true)}
            >
              {t("admin.operations.orders.updateStatus")}
            </Button>
          )}
          {canManage && entry.status === "preparing" && (
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<TruckIcon className="h-4 w-4" />}
              onClick={() => setTrackingOpen(true)}
            >
              {t("admin.operations.orders.addTracking")}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<PrinterIcon className="h-4 w-4" />}
            onClick={() => printOrderInvoice(entry.id, t)}
          >
            {t("admin.operations.orders.printInvoice")}
          </Button>
        </div>
      }
    >
      {/* Ürün satırı */}
      <div className="flex items-start gap-4">
        {entry.product.imageUrl && (
          <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-surface-alt">
            <Image
              src={entry.product.imageUrl}
              alt={entry.product.title ?? ""}
              fill
              sizes="56px"
              className="object-cover"
            />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <Link
            href={`/catalog/products/${entry.product.id}`}
            className="font-medium text-heading hover:text-primary-600"
          >
            {entry.product.title ?? entry.product.id}
          </Link>
          <p className="text-sm text-muted">
            {t("admin.operations.orders.file.quantity")}: {entry.quantity}
            {entry.unitPrice != null && (
              <>
                {" "}
                · {t("admin.operations.orders.file.unitPrice")}:{" "}
                {fmtTry(entry.unitPrice)}
              </>
            )}
          </p>
          <p className="mt-0.5 text-xs text-subtle">
            {fmtDateTime(entry.createdAt)}
            {entry.deliveredAt && (
              <>
                {" · "}
                {t("admin.operations.orders.file.deliveredAt")}:{" "}
                {fmtDate(entry.deliveredAt)}
              </>
            )}
            {entry.confirmationDeadline && !entry.completedAt && (
              <>
                {" · "}
                {t("admin.operations.orders.file.confirmationDeadline")}:{" "}
                {fmtDate(entry.confirmationDeadline)}
              </>
            )}
          </p>
        </div>
        <p className="flex-shrink-0 text-base font-semibold text-heading">
          {fmtTry(f.totalAmount)}
        </p>
      </div>

      {/* Finansal kırılım — stopaj ve KDV dahil, admin kurallarının izi */}
      <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-1 border-t border-border pt-4 text-sm sm:grid-cols-2">
        <FinRow label={t("admin.operations.orders.financial.subtotal")}>
          {fmtTry(f.subtotal)}
        </FinRow>
        {f.discountAmount > 0 && (
          <FinRow
            label={t("admin.operations.orders.financial.discount", {
              code: f.discountCode ? ` (${f.discountCode})` : "",
            })}
          >
            <span className="text-danger-600">−{fmtTry(f.discountAmount)}</span>
          </FinRow>
        )}
        <FinRow label={t("admin.operations.orders.file.shippingBuyer")}>
          {fmtTry(f.buyerShippingAmount)}
        </FinRow>
        <FinRow label={t("admin.operations.orders.file.shippingSeller")}>
          {fmtTry(f.sellerShippingAmount)}
        </FinRow>
        <FinRow label={t("admin.operations.orders.financial.buyerFee")}>
          {fmtTry(f.buyerFeeAmount)}
        </FinRow>
        <FinRow label={t("admin.operations.orders.financial.sellerFee")}>
          {fmtTry(f.sellerFeeAmount)}
        </FinRow>
        {f.taxAmount > 0 && (
          <FinRow label={t("admin.operations.orders.file.vat")}>
            {fmtTry(f.taxAmount)}
          </FinRow>
        )}
        {f.withholdingTaxAmount > 0 && (
          <FinRow label={t("admin.operations.orders.file.withholding")}>
            {fmtTry(f.withholdingTaxAmount)}
          </FinRow>
        )}
        <FinRow label={t("admin.operations.orders.financial.commission")}>
          {fmtTry(f.commissionAmount)}
        </FinRow>
        <FinRow label={t("admin.operations.orders.financial.buyerTotal")}>
          <span className="font-semibold">{fmtTry(f.totalAmount)}</span>
        </FinRow>
        <FinRow label={t("admin.operations.orders.financial.sellerNet")}>
          <span className="font-medium text-success-600">
            {fmtTry(f.sellerNetAmount)}
          </span>
        </FinRow>
        {entry.ledger && (
          <FinRow label={t("admin.operations.orders.file.ledgerTitle")}>
            {t(
              `admin.operations.orders.file.ledgerStatus.${entry.ledger.status}` as Parameters<
                typeof t
              >[0],
            )}
          </FinRow>
        )}
      </div>

      {/* Escrow — TAHMİN değil gerçek hold kaydı; aksiyon Satıcı Ödemelerinde */}
      <div className="mt-4 rounded-lg bg-surface-alt p-4 text-sm">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="font-medium text-heading">
            {t("admin.operations.orders.escrow.title")}
          </p>
          {entry.escrow && (
            <Badge
              status={entry.escrow.status}
              config={paymentHoldStatusConfig}
            />
          )}
        </div>
        {entry.escrow ? (
          <DataList columns={2}>
            <Field label={t("admin.operations.orders.file.escrowAmount")}>
              {fmtTry(entry.escrow.amount)}
            </Field>
            {entry.escrow.refundedAmount > 0 && (
              <Field label={t("admin.operations.orders.file.escrowRefunded")}>
                <span className="text-danger-600">
                  −{fmtTry(entry.escrow.refundedAmount)}
                </span>
              </Field>
            )}
            {entry.escrow.releasedAt ? (
              <Field label={t("admin.operations.orders.file.escrowReleased")}>
                {fmtDateTime(entry.escrow.releasedAt)}
              </Field>
            ) : (
              <Field label={t("admin.operations.orders.file.escrowRelease")}>
                {entry.escrow.releaseAt
                  ? fmtDateTime(entry.escrow.releaseAt)
                  : "—"}
              </Field>
            )}
          </DataList>
        ) : (
          <p className="text-muted">
            {t("admin.operations.orders.file.escrowNone")}
          </p>
        )}
        {entry.escrow?.frozenByRefundId && (
          <p className="mt-2 text-xs font-medium text-danger-600">
            {t("admin.operations.orders.file.escrowFrozen")}
          </p>
        )}
        {entry.escrow && (
          <Button asChild variant="ghost" size="sm" className="mt-2">
            <Link href="/finance/payouts?tab=escrow">
              {t("admin.operations.orders.file.openPayouts")}
              <ChevronRightIcon className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        )}
      </div>

      {/* İade talepleri — K5: artık detayda da görünür ve talebe link verir */}
      {entry.refundRequests.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-sm font-medium text-heading">
            {t("admin.operations.orders.file.refundsTitle")}
          </p>
          <div className="space-y-2">
            {entry.refundRequests.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono">{r.refundNumber}</span>
                  <StatusBadge
                    status={r.status}
                    config={refundRequestStatusConfig}
                    size="sm"
                  />
                  <span className="text-muted">
                    {t("admin.operations.orders.file.refundQty", {
                      count: r.refundQuantity,
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{fmtTry(r.amount)}</span>
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/operations/refund-requests/${r.id}`}>
                      {t("admin.operations.orders.file.openRefund")}
                      <ChevronRightIcon className="ml-1 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {entry.cancelReason && (
        <p className="mt-3 text-xs text-muted">
          {t("admin.operations.orders.banners.cancelReason", {
            reason: entry.cancelReason,
          })}
        </p>
      )}

      <StatusUpdateModal
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
        orderId={entry.id}
        currentStatus={entry.status}
      />
      <AddTrackingModal
        open={trackingOpen}
        onClose={() => setTrackingOpen(false)}
        orderId={entry.id}
      />
    </SectionCard>
  );
}

function FinRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted">{label}</span>
      <span>{children}</span>
    </div>
  );
}
