/**
 * Ödeme formu hazırlanırken mesafeli satış onayı kapısının kararı — saf
 * fonksiyon, tek kural.
 *
 *   - `record`   : istemci bu adımda onay verdi ve hedefin (sepet / sipariş)
 *                  henüz kaydı yok → kaydet, devam et.
 *   - `proceed`  : hedefin kaydı zaten var (checkout'ta alındı ya da önceki
 *                  bir ödeme denemesinde) → ikinci satır yazma, devam et.
 *   - `reject`   : kayıt yok, onay da gelmedi ve platform onayı ZORUNLU
 *                  kılıyor → ödeme başlamaz.
 *   - `unrecorded`: kayıt yok, onay gelmedi, zorunluluk KAPALI → eski mobil
 *                  sürümler ödeme yapabilsin diye devam edilir; satır yazılmaz.
 *
 * Kayıt varken gelen yeni onay ikinci satır üretmez: aynı sepete yapılan her
 * ödeme denemesi (yeniden deneme, çift tıklama) kanıtı çoğaltmamalı.
 */
export type DistanceSalesGateDecision =
  "record" | "proceed" | "reject" | "unrecorded";

export function distanceSalesGateDecision(input: {
  hasRecord: boolean;
  accepted: boolean;
  required: boolean;
}): DistanceSalesGateDecision {
  if (input.hasRecord) return "proceed";
  if (input.accepted) return "record";
  return input.required ? "reject" : "unrecorded";
}
