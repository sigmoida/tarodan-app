-- Mail Yönlendirme (docs/MAIL_ROUTING.md).
--
-- CANLI VERİ GÜVENLİĞİ: yalnız ekleme. Üç yeni tablo, mevcut tablolara
-- dokunulmaz. Tohum satırı YOK: alan satırı olmaması = varsayılan (hesap yok →
-- env kimliği, alıcı yok, her iç olay kapalı) — yani bu göç tek başına hiçbir
-- e-postanın gönderenini ya da alıcısını değiştirmez.

-- Gönderici posta kutuları. Şifre AES-256-GCM ile şifreli saklanır
-- (MAIL_ACCOUNT_ENCRYPTION_KEY); düz metin hiçbir kolonda yoktur.
CREATE TABLE "mail_sender_accounts" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "host" TEXT,
    "port" INTEGER,
    "secure" BOOLEAN,
    "username" TEXT NOT NULL,
    "password_encrypted" TEXT NOT NULL,
    "last_test_at" TIMESTAMP(3),
    "last_test_ok" BOOLEAN,
    "last_test_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "mail_sender_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mail_sender_accounts_address_key"
ON "mail_sender_accounts"("address");

-- Alan başına ayar. Kullanımdaki hesap silinemez (RESTRICT).
CREATE TABLE "mail_area_settings" (
    "area_id" TEXT NOT NULL,
    "sender_account_id" TEXT,
    "display_name" TEXT,
    "reply_to" TEXT,
    "internal_recipients" JSONB NOT NULL DEFAULT '[]',
    "events" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "mail_area_settings_pkey" PRIMARY KEY ("area_id")
);

CREATE INDEX "mail_area_settings_sender_account_id_idx"
ON "mail_area_settings"("sender_account_id");

ALTER TABLE "mail_area_settings"
  ADD CONSTRAINT "mail_area_settings_sender_account_id_fkey"
  FOREIGN KEY ("sender_account_id") REFERENCES "mail_sender_accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Personel bildirimleri: outbox olayı başına tek satır (source_key), anlık
-- satırlar hemen, saatlik/günlük satırlar özet işiyle gönderilir.
CREATE TABLE "mail_internal_notices" (
    "id" TEXT NOT NULL,
    "source_key" TEXT NOT NULL,
    "area_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "delivery" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "claim_id" TEXT,
    "claimed_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mail_internal_notices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mail_internal_notices_source_key_key"
ON "mail_internal_notices"("source_key");

-- Özet işinin aday sorgusu: teslim modu + gönderilmemiş + en eski önce.
CREATE INDEX "mail_internal_notices_delivery_sent_at_created_at_idx"
ON "mail_internal_notices"("delivery", "sent_at", "created_at");

CREATE INDEX "mail_internal_notices_claim_id_idx"
ON "mail_internal_notices"("claim_id");
