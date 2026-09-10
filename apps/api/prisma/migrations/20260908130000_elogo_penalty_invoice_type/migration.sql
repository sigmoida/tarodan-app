-- Ceza faturası: kusurlu taraftan tahsil edilen ama ona DAHA ÖNCE faturalanmamış
-- kargo bedeli. Kaynak iade TALEBİdir (refundRequestId), böylece aynı kolinin
-- birden fazla iadesi ayrı ayrı cezalanır.
--
-- ALTER TYPE ... ADD VALUE, değeri kullanan ifadelerle AYNI transaction'da
-- çalışamaz; bu yüzden kendi migration'ında durur.
ALTER TYPE "ElogoInvoiceType" ADD VALUE IF NOT EXISTS 'penalty';
