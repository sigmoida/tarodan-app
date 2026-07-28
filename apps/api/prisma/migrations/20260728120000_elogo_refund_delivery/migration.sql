ALTER TYPE "ElogoInvoiceStatus" ADD VALUE IF NOT EXISTS 'processing';

ALTER TABLE "elogo_invoices"
ADD COLUMN "billing_reference_issue_date" TIMESTAMP(3),
ADD COLUMN "refund_adjusted_at" TIMESTAMP(3),
ADD COLUMN "original_total" DECIMAL(10, 2);

UPDATE "elogo_invoices"
SET "original_total" = "total";

ALTER TABLE "elogo_invoices"
ALTER COLUMN "original_total" SET NOT NULL;
