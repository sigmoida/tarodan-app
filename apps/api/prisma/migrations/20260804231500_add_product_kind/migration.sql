CREATE TYPE "ProductKind" AS ENUM ('listing', 'membership', 'boost');

ALTER TABLE "products"
ADD COLUMN "kind" "ProductKind" NOT NULL DEFAULT 'listing';

UPDATE "products"
SET "kind" = 'membership'
WHERE "id" LIKE 'membership-%';

UPDATE "products"
SET "kind" = 'boost'
WHERE "id" LIKE 'boost-%';

CREATE INDEX "products_kind_status_idx" ON "products"("kind", "status");
