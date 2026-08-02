-- PayTR platform transfer aşama-2 (transfer sonucu callback) desteği:
-- aşama-1 kabul anı ve o an gönderilen net tutar snapshot'ı.
ALTER TABLE "payout_transfers" ADD COLUMN "submitted_at" TIMESTAMP(3);
ALTER TABLE "payout_transfers" ADD COLUMN "submitted_amount" DECIMAL(10,2);
