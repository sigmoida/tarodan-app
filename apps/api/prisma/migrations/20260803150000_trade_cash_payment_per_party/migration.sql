-- Takas ödemesi artık TARAF BAŞINA bir satır.
--
-- v1'de takas başına en fazla bir ödeme vardı (yalnız nakit farkını ödeyen
-- taraf), bu yüzden benzersizlik `trade_id` üzerindeydi. v2'de HER İKİ taraf
-- kendi hizmet bedelini + kargosunu öder → aynı takasta iki satır olur ve depo
-- süreci ancak ikisi de `completed` olunca başlar.
--
-- Benzersizlik (trade_id, payer_id) çiftine taşınır: bir taraf aynı takasta
-- ikinci bir ödeme satırı açamaz (çift tahsilat DB seviyesinde engellenir),
-- ama karşı taraf kendi satırını açabilir.
--
-- Mevcut satırlar tek başlarına bu kısıtı zaten sağlar (takas başına tek satır,
-- dolayısıyla payer_id ile birlikte de benzersiz) — veri dönüşümü gerekmez.

DROP INDEX IF EXISTS "trade_cash_payments_trade_id_key";

CREATE UNIQUE INDEX "trade_cash_payments_trade_id_payer_id_key"
  ON "trade_cash_payments"("trade_id", "payer_id");

CREATE INDEX "trade_cash_payments_trade_id_idx"
  ON "trade_cash_payments"("trade_id");
