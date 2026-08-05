CREATE TYPE "ProductImportBatchStatus" AS ENUM ('processing', 'completed', 'failed');

CREATE TABLE "product_import_batches" (
    "id" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "source_filename" TEXT NOT NULL,
    "request_fingerprint" TEXT NOT NULL,
    "status" "ProductImportBatchStatus" NOT NULL DEFAULT 'processing',
    "result" JSONB,
    "error_messages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "product_import_batches_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "product_import_batches_admin_id_created_at_idx"
ON "product_import_batches"("admin_id", "created_at");

CREATE INDEX "product_import_batches_seller_id_created_at_idx"
ON "product_import_batches"("seller_id", "created_at");

CREATE INDEX "product_import_batches_status_created_at_idx"
ON "product_import_batches"("status", "created_at");
