/**
 * Yürürlükteki mesafeli satış sözleşmesinin sürümü.
 *
 * Alıcının onayı bu sürümle birlikte `CheckoutGroup`'a yazılır: sözleşme metni
 * sonradan güncellense bile hangi metnin kabul edildiği kayıtta kalır. Metin
 * değiştiğinde BURASI da güncellenmelidir — aksi halde yeni metin eski sürüm
 * numarasıyla kabul edilmiş görünür.
 */
export const DISTANCE_SALES_CONTRACT_VERSION = "2026-08-03";

/** Kabul verilmişse damga, verilmemişse null — tek yerden. */
export function distanceSalesConsent(accepted?: boolean): {
  distanceSalesAcceptedAt: Date | null;
  distanceSalesVersion: string | null;
} {
  return accepted
    ? {
        distanceSalesAcceptedAt: new Date(),
        distanceSalesVersion: DISTANCE_SALES_CONTRACT_VERSION,
      }
    : { distanceSalesAcceptedAt: null, distanceSalesVersion: null };
}
