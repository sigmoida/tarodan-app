import { ShipmentStatus } from "@prisma/client";
import {
  SHIPMENT_IN_MOTION_STATUSES as SHARED_SHIPMENT_IN_MOTION_STATUSES,
  isShipmentHandedToCarrier as sharedIsShipmentHandedToCarrier,
} from "@tarodan/types";

/**
 * "KARGOYA VERİLDİ" TANIMI — tanımın kendisi `@tarodan/types`'ta
 * (order-cancellation.ts) yaşar: admin paneli iptal aksiyonunu AYNI kuralla
 * gösterir/gizler, API ile ayrışamaz. Bu dosya API tarafının Prisma tipli
 * giriş kapısıdır; mevcut çağıranlar import yolunu değiştirmedi.
 *
 * İptal hakkının bittiği an budur: koli taşıyıcıya fiziksel olarak geçtiyse
 * sipariş artık iptal edilemez, yalnız iade süreci işler. Aynı tanım escrow
 * tarafında da kullanılır (koli yoldayken "satıcı göndermedi" sayıp iptal+iade
 * edersek alıcı hem malı hem parayı alır). `pending` / `label_created`
 * devir sayılmaz; `shippedAt` mührü tek başına devirdir.
 */
export const SHIPMENT_IN_MOTION_STATUSES: readonly ShipmentStatus[] =
  SHARED_SHIPMENT_IN_MOTION_STATUSES;

/** İptal kapılarının okuduğu asgari kargo şekli. */
export type HandoverShipmentShape = {
  status: ShipmentStatus;
  shippedAt?: Date | null;
} | null;

/** Bu kargo satırı taşıyıcıya devredilmiş mi? (kayıt yoksa hayır) */
export function isShipmentHandedToCarrier(
  shipment: HandoverShipmentShape,
): boolean {
  return sharedIsShipmentHandedToCarrier(shipment);
}
