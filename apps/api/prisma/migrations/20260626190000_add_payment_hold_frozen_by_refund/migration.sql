-- Escrow ↔ iade çakışmasını önlemek için PaymentHold kilidi.
-- Açık bir iade talebi varken hold bu alanla işaretlenir; hiçbir release yolu
-- frozen_by_refund_id dolu bir hold'u serbest bırakamaz.
ALTER TABLE "payment_holds" ADD COLUMN "frozen_by_refund_id" TEXT;
