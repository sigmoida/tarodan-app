/** @format */

"use client";

import { Link } from "@/i18n/navigation";
import toast from "react-hot-toast";
import {
  ArrowUturnLeftIcon,
  ChevronRightIcon,
  TruckIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@tarodan/ui";
import { ButtonLink } from "@/components/ui";
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
    <div className="rounded-xl shadow-sm p-6 border border-border bg-surface-alt">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2 text-heading">
            <ArrowUturnLeftIcon className="w-5 h-5" />
            {t("order.refundRequest")}
          </h2>
          <p className="text-sm text-muted mt-1">
            {rr.refundNumber} ·{" "}
            {new Date(rr.createdAt).toLocaleDateString(t("common.dateLocale"))}
          </p>
        </div>
        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border bg-surface text-body border-border">
          {lbl}
        </span>
      </div>

      {isReturnReady &&
        (() => {
          // L1: Sürat iadesinde yalnız GERÇEK kodu göster — returnTrackingNumber
          // iç referanstır (refundNumber), şubede geçersiz. Manuel iade akışında
          // ise trackingNumber referansın kendisidir.
          const returnRef =
            rr.returnProvider === "surat"
              ? rr.returnCargoCode
              : (rr.returnCargoCode ?? rr.returnTrackingNumber);
          return (
            <div className="bg-surface-elevated rounded-lg p-4 mb-3">
              <p className="text-sm text-body mb-2">
                {order.isBuyer
                  ? t("refund.dropOffAtSurat")
                  : t("refund.buyerGivenReturnLabel")}
              </p>
              {returnRef ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-lg font-bold text-heading break-all">
                    {returnRef}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      navigator.clipboard.writeText(returnRef);
                      toast.success(t("common.copiedShort"));
                    }}
                    className="h-auto p-0 text-sm text-primary-600 hover:text-primary-700 font-medium"
                  >
                    {t("common.copy")}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted italic">
                  {t("order.cargoCodePending")}
                </p>
              )}
            </div>
          );
        })()}

      {rr.returnProvider === "surat" && rr.returnCargoCode && (
        <a
          href={`https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=${encodeURIComponent(rr.returnCargoCode)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 font-medium mr-4"
        >
          <TruckIcon className="w-4 h-4" />
          {t("order.trackReturn")}
        </a>
      )}

      <ButtonLink
        href={`/profile/refund-requests/${rr.id}`}
        variant="outline"
        size="sm"
        className="gap-1"
      >
        {t("common.viewDetails")}
        <ChevronRightIcon className="h-4 w-4" />
      </ButtonLink>
    </div>
  );
}
