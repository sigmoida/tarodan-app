-- Data backfill: subtotal NULL olan siparişler için subtotal'ı doldur.
-- Invariant (order.service checkout): total_amount = subtotal + shipping_cost + buyer_fee_amount
-- => subtotal = total_amount - shipping_cost - buyer_fee_amount (0'ın altına düşmesin).
-- Kısmi iade hesabı (computePartialRefundAmount) artık ürün tutarını
-- total_amount - shipping - buyerFee ile türetiyor; bu backfill stored
-- subtotal kolonunu da o gerçekle tutarlı hale getirir.
UPDATE "orders"
SET "subtotal" = GREATEST(
  "total_amount" - COALESCE("shipping_cost", 0) - COALESCE("buyer_fee_amount", 0),
  0
)
WHERE "subtotal" IS NULL;
