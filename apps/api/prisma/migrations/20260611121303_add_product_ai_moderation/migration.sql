-- AlterTable
ALTER TABLE "products" ADD COLUMN     "ai_check_labels" JSONB,
ADD COLUMN     "ai_check_reason" TEXT,
ADD COLUMN     "ai_check_status" TEXT,
ADD COLUMN     "ai_checked_at" TIMESTAMP(3),
ADD COLUMN     "ai_nsfw_score" DOUBLE PRECISION,
ADD COLUMN     "ai_relevance_score" DOUBLE PRECISION;
