-- Yasal kimlik: her üyenin ad, soyad ve TCKN'si (devlet bildirimi). Kayıtta
-- web formu ister; eski üyeler bir sonraki girişte kapatılamaz pencereyle
-- doldurur (zorlama istemcidedir, sunucu istekleri reddetmez).
--
-- CANLI VERİ GÜVENLİĞİ: yalnız ekleme. Üç boş (NULL) kolon + tekil indeks
-- (`users`) ve iki boş kolon (`deleted_user_identities` arşivi). Varsayılan
-- değer ve geri doldurma YOK — NULL "üye henüz girmedi" demektir. Postgres
-- tekil indeksi birden çok NULL'a izin verir, yani mevcut satırlar indeksi
-- ihlal edemez. Banka hesabındaki TCKN'ler BİLEREK kopyalanmaz: üyenin kendi
-- beyanı değildir, kapı onu yalnız ön doldurma olarak önerir.
ALTER TABLE "users" ADD COLUMN "legal_first_name" TEXT;
ALTER TABLE "users" ADD COLUMN "legal_last_name" TEXT;
ALTER TABLE "users" ADD COLUMN "national_id" TEXT;

-- Bir TCKN tek hesapta: hesap silmede kolon NULL'lanır, numara serbest kalır
-- (e-posta/telefon ile aynı kural).
CREATE UNIQUE INDEX "users_national_id_key" ON "users"("national_id");

ALTER TABLE "deleted_user_identities" ADD COLUMN "legal_first_name" TEXT;
ALTER TABLE "deleted_user_identities" ADD COLUMN "legal_last_name" TEXT;
