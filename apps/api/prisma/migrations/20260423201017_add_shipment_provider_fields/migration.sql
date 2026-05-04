-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ShipmentStatus" ADD VALUE 'at_delivery_branch';
ALTER TYPE "ShipmentStatus" ADD VALUE 'return_in_progress';
ALTER TYPE "ShipmentStatus" ADD VALUE 'cancelled';

-- AlterTable
ALTER TABLE "shipments" ADD COLUMN     "provider_raw_status" TEXT,
ADD COLUMN     "provider_status_code" INTEGER,
ADD COLUMN     "provider_tracking_id" TEXT,
ADD COLUMN     "received_by" TEXT,
ADD COLUMN     "return_reason" TEXT;
