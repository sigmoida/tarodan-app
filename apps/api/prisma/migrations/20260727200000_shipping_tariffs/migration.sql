-- CreateEnum
CREATE TYPE "ShippingTariffStatus" AS ENUM ('draft', 'active', 'archived');

-- CreateTable
CREATE TABLE "shipping_tariffs" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'surat',
    "name" TEXT NOT NULL,
    "status" "ShippingTariffStatus" NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "outbound_package_fee" DECIMAL(10,2) NOT NULL,
    "free_shipping_enabled" BOOLEAN NOT NULL DEFAULT true,
    "free_shipping_threshold" DECIMAL(10,2) NOT NULL,
    "return_package_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "trade_leg_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipping_tariffs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shipping_tariffs_provider_version_key" ON "shipping_tariffs"("provider", "version");

-- CreateIndex
CREATE INDEX "shipping_tariffs_provider_status_idx" ON "shipping_tariffs"("provider", "status");

-- Enforce a single ACTIVE tariff per provider at the DB level (guards atomic activation).
CREATE UNIQUE INDEX "shipping_tariffs_provider_active_key" ON "shipping_tariffs"("provider") WHERE "status" = 'active';

-- Seed the first active Surat tariff from the current hardcoded defaults
-- (shipping_base_cost=29.99, free_shipping_threshold=500) so pricing is unchanged at cutover.
INSERT INTO "shipping_tariffs" (
  "id", "provider", "name", "status", "version", "currency",
  "outbound_package_fee", "free_shipping_enabled", "free_shipping_threshold",
  "return_package_fee", "trade_leg_fee", "effective_from", "created_at", "updated_at"
) VALUES (
  gen_random_uuid(), 'surat', 'Surat Kargo - v1', 'active', 1, 'TRY',
  29.99, true, 500, 29.99, 29.99, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);
