-- #298: seller storefront view tracking. Counter mirrors Product.viewCount;
-- rate-limited increment endpoint prevents abuse (see UserEngagementService).
ALTER TABLE "users" ADD COLUMN "store_view_count" INTEGER NOT NULL DEFAULT 0;
