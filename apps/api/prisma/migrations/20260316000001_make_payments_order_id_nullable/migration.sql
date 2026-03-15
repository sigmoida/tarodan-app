-- Make order_id nullable for trade cash payments (Payment can be linked to Order OR TradeCashPayment)
ALTER TABLE "payments" ALTER COLUMN "order_id" DROP NOT NULL;
