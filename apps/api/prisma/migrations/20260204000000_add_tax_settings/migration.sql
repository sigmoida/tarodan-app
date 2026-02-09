-- CreateEnum
CREATE TYPE "TaxRuleScope" AS ENUM ('default_rate', 'category', 'product');

-- CreateTable
CREATE TABLE "tax_regions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "region_code" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_rates" (
    "id" TEXT NOT NULL,
    "tax_region_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rate" DECIMAL(5,2) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "effective_from" DATE,
    "effective_to" DATE,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_rules" (
    "id" TEXT NOT NULL,
    "tax_region_id" TEXT NOT NULL,
    "tax_rate_id" TEXT NOT NULL,
    "scope" "TaxRuleScope" NOT NULL DEFAULT 'default_rate',
    "category_id" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tax_regions_country_code_region_code_key" ON "tax_regions"("country_code", "region_code");

-- CreateIndex
CREATE INDEX "tax_regions_country_code_idx" ON "tax_regions"("country_code");

-- CreateIndex
CREATE INDEX "tax_regions_is_active_idx" ON "tax_regions"("is_active");

-- CreateIndex
CREATE INDEX "tax_rates_tax_region_id_idx" ON "tax_rates"("tax_region_id");

-- CreateIndex
CREATE INDEX "tax_rates_is_active_idx" ON "tax_rates"("is_active");

-- CreateIndex
CREATE INDEX "tax_rules_tax_region_id_idx" ON "tax_rules"("tax_region_id");

-- CreateIndex
CREATE INDEX "tax_rules_tax_rate_id_idx" ON "tax_rules"("tax_rate_id");

-- CreateIndex
CREATE INDEX "tax_rules_category_id_idx" ON "tax_rules"("category_id");

-- CreateIndex
CREATE INDEX "tax_rules_is_active_idx" ON "tax_rules"("is_active");

-- AddForeignKey
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_tax_region_id_fkey" FOREIGN KEY ("tax_region_id") REFERENCES "tax_regions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_rules" ADD CONSTRAINT "tax_rules_tax_region_id_fkey" FOREIGN KEY ("tax_region_id") REFERENCES "tax_regions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_rules" ADD CONSTRAINT "tax_rules_tax_rate_id_fkey" FOREIGN KEY ("tax_rate_id") REFERENCES "tax_rates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_rules" ADD CONSTRAINT "tax_rules_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
