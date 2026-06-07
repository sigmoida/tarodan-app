-- Fix drift: trades.compensation_pending_user_id was declared UUID in
-- 20260514175446_trade_compensation_and_lost_shipments, but the Prisma schema
-- defines User.id as String (TEXT). Bring DB in sync with schema.

ALTER TABLE "trades" ALTER COLUMN "compensation_pending_user_id" SET DATA TYPE TEXT;
