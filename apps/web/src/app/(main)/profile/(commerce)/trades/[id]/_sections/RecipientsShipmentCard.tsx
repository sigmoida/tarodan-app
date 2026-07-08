/** @format */

import { TruckIcon, CheckCircleIcon } from "@heroicons/react/24/outline";
import { Button, Spinner } from "@tarodan/ui";
import type { Trade, TradeShipment } from "../_lib/types";

interface RecipientsShipmentCardProps {
  trade: Trade;
  userId?: string;
  locale: string;
  myFromWarehouseShipment?: TradeShipment;
  otherFromWarehouseShipment?: TradeShipment;
  onConfirmReceipt: () => void;
  isActionLoading: boolean;
}

export default function RecipientsShipmentCard({
  trade,
  userId,
  locale,
  myFromWarehouseShipment,
  otherFromWarehouseShipment,
  onConfirmReceipt,
  isActionLoading,
}: RecipientsShipmentCardProps) {
  if (
    trade.status !== "shipping_to_recipients" ||
    !userId ||
    (userId !== trade.initiatorId && userId !== trade.receiverId)
  ) {
    return null;
  }

  return (
    <div className="card p-6 mb-6 bg-info-50 border-info-200">
      <h2 className="text-lg font-semibold text-heading mb-4">
        {locale === "en" ? "Your Shipment is on the Way" : "Kargonuz Yolda"}
      </h2>

      {myFromWarehouseShipment ? (
        <div className="p-4 bg-surface-elevated rounded-lg border border-info-200 mb-4">
          <p className="text-sm text-muted mb-1">
            {locale === "en" ? "Shipped to you" : "Size gönderilen kargo"}
          </p>
          <p className="font-medium text-heading">
            {myFromWarehouseShipment.carrier === "surat"
              ? "Sürat Kargo"
              : myFromWarehouseShipment.carrier || "—"}
            {myFromWarehouseShipment.trackingNumber
              ? ` · ${myFromWarehouseShipment.trackingNumber}`
              : ""}
          </p>
          {myFromWarehouseShipment.carrier === "surat" &&
            myFromWarehouseShipment.trackingNumber && (
              <a
                href={`https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=${encodeURIComponent(myFromWarehouseShipment.trackingNumber)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-2 text-sm text-primary-600 hover:text-primary-700 font-medium"
              >
                <TruckIcon className="w-4 h-4" />
                {locale === "en" ? "Track on Sürat" : "Sürat'ta Takip Et"}
              </a>
            )}
        </div>
      ) : (
        <div className="p-4 bg-surface-elevated rounded-lg border border-info-200 mb-4">
          <p className="text-sm text-muted">
            {locale === "en"
              ? "Tracking info will be available shortly."
              : "Takip bilgileri kısa süre içinde görünecek."}
          </p>
        </div>
      )}

      {otherFromWarehouseShipment && (
        <div className="p-3 bg-surface-elevated/70 rounded-lg border border-info-100 mb-4 text-sm text-muted">
          <p className="font-medium text-body mb-0.5">
            {locale === "en"
              ? "Other party's shipment"
              : "Karşı tarafın kargosu"}
          </p>
          <p>
            {otherFromWarehouseShipment.carrier === "surat"
              ? "Sürat Kargo"
              : otherFromWarehouseShipment.carrier || "—"}
            {otherFromWarehouseShipment.trackingNumber
              ? ` · ${otherFromWarehouseShipment.trackingNumber}`
              : ""}
          </p>
        </div>
      )}

      <Button
        variant="success"
        size="lg"
        className="w-full flex items-center justify-center gap-2"
        onClick={onConfirmReceipt}
        disabled={
          isActionLoading || myFromWarehouseShipment?.status !== "delivered"
        }
      >
        {isActionLoading ? (
          <>
            <Spinner
              size="sm"
              color="border-surface-elevated border-t-transparent"
            />
            {locale === "en" ? "Processing..." : "İşleniyor..."}
          </>
        ) : (
          <>
            <CheckCircleIcon className="w-5 h-5" />
            {locale === "en" ? "I Received It" : "Teslim Aldım"}
          </>
        )}
      </Button>
      {myFromWarehouseShipment?.status !== "delivered" && (
        <p className="text-xs text-muted mt-2 text-center">
          {locale === "en"
            ? "Waiting for the carrier to mark the shipment as delivered."
            : "Kargonun teslim edildiği bilgisi bekleniyor."}
        </p>
      )}
    </div>
  );
}
