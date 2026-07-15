/** @format */

"use client";

import toast from "react-hot-toast";
import { TruckIcon, ClipboardDocumentIcon } from "@heroicons/react/24/outline";
import { Button } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import type { MessageKey } from "@tarodan/i18n";
import type { RefundRequest } from "../../_lib/types";

const TRANSIT_COPY: Record<string, { buyer: MessageKey; seller: MessageKey }> =
  {
    return_shipment_open: {
      buyer: "refund.transit.returnShipmentOpen.buyer",
      seller: "refund.transit.returnShipmentOpen.seller",
    },
    return_in_transit: {
      buyer: "refund.transit.returnInTransit.buyer",
      seller: "refund.transit.returnInTransit.seller",
    },
    return_delivered: {
      buyer: "refund.transit.returnDelivered.buyer",
      seller: "refund.transit.returnDelivered.seller",
    },
  };

/** Return-shipment card — the most important card during the return phase. */
export default function ReturnShipmentCard({
  refund,
  isBuyer,
}: {
  refund: RefundRequest;
  isBuyer: boolean;
}) {
  const t = useTranslations();
  const copy = TRANSIT_COPY[refund.status];
  const side = isBuyer ? "buyer" : "seller";

  return (
    <div className="rounded-lg border-2 border-info-200 bg-info-50 p-5">
      <h2 className="mb-3 text-base font-semibold text-info-900">
        {isBuyer
          ? t("refund.return.yourShipment")
          : t("refund.return.incomingShipment")}
      </h2>

      {copy && <p className="mb-3 text-sm text-info-900">{t(copy[side])}</p>}

      {refund.returnTrackingNumber ? (
        <>
          <div className="mb-3 flex items-center justify-between gap-3 rounded-lg bg-surface-elevated p-4">
            <span className="break-all font-mono text-lg font-bold text-heading">
              {refund.returnTrackingNumber}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(refund.returnTrackingNumber!);
                toast.success(t("common.copiedShort"));
              }}
            >
              <ClipboardDocumentIcon className="h-4 w-4" />
              {t("common.copy")}
            </Button>
          </div>
          {refund.returnProvider === "surat" && (
            <Button asChild variant="link" size="sm">
              <a
                href={`https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=${encodeURIComponent(
                  refund.returnTrackingNumber,
                )}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <TruckIcon className="h-4 w-4" />
                {t("order.trackOnSurat")}
              </a>
            </Button>
          )}
        </>
      ) : (
        <p className="text-sm text-info-700">
          {t("refund.trackingGenerating")}
        </p>
      )}
    </div>
  );
}
