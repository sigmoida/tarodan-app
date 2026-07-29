/** @format */

import {
  TruckIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { Alert } from "@tarodan/ui";
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
    <Alert
      variant="warning"
      icon={<ExclamationTriangleIcon className="h-5 w-5 text-warning-600" />}
      title={t("trade.returnShipment")}
      className="mb-6"
    >
      <p className="text-body">
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
        <p className="mt-1 text-xs italic text-muted">
          {t("order.cargoCodePending")}
        </p>
      )}
      {myReturnShipment.carrier === "surat" && myReturnShipment.cargoCode && (
        <a
          href={`https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=${encodeURIComponent(myReturnShipment.cargoCode)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-700"
        >
          <TruckIcon className="h-4 w-4" />
          {t("order.trackOnSurat")}
        </a>
      )}
    </Alert>
  );
}
