-- Ertelemeli period değişimi (yıllık→aylık vb.) için dönem sonunda geçilecek periyot.
ALTER TABLE "user_memberships" ADD COLUMN "scheduled_billing_period" TEXT;
