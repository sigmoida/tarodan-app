-- Takas kargo bedeli belgesi. Taraf başına 2 bacaklık kargo tahsil ediliyordu
-- ama hiç faturalanmıyordu — satıştaki kargo payı eksikliğinin takas karşılığı.
--
-- ALTER TYPE ... ADD VALUE, değeri kullanan ifadelerle AYNI transaction'da
-- çalışamaz; bu yüzden kendi migration'ında durur.
ALTER TYPE "ElogoInvoiceType" ADD VALUE IF NOT EXISTS 'trade_shipping';
