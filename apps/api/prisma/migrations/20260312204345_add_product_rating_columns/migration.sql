-- DropIndex
DROP INDEX "products_status_category_idx";

-- DropIndex
DROP INDEX "products_status_price_idx";

-- DropIndex
DROP INDEX "products_title_trgm_idx";

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "average_rating" DECIMAL(3,2),
ADD COLUMN     "rating_count" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "products_average_rating_rating_count_idx" ON "products"("average_rating" DESC, "rating_count" DESC);
