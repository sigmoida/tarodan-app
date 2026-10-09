-- Staging "production'dan maskeli yenile" koşu kayıtları (docs/UAT_REFRESH.md).
--
-- CANLI VERİ GÜVENLİĞİ: yalnız ekleme. Yeni bir enum ve bir tablo; mevcut
-- tablolara dokunulmaz. Production'da tablo boş kalır (düğme orada gizli ve
-- uç reddeder). Kullanıcıya FK bilinçli olarak YOK: workflow tabloyu
-- veritabanı takasının iki yanında taşır, isteyen personelin satırı yeni
-- veritabanında olmayabilir.

CREATE TYPE "UatRefreshState" AS ENUM ('queued', 'running', 'succeeded', 'failed');

CREATE TABLE "uat_refresh_runs" (
    "id" TEXT NOT NULL,
    "state" "UatRefreshState" NOT NULL DEFAULT 'queued',
    "requested_by_id" TEXT,
    "requested_by_name" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "dry_run" BOOLEAN NOT NULL DEFAULT false,
    "token_hash" TEXT NOT NULL,
    "workflow_run_url" TEXT,
    "source_snapshot_at" TIMESTAMP(3),
    "masked" JSONB NOT NULL DEFAULT '[]',
    "migrations_applied" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "backup_file" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uat_refresh_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uat_refresh_runs_token_hash_key" ON "uat_refresh_runs"("token_hash");

CREATE INDEX "uat_refresh_runs_requested_at_idx" ON "uat_refresh_runs"("requested_at");
