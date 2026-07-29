ALTER TABLE "products"
ADD COLUMN "shipping_desi" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "order_packages"
ADD COLUMN "billable_desi" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "shipping_pricing_snapshot" JSONB;

CREATE TABLE "shipping_tariff_rates" (
    "id" TEXT NOT NULL,
    "tariff_id" TEXT NOT NULL,
    "desi" INTEGER NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipping_tariff_rates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shipping_tariff_rates_desi_positive" CHECK ("desi" > 0),
    CONSTRAINT "shipping_tariff_rates_amount_nonnegative" CHECK ("amount" >= 0)
);

CREATE UNIQUE INDEX "shipping_tariff_rates_tariff_id_desi_key"
ON "shipping_tariff_rates"("tariff_id", "desi");

CREATE INDEX "shipping_tariff_rates_tariff_id_idx"
ON "shipping_tariff_rates"("tariff_id");

-- Existing tariffs become an exact 1-desi tariff. This keeps legacy products
-- purchasable while every other desi fails closed until admin configuration.
INSERT INTO "shipping_tariff_rates" (
    "id",
    "tariff_id",
    "desi",
    "amount",
    "updated_at"
)
SELECT
    CONCAT("id", '-desi-1'),
    "id",
    1,
    "outbound_package_fee",
    CURRENT_TIMESTAMP
FROM "shipping_tariffs";

ALTER TABLE "shipping_tariff_rates"
ADD CONSTRAINT "shipping_tariff_rates_tariff_id_fkey"
FOREIGN KEY ("tariff_id") REFERENCES "shipping_tariffs"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "products"
ADD CONSTRAINT "products_shipping_desi_positive" CHECK ("shipping_desi" > 0);

ALTER TABLE "order_packages"
ADD CONSTRAINT "order_packages_billable_desi_positive" CHECK ("billable_desi" > 0);
