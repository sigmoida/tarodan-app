/** @format */

import SectionCard from "@/components/ui/SectionCard";
import ShipmentStatusChip from "../_components/ShipmentStatusChip";
import type { Trade, TradeShipment } from "../_lib/types";

interface WarehouseShipmentCardProps {
  trade: Trade;
  userId?: string;
  locale: string;
  myToWarehouseShipment?: TradeShipment;
  otherToWarehouseShipment?: TradeShipment;
}

export default function WarehouseShipmentCard({
  trade,
  userId,
  locale,
  myToWarehouseShipment,
  otherToWarehouseShipment,
}: WarehouseShipmentCardProps) {
  if (
    trade.status !== "shipping_to_warehouse" ||
    !userId ||
    (userId !== trade.initiatorId && userId !== trade.receiverId)
  ) {
    return null;
  }

  return (
    <SectionCard
      title={
        locale === "en"
          ? "Shipping to Tarodan Warehouse"
          : "Tarodan Deposuna Gönderim"
      }
      className="mb-6"
    >
      <p className="text-sm text-subtle mb-5">
        {locale === "en"
          ? "The system has issued a Sürat Kargo tracking number for both parties. Take your item to the nearest Sürat branch with the number below."
          : "Sistem her iki tarafa Sürat Kargo takip numarası tahsis etti. Aşağıdaki numara ile en yakın Sürat şubesine giderek ürününüzü teslim edin."}
      </p>
      {/* Tek kart: yalnız kullanıcının kendi gönderisi. Karşı tarafın
         numarası gösterilmez; sadece "kargoya verdi mi" durumu altta
         küçük bir satırla bilgi olarak yazılır. */}
      <div className="border border-border-subtle rounded-lg p-4">
        <p className="text-xs uppercase text-subtle mb-1">
          {locale === "en" ? "Your shipment" : "Sizin gönderiniz"}
        </p>
        <p className="font-mono text-base font-bold text-heading break-all">
          {myToWarehouseShipment?.trackingNumber ?? "—"}
        </p>
        <p className="text-xs text-muted mt-2">
          {locale === "en"
            ? "Take this number to the nearest Sürat Kargo branch and hand in your item."
            : "Bu numarayla Sürat Kargo şubesine gidip ürününüzü teslim edin."}
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
                ✓
                {locale === "en"
                  ? "The other party's shipment has reached the warehouse."
                  : "Karşı tarafın gönderisi de depoya ulaştı."}
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
              <span>
                {locale === "en"
                  ? "The other party's shipment is on the way."
                  : "Karşı tarafın gönderisi yolda."}
              </span>
            );
          }
          if (s === "cancelled") {
            return (
              <span className="text-warning-700">
                {locale === "en"
                  ? "The other party's shipment was cancelled. Admin will follow up."
                  : "Karşı tarafın gönderisi iptal edildi; yetkili ekibimiz devreye girecek."}
              </span>
            );
          }
          if (s === "failed") {
            return (
              <span className="text-warning-700">
                {locale === "en"
                  ? "The other party's shipment failed. Admin will follow up."
                  : "Karşı tarafın gönderisinde bir aksaklık oluştu; yetkili ekibimiz inceliyor."}
              </span>
            );
          }
          if (s === "returned" || s === "return_in_progress") {
            return (
              <span className="text-warning-700">
                {locale === "en"
                  ? "The other party's shipment was returned."
                  : "Karşı tarafın gönderisi iade edildi."}
              </span>
            );
          }
          // pending | label_created | undefined → henüz kargoya verilmedi
          return (
            <span>
              {locale === "en"
                ? "Waiting for the other party to hand in their shipment."
                : "Karşı tarafın kargoya teslim etmesi bekleniyor."}
            </span>
          );
        })()}
      </div>
    </SectionCard>
  );
}
