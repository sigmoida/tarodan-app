/** @format */

import { TruckIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import type { Trade, TradeShipment } from "../_lib/types";

interface ReturnShipmentCardProps {
  trade: Trade;
  myReturnShipment?: TradeShipment;
}

export default function ReturnShipmentCard({
  trade,
  myReturnShipment,
}: ReturnShipmentCardProps) {
  const t = useTranslations();
  if (trade.status !== "returning" || !myReturnShipment) return null;

  return (
    <div className="card p-6 mb-6 bg-warning-50 border-warning-200">
      <h3 className="font-semibold text-warning-900 mb-2">
        {t("trade.returnShipment")}
      </h3>
      <p className="text-sm text-body">
        {myReturnShipment.carrier === "surat"
          ? "Sürat Kargo"
          : myReturnShipment.carrier || "—"}
        {/* L1: Sürat'ta yalnız GERÇEK kod; iç ref şubede geçersiz. */}
        {(() => {
          const code =
            myReturnShipment.cargoCode ??
            (myReturnShipment.carrier !== "surat"
              ? myReturnShipment.trackingNumber
              : null);
          return code ? ` · ${code}` : "";
        })()}
      </p>
      {myReturnShipment.carrier === "surat" && !myReturnShipment.cargoCode && (
        <p className="text-xs text-muted italic mt-1">
          {t("order.cargoCodePending")}
        </p>
      )}
      {myReturnShipment.carrier === "surat" && myReturnShipment.cargoCode && (
        <a
          href={`https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=${encodeURIComponent(myReturnShipment.cargoCode)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 mt-2 text-sm text-primary-600 hover:text-primary-700 font-medium"
        >
          <TruckIcon className="w-4 h-4" />
          {t("order.trackOnSurat")}
        </a>
      )}
    </div>
  );
}
