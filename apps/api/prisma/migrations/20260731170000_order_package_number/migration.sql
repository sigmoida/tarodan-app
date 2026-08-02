-- Koli (OrderPackage) artık KENDİ kalıcı numarasına sahip: PKG-XXXXXXXXXX.
-- Önceden paketin Sürat referansı (OzelKargoTakipNo) paketin en küçük
-- orderNumber'ından TÜRETİLİYORDU; türetilmiş referans paketin sipariş kümesi
-- değişince kayıyor, idempotency cache'ini ıskalıyor ve MÜKERRER fiziksel
-- gönderi açabiliyordu. Saklanan numara bu hata sınıfını kapatır.

ALTER TABLE "order_packages" ADD COLUMN "package_number" TEXT;

-- Mevcut satırlar: referansın Sürat'ta bilinen değerle AYNI kalması için paketin
-- en küçük order_number gövdesi PKG önekiyle korunur (ORD-K7X9 → PKG-K7X9).
-- Siparişsiz paket kalırsa id'den deterministik bir gövde türetilir.
UPDATE "order_packages" p
SET "package_number" = 'PKG-' || COALESCE(
  (
    SELECT SUBSTRING(o."order_number" FROM POSITION('-' IN o."order_number") + 1)
    FROM "orders" o
    WHERE o."package_id" = p."id"
    ORDER BY o."order_number" ASC
    LIMIT 1
  ),
  UPPER(SUBSTRING(REPLACE(p."id"::text, '-', '') FROM 1 FOR 10))
)
WHERE "package_number" IS NULL;

ALTER TABLE "order_packages" ALTER COLUMN "package_number" SET NOT NULL;

CREATE UNIQUE INDEX "order_packages_package_number_key" ON "order_packages"("package_number");
