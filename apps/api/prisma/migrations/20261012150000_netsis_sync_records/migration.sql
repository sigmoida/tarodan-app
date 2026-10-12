-- Netsis muhasebe senkronu: platformun para hareketlerini (fatura tahsilatı,
-- PayTR hakediş aktarımı, satıcı ödemesi, alıcı iadesi) Netsis'e aynalayan
-- iş kayıtları (docs/NETSIS.md → "Muhasebe senkronu").
--
-- CANLI VERİ GÜVENLİĞİ: yalnız ekleme. İki yeni enum ve bir tablo; mevcut
-- tablolara dokunulmaz, eski imaj tabloyu yok sayar. Kaynağa FK bilerek YOK:
-- kaynak polimorfiktir ve satır, kaynak tablolardan bağımsız bir denetim izidir.
-- Geçmiş hareketler için satır AÇILMAZ (geriye doldurma yok): senkron açıldığı
-- andan itibaren olaylar ve cron'un 30 günlük süpürmesi satır üretir.
BEGIN;

CREATE TYPE "NetsisSyncKind" AS ENUM ('invoice_collection', 'settlement_transfer', 'payout_transfer', 'refund_reversal');

CREATE TYPE "NetsisSyncStatus" AS ENUM ('pending', 'processing', 'synced', 'failed', 'skipped');

CREATE TABLE "netsis_sync_records" (
    "id" TEXT NOT NULL,
    "kind" "NetsisSyncKind" NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "status" "NetsisSyncStatus" NOT NULL DEFAULT 'pending',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMP(3),
    "last_error" TEXT,
    "netsis_ref" TEXT,
    "payload" JSONB,
    "amount" DECIMAL(12,2),
    "synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "netsis_sync_records_pkey" PRIMARY KEY ("id")
);

-- Aynı para hareketi ikinci bir satır (dolayısıyla ikinci bir Netsis kaydı) açamaz.
CREATE UNIQUE INDEX "netsis_sync_records_idempotency_key_key" ON "netsis_sync_records"("idempotency_key");

CREATE UNIQUE INDEX "netsis_sync_records_kind_source_id_key" ON "netsis_sync_records"("kind", "source_id");

-- Retry adayları (pending/failed + bayat processing kirası).
CREATE INDEX "netsis_sync_records_status_last_attempt_at_idx" ON "netsis_sync_records"("status", "last_attempt_at");

-- Admin listesi: varsayılan sıra ve tarih filtresi.
CREATE INDEX "netsis_sync_records_created_at_idx" ON "netsis_sync_records"("created_at");

COMMIT;
