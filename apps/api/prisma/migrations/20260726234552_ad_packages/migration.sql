-- AlterTable
ALTER TABLE "products" ADD COLUMN     "boosted_at" TIMESTAMP(3),
ADD COLUMN     "home_showcase_until" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "product_boosts" ADD COLUMN     "package_id" TEXT,
ADD COLUMN     "package_name" TEXT,
ADD COLUMN     "purchased_at" TIMESTAMP(3),
ADD COLUMN     "showcase_on_home" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ad_packages" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "showcase_on_home" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_package_tiers" (
    "id" TEXT NOT NULL,
    "package_id" TEXT NOT NULL,
    "duration_days" INTEGER NOT NULL,
    "min_amount" DECIMAL(12,2) NOT NULL,
    "max_amount" DECIMAL(12,2),
    "price" DECIMAL(10,2) NOT NULL,
    "campaign_price" DECIMAL(10,2),
    "campaign_starts_at" TIMESTAMP(3),
    "campaign_ends_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_package_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ad_packages_slug_key" ON "ad_packages"("slug");

-- CreateIndex
CREATE INDEX "ad_package_tiers_package_id_duration_days_idx" ON "ad_package_tiers"("package_id", "duration_days");

-- CreateIndex
CREATE INDEX "products_boosted_until_boosted_at_idx" ON "products"("boosted_until", "boosted_at" DESC);

-- CreateIndex
CREATE INDEX "products_home_showcase_until_boosted_at_idx" ON "products"("home_showcase_until", "boosted_at" DESC);

-- CreateIndex
CREATE INDEX "product_boosts_package_id_idx" ON "product_boosts"("package_id");

-- AddForeignKey
ALTER TABLE "product_boosts" ADD CONSTRAINT "product_boosts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_boosts" ADD CONSTRAINT "product_boosts_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "ad_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_package_tiers" ADD CONSTRAINT "ad_package_tiers_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "ad_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Seed the two default ad packages + their price tiers (from the launch pricing
-- table). Runs once via `prisma migrate deploy`. Admins edit/extend these after.
INSERT INTO "ad_packages" ("id","name","slug","showcase_on_home","is_active","sort_order","created_at","updated_at") VALUES
  ('a0000000-0000-4000-8000-000000000001','Ekonomik Paket','ekonomik',false,true,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('a0000000-0000-4000-8000-000000000002','Vitrin Paket','vitrin',true,true,2,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

-- Ekonomik: 7d then 30d, tiers 200-999 / 1000-5000 / 5000+
INSERT INTO "ad_package_tiers" ("id","package_id","duration_days","min_amount","max_amount","price","campaign_price","is_active","created_at","updated_at") VALUES
  (gen_random_uuid(),'a0000000-0000-4000-8000-000000000001',7 ,200 ,999 ,150 ,NULL,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'a0000000-0000-4000-8000-000000000001',7 ,1000,5000,250 ,NULL,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'a0000000-0000-4000-8000-000000000001',7 ,5000,NULL,500 ,NULL,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'a0000000-0000-4000-8000-000000000001',30,200 ,999 ,550 ,NULL,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'a0000000-0000-4000-8000-000000000001',30,1000,5000,750 ,NULL,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'a0000000-0000-4000-8000-000000000001',30,5000,NULL,1900,NULL,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

-- Vitrin: 7d then 30d (30d/1000-5000 has a 1750 campaign price)
INSERT INTO "ad_package_tiers" ("id","package_id","duration_days","min_amount","max_amount","price","campaign_price","is_active","created_at","updated_at") VALUES
  (gen_random_uuid(),'a0000000-0000-4000-8000-000000000002',7 ,200 ,999 ,350 ,NULL,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'a0000000-0000-4000-8000-000000000002',7 ,1000,5000,500 ,NULL,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'a0000000-0000-4000-8000-000000000002',7 ,5000,NULL,1000,NULL,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'a0000000-0000-4000-8000-000000000002',30,200 ,999 ,1200,NULL,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'a0000000-0000-4000-8000-000000000002',30,1000,5000,1900,1750,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'a0000000-0000-4000-8000-000000000002',30,5000,NULL,3750,NULL,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
