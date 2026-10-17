-- Additive only: one new enum value + one nullable column, no default, no backfill.
--
-- `expired` marks a listing the lifetime job deactivated, so a seller can renew
-- it in one action (and so it can be told apart from a seller pause or an
-- out-of-stock deactivation). Listings that expired BEFORE this migration stay
-- unmarked on purpose; an admin-triggered, dry-run-first maintenance operation
-- identifies them conservatively (see docs/TIMING_RULES.md).
--
-- `approved_content_fingerprint` is the hash of the moderated content at the
-- last approval. A renewal whose current content hashes the same may skip the
-- moderation queue; null means "no approval trace" and never skips it.
--
-- NOTE: the new enum value is not used anywhere in this migration, so it is safe
-- inside the migration transaction (PostgreSQL 12+).

ALTER TYPE "ProductInactiveReason" ADD VALUE IF NOT EXISTS 'expired';

ALTER TABLE "products"
  ADD COLUMN "approved_content_fingerprint" TEXT;
