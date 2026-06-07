-- CreateEnum
CREATE TYPE "BoostStatus" AS ENUM ('pending', 'active', 'expired', 'cancelled', 'failed');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "boosted_until" TIMESTAMP(3),
ADD COLUMN     "quality_score" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rank_tier" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "product_boosts" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "duration_days" INTEGER NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "status" "BoostStatus" NOT NULL DEFAULT 'pending',
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "order_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_boosts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_boosts_order_id_key" ON "product_boosts"("order_id");

-- CreateIndex
CREATE INDEX "product_boosts_product_id_idx" ON "product_boosts"("product_id");

-- CreateIndex
CREATE INDEX "product_boosts_user_id_idx" ON "product_boosts"("user_id");

-- CreateIndex
CREATE INDEX "product_boosts_status_ends_at_idx" ON "product_boosts"("status", "ends_at");

-- CreateIndex
CREATE INDEX "products_rank_tier_quality_score_created_at_idx" ON "products"("rank_tier" DESC, "quality_score" DESC, "created_at" DESC);

-- CreateIndex
CREATE INDEX "products_boosted_until_idx" ON "products"("boosted_until");

-- AddForeignKey
ALTER TABLE "product_boosts" ADD CONSTRAINT "product_boosts_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
