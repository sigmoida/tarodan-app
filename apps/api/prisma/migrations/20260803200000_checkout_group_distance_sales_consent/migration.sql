-- Mesafeli satış sözleşmesi onayının kaydı.
--
-- Alıcı ödeme ekranında sözleşmeyi onaylıyor; onay ihtilafta kanıt olarak
-- isteneceği için zamanı ve o an yürürlükteki sözleşme sürümü sipariş grubuyla
-- birlikte saklanır. Mevcut gruplar için null: geçmişe dönük kabul uydurulmaz.
ALTER TABLE "checkout_groups"
  ADD COLUMN "distance_sales_accepted_at" TIMESTAMP(3),
  ADD COLUMN "distance_sales_version" TEXT;
