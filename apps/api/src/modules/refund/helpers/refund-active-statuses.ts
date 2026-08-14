import { RefundRequestStatus } from "@prisma/client";

/**
 * Bir siparişte "aktif" (parayı bağlayan, henüz sonuçlanmamış) iade talebi
 * durumları. Aynı sipariş için bu durumlarda EN FAZLA BİR talep olabilir.
 *
 * Tek kaynak: uygulama guard'ı, kısmi tekil indeks (migration
 * `20260730140000_unique_active_refund_request_per_order`) ve buna bakan testler
 * aynı listeyi kullanır. Liste ile SQL ayrışırsa eşzamanlı iki talep yarışı
 * yeniden açılır (iki Sürat iade kargosu + kümülatif tavana takılıp sonsuz retry
 * eden ikinci talep).
 */
export const ACTIVE_REFUND_REQUEST_STATUSES: RefundRequestStatus[] = [
  RefundRequestStatus.pending_review,
  RefundRequestStatus.approved,
  RefundRequestStatus.wait_for_delivery,
  RefundRequestStatus.return_shipment_open,
  RefundRequestStatus.return_in_transit,
  RefundRequestStatus.return_delivered,
  RefundRequestStatus.disputed,
];
