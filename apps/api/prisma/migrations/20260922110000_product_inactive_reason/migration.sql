-- Additive only: new enum + nullable column, no default, no backfill.
-- `inactive_reason` marks WHY a listing is inactive. Only `return_quarantine`
-- is meaningful today: a post-delivery return set the listing inactive and
-- the seller may reactivate it directly (no admin review). Every other
-- inactive listing (manual pause, stock=0) leaves this null and keeps the
-- existing admin-review reactivation flow.

CREATE TYPE "ProductInactiveReason" AS ENUM ('return_quarantine');

ALTER TABLE "products"
  ADD COLUMN "inactive_reason" "ProductInactiveReason";
