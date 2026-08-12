-- Kusursuz tarafa TAM iade. Takas bir tarafın kusuru olmadan bozulduğunda
-- (karşı taraf ödemedi/kargolamadı, karşı tarafın ürünü depo kontrolünden
-- geçmedi, koli kayboldu, karşı taraf vazgeçti) o tarafın ödemesi hizmet bedeli
-- ve kargo dahil tam iade edilir. Karar ödeme satırına yazılır: iade sağlayıcıda
-- patlayıp retry cron'una düşse bile aynı tutar yeniden hesaplanır.
--
-- Geçmiş satırlar false kalır: kapanmış takaslarda o günkü politika uygulandı.
ALTER TABLE "trade_cash_payments"
  ADD COLUMN "full_refund_entitled" BOOLEAN NOT NULL DEFAULT false;
