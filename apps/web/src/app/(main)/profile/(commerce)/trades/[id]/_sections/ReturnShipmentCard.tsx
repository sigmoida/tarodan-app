/** @format */

import { TruckIcon } from "@heroicons/react/24/outline";
import type { Trade, TradeShipment } from "../_lib/types";

interface ReturnShipmentCardProps {
  trade: Trade;
  locale: string;
  myReturnShipment?: TradeShipment;
}

export default function ReturnShipmentCard({
  trade,
  locale,
  myReturnShipment,
}: ReturnShipmentCardProps) {
  if (trade.status !== "returning" || !myReturnShipment) return null;

  return (
    <div className="card p-6 mb-6 bg-warning-50 border-warning-200">
      <h3 className="font-semibold text-warning-900 mb-2 flex items-center gap-2">
        <TruckIcon className="w-5 h-5" />
        {locale === "en" ? "Return Shipment" : "İade Kargosu"}
      </h3>
      <p className="text-sm text-body">
        {myReturnShipment.carrier === "surat"
          ? "Sürat Kargo"
          : myReturnShipment.carrier || "—"}
        {myReturnShipment.trackingNumber
          ? ` · ${myReturnShipment.trackingNumber}`
          : ""}
      </p>
      {myReturnShipment.carrier === "surat" &&
        myReturnShipment.trackingNumber && (
          <a
            href={`https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=${encodeURIComponent(myReturnShipment.trackingNumber)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 mt-2 text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            <TruckIcon className="w-4 h-4" />
            {locale === "en" ? "Track on Sürat" : "Sürat'ta Takip Et"}
          </a>
        )}
    </div>
  );
}
