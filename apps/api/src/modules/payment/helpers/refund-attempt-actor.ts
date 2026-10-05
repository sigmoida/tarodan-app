import { CancellationActor } from "@prisma/client";
import {
  isAdminCancelReasonCode,
  type AdminCancelReasonCode,
} from "@tarodan/types";
import { refundRequestIdOf } from "../../elogo/helpers/refund-request-key";

/**
 * Bir iade talebini (RefundRequest) başlatabilen taraflar: alıcı (kendi iptal /
 * iade talebi) ya da platform (admin "Siparişi iptal et" — talep yine alıcı
 * adına açılır).
 */
export type RefundRequestActor =
  typeof CancellationActor.buyer | typeof CancellationActor.platform;

/**
 * Talebin kimin adına iptal ettiğinin yazıldığı `RefundRequest.metadata`
 * anahtarı. `requesterId` bunu söyleyemez: platform iptalinde de talep alıcının
 * adınadır (alıcının iade listesi ve e-postaları o alana bakar).
 */
export const REFUND_REQUEST_ACTOR_KEY = "cancellationActor";

/**
 * Talep sonradan (admin onayı, takılı deneme kurtarması) processRefund'a
 * gittiğinde siparişin iptal aktörü — TEK okuma yeri. İşaretsiz (eski ya da
 * alıcı) talep alıcınındır.
 */
export function refundRequestCancelActor(
  metadata: unknown,
): RefundRequestActor {
  const actor =
    metadata && typeof metadata === "object"
      ? (metadata as Record<string, unknown>)[REFUND_REQUEST_ACTOR_KEY]
      : undefined;
  return actor === CancellationActor.platform
    ? CancellationActor.platform
    : CancellationActor.buyer;
}

/**
 * Platform (yönetici) iptalinin katalog nedeni — talebin `metadata`'sında.
 * İptal, talep açıldığı anda değil İADE TAMAMLANINCA kesinleşir; tamamlayan
 * yol (eşzamanlı başarı, admin onayı, takılı deneme kurtarması) kodu buradan
 * okuyup siparişi kapatırken yazar ve platform duyurusunu gönderir.
 */
export const REFUND_REQUEST_ADMIN_REASON_KEY = "adminCancelReasonCode";

/** Talepteki yönetici neden kodu; platform talebi değilse ya da yoksa null. */
export function refundRequestAdminReasonCode(
  metadata: unknown,
): AdminCancelReasonCode | null {
  if (refundRequestCancelActor(metadata) !== CancellationActor.platform) {
    return null;
  }
  const code = (metadata as Record<string, unknown>)[
    REFUND_REQUEST_ADMIN_REASON_KEY
  ];
  return isAdminCancelReasonCode(code) ? code : null;
}

/**
 * Takılı bir iade denemesini kurtaran cron, iade siparişi kapatırsa iptali
 * kimin adına yazacak? Deneme satırı aktörü taşımaz; tek köprü idempotency
 * anahtarıdır.
 *
 * - `refund-request:<id>` → iade talebinden doğdu; aktör talebin
 *   metadata'sından (`refundRequestCancelActor`): alıcı ya da platform.
 * - Diğer her şey (`full-refund:*`, `stock-shortage-refund:*`, yönetici manuel
 *   iadesinin serbest anahtarı) → `system`. Stok ve cron anahtarlarında
 *   sipariş zaten iptaldir ve processRefund önceki aktörü korur; yalnız
 *   yönetici manuel iadesinin kurtarılması aktörü kaybeder (bilinçli kabul:
 *   anahtar serbest metindir, ayırt edilemez).
 *
 * @param requestMetadata Anahtarın gösterdiği talebin metadata'sı (varsa).
 */
export function refundAttemptCancelActor(
  idempotencyKey: string | null | undefined,
  requestMetadata?: unknown,
): CancellationActor {
  return refundRequestIdOf(idempotencyKey)
    ? refundRequestCancelActor(requestMetadata)
    : CancellationActor.system;
}
