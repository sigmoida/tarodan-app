-- İlanın vitrinden düşme NEDENİ: kim, hangi nedenle, ne zaman.
-- Bkz. docs/LISTING_REMOVAL_REASONS.md.
--
-- CANLI VERİ GÜVENLİĞİ: yalnız ekleme. Bir yeni enum tipi + `products`a bir
-- boş bırakılabilir, varsayılansız kolon + yeni tablo + indeksler + FK +
-- tetikleyici. Mevcut hiçbir tablo/kolon silinmez, yeniden adlandırılmaz, NOT
-- NULL'a çekilmez. GERİ DOLDURMA YOK (ürün kararı): bu göçten önce düşmüş
-- ilanlar `removal_reason = NULL` kalır ve "bilinmiyor" görünür — eski
-- ilanların nedenini tahmin etmek yanlış veri üretirdi.
--
-- `products.inactive_reason` DEĞİŞMEZ: o, satıcının pasif ilanla ne
-- yapabileceğini söyleyen davranış işaretidir (yenileme / karantinadan
-- doğrudan açma) ve okuyanları aynen çalışır. Yeni kolon açıklamadır.

CREATE TYPE "ListingRemovalReason" AS ENUM (
  'not_given',
  'changed_mind',
  'sold_elsewhere',
  'paused_temporarily',
  'expired',
  'out_of_stock',
  'return_quarantine',
  'seller_suspended',
  'policy_violation'
);

-- İlanın GÜNCEL nedeni (son kaldırma olayının kopyası) — liste ve filtre
-- JOIN'siz okusun diye. Boş: vitrindeki ilan ya da nedeni bilinmeyen eski ilan.
ALTER TABLE "products" ADD COLUMN "removal_reason" "ListingRemovalReason";

-- Kaldırma olayları: ekleme-yalnız. Dashboard dönem kırılımı `created_at`
-- (olay anı) ile sayar; yeniden açılıp tekrar kaldırılan ilan iki satırdır.
CREATE TABLE "product_removal_events" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "reason" "ListingRemovalReason" NOT NULL,
    "platform" TEXT,
    "violation_code" TEXT,
    "detail" TEXT,
    "status_before" "ProductStatus" NOT NULL,
    "status_after" "ProductStatus" NOT NULL,
    -- İlan olaydan önce vitrindeydi mi (status_before = active ya da reserved)? Dashboard
    -- yalnız bunları "vitrinden düşüş" sayar; kayıt anında yazılır.
    "from_storefront" BOOLEAN NOT NULL,
    "actor_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_removal_events_pkey" PRIMARY KEY ("id")
);

-- Dashboard: dönem penceresindeki vitrinden düşüşler.
CREATE INDEX "product_removal_events_from_storefront_created_at_idx"
ON "product_removal_events"("from_storefront", "created_at");

-- Admin ürün detayı/listesi: ilanın son kaldırması ve geçmişi.
CREATE INDEX "product_removal_events_product_id_created_at_idx"
ON "product_removal_events"("product_id", "created_at" DESC);

-- Dashboard: nedene göre dönem sayımı.
CREATE INDEX "product_removal_events_reason_created_at_idx"
ON "product_removal_events"("reason", "created_at");

-- Admin ürün listesi: kaldırma nedeni / kaldıran filtresi.
CREATE INDEX "products_removal_reason_idx" ON "products"("removal_reason");

-- CASCADE: ürün satırı yalnız siparişi/teklifi olmamış ilanın yönetici "kalıcı
-- silmesi" ve dev sıfırlamasıyla silinir; bağlanacak ilanı kalmayan kaldırma
-- kaydının tutulacak anlamı yoktur ve RESTRICT o iki yolu kırardı.
ALTER TABLE "product_removal_events"
  ADD CONSTRAINT "product_removal_events_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- EKLEME-YALNIZ ZORLAMASI — geçmiş bir kaldırmanın nedeni sonradan
-- değiştirilemez; "değişmedi" garantisi kod disiplinine bırakılmaz.
--   UPDATE → yasak.
--   DELETE → serbest: yalnız yukarıdaki CASCADE'in yolu (ürünün kendisi
--            silindiğinde); uygulamada satır silen kod yoktur.
CREATE OR REPLACE FUNCTION product_removal_events_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'product_removal_events: UPDATE engellendi (kaldırma kaydı eklemeye açık tek yönlü kayıttır)'
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER product_removal_events_append_only_guard
  BEFORE UPDATE ON "product_removal_events"
  FOR EACH ROW EXECUTE FUNCTION product_removal_events_append_only();
