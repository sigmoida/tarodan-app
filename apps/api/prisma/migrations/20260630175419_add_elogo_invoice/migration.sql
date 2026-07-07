-- CreateEnum
CREATE TYPE "ElogoInvoiceType" AS ENUM ('commission', 'service_fee', 'membership', 'boost', 'trade_commission', 'return_invoice');

-- CreateEnum
CREATE TYPE "ElogoInvoiceStatus" AS ENUM ('pending', 'sent', 'signed', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "elogo_invoices" (
    "id" TEXT NOT NULL,
    "type" "ElogoInvoiceType" NOT NULL,
    "source_id" TEXT NOT NULL,
    "recipient_user_id" TEXT,
    "recipient_vkn_tckn" TEXT,
    "recipient_name" TEXT,
    "document_type" TEXT NOT NULL DEFAULT 'EARCHIVE',
    "send_type" TEXT NOT NULL DEFAULT 'ELEKTRONIK',
    "invoice_number" TEXT,
    "ettn" TEXT,
    "net_amount" DECIMAL(10,2) NOT NULL,
    "tax_amount" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 20,
    "status" "ElogoInvoiceStatus" NOT NULL DEFAULT 'pending',
    "elogo_ref_id" TEXT,
    "elogo_result_code" INTEGER,
    "elogo_result_msg" TEXT,
    "billing_reference" TEXT,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMP(3),
    "issued_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "elogo_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "elogo_doc_sequences" (
    "id" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "last_value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "elogo_doc_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "elogo_invoices_invoice_number_key" ON "elogo_invoices"("invoice_number");

-- CreateIndex
CREATE UNIQUE INDEX "elogo_invoices_ettn_key" ON "elogo_invoices"("ettn");

-- CreateIndex
CREATE INDEX "elogo_invoices_status_idx" ON "elogo_invoices"("status");

-- CreateIndex
CREATE INDEX "elogo_invoices_recipient_user_id_idx" ON "elogo_invoices"("recipient_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "elogo_invoices_type_source_id_key" ON "elogo_invoices"("type", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "elogo_doc_sequences_prefix_year_key" ON "elogo_doc_sequences"("prefix", "year");
