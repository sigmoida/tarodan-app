/*
  Warnings:

  - You are about to drop the `shipping_carriers` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `shipping_methods` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `shipping_rates` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `shipping_zones` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "shipping_rates" DROP CONSTRAINT "shipping_rates_carrier_id_fkey";

-- DropForeignKey
ALTER TABLE "shipping_rates" DROP CONSTRAINT "shipping_rates_method_id_fkey";

-- DropForeignKey
ALTER TABLE "shipping_rates" DROP CONSTRAINT "shipping_rates_zone_id_fkey";

-- DropTable
DROP TABLE "shipping_carriers";

-- DropTable
DROP TABLE "shipping_methods";

-- DropTable
DROP TABLE "shipping_rates";

-- DropTable
DROP TABLE "shipping_zones";
