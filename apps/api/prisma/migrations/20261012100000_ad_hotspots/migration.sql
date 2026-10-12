-- Reklam tıklanabilir alanları (hotspot).
--
-- Görselli reklamda tıklama artık YALNIZ admin'in görsel üzerine çizdiği
-- alanlarda olur; alan dışı tıklama bir yere gitmez ve reklamın `link_url`'i
-- görselli reklamda kullanılmaz (daima NULL). Görselsiz (metin) reklam tek
-- `link_url`'iyle aynen çalışır, alanı olmaz.
--
-- Koordinatlar görselin kesirleridir (0–1). Kurallar tek kaynaktan:
-- `validateAdHotspots` (@tarodan/types).
--
-- Alanlar reklamla birlikte silinir (CASCADE): yalnız görsel düzeni + tık
-- sayacı taşırlar, finansal/denetim izi değiller.
BEGIN;

CREATE TABLE "advertisement_hotspots" (
    "id" TEXT NOT NULL,
    "advertisement_id" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "width" DOUBLE PRECISION NOT NULL,
    "height" DOUBLE PRECISION NOT NULL,
    "link_url" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "click_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "advertisement_hotspots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "advertisement_hotspots_advertisement_id_idx"
ON "advertisement_hotspots"("advertisement_id");

ALTER TABLE "advertisement_hotspots"
ADD CONSTRAINT "advertisement_hotspots_advertisement_id_fkey"
FOREIGN KEY ("advertisement_id") REFERENCES "advertisements"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Veri adımı: bugün tıklanabilir olan her görselli reklam (görsel + bağlantı)
-- görselin TAMAMINI kaplayan tek bir alan alır (x 0, y 0, en 1, boy 1; hedef =
-- eski link_url, ad = başlığın ilk 80 karakteri) ve link_url'i boşaltılır.
-- Böylece mevcut reklamlar göç sonrası tam eskisi gibi tıklanır; admin alanı
-- dilediğinde daraltır/böler. Boş dize de "yok" sayılır (BlankToNull öncesi
-- kayıtlar). Reklamın tık geçmişi reklamda kalır; yeni alanın sayacı 0'dan
-- başlar.
INSERT INTO "advertisement_hotspots" (
    "id", "advertisement_id", "x", "y", "width", "height",
    "link_url", "label", "sort_order", "click_count", "created_at", "updated_at"
)
SELECT gen_random_uuid()::text, "id", 0, 0, 1, 1,
       "link_url", left(btrim("title"), 80), 0, 0, NOW(), NOW()
  FROM "advertisements"
 WHERE COALESCE("image_url", '') <> ''
   AND COALESCE("link_url", '') <> '';

-- Görselli reklamın link_url'i kural gereği NULL (servis de böyle yazar).
UPDATE "advertisements"
   SET "link_url" = NULL, "updated_at" = NOW()
 WHERE COALESCE("image_url", '') <> ''
   AND "link_url" IS NOT NULL;

COMMIT;
