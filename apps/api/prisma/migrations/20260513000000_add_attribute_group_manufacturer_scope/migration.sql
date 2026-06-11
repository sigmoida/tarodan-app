-- AlterTable
ALTER TABLE "attribute_groups" ADD COLUMN "manufacturer_slug" TEXT;

-- CreateIndex
CREATE INDEX "attribute_groups_manufacturer_slug_idx" ON "attribute_groups"("manufacturer_slug");
