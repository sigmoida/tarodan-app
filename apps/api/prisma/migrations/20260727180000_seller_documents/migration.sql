-- CreateEnum
CREATE TYPE "SellerDocumentType" AS ENUM ('tax_plate', 'contract', 'signature_circular', 'activity_certificate', 'identity');

-- CreateEnum
CREATE TYPE "SellerDocumentStatus" AS ENUM ('pending', 'approved', 'rejected');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "company_city" TEXT,
ADD COLUMN     "company_district" TEXT,
ADD COLUMN     "company_type" TEXT,
ADD COLUMN     "tax_office" TEXT;

-- CreateTable
CREATE TABLE "seller_documents" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "document_type" "SellerDocumentType" NOT NULL,
    "s3_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "status" "SellerDocumentStatus" NOT NULL DEFAULT 'pending',
    "review_note" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),

    CONSTRAINT "seller_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "seller_documents_user_id_idx" ON "seller_documents"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "seller_documents_user_id_document_type_key" ON "seller_documents"("user_id", "document_type");

-- AddForeignKey
ALTER TABLE "seller_documents" ADD CONSTRAINT "seller_documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

