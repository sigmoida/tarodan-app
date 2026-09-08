/**
 * PayTR bildirim hash'i `merchant_oid + salt + status + total_amount` üzerinden
 * hesaplanır; `test_mode` bu imzanın KAPSAMINDA DEĞİLDİR ve test modunda gerçek
 * para hareketi olmaz. Prod merchant bilgilerini paylaşan bir ortam (ör. yanlış
 * yapılandırılmış bir kopya; `PAYTR_TEST_MODE` tanımsızken varsayılan `true`)
 * gerçek-hash'li bir `test_mode=1` başarı bildirimi üretebilir — `merchant_oid`
 * bekleyen bir prod ödemesiyle eşleşirse sipariş SIFIR gelirle tamamlanır.
 *
 * Kural prod'da simetriktir: bildirimin test-modu bayrağı ödemenin kendi
 * şeridiyle (`Payment.isTest`, DB trigger damgası) EŞLEŞMEK zorundadır.
 *   - canlı ödeme + test_mode=1 başarı → ret (sıfır gelirle kapanmasın)
 *   - test şeridi ödemesi + test_mode=0 başarı → ret (test hattı gerçek para
 *     taşımasın; form zaten test_mode=1 ile açılır, uyuşmazlık sahtecilik/
 *     yanlış yapılandırma işaretidir)
 * Başarısızlık bildirimleri engellenmez; sipariş temizliği çalışabilsin.
 * `test_mode` bildirimde yoksa (undefined) mevcut davranış korunur.
 */
export function isRejectableTestModeSuccess(params: {
  nodeEnv: string | undefined;
  status: string;
  testMode: boolean | undefined;
  /** Ödemenin şeridi; bilinmiyorsa (eski çağıranlar) canlı varsayılır. */
  paymentIsTest?: boolean;
}): boolean {
  if (params.nodeEnv !== "production") return false;
  if (params.status !== "success") return false;
  if (params.testMode === undefined) return false;
  return params.testMode !== (params.paymentIsTest ?? false);
}
