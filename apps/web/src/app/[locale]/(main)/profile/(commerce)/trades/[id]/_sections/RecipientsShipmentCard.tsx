/** @format */

import { TruckIcon, CheckCircleIcon } from "@heroicons/react/24/outline";
import { Button, Spinner } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import type { Trade, TradeShipment } from "../_lib/types";

interface RecipientsShipmentCardProps {
  trade: Trade;
  userId?: string;
  myFromWarehouseShipment?: TradeShipment;
  otherFromWarehouseShipment?: TradeShipment;
  onConfirmReceipt: () => void;
  isActionLoading: boolean;
}

export default function RecipientsShipmentCard({
  trade,
  userId,
  myFromWarehouseShipment,
  otherFromWarehouseShipment,
  onConfirmReceipt,
  isActionLoading,
}: RecipientsShipmentCardProps) {
  const t = useTranslations();
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
        {t("trade.shipmentOnWay")}
      </h2>

      {myFromWarehouseShipment ? (
        <div className="p-4 bg-surface-elevated rounded-lg border border-info-200 mb-4">
          <p className="text-sm text-muted mb-1">{t("trade.shippedToYou")}</p>
          <p className="font-medium text-heading">
            {myFromWarehouseShipment.carrier === "surat"
              ? "Sürat Kargo"
              : myFromWarehouseShipment.carrier || "—"}
            {/* L1: Sürat'ta yalnız GERÇEK kod göster (iç ref şubede geçersiz);
               manuel taşıyıcıda trackingNumber referanstır. */}
            {(() => {
              const code =
                myFromWarehouseShipment.cargoCode ??
                (myFromWarehouseShipment.carrier !== "surat"
                  ? myFromWarehouseShipment.trackingNumber
                  : null);
              return code ? ` · ${code}` : "";
            })()}
          </p>
          {myFromWarehouseShipment.carrier === "surat" &&
            !myFromWarehouseShipment.cargoCode && (
              <p className="text-xs text-muted italic mt-1">
                {t("order.cargoCodePending")}
              </p>
            )}
          {myFromWarehouseShipment.carrier === "surat" &&
            myFromWarehouseShipment.cargoCode && (
              <a
                href={`https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=${encodeURIComponent(myFromWarehouseShipment.cargoCode)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-2 text-sm text-primary-600 hover:text-primary-700 font-medium"
              >
                <TruckIcon className="w-4 h-4" />
                {t("order.trackOnSurat")}
              </a>
            )}
        </div>
      ) : (
        <div className="p-4 bg-surface-elevated rounded-lg border border-info-200 mb-4">
          <p className="text-sm text-muted">{t("trade.trackingSoon")}</p>
        </div>
      )}

      {otherFromWarehouseShipment && (
        <div className="p-3 bg-surface-elevated/70 rounded-lg border border-info-100 mb-4 text-sm text-muted">
          <p className="font-medium text-body mb-0.5">
            {t("trade.otherPartyShipment")}
          </p>
          <p>
            {otherFromWarehouseShipment.carrier === "surat"
              ? "Sürat Kargo"
              : otherFromWarehouseShipment.carrier || "—"}
            {(() => {
              const code =
                otherFromWarehouseShipment.cargoCode ??
                (otherFromWarehouseShipment.carrier !== "surat"
                  ? otherFromWarehouseShipment.trackingNumber
                  : null);
              return code ? ` · ${code}` : "";
            })()}
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
            {t("checkout.processing")}
          </>
        ) : (
          <>
            <CheckCircleIcon className="w-5 h-5" />
            {t("trade.iReceivedIt")}
          </>
        )}
      </Button>
      {myFromWarehouseShipment?.status !== "delivered" && (
        <p className="text-xs text-muted mt-2 text-center">
          {t("trade.confirmReceipt.waitingDelivered")}
        </p>
      )}
    </div>
  );
}
