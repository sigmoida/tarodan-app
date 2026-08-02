/**
 * Gecikmiş "failed" bildirimi ESKİ bir `merchant_oid`'e ait ve o ödeme için hâlâ
 * canlı bir çekim (3DS) sürüyorsa fail'i ERTELE.
 *
 * Retry, oid'i döndürür ama ödeme satırını yeniden kullanır ve callback eşlemesi
 * eski oid'leri `merchantOidHistory` üzerinden de bulur. Bu yüzden attempt-1'in
 * gecikmiş failed bildirimi, attempt-2 3DS'i uçarken ödemeyi `failed` yapıp
 * siparişi iptal ediyordu; ardından attempt-2'nin başarı bildirimi geldiğinde CAS
 * `failed` gördüğü için fulfillment atlanıyor ve alıcı parası çekilmiş halde
 * manuel iade kuyruğuna düşüyordu. `confirmFailedFromClient` ve reconcile cron'ları
 * zaten aynı canlı-çekim guard'ını uyguluyor; eksik olan tek yol bu.
 *
 * Güncel oid'e ait fail bildirimi ERTELENMEZ — o gerçekten aktif denemenin
 * sonucudur ve ertelemek siparişi gereksiz yere askıda bırakır.
 */
export function shouldDeferSupersededOidFailure(params: {
  callbackOid: string;
  currentOid: string | null | undefined;
  chargeLive: boolean;
}): boolean {
  if (!params.currentOid) return false;
  return params.chargeLive && params.callbackOid !== params.currentOid;
}
