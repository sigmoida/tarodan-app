-- PayTR rapor senkronu (PSP mutabakat katmanı, Faz 1-2):
-- işlem dökümü satırları + hakediş (settlement) kayıtları ve kalemleri.

CREATE TYPE "PaytrStatementLineType" AS ENUM ('sale', 'refund');
CREATE TYPE "PaytrMatchStatus" AS ENUM ('unmatched', 'matched', 'amount_mismatch');

CREATE TABLE "paytr_statement_lines" (
    "id" TEXT NOT NULL,
    "merchant_oid" TEXT NOT NULL,
    "type" "PaytrStatementLineType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "fee" DECIMAL(12,2),
    "fee_rate" DECIMAL(6,3),
    "net" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'TL',
    "installment" INTEGER,
    "card_brand" TEXT,
    "masked_pan" TEXT,
    "payment_type" TEXT,
    "transaction_date" TIMESTAMP(3) NOT NULL,
    "match_status" "PaytrMatchStatus" NOT NULL DEFAULT 'unmatched',
    "payment_id" TEXT,
    "refund_attempt_id" TEXT,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "paytr_statement_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "paytr_statement_lines_merchant_oid_type_transaction_date_a_key"
    ON "paytr_statement_lines"("merchant_oid", "type", "transaction_date", "amount");
CREATE INDEX "paytr_statement_lines_transaction_date_idx" ON "paytr_statement_lines"("transaction_date");
CREATE INDEX "paytr_statement_lines_match_status_idx" ON "paytr_statement_lines"("match_status");

CREATE TABLE "paytr_settlements" (
    "id" TEXT NOT NULL,
    "date_paid" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TL',
    "sales_total" DECIMAL(12,2) NOT NULL,
    "return_total" DECIMAL(12,2) NOT NULL,
    "net_total" DECIMAL(12,2) NOT NULL,
    "merchant_iban" TEXT,
    "is_projection" BOOLEAN NOT NULL DEFAULT false,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "paytr_settlements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "paytr_settlements_date_paid_currency_is_projection_key"
    ON "paytr_settlements"("date_paid", "currency", "is_projection");
CREATE INDEX "paytr_settlements_date_paid_idx" ON "paytr_settlements"("date_paid");

CREATE TABLE "paytr_settlement_items" (
    "id" TEXT NOT NULL,
    "settlement_id" TEXT NOT NULL,
    "merchant_oid" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TL',
    "payment_id" TEXT,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "paytr_settlement_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "paytr_settlement_items_settlement_id_idx" ON "paytr_settlement_items"("settlement_id");
CREATE INDEX "paytr_settlement_items_merchant_oid_idx" ON "paytr_settlement_items"("merchant_oid");

ALTER TABLE "paytr_settlement_items"
    ADD CONSTRAINT "paytr_settlement_items_settlement_id_fkey"
    FOREIGN KEY ("settlement_id") REFERENCES "paytr_settlements"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
