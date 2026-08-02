-- Gönderi satırı KOLİ'ye bağlanır: bir OrderPackage = bir fiziksel gönderi, ama
-- kayıt hâlâ sipariş başınadır (iade/escrow/muhasebe sipariş bazlı). Aynı
-- package_id'yi paylaşan satırlar aynı koliyi temsil eder → Sürat koli başına
-- BİR kez sorgulanır ve taşıyıcı webhook'u tüm kardeş satırlara yayılır.

ALTER TABLE "shipments" ADD COLUMN "package_id" TEXT;

UPDATE "shipments" s
SET "package_id" = o."package_id"
FROM "orders" o
WHERE o."id" = s."order_id" AND o."package_id" IS NOT NULL;

CREATE INDEX "shipments_package_id_idx" ON "shipments"("package_id");

ALTER TABLE "shipments" ADD CONSTRAINT "shipments_package_id_fkey"
  FOREIGN KEY ("package_id") REFERENCES "order_packages"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
