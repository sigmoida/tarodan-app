-- Kurumsal satıcının ürün faturası hatırlatması.
--
-- Ürün faturasını kesmek SATICININ yükümlülüğüdür ve platformda elle yüklenir.
-- Yüklenip yüklenmediğini hiçbir şey takip etmiyordu: satıcı unutursa alıcı
-- faturasını hiç alamıyor, platform da denetimde "kaç siparişte fatura
-- düzenlendi" sorusuna cevap veremiyordu.
--
-- Bu kolon hatırlatmanın gönderildiği anı tutar (sipariş başına TEK) — teslimden
-- sonra faturası hâlâ yüklenmemiş siparişleri tarayan cron bunu işaretler.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "seller_invoice_reminder_at" TIMESTAMP(3);

-- Tarama, teslim edilmiş ve henüz hatırlatılmamış siparişleri arar.
CREATE INDEX IF NOT EXISTS "orders_seller_invoice_reminder_at_idx"
  ON "orders" ("seller_invoice_reminder_at");
