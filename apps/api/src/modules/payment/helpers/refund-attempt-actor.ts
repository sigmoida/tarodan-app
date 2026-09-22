import { CancellationActor } from "@prisma/client";
import { refundRequestIdOf } from "../../elogo/helpers/refund-request-key";

/**
 * Takılı bir iade denemesini kurtaran cron, iade siparişi kapatırsa iptali
 * kimin adına yazacak? Deneme satırı aktörü taşımaz; tek köprü idempotency
 * anahtarıdır.
 *
 * - `refund-request:<id>` → iade talebinden doğdu; talebi yalnız alıcı açabilir
 *   (bkz. RefundCreationService — requesterId = buyerId kapısı) → `buyer`.
 * - Diğer her şey (`full-refund:*`, `stock-shortage-refund:*`, yönetici manuel
 *   iadesinin serbest anahtarı) → `system`. Stok ve cron anahtarlarında
 *   sipariş zaten iptaldir ve processRefund önceki aktörü korur; yalnız
 *   yönetici manuel iadesinin kurtarılması aktörü kaybeder (bilinçli kabul:
 *   anahtar serbest metindir, ayırt edilemez).
 */
export function refundAttemptCancelActor(
  idempotencyKey: string | null | undefined,
): CancellationActor {
  return refundRequestIdOf(idempotencyKey)
    ? CancellationActor.buyer
    : CancellationActor.system;
}
