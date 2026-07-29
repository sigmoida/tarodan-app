-- Stable, human-readable account references. The prefix is assigned once:
-- B individual buyer, S individual seller, K corporate account.
CREATE SEQUENCE "user_admin_code_seq";
CREATE OR REPLACE FUNCTION generate_user_admin_code(prefix TEXT DEFAULT 'B')
RETURNS TEXT
LANGUAGE SQL
VOLATILE
AS $$
  SELECT upper(prefix) || lpad(nextval('user_admin_code_seq')::text, 6, '0')
$$;

-- Legacy/OAuth accounts receive a collision-free placeholder. They may claim a
-- permanent username once; new password registrations provide it up front.
CREATE SEQUENCE "legacy_username_seq";
CREATE OR REPLACE FUNCTION generate_legacy_username()
RETURNS TEXT
LANGUAGE SQL
VOLATILE
AS $$
  SELECT 'legacy_' || lpad(nextval('legacy_username_seq')::text, 8, '0')
$$;

ALTER TABLE "users"
  ADD COLUMN "admin_code" TEXT,
  ADD COLUMN "username" TEXT,
  ADD COLUMN "username_claimed_at" TIMESTAMP(3);

WITH ranked AS (
  SELECT
    "id",
    row_number() OVER (ORDER BY "created_at", "id") AS rn,
    CASE
      WHEN "company_name" IS NOT NULL OR "business_status" IS NOT NULL THEN 'K'
      WHEN "is_seller" = true THEN 'S'
      ELSE 'B'
    END AS prefix
  FROM "users"
)
UPDATE "users" u
SET
  "admin_code" = ranked.prefix || lpad(ranked.rn::text, 6, '0'),
  "username" = 'legacy_' || lpad(ranked.rn::text, 8, '0')
FROM ranked
WHERE u."id" = ranked."id";

SELECT setval(
  'user_admin_code_seq',
  GREATEST((SELECT count(*) FROM "users"), 1),
  (SELECT count(*) FROM "users") > 0
);
SELECT setval(
  'legacy_username_seq',
  GREATEST((SELECT count(*) FROM "users"), 1),
  (SELECT count(*) FROM "users") > 0
);

ALTER TABLE "users"
  ALTER COLUMN "admin_code" SET DEFAULT generate_user_admin_code('B'::text),
  ALTER COLUMN "admin_code" SET NOT NULL,
  ALTER COLUMN "username" SET DEFAULT generate_legacy_username(),
  ALTER COLUMN "username" SET NOT NULL;

CREATE UNIQUE INDEX "users_admin_code_key" ON "users"("admin_code");
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
CREATE INDEX "users_admin_code_idx" ON "users"("admin_code");
CREATE INDEX "users_username_idx" ON "users"("username");

CREATE TYPE "CorporateApplicationStatus" AS ENUM (
  'submitted',
  'preliminary_approved',
  'invited',
  'activated',
  'completing',
  'under_review',
  'approved',
  'rejected'
);
CREATE TYPE "CorporateIdentityType" AS ENUM ('tckn', 'passport');

