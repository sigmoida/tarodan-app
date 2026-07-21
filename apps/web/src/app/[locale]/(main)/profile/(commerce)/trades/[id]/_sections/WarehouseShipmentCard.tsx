/** @format */

import { useTranslations } from "next-intl";
import SectionCard from "@/components/ui/SectionCard";
import ShipmentStatusChip from "../_components/ShipmentStatusChip";
import type { Trade, TradeShipment } from "../_lib/types";

interface WarehouseShipmentCardProps {
  trade: Trade;
  userId?: string;
  myToWarehouseShipment?: TradeShipment;
  otherToWarehouseShipment?: TradeShipment;
}

export default function WarehouseShipmentCard({
  trade,
  userId,
  myToWarehouseShipment,
  otherToWarehouseShipment,
}: WarehouseShipmentCardProps) {
  const t = useTranslations();
  if (
    trade.status !== "shipping_to_warehouse" ||
    !userId ||
    (userId !== trade.initiatorId && userId !== trade.receiverId)
  ) {
    return null;
  }

  return (
    <SectionCard title={t("trade.warehouseShipping.title")} className="mb-6">
      <p className="text-sm text-subtle mb-5">
        {t("trade.warehouseShipping.subtitle")}
      </p>
      {/* Tek kart: yalnız kullanıcının kendi gönderisi. Karşı tarafın
         numarası gösterilmez; sadece "kargoya verdi mi" durumu altta
         küçük bir satırla bilgi olarak yazılır. */}
      <div className="border border-border-subtle rounded-lg p-4">
        <p className="text-xs uppercase text-subtle mb-1">
          {t("trade.warehouseShipping.yourShipment")}
        </p>
        <p className="font-mono text-base font-bold text-heading break-all">
          {myToWarehouseShipment?.cargoCode ??
            myToWarehouseShipment?.trackingNumber ??
            "—"}
        </p>
        <p className="text-xs text-muted mt-2">
          {t("trade.warehouseShipping.handIn")}
        </p>
        <div className="mt-3">
          <ShipmentStatusChip status={myToWarehouseShipment?.status} />
        </div>
      </div>

      {/* Karşı tarafın durumu — numara YOK, sadece tek satırlık ipucu.
         ShipmentStatus enum'undaki tüm değerleri açıkça karşıla; aksi
         hâlde cancelled/failed/returned gibi terminal durumlar yanlış
         "bekleniyor" mesajına düşer. */}
      <div className="mt-3 flex items-center gap-2 text-sm text-subtle">
        {(() => {
          const s = otherToWarehouseShipment?.status;
          if (s === "delivered") {
            return (
              <span className="inline-flex items-center gap-2 text-success-700">
                {t("trade.warehouseShipping.counterpartyDelivered")}
              </span>
            );
          }
          if (
            s === "picked_up" ||
            s === "in_transit" ||
            s === "at_delivery_branch" ||
            s === "out_for_delivery"
          ) {
            return (
              <span>{t("trade.warehouseShipping.counterpartyInTransit")}</span>
            );
          }
          if (s === "cancelled") {
            return (
              <span className="text-warning-700">
                {t("trade.warehouseShipping.counterpartyCancelled")}
              </span>
            );
          }
          if (s === "failed") {
            return (
              <span className="text-warning-700">
                {t("trade.warehouseShipping.counterpartyFailed")}
              </span>
            );
          }
          if (s === "returned" || s === "return_in_progress") {
            return (
              <span className="text-warning-700">
                {t("trade.warehouseShipping.counterpartyReturned")}
              </span>
            );
          }
          // pending | label_created | undefined → henüz kargoya verilmedi
          return (
            <span>{t("trade.warehouseShipping.counterpartyWaiting")}</span>
          );
        })()}
      </div>
    </SectionCard>
  );
}
