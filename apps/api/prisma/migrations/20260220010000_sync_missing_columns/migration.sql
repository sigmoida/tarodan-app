-- Products: add missing columns
ALTER TABLE "products" ADD COLUMN "brand_id" TEXT;
ALTER TABLE "products" ADD COLUMN "car_model_id" TEXT;
ALTER TABLE "products" ADD COLUMN "bundle_size" INTEGER;
ALTER TABLE "products" ADD COLUMN "edition_number" TEXT;
ALTER TABLE "products" ADD COLUMN "edition_total" INTEGER;
ALTER TABLE "products" ADD COLUMN "is_limited" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "products" ADD COLUMN "is_preorder" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "products" ADD COLUMN "is_set" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "products" ADD COLUMN "release_date" TIMESTAMP(3);

-- Brands: add missing columns
ALTER TABLE "brands" ADD COLUMN "country" TEXT;
ALTER TABLE "brands" ADD COLUMN "founded_year" INTEGER;

-- Collections: add missing columns
ALTER TABLE "collections" ADD COLUMN "is_featured" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "collections" ADD COLUMN "category_id" TEXT;

-- User memberships: add missing columns
ALTER TABLE "user_memberships" ADD COLUMN "auto_renew" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_memberships" ADD COLUMN "payment_method_id" TEXT;

-- Discounts: add missing columns
ALTER TABLE "discounts" ADD COLUMN "buy_quantity" INTEGER;
ALTER TABLE "discounts" ADD COLUMN "get_quantity" INTEGER;
ALTER TABLE "discounts" ADD COLUMN "is_flash_sale" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "discounts" ADD COLUMN "min_quantity" INTEGER NOT NULL DEFAULT 1;

-- Foreign keys
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_car_model_id_fkey" FOREIGN KEY ("car_model_id") REFERENCES "car_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "collections" ADD CONSTRAINT "collections_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
