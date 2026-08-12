-- Boost sistem duraklatması: ürün yayından düşünce satın alınan süre görünmez
-- akmasın — cron boost'u duraklatır (kalan süre saklanır) ve ürün yayına
-- dönünce sürdürür. Admin'in elle duraklattığı boost'lardan bayrakla ayrışır.
ALTER TABLE "product_boosts"
  ADD COLUMN "paused_by_system" BOOLEAN NOT NULL DEFAULT false;
