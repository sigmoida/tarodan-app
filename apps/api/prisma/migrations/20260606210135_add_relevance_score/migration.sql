-- AlterTable
ALTER TABLE "products" ADD COLUMN     "relevance_score" INTEGER;

-- CreateIndex
CREATE INDEX "products_relevance_score_idx" ON "products"("relevance_score" DESC);