CREATE TABLE "corporate_applications" (
  "id" TEXT NOT NULL,
  "user_id" TEXT,
  "status" "CorporateApplicationStatus" NOT NULL DEFAULT 'submitted',
  "authorized_full_name" TEXT NOT NULL,
  "company_legal_name" TEXT NOT NULL,
  "company_title" TEXT NOT NULL,
  "company_address" TEXT NOT NULL,
  "company_email" TEXT NOT NULL,
  "kep_address" TEXT,
  "phone" TEXT NOT NULL,
  "contact_phone" TEXT,
  "tax_id" TEXT,
  "company_type" TEXT,
  "tax_office" TEXT,
  "company_city" TEXT,
  "company_district" TEXT,
  "bank_account_holder" TEXT,
  "iban" TEXT,
  "review_note" TEXT,
  "invitation_token_hash" TEXT,
  "invitation_expires_at" TIMESTAMP(3),
  "preliminary_approved_at" TIMESTAMP(3),
  "activated_at" TIMESTAMP(3),
  "submitted_for_review_at" TIMESTAMP(3),
  "final_approved_at" TIMESTAMP(3),
  "rejected_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "corporate_applications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "corporate_stakeholders" (
  "id" TEXT NOT NULL,
  "application_id" TEXT NOT NULL,
  "full_name" TEXT NOT NULL,
  "identity_type" "CorporateIdentityType" NOT NULL,
  "identity_number" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "corporate_stakeholders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "corporate_application_events" (
  "id" TEXT NOT NULL,
  "application_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "note" TEXT,
  "actor_admin_id" TEXT,
  "actor_user_id" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "corporate_application_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "corporate_applications_user_id_key" ON "corporate_applications"("user_id");
CREATE UNIQUE INDEX "corporate_applications_invitation_token_hash_key" ON "corporate_applications"("invitation_token_hash");
CREATE INDEX "corporate_applications_status_created_at_idx" ON "corporate_applications"("status", "created_at" DESC);
CREATE INDEX "corporate_applications_company_email_idx" ON "corporate_applications"("company_email");
CREATE INDEX "corporate_applications_phone_idx" ON "corporate_applications"("phone");
CREATE INDEX "corporate_applications_tax_id_idx" ON "corporate_applications"("tax_id");
CREATE INDEX "corporate_stakeholders_application_id_idx" ON "corporate_stakeholders"("application_id");
CREATE INDEX "corporate_application_events_application_id_created_at_idx" ON "corporate_application_events"("application_id", "created_at" DESC);

ALTER TABLE "corporate_applications"
  ADD CONSTRAINT "corporate_applications_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "corporate_stakeholders"
  ADD CONSTRAINT "corporate_stakeholders_application_id_fkey"
  FOREIGN KEY ("application_id") REFERENCES "corporate_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "corporate_application_events"
  ADD CONSTRAINT "corporate_application_events_application_id_fkey"
  FOREIGN KEY ("application_id") REFERENCES "corporate_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TYPE "SellerDocumentType" ADD VALUE IF NOT EXISTS 'identity_front';
ALTER TYPE "SellerDocumentType" ADD VALUE IF NOT EXISTS 'identity_back';
ALTER TYPE "SellerDocumentType" ADD VALUE IF NOT EXISTS 'passport_front';
ALTER TYPE "SellerDocumentType" ADD VALUE IF NOT EXISTS 'passport_back';
ALTER TYPE "SellerDocumentType" ADD VALUE IF NOT EXISTS 'residence_or_invoice';
ALTER TYPE "SellerDocumentType" ADD VALUE IF NOT EXISTS 'trade_registry_gazette';
ALTER TYPE "SellerDocumentType" ADD VALUE IF NOT EXISTS 'bank_account_info';
ALTER TYPE "SellerDocumentStatus" ADD VALUE IF NOT EXISTS 'revision_requested';
ALTER TYPE "SellerDocumentStatus" ADD VALUE IF NOT EXISTS 'appealed';

DROP INDEX "seller_documents_user_id_document_type_key";
ALTER TABLE "seller_documents"
  ADD COLUMN "application_id" TEXT,
  ADD COLUMN "stakeholder_id" TEXT,
  ADD COLUMN "reviewed_by" TEXT,
  ADD COLUMN "appeal_note" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "is_current" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "supersedes_id" TEXT;

CREATE INDEX "seller_documents_application_id_document_type_is_current_idx"
  ON "seller_documents"("application_id", "document_type", "is_current");
CREATE INDEX "seller_documents_stakeholder_id_idx" ON "seller_documents"("stakeholder_id");
CREATE UNIQUE INDEX "seller_documents_current_slot_key"
  ON "seller_documents"(
    "user_id",
    "document_type",
    COALESCE("stakeholder_id", '')
  )
  WHERE "is_current" = true;

ALTER TABLE "seller_documents"
  ADD CONSTRAINT "seller_documents_application_id_fkey"
  FOREIGN KEY ("application_id") REFERENCES "corporate_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "seller_documents"
  ADD CONSTRAINT "seller_documents_stakeholder_id_fkey"
  FOREIGN KEY ("stakeholder_id") REFERENCES "corporate_stakeholders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TYPE "AdPackageAudienceMode" AS ENUM (
  'everyone',
  'membership_tiers',
  'specific_users',
  'tiers_or_users'
);
ALTER TABLE "ad_packages"
  ADD COLUMN "audience_mode" "AdPackageAudienceMode" NOT NULL DEFAULT 'everyone';

CREATE TABLE "ad_package_membership_tiers" (
  "package_id" TEXT NOT NULL,
  "tier_type" "MembershipTierType" NOT NULL,
  CONSTRAINT "ad_package_membership_tiers_pkey" PRIMARY KEY ("package_id", "tier_type")
);
CREATE TABLE "ad_package_user_targets" (
  "package_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ad_package_user_targets_pkey" PRIMARY KEY ("package_id", "user_id")
);
CREATE INDEX "ad_package_membership_tiers_tier_type_idx" ON "ad_package_membership_tiers"("tier_type");
CREATE INDEX "ad_package_user_targets_user_id_idx" ON "ad_package_user_targets"("user_id");
ALTER TABLE "ad_package_membership_tiers"
  ADD CONSTRAINT "ad_package_membership_tiers_package_id_fkey"
  FOREIGN KEY ("package_id") REFERENCES "ad_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ad_package_user_targets"
  ADD CONSTRAINT "ad_package_user_targets_package_id_fkey"
  FOREIGN KEY ("package_id") REFERENCES "ad_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ad_package_user_targets"
  ADD CONSTRAINT "ad_package_user_targets_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "products" ADD COLUMN "click_count" INTEGER NOT NULL DEFAULT 0;
ALTER TYPE "BoostStatus" ADD VALUE IF NOT EXISTS 'paused';
ALTER TABLE "product_boosts"
  ADD COLUMN "paused_at" TIMESTAMP(3),
  ADD COLUMN "paused_remaining_seconds" INTEGER,
  ADD COLUMN "extended_days" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "baseline_view_count" INTEGER,
  ADD COLUMN "baseline_like_count" INTEGER,
  ADD COLUMN "baseline_click_count" INTEGER,
  ADD COLUMN "final_view_count" INTEGER,
  ADD COLUMN "final_like_count" INTEGER,
  ADD COLUMN "final_click_count" INTEGER;
