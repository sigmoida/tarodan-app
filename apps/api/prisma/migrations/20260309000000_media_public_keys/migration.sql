-- ProductImage: replace url with cardKey, detailKey (DB reset allowed - truncate first)
TRUNCATE TABLE "product_images";
ALTER TABLE "product_images" DROP COLUMN "url";
ALTER TABLE "product_images" ADD COLUMN "card_key" TEXT NOT NULL;
ALTER TABLE "product_images" ADD COLUMN "detail_key" TEXT NOT NULL;

-- Collection: rename coverImageUrl to coverImageKey
ALTER TABLE "collections" RENAME COLUMN "cover_image_url" TO "cover_image_key";
