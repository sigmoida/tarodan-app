-- Escrow hold artık TAM kargoyu düşüyor. İade kararının kargo bacağı da kalem
-- bazlı saklanır: satıcıya bırakılan kendi payı ve satıcıya yazılan gidiş borcu.
ALTER TABLE "refund_requests"
  ADD COLUMN "seller_shipping_compensation_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "outbound_shipping_charge_to_seller" DECIMAL(10,2) NOT NULL DEFAULT 0;
