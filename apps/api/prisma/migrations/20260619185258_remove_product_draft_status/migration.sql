-- AlterEnum: `draft` değerini ProductStatus'tan kaldır.
-- draft hiçbir gerçek uygulama akışıyla oluşmaz (ürün oluşturma -> pending).
-- Mevcut (demo/legacy) draft ürünlerini, enum değeri kaldırılmadan ÖNCE inactive'e
-- çeviriyoruz; aksi halde "status"::"ProductStatus_new" dönüşümü patlar.
BEGIN;
UPDATE "products" SET "status" = 'inactive' WHERE "status" = 'draft';
CREATE TYPE "ProductStatus_new" AS ENUM ('pending', 'active', 'reserved', 'sold', 'inactive', 'rejected', 'deleted');
ALTER TABLE "products" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "products" ALTER COLUMN "status" TYPE "ProductStatus_new" USING ("status"::text::"ProductStatus_new");
ALTER TYPE "ProductStatus" RENAME TO "ProductStatus_old";
ALTER TYPE "ProductStatus_new" RENAME TO "ProductStatus";
DROP TYPE "ProductStatus_old";
ALTER TABLE "products" ALTER COLUMN "status" SET DEFAULT 'pending';
COMMIT;
