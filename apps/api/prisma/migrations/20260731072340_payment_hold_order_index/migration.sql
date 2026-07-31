-- CreateIndex
CREATE INDEX "payment_holds_order_id_idx" ON "payment_holds"("order_id");

-- RenameIndex
ALTER INDEX "seller_adjustment_applications_adjustment_id_payout_transfer_id" RENAME TO "seller_adjustment_applications_adjustment_id_payout_transfe_key";
