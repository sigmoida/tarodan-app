-- CreateEnum
CREATE TYPE "BusinessStatus" AS ENUM ('pending', 'approved', 'rejected');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "business_status" "BusinessStatus";
