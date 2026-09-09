-- Silinen hesabın kimlik arşivi — aylık resmî bildirim yükümlülüğü için.
--
-- Hesap silme hard-delete değil ANONİMLEŞTİRME: `users` satırı finansal FK'lar
-- için korunuyor ama e-posta `deleted_...@deleted.local` ile eziliyor, telefon /
-- tax_id / company_name null'lanıyor, display_name "Silinmiş Kullanıcı" oluyor.
-- Bu alanların hiçbiri başka bir tabloda tutulmuyordu; silinen bir kullanıcı bir
-- daha bildirilemiyordu. Üstelik aylık stopaj raporu kimliği CANLI users
-- satırından okuduğu için GEÇMİŞ dönemler de geriye dönük bozuluyordu.
--
-- Snapshot, silme transaction'ının ilk adımında — hiçbir alan üzerine yazılmadan
-- ve adresler silinmeden önce — alınır. Backfill satırları kaçınılmaz olarak
-- kısmi olduğu için `username` dışındaki kimlik kolonları NULL kabul eder;
-- hangi alanın nereden geldiği `source_detail` / `source_refs` ile kayıtlıdır.
CREATE TYPE "DeletionActor" AS ENUM ('self', 'admin', 'unknown');
CREATE TYPE "IdentitySnapshotSource" AS ENUM ('live', 'backfill');

CREATE TABLE "deleted_user_identities" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "email" TEXT,
    "username" TEXT NOT NULL,
    "display_name" TEXT,
    "phone" TEXT,
    "birth_date" TIMESTAMP(3),
    "national_id" TEXT,
    "tax_id" TEXT,
    "tax_office" TEXT,
    "company_name" TEXT,
    "company_type" TEXT,
    "seller_type" "SellerType",
    "business_status" "BusinessStatus",
    "address_city" TEXT,
    "address_district" TEXT,
    "address_line" TEXT,
    "iban" TEXT,
    "bank_account_holder" TEXT,
    "was_seller" BOOLEAN NOT NULL DEFAULT false,
    "admin_code" TEXT,
    "registered_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3) NOT NULL,
    "deleted_by_actor" "DeletionActor" NOT NULL DEFAULT 'self',
    "deleted_by_admin_user_id" TEXT,
    "source" "IdentitySnapshotSource" NOT NULL DEFAULT 'live',
    "source_detail" JSONB,
    "source_refs" JSONB,
    "retain_until" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deleted_user_identities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "deleted_user_identities_user_id_key"
ON "deleted_user_identities"("user_id");

-- Bildirim dönem bazlı çekiliyor: filtre HER ZAMAN deleted_at üzerinden
-- (created_at değil — backfill satırlarının hepsi aynı güne düşer).
CREATE INDEX "deleted_user_identities_deleted_at_idx"
ON "deleted_user_identities"("deleted_at");

-- Saklama süresi dolanların manuel imha kuyruğu panelden filtreleniyor.
CREATE INDEX "deleted_user_identities_retain_until_idx"
ON "deleted_user_identities"("retain_until");

-- Bildirim çıktısı TCKN/VKN ile de aranıyor.
CREATE INDEX "deleted_user_identities_national_id_idx"
ON "deleted_user_identities"("national_id");

CREATE INDEX "deleted_user_identities_tax_id_idx"
ON "deleted_user_identities"("tax_id");

-- RESTRICT: arşiv, users satırının yanlışlıkla fiziksel silinmesini de engeller
-- (bugün böyle bir yol yok; ileride eklenirse sessiz kimlik kaybı yerine bu
-- tabloyu adıyla söyleyen bir FK hatası alınsın).
ALTER TABLE "deleted_user_identities"
  ADD CONSTRAINT "deleted_user_identities_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- SAKLAMA ZORLAMASI — bu tablo, hesap silindikten SONRA devlete bildirilebilen
-- tek kimlik kaydı (VUK 253 / TTK 82). "Silinse bile duruyor" garantisi kod
-- disiplinine bırakılamaz: elle SQL, hatalı bir servis ya da ileride eklenecek
-- bir temizlik işi satırları sessizce yok edebilirdi.
--
--   DELETE  → tamamen yasak.
--   UPDATE  → yalnız ZENGİNLEŞTİRME yönünde serbest. Backfill, boş kolonları
--             sonradan doldurabilmeli; ama DOLU bir kimlik kolonunu NULL'a
--             çekmek sessiz veri kaybıdır ve reddedilir.
--   TRUNCATE→ bilinçli serbest (satır tetikleyicisi zaten yakalamaz):
--             `prisma migrate reset` ve test DB'sinin truncateAll'ı buna
--             dayanıyor — ledger append-only migration'ındaki aynı gerekçe.
--
-- Yasal imha/düzeltme gerektiğinde oturum bayrağı açılır. LOCAL şart: düz `SET`
-- havuzdaki bağlantıda açık kalır ve sonraki alakasız istek de silebilir.
--   SET LOCAL "tarodan.allow_identity_purge" = 'on';
CREATE OR REPLACE FUNCTION deleted_user_identities_retention() RETURNS trigger AS $$
BEGIN
  IF current_setting('tarodan.allow_identity_purge', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'deleted_user_identities: DELETE engellendi (yasal saklama kaydı)'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF (OLD.national_id  IS NOT NULL AND NEW.national_id  IS NULL)
  OR (OLD.tax_id       IS NOT NULL AND NEW.tax_id       IS NULL)
  OR (OLD.email        IS NOT NULL AND NEW.email        IS NULL)
  OR (OLD.phone        IS NOT NULL AND NEW.phone        IS NULL)
  OR (OLD.display_name IS NOT NULL AND NEW.display_name IS NULL)
  OR (OLD.iban         IS NOT NULL AND NEW.iban         IS NULL)
  THEN
    RAISE EXCEPTION
      'deleted_user_identities: dolu kimlik kolonu NULL''a çekilemez'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER deleted_user_identities_retention_guard
  BEFORE UPDATE OR DELETE ON "deleted_user_identities"
  FOR EACH ROW EXECUTE FUNCTION deleted_user_identities_retention();
