import { ShipmentStatus } from '@prisma/client';

/**
 * Maps Sürat Kargo KargonunDurumuSayi (1-16) to our ShipmentStatus enum.
 * Based on official Sürat Kargo API documentation (2024).
 *
 * Sürat statuses:
 *  1  = Gönderi Hazırlanıyor
 *  2  = Transfer Merkezinde
 *  3  = Gönderi Yolda
 *  4  = Teslimat Şubesinde
 *  5  = Kurye Dağıtımda
 *  6  = Teslim Edildi
 *  7  = MGT Teslim Edildi
 *  8  = Yönlendirme Sürecinde
 *  9  = İade Sürecinde
 *  10 = İade Gönderi Hazırlanıyor
 *  11 = İade Transfer Merkezinde
 *  12 = İade Teslim Edildi
 *  13 = İade Gönderi Yolda
 *  14 = İade Teslimat Şubesinde
 *  15 = İade Kurye Dağıtımda
 *  16 = İade Yönlendirme Sürecinde
 */
const SURAT_STATUS_MAP: Record<number, ShipmentStatus> = {
  1:  ShipmentStatus.pending,
  2:  ShipmentStatus.in_transit,
  3:  ShipmentStatus.in_transit,
  4:  ShipmentStatus.at_delivery_branch,
  5:  ShipmentStatus.out_for_delivery,
  6:  ShipmentStatus.delivered,
  7:  ShipmentStatus.delivered,
  8:  ShipmentStatus.in_transit,
  9:  ShipmentStatus.return_in_progress,
  10: ShipmentStatus.return_in_progress,
  11: ShipmentStatus.return_in_progress,
  12: ShipmentStatus.returned,
  13: ShipmentStatus.return_in_progress,
  14: ShipmentStatus.return_in_progress,
  15: ShipmentStatus.return_in_progress,
  16: ShipmentStatus.return_in_progress,
};

export function mapSuratStatusToShipmentStatus(
  kargonunDurumuSayi: number,
): ShipmentStatus {
  return SURAT_STATUS_MAP[kargonunDurumuSayi] ?? ShipmentStatus.in_transit;
}

/**
 * Whether a Sürat status indicates the shipment has been successfully delivered.
 */
export function isSuratDelivered(kargonunDurumuSayi: number): boolean {
  return kargonunDurumuSayi === 6 || kargonunDurumuSayi === 7;
}

/**
 * Whether a Sürat status indicates the shipment is in a return flow.
 */
export function isSuratReturnFlow(kargonunDurumuSayi: number): boolean {
  return kargonunDurumuSayi >= 9 && kargonunDurumuSayi <= 16;
}

/**
 * Whether the return has been completed (delivered back to sender).
 */
export function isSuratReturnCompleted(kargonunDurumuSayi: number): boolean {
  return kargonunDurumuSayi === 12;
}
