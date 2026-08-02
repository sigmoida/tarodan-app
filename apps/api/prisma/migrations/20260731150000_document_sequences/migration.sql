-- Tarodan iç belge sayaçları. PDF fatura numarası (SPR-YYYYMM-NNNNNN) şimdiye
-- kadar "o aya ait en büyük numarayı oku, +1 yaz" ile üretiliyordu; eşzamanlı
-- iki fatura aynı numarayı hesaplayıp unique index'e takılabiliyordu.
-- Numara artık upsert + increment ile atomik alınır.
CREATE TABLE "document_sequences" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "last_value" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "document_sequences_scope_key" ON "document_sequences"("scope");

-- Mevcut faturaların en büyük numarasından devam et (dev/staging verisi).
INSERT INTO "document_sequences" ("id", "scope", "last_value", "updated_at")
SELECT
  gen_random_uuid()::text,
  substring("invoice_number" FROM 1 FOR 11),
  MAX(CAST(substring("invoice_number" FROM 13 FOR 6) AS INTEGER)),
  NOW()
FROM "invoices"
WHERE "invoice_number" ~ '^SPR-[0-9]{6}-[0-9]{6}$'
GROUP BY substring("invoice_number" FROM 1 FOR 11)
ON CONFLICT ("scope") DO NOTHING;
