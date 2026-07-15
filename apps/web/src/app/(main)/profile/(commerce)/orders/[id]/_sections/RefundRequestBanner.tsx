/** @format */

"use client";

import Link from "next/link";
import toast from "react-hot-toast";
import { ArrowUturnLeftIcon, TruckIcon } from "@heroicons/react/24/outline";
import { Button } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import type { OrderDetail } from "../_lib/types";

export default function RefundRequestBanner({ order }: { order: OrderDetail }) {
  const t = useTranslations();
  const rr = order.activeRefundRequest;
  if (!rr) return null;

  const labelMap: Record<string, string> = {
    pending_review: t("refund.statusPendingReview"),
    approved: t("refund.statusApproved"),
    wait_for_delivery: t("refund.statusWaitForDelivery"),
    return_shipment_open: t("refund.statusReturnShipmentOpen"),
    return_in_transit: t("refund.statusReturnInTransit"),
    return_delivered: t("refund.statusReturnDelivered"),
    refunded: t("refund.statusRefunded"),
    disputed: t("refund.statusDisputed"),
  };

  const isRefunded = rr.status === "refunded";
  const isReturnReady =
    rr.status === "return_shipment_open" && !!rr.returnTrackingNumber;
  const lbl = labelMap[rr.status] ?? rr.status;

  return (
    <div
      className={`rounded-xl shadow-sm p-6 border-2 ${
        isRefunded
          ? "bg-success-50 border-success-200"
          : "bg-info-50 border-info-200"
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2
            className={`text-lg font-semibold flex items-center gap-2 ${
              isRefunded ? "text-success-800" : "text-info-800"
            }`}
          >
            <ArrowUturnLeftIcon className="w-5 h-5" />
            {t("order.refundRequest")}
          </h2>
          <p className="text-sm text-muted mt-1">
            {rr.refundNumber} ·{" "}
            {new Date(rr.createdAt).toLocaleDateString(t("common.dateLocale"))}
          </p>
        </div>
        <span
          className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${
            isRefunded
              ? "bg-success-100 text-success-800 border-success-300"
              : "bg-info-100 text-info-800 border-info-300"
          }`}
        >
          {lbl}
        </span>
      </div>

      {isReturnReady && (
        <div className="bg-surface-elevated rounded-lg p-4 mb-3">
          <p className="text-sm text-body mb-2">
            {order.isBuyer
              ? t("refund.dropOffAtSurat")
              : t("refund.buyerGivenReturnLabel")}
          </p>
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-lg font-bold text-heading break-all">
              {rr.returnTrackingNumber}
            </span>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                navigator.clipboard.writeText(rr.returnTrackingNumber!);
                toast.success(t("common.copiedShort"));
              }}
              className="h-auto p-0 text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              {t("common.copy")}
            </Button>
          </div>
        </div>
      )}

      {rr.returnProvider === "surat" && rr.returnTrackingNumber && (
        <a
          href={`https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=${encodeURIComponent(rr.returnTrackingNumber)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 font-medium mr-4"
        >
          <TruckIcon className="w-4 h-4" />
          {t("order.trackReturn")}
        </a>
      )}

      <Link
        href={`/profile/refund-requests/${rr.id}`}
        className="inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 font-medium"
      >
        {t("common.viewDetails")} →
      </Link>
    </div>
  );
}
