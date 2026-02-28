/*
  Warnings:

  - You are about to drop the column `minio_key` on the `product_images` table. All the data in the column will be lost.
  - You are about to drop the column `last_login_ip` on the `users` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "advertisements" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "product_images" DROP COLUMN "minio_key";

-- AlterTable
ALTER TABLE "scheduled_notifications" ALTER COLUMN "channels" DROP DEFAULT;

-- AlterTable
ALTER TABLE "shipping_zones" ALTER COLUMN "countries" DROP DEFAULT,
ALTER COLUMN "regions" DROP DEFAULT,
ALTER COLUMN "cities" DROP DEFAULT;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "last_login_ip";
