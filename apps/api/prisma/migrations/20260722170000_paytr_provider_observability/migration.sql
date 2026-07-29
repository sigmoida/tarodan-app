-- PayTR provider observability: capture the rich PSP response data PayTR already
-- returns (payment_type, installment_count, currency, card metadata, raw envelope)
-- for accounting/reconciliation, support, dispute defense and reporting.

-- CreateEnum
CREATE TYPE "PaymentProviderEventType" AS ENUM ('callback', 'direct_payment', 'recurring_charge', 'status_inquiry', 'refund', 'card_list', 'card_delete');

-- SavedCard: persist PayTR CAPI list metadata (issuing bank, scheme, credit/debit,
-- corporate flag). PAN/CVV are never stored — these are masked/meta fields only.
ALTER TABLE "saved_cards" ADD COLUMN "bank" TEXT;
ALTER TABLE "saved_cards" ADD COLUMN "card_type" TEXT;
ALTER TABLE "saved_cards" ADD COLUMN "card_scheme" TEXT;
ALTER TABLE "saved_cards" ADD COLUMN "business_card" BOOLEAN;

-- MembershipPayment (recurring auto-renew) observability: merchant_oid + payment
-- method + raw provider envelope.
ALTER TABLE "membership_payments" ADD COLUMN "merchant_oid" TEXT;
ALTER TABLE "membership_payments" ADD COLUMN "payment_type" TEXT;
ALTER TABLE "membership_payments" ADD COLUMN "metadata" JSONB;
CREATE INDEX "membership_payments_merchant_oid_idx" ON "membership_payments"("merchant_oid");

-- Append-only PSP event log (audit source for Faz 6.5 ledger vs PSP reconciliation).
CREATE TABLE "payment_provider_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'paytr',
    "event_type" "PaymentProviderEventType" NOT NULL,
    "merchant_oid" TEXT,
    "payment_id" TEXT,
    "membership_payment_id" TEXT,
    "status" TEXT,
    "payment_type" TEXT,
    "installment_count" INTEGER,
    "currency" TEXT,
    "amount" DECIMAL(12,2),
    "total_amount" DECIMAL(12,2),
    "failed_reason_code" TEXT,
    "failed_reason_msg" TEXT,
    "utoken" TEXT,
    "test_mode" BOOLEAN,
    "hash_valid" BOOLEAN,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_provider_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payment_provider_events_merchant_oid_idx" ON "payment_provider_events"("merchant_oid");
CREATE INDEX "payment_provider_events_payment_id_idx" ON "payment_provider_events"("payment_id");
CREATE INDEX "payment_provider_events_membership_payment_id_idx" ON "payment_provider_events"("membership_payment_id");
CREATE INDEX "payment_provider_events_provider_event_type_created_at_idx" ON "payment_provider_events"("provider", "event_type", "created_at");
