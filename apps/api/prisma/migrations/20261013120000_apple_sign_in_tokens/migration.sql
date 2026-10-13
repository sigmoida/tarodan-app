-- Sign in with Apple token iptali (App Store 5.1.1(v)): mobil girişin
-- `authorizationCode`u refresh token'a çevrilip ŞİFRELİ saklanır, hesap
-- silmede Apple'a iptal edilir (outbox `apple.token_revoke`).
--
-- CANLI VERİ GÜVENLİĞİ: yalnız ekleme. Bir yeni tablo + unique indeks + FK;
-- mevcut hiçbir tabloya/kolona dokunulmaz, geri doldurma yok (mevcut Apple
-- kullanıcılarının token'ı bir sonraki girişlerinde yazılır).
-- Geri alma: `DROP TABLE "apple_sign_in_tokens";` (yalnız bu özelliğin verisi).
--
-- FK CASCADE: kullanıcı satırı silinmez (hesap silme anonimleştirir); yalnız
-- test/UAT temizliği gibi kalıcı silmelerde token satırı da gider.

CREATE TABLE "apple_sign_in_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "refresh_token_encrypted" TEXT,
    "revoke_requested_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "last_revoke_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "apple_sign_in_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "apple_sign_in_tokens_user_id_client_id_key" ON "apple_sign_in_tokens"("user_id", "client_id");

ALTER TABLE "apple_sign_in_tokens"
  ADD CONSTRAINT "apple_sign_in_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
