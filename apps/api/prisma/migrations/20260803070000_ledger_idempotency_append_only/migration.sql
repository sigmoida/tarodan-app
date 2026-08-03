-- Defter sertleştirmesi: (1) iş olayı başına idempotency anahtarı, (2) append-only zorlaması.
--
-- (1) İDEMPOTENCY — finalize/callback/cron yolları aynı olayı iki kez işleyebiliyor
-- (outbox backstop, PayTR bildirim tekrarı, retry). Uygulama seviyesindeki
-- "önce findFirst, sonra insert" kontrolü yarışa açıktır: iki eşzamanlı finalize
-- ikisi de boş okur ve ÇİFT grup yazar. Anahtar grup satırlarının HEPSİNDE aynıdır;
-- `line_no` grup içinde ayırır → (key, line_no) UNIQUE. Satırlar tek `createMany`
-- ile yazıldığından yazım atomiktir: ikinci deneme ilk satırda P2002 alır, yarım
-- grup oluşmaz. NULL anahtar = eski/anahtarsız kayıt; Postgres NULL'ları benzersiz
-- saymadığı için mevcut satırlar etkilenmez.
ALTER TABLE "ledger_entries" ADD COLUMN "idempotency_key" TEXT;
ALTER TABLE "ledger_entries" ADD COLUMN "line_no" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "ledger_entries_idempotency_key_line_no_key"
  ON "ledger_entries"("idempotency_key", "line_no");

-- (2) APPEND-ONLY — defterin değişmezliği bugüne dek yalnız kod disipliniydi
-- (LedgerService update/delete sunmuyor). Elle SQL, yanlış bir migration veya
-- ileride eklenecek bir servis satırları sessizce değiştirebilirdi; muhasebe
-- defterinde düzeltme UPDATE ile değil TERS KAYIT ile yapılır. Satır seviyesinde
-- yasak: UPDATE ve DELETE hata fırlatır.
--
-- TRUNCATE bilinçli olarak serbest bırakıldı (satır tetikleyicisi zaten yakalamaz):
-- test veritabanı sıfırlama ve `prisma migrate reset` akışları buna dayanıyor.
-- Üretimde riskli olan sessiz satır değişimidir; TRUNCATE zaten denetlenen bir DDL.
CREATE OR REPLACE FUNCTION ledger_entries_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'ledger_entries append-only: % engellendi (düzeltme için ters kayıt yazın)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_entries_append_only_guard
  BEFORE UPDATE OR DELETE ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION ledger_entries_append_only();
