-- AlterTable
ALTER TABLE "discounts" ADD COLUMN     "is_batch" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "discount_codes" (
    "id" TEXT NOT NULL,
    "discount_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "is_redeemed" BOOLEAN NOT NULL DEFAULT false,
    "redeemed_by_id" TEXT,
    "redeemed_at" TIMESTAMP(3),
    "order_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discount_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "discount_codes_code_key" ON "discount_codes"("code");

-- CreateIndex
CREATE INDEX "discount_codes_discount_id_idx" ON "discount_codes"("discount_id");

-- CreateIndex
CREATE INDEX "discount_codes_is_redeemed_idx" ON "discount_codes"("is_redeemed");

-- AddForeignKey
ALTER TABLE "discount_codes" ADD CONSTRAINT "discount_codes_discount_id_fkey" FOREIGN KEY ("discount_id") REFERENCES "discounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

