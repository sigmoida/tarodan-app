-- DropForeignKey
ALTER TABLE "trade_shipments" DROP CONSTRAINT "trade_shipments_from_address_id_fkey";

-- AlterTable
ALTER TABLE "trade_shipments" ALTER COLUMN "from_address_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "trade_shipments" ADD CONSTRAINT "trade_shipments_from_address_id_fkey" FOREIGN KEY ("from_address_id") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
