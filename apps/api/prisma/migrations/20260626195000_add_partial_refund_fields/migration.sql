-- Adet bazlı kısmi iade: RefundRequest.refundQuantity + PaymentHold.refundedAmount (hold subdivision).
ALTER TABLE "refund_requests" ADD COLUMN "refund_quantity" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "payment_holds" ADD COLUMN "refunded_amount" DECIMAL(10,2) NOT NULL DEFAULT 0;
