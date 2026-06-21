-- Wave 3 — Ödeme bütünlüğü kısıtları (O3/O4/O5).
-- CHECK kısıtları NOT VALID ile eklenir: mevcut satırları DOĞRULAMADAN geçer, yeni/güncellenen
-- satırları zorlar. Böylece prod'da geçmiş kirli veri olsa bile deploy patlamaz. (Dev DB'de
-- ihlal=0 doğrulandı.) Veri temiz olduğu teyit edilince ileride `VALIDATE CONSTRAINT` ile
-- mevcut satırlar da doğrulanabilir.

-- O4: PayoutTransfer.tradeCashPaymentId BENZERSIZ → takas-nakit için çift-payout DB seviyesinde
-- engellenir (uygulama-seviyesi check-then-create TOCTOU açığını kapatır). paymentHoldId zaten
-- @unique idi; trade-cash tarafı eksikti.
CREATE UNIQUE INDEX "payout_transfers_trade_cash_payment_id_key" ON "payout_transfers"("trade_cash_payment_id");

-- O3: Payment TAM OLARAK bir kaynağa bağlı olmalı (orderId XOR checkoutGroupId XOR tradeCashPaymentId).
-- Orphan veya çoklu-dolu satır oluşmasını engeller.
ALTER TABLE "payments" ADD CONSTRAINT "payments_exactly_one_source_check"
  CHECK (
    ( ("order_id" IS NOT NULL)::int
    + ("checkout_group_id" IS NOT NULL)::int
    + ("trade_cash_payment_id" IS NOT NULL)::int ) = 1
  ) NOT VALID;

-- O5: PayoutTransfer.net_amount = amount - commission. netAmount ayrı kaynaktan kopyalandığı
-- için tutarsız yazımı DB seviyesinde yakalar.
ALTER TABLE "payout_transfers" ADD CONSTRAINT "payout_transfers_net_amount_check"
  CHECK ("net_amount" = "amount" - "commission") NOT VALID;
