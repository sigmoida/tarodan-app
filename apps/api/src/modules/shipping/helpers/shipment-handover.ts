import { ShipmentStatus } from "@prisma/client";

/**
 * "KARGOYA VERİLDİ" TANIMI — TEK KAYNAK.
 *
 * İptal hakkının bittiği an budur: koli taşıyıcıya fiziksel olarak geçtiyse
 * sipariş artık iptal edilemez, yalnız iade süreci işler. Aynı tanım escrow
 * tarafında da kullanılır (koli yoldayken "satıcı göndermedi" sayıp iptal+iade
 * edersek alıcı hem malı hem parayı alır).
 *
 * İki sinyal birlikte değerlendirilir:
 *   1) HAREKET EDEN durumlar — poller gerçek kargo hareketiyle set eder.
 *   2) `shippedAt` — ilk fiziksel devir mührü. Sürat bilinmeyen bir durum kodu
 *      döndürdüğünde poller statüyü DEĞİŞTİRMEZ ama shippedAt'i yazar
 *      (order-tracking-sync). Yalnız statüye bakan bir kontrol bu durumda koli
 *      fiilen yoldayken iptali kabul ederdi.
 *
 * `pending` / `label_created` HARİÇTİR: barkod/etiket üretilmiş olabilir ama
 * paket henüz taşıyıcıya geçmemiştir (immediate-barcode her ödemede etiket
 * üretir). `cancelled` / `failed` de devir sayılmaz.
 */
export const SHIPMENT_IN_MOTION_STATUSES: readonly ShipmentStatus[] = [
  ShipmentStatus.picked_up,
  ShipmentStatus.in_transit,
  ShipmentStatus.at_delivery_branch,
  ShipmentStatus.out_for_delivery,
  ShipmentStatus.delivered,
  ShipmentStatus.return_in_progress,
  ShipmentStatus.returned,
];

/** Bu kargo satırı taşıyıcıya devredilmiş mi? (kayıt yoksa hayır) */
export function isShipmentHandedToCarrier(
  shipment: { status: ShipmentStatus; shippedAt?: Date | null } | null,
): boolean {
  if (!shipment) return false;
  return (
    SHIPMENT_IN_MOTION_STATUSES.includes(shipment.status) ||
    shipment.shippedAt != null
  );
}

/** İptal kapılarının okuduğu asgari kargo şekli. */
export type HandoverShipmentShape = {
  status: ShipmentStatus;
  shippedAt?: Date | null;
} | null;
