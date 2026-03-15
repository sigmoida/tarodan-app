-- AlterTable: add trade_cash_payment_id to payments (for trade cash payment flow)
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "trade_cash_payment_id" TEXT;

-- Unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS "payments_trade_cash_payment_id_key" ON "payments"("trade_cash_payment_id");

-- Foreign key to trade_cash_payments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_trade_cash_payment_id_fkey'
  ) THEN
    ALTER TABLE "payments" ADD CONSTRAINT "payments_trade_cash_payment_id_fkey"
      FOREIGN KEY ("trade_cash_payment_id") REFERENCES "trade_cash_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
