-- İlan kaldırma nedenleri — iki takip kararı (docs/LISTING_REMOVAL_REASONS.md).
--
-- CANLI VERİ GÜVENLİĞİ: yalnız ekleme. Bir yeni enum değeri + olay tablosuna
-- varsayılanlı (false) bir boolean kolon + indeks. GERİ DOLDURMA YOK (ürün
-- kararı): bu göçten önce takasla stoğu biten ilanlar `out_of_stock` kalır;
-- önceki olaylar `late_sold_elsewhere = false` (eski sayım aynen sürer).
-- `product_removal_events` UPDATE'e kapalı olduğundan (tetikleyici) mevcut
-- satırlara dokunulmaz — kolon yalnız bu göçten sonraki olaylarda yazılır.
--
-- 1) `traded`: takas Tarodan'da tamamlandığı için stoğu biten ilanın nedeni
--    artık "stok tükendi" değil "Tarodan'da takas edildi". Kataloğun sırasını
--    korumak için `out_of_stock`tan hemen sonra eklenir.
--
-- NOT: yeni enum değeri bu göç içinde kullanılmaz, bu yüzden göç transaction'ı
-- içinde güvenlidir (PostgreSQL 12+).
ALTER TYPE "ListingRemovalReason" ADD VALUE IF NOT EXISTS 'traded' AFTER 'out_of_stock';

-- 2) `late_sold_elsewhere`: zaten vitrinden düşmüş ilanın sonradan "başka
--    platformda sattım" diye kaldırılması (ör. süresi dolmuş ilanın silinmesi).
--    Toplam sayıma (from_storefront) girmez ama dashboard'ın platform kırılımına
--    girer. Kayıt anında yazılır; kural @tarodan/types `isLateSoldElsewhere`.
ALTER TABLE "product_removal_events"
  ADD COLUMN "late_sold_elsewhere" BOOLEAN NOT NULL DEFAULT false;

-- Dashboard: dönem penceresindeki geç platform cevapları.
CREATE INDEX "product_removal_events_late_sold_elsewhere_created_at_idx"
ON "product_removal_events"("late_sold_elsewhere", "created_at");
