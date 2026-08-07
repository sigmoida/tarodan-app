/** @format */

"use client";

import toast from "react-hot-toast";
import {
  TruckIcon,
  ClipboardDocumentIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import { Alert, Button } from "@tarodan/ui";
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
  const displayTrackingCode =
    refund.returnProviderTrackingId ?? refund.returnTrackingNumber;

  return (
    <Alert
      variant="default"
      icon={<InformationCircleIcon className="h-5 w-5 text-muted" />}
      title={
        isBuyer
          ? t("refund.return.yourShipment")
          : t("refund.return.incomingShipment")
      }
    >
      {copy && <p className="mb-3 text-body">{t(copy[side])}</p>}

      {displayTrackingCode ? (
        <>
          <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-alt p-4">
            <span className="break-all font-mono text-lg font-bold text-heading">
              {displayTrackingCode}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(displayTrackingCode);
                toast.success(t("common.copiedShort"));
              }}
            >
              <ClipboardDocumentIcon className="h-4 w-4" />
              {t("common.copy")}
            </Button>
          </div>
          {refund.returnProvider === "surat" &&
            !refund.returnProviderTrackingId && (
              <p className="mb-2 text-xs text-muted">
                {t("order.trackingAppearsAfterDropoff")}
              </p>
            )}
          {refund.returnProvider === "surat" &&
            refund.returnProviderTrackingId && (
              <Button asChild variant="link" size="sm">
                <a
                  href={`https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=${encodeURIComponent(
                    refund.returnProviderTrackingId,
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
        <p className="text-muted">{t("refund.trackingGenerating")}</p>
      )}
    </Alert>
  );
}
