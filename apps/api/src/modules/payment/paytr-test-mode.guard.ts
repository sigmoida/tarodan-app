/**
 * PayTR bildirim hash'i `merchant_oid + salt + status + total_amount` üzerinden
 * hesaplanır; `test_mode` bu imzanın KAPSAMINDA DEĞİLDİR ve test modunda gerçek
 * para hareketi olmaz. Prod merchant bilgilerini paylaşan bir ortam (ör. yanlış
 * yapılandırılmış bir kopya; `PAYTR_TEST_MODE` tanımsızken varsayılan `true`)
 * gerçek-hash'li bir `test_mode=1` başarı bildirimi üretebilir — `merchant_oid`
 * bekleyen bir prod ödemesiyle eşleşirse sipariş SIFIR gelirle tamamlanır.
 *
 * Olasılık düşük (boot doğrulaması prod'da `PAYTR_TEST_MODE=false` zorlar ve oid
 * çakışması beklenmez) ama savunma ucuz: prod'da test-modu BAŞARI bildirimini
 * reddet. Başarısızlık bildirimleri engellenmez; sipariş temizliği çalışabilsin.
 */
export function isRejectableTestModeSuccess(params: {
  nodeEnv: string | undefined;
  status: string;
  testMode: boolean | undefined;
}): boolean {
  return (
    params.nodeEnv === "production" &&
    params.status === "success" &&
    params.testMode === true
  );
}
