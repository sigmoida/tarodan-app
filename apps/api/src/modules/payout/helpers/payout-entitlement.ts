/**
 * Satıcının hakediş tutarına dair saf kurallar — payout üretimi, transfer
 * öncesi yeniden doğrulama, iade-void yeniden kuyruğa alma ve hesap silmede
 * "hâlâ ödenecek para var mı" denetimi AYNI tanımları okur.
 */

/** Tutar eşiği: bu değerin altındaki net ödeme "sıfır" kabul edilir (kuruş artıkları). */
export const PAYOUT_MIN_NET = 0.01;

/**
 * Hold tamamen iade edildiği için transfer edilmeden kapatılan payout'un
 * gerekçesi. Kalıcıdır: satıcıya ödenecek bir şey kalmamıştır.
 */
export const PAYOUT_FAILURE_FULLY_REFUNDED = "fully_refunded";

/**
 * Satıcının bir hold üzerinden hak ettiği GÜNCEL net tutar: escrow'a giren
 * tutar eksi o hold'dan iade edilmiş kısım. Payout oluşturma ve transfer
 * öncesi yeniden doğrulama AYNI bu formülü kullanır (tek kaynak) — aksi halde
 * kısmi iade sonrası satırda kalan bayat `netAmount` transfer edilebilir.
 */
export function entitledNetFromHold(hold: {
  amount: unknown;
  refundedAmount?: unknown;
}): number {
  return Number(hold.amount) - Number(hold.refundedAmount ?? 0);
}
