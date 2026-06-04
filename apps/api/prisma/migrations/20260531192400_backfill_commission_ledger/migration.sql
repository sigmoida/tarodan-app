-- Backfill: mevcut siparisler icin commission_ledger satirlari uret.
-- Idempotent (ON CONFLICT DO NOTHING). pending_payment durumundakiler
-- atlaanr cunku odeme heniz alinmadi ve commission/buyer_fee netlesemedi.

-- completed -> earned
INSERT INTO "commission_ledger" (
  "id", "order_id", "seller_commission", "buyer_fee", "total_platform_revenue",
  "status", "earned_at", "created_at", "updated_at"
)
SELECT
  gen_random_uuid()::text,
  o."id",
  o."commission_amount",
  o."buyer_fee_amount",
  (o."commission_amount" + o."buyer_fee_amount"),
  'earned',
  o."updated_at",
  NOW(),
  NOW()
FROM "orders" o
WHERE o."status" = 'completed'
ON CONFLICT ("order_id") DO NOTHING;

-- paid / preparing / shipped / delivered / awaiting_buyer_confirmation -> pending
INSERT INTO "commission_ledger" (
  "id", "order_id", "seller_commission", "buyer_fee", "total_platform_revenue",
  "status", "created_at", "updated_at"
)
SELECT
  gen_random_uuid()::text,
  o."id",
  o."commission_amount",
  o."buyer_fee_amount",
  (o."commission_amount" + o."buyer_fee_amount"),
  'pending',
  NOW(),
  NOW()
FROM "orders" o
WHERE o."status" IN ('paid', 'preparing', 'shipped', 'delivered', 'awaiting_buyer_confirmation')
ON CONFLICT ("order_id") DO NOTHING;

-- cancelled -> waived
INSERT INTO "commission_ledger" (
  "id", "order_id", "seller_commission", "buyer_fee", "total_platform_revenue",
  "status", "waived_at", "waived_reason", "created_at", "updated_at"
)
SELECT
  gen_random_uuid()::text,
  o."id",
  o."commission_amount",
  o."buyer_fee_amount",
  (o."commission_amount" + o."buyer_fee_amount"),
  'waived',
  o."updated_at",
  'backfill_cancelled',
  NOW(),
  NOW()
FROM "orders" o
WHERE o."status" = 'cancelled'
ON CONFLICT ("order_id") DO NOTHING;

-- refunded -> refunded
INSERT INTO "commission_ledger" (
  "id", "order_id", "seller_commission", "buyer_fee", "total_platform_revenue",
  "status", "refunded_at", "created_at", "updated_at"
)
SELECT
  gen_random_uuid()::text,
  o."id",
  o."commission_amount",
  o."buyer_fee_amount",
  (o."commission_amount" + o."buyer_fee_amount"),
  'refunded',
  o."updated_at",
  NOW(),
  NOW()
FROM "orders" o
WHERE o."status" = 'refunded'
ON CONFLICT ("order_id") DO NOTHING;
