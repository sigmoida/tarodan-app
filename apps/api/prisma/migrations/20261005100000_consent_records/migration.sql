-- Hukuki onay kayıtları (KVKK, kullanım şartları, gizlilik, mesafeli satış,
-- çerez, pazarlama izni). Müşterinin "kullanıcı bu metni kabul etti"
-- ispatının tek kaynağı: kim, hangi belge, hangi sürüm, ne zaman, nereden.
--
-- CANLI VERİ GÜVENLİĞİ: yalnız ekleme. İki yeni enum tipi + yeni tablo +
-- indeksler + FK'lar + tetikleyici. Mevcut hiçbir tablo/kolon silinmez,
-- yeniden adlandırılmaz, NOT NULL'a çekilmez. `checkout_groups
-- .distance_sales_*` kolonları yerinde kalır (yalnız okunur hale geldi);
-- içerikleri ayrı bir bakım script'iyle (`backfill:prod:distance-sales-
-- consents`) bu tabloya aktarılır — veri taşıma şema göçüne gömülmez.
CREATE TYPE "ConsentAction" AS ENUM ('granted', 'withdrawn');
CREATE TYPE "ConsentSource" AS ENUM (
  'registration',
  'consent_prompt',
  'checkout',
  'payment',
  'cookie_banner',
  'account_settings',
  'newsletter_unsubscribe',
  'account_deletion',
  'legacy_backfill'
);

CREATE TABLE "consent_records" (
    "id" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "action" "ConsentAction" NOT NULL,
    "source" "ConsentSource" NOT NULL,
    "user_id" TEXT,
    "visitor_id" TEXT,
    "guest_email" TEXT,
    "details" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "checkout_group_id" TEXT,
    "order_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- Yeniden-onay hesabı: üyenin belge başına EN SON satırı.
CREATE INDEX "consent_records_user_id_document_created_at_idx"
ON "consent_records"("user_id", "document", "created_at");

-- Admin listesi: belge filtresi + tarih sırası; varsayılan sıra created_at.
CREATE INDEX "consent_records_document_created_at_idx"
ON "consent_records"("document", "created_at");

CREATE INDEX "consent_records_created_at_idx"
ON "consent_records"("created_at");

-- Anonim çerez kayıtları ziyaretçi kimliğiyle aranır.
CREATE INDEX "consent_records_visitor_id_idx"
ON "consent_records"("visitor_id");

-- Ödeme kapısı: "bu sepet / sipariş için mesafeli satış onayı var mı".
CREATE INDEX "consent_records_checkout_group_id_idx"
ON "consent_records"("checkout_group_id");

CREATE INDEX "consent_records_order_id_idx"
ON "consent_records"("order_id");

-- RESTRICT: üyeler fiziksel silinmez (anonimleşir); kanıt satırı users
-- kaydının yanlışlıkla silinmesini de engeller.
ALTER TABLE "consent_records"
  ADD CONSTRAINT "consent_records_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- SET NULL: test şeridi temizliği sipariş/sepet satırlarını siler; onay
-- kanıtı (kişi, sürüm, zaman) bağ kopsa da yerinde kalır.
ALTER TABLE "consent_records"
  ADD CONSTRAINT "consent_records_checkout_group_id_fkey"
  FOREIGN KEY ("checkout_group_id") REFERENCES "checkout_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "consent_records"
  ADD CONSTRAINT "consent_records_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- EKLEME-YALNIZ ZORLAMASI — onay kaydı hukuki kanıttır; "değişmedi" garantisi
-- kod disiplinine bırakılmaz (elle SQL, hatalı bir servis, ileride eklenecek
-- bir temizlik işi).
--
--   DELETE   → yasak.
--   UPDATE   → yalnız yukarıdaki SET NULL FK'larının yaptığı değişiklik:
--              checkout_group_id / order_id NULL'a çekilebilir, başka HİÇBİR
--              kolon değişemez.
--   TRUNCATE → bilinçli serbest (satır tetikleyicisi yakalamaz):
--              `prisma migrate reset` ve test DB'sinin truncateAll'ı buna
--              dayanıyor — deleted_user_identities ile aynı gerekçe.
--
-- Yasal imha/düzeltme gerektiğinde oturum bayrağı açılır (LOCAL şart: düz SET
-- havuzdaki bağlantıda açık kalır):
--   SET LOCAL "tarodan.allow_consent_purge" = 'on';
CREATE OR REPLACE FUNCTION consent_records_append_only() RETURNS trigger AS $$
BEGIN
  IF current_setting('tarodan.allow_consent_purge', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'consent_records: DELETE engellendi (onay kaydı eklemeye açık tek yönlü kayıttır)'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF (NEW.checkout_group_id IS NULL OR NEW.checkout_group_id IS NOT DISTINCT FROM OLD.checkout_group_id)
  AND (NEW.order_id IS NULL OR NEW.order_id IS NOT DISTINCT FROM OLD.order_id)
  AND (to_jsonb(NEW) - 'checkout_group_id' - 'order_id')
      = (to_jsonb(OLD) - 'checkout_group_id' - 'order_id')
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'consent_records: UPDATE engellendi (yalnız silinen sipariş/sepet bağı NULL''a çekilebilir)'
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER consent_records_append_only_guard
  BEFORE UPDATE OR DELETE ON "consent_records"
  FOR EACH ROW EXECUTE FUNCTION consent_records_append_only();
