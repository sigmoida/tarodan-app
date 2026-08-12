-- İndirim modeli: hedef kalem + hedef kitle + bütçe tavanı.
--
-- Cep kuralı: `product_price` yalnız satıcının, kalan altı bedel yalnız
-- platformun kalemidir. Varsayılan `product_price` seçilmiştir; mevcut bütün
-- indirimler bugünkü davranışlarını (ürün fiyatından inme) aynen sürdürür.

CREATE TYPE "DiscountTarget" AS ENUM (
  'product_price',
  'buyer_commission',
  'buyer_service_fee',
  'buyer_shipping',
  'seller_commission',
  'seller_platform_fee',
  'seller_shipping'
);

CREATE TYPE "DiscountAudience" AS ENUM (
  'everyone',
  'membership_tiers',
  'specific_buyers',
  'specific_sellers',
  'all_buyers',
  'all_sellers'
);

ALTER TABLE "discounts"
  ADD COLUMN "target" "DiscountTarget" NOT NULL DEFAULT 'product_price',
  ADD COLUMN "audience" "DiscountAudience" NOT NULL DEFAULT 'everyone',
  ADD COLUMN "budget_limit" DECIMAL(12,2),
  ADD COLUMN "budget_spent" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "budget_stopped_at" TIMESTAMP(3);

CREATE INDEX "discounts_target_idx" ON "discounts"("target");
CREATE INDEX "discounts_audience_idx" ON "discounts"("audience");

CREATE TABLE "discount_target_tiers" (
  "discount_id" TEXT NOT NULL,
  "tier_type" "MembershipTierType" NOT NULL,
  CONSTRAINT "discount_target_tiers_pkey" PRIMARY KEY ("discount_id", "tier_type")
);
CREATE INDEX "discount_target_tiers_tier_type_idx" ON "discount_target_tiers"("tier_type");
ALTER TABLE "discount_target_tiers"
  ADD CONSTRAINT "discount_target_tiers_discount_id_fkey"
  FOREIGN KEY ("discount_id") REFERENCES "discounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "discount_target_users" (
  "discount_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  CONSTRAINT "discount_target_users_pkey" PRIMARY KEY ("discount_id", "user_id")
);
CREATE INDEX "discount_target_users_user_id_idx" ON "discount_target_users"("user_id");
ALTER TABLE "discount_target_users"
  ADD CONSTRAINT "discount_target_users_discount_id_fkey"
  FOREIGN KEY ("discount_id") REFERENCES "discounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "discount_target_users"
  ADD CONSTRAINT "discount_target_users_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Kupon geri verme: kullanım kaydı SİLİNMEZ, iptal işareti taşır. Kota ve bütçe
-- hesapları yalnız iptal edilmemiş satırları sayar.
ALTER TABLE "discount_usages"
  ADD COLUMN "revoked_at" TIMESTAMP(3),
  ADD COLUMN "revoke_reason" TEXT;

CREATE INDEX "discount_usages_discount_id_revoked_at_idx"
  ON "discount_usages"("discount_id", "revoked_at");

-- Siparişte verilen bedel indirimlerinin snapshot'ı. Kesinti kolonları indirim
-- SONRASI tutarı taşır; bu alanlar raporlama ve iade denetimi içindir.
ALTER TABLE "orders"
  ADD COLUMN "buyer_fee_discount_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "seller_fee_discount_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "fee_discount_breakdown" JSONB;
