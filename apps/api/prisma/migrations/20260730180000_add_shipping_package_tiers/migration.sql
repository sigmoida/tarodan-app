-- Satıcı artık desi girmiyor: Küçük/Orta/Büyük paket seçiyor. Desi aralıkları,
-- fiyatlar ve örnek ölçüler tarifede (versiyonlu) admin tarafından yönetilir.
CREATE TYPE "ShippingPackageTierCode" AS ENUM ('small', 'medium', 'large');

CREATE TABLE "shipping_package_tiers" (
  "id" TEXT NOT NULL,
  "tariff_id" TEXT NOT NULL,
  "code" "ShippingPackageTierCode" NOT NULL,
  "label" TEXT NOT NULL,
  "min_desi" INTEGER NOT NULL,
  "max_desi" INTEGER,
  "amount" DECIMAL(10,2) NOT NULL,
  "sample_width" INTEGER,
  "sample_height" INTEGER,
  "sample_length" INTEGER,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "shipping_package_tiers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "shipping_package_tiers_tariff_id_code_key"
  ON "shipping_package_tiers"("tariff_id", "code");
CREATE INDEX "shipping_package_tiers_tariff_id_idx"
  ON "shipping_package_tiers"("tariff_id");

ALTER TABLE "shipping_package_tiers"
  ADD CONSTRAINT "shipping_package_tiers_tariff_id_fkey"
  FOREIGN KEY ("tariff_id") REFERENCES "shipping_tariffs"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Komisyon kuralı başına paket boyutuna göre kargo bölüşümü. Satır yoksa
-- kuralın tek shipping_buyer_share değeri geçerli kalır.
CREATE TABLE "commission_rule_shipping_shares" (
  "id" TEXT NOT NULL,
  "rule_id" TEXT NOT NULL,
  "tier_code" "ShippingPackageTierCode" NOT NULL,
  "buyer_share" DECIMAL(5,2) NOT NULL DEFAULT 100,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "commission_rule_shipping_shares_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "commission_rule_shipping_shares_rule_id_tier_code_key"
  ON "commission_rule_shipping_shares"("rule_id", "tier_code");
CREATE INDEX "commission_rule_shipping_shares_rule_id_idx"
  ON "commission_rule_shipping_shares"("rule_id");

ALTER TABLE "commission_rule_shipping_shares"
  ADD CONSTRAINT "commission_rule_shipping_shares_rule_id_fkey"
  FOREIGN KEY ("rule_id") REFERENCES "commission_rules"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Ürünün paket boyutu. Mevcut ürünler desilerinden eşlenir (≤2 Küçük,
-- 3-5 Orta, 6+ Büyük); shipping_desi kademenin ÜST SINIRINA normalize edilir
-- ki paket desisi toplamı (Σ desi × adet) kademe çözümüyle tutarlı kalsın.
ALTER TABLE "products"
  ADD COLUMN "shipping_package_tier" "ShippingPackageTierCode" NOT NULL DEFAULT 'small';

UPDATE "products"
SET "shipping_package_tier" = CASE
      WHEN "shipping_desi" <= 2 THEN 'small'::"ShippingPackageTierCode"
      WHEN "shipping_desi" <= 5 THEN 'medium'::"ShippingPackageTierCode"
      ELSE 'large'::"ShippingPackageTierCode"
    END,
    "shipping_desi" = CASE
      WHEN "shipping_desi" <= 2 THEN 2
      WHEN "shipping_desi" <= 5 THEN 5
      ELSE 10
    END;

-- Mevcut tarifelerin kademeleri kendi desi satırlarından türetilir: hedef desi
-- için önce bir ÜST satır, yoksa en büyük satır, o da yoksa tarifenin paket
-- ücreti. Eski shippingAmountForDesi bracketing'inin aynısı — böylece hiçbir
-- ortam kademesiz (fiyatsız) aktif tarifeyle kalmaz.
INSERT INTO "shipping_package_tiers" (
  "id", "tariff_id", "code", "label", "min_desi", "max_desi", "amount",
  "sort_order", "updated_at"
)
SELECT
  gen_random_uuid()::text,
  t."id",
  tier."code"::"ShippingPackageTierCode",
  tier."label",
  tier."min_desi",
  tier."max_desi",
  COALESCE(
    (SELECT r."amount" FROM "shipping_tariff_rates" r
      WHERE r."tariff_id" = t."id" AND r."desi" >= tier."target_desi"
      ORDER BY r."desi" ASC LIMIT 1),
    (SELECT r."amount" FROM "shipping_tariff_rates" r
      WHERE r."tariff_id" = t."id"
      ORDER BY r."desi" DESC LIMIT 1),
    t."outbound_package_fee"
  ),
  tier."sort_order",
  CURRENT_TIMESTAMP
FROM "shipping_tariffs" t
CROSS JOIN (
  VALUES
    ('small',  'Küçük Paket', 0, 2,          2,  0),
    ('medium', 'Orta Paket',  2, 5,          5,  1),
    ('large',  'Büyük Paket', 5, NULL::int, 10,  2)
) AS tier("code", "label", "min_desi", "max_desi", "target_desi", "sort_order");
