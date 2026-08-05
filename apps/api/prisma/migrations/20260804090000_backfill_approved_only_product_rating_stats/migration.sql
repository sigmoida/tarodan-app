-- Ürün kartındaki yorum sayısı/ortalamasını YALNIZ onaylı yorumlardan yeniden hesapla.
--
-- products.average_rating / rating_count, ürün kartının ve arama dokümanının tek
-- kaynağıdır (kart hiç product_ratings okumaz). Bu kolonları besleyen iki yazar
-- vardı ve biri filtresizdi: seed'in toplu backfill'i TÜM satırları sayıyordu.
-- Sonuç, kullanıcının gördüğü hayalet yorum: kartta "(3)" yazıyor, ürün detayında
-- yorum listesi boş, admin panelinde o yorumlar `pending`. Aynı sapma
-- post-moderasyonda da oluşabilir — bir yorum `rejected`/`spam`/`deleted`
-- yapıldığında kolonlar elle güncellenmediyse sayaç yüksek kalır.
--
-- Yazar tarafı kodda düzeltildi (seed + RatingService.updateProductRatingStats
-- ortak publicProductRatingWhere filtresini kullanıyor); burada mevcut satırlar
-- gerçeğe döndürülüyor. Idempotent: tekrar çalıştırmak aynı sonucu verir.

-- 1) Onaylı yorumu OLAN ürünler → gerçek ortalama + sayı.
UPDATE "products" p
SET "average_rating" = agg.avg_score,
    "rating_count"   = agg.cnt
FROM (
  SELECT pr."product_id",
         ROUND(AVG(pr."score")::numeric, 2) AS avg_score,
         COUNT(*)::int                      AS cnt
  FROM "product_ratings" pr
  WHERE pr."status" = 'approved'
  GROUP BY pr."product_id"
) agg
WHERE p."id" = agg."product_id"
  AND (p."average_rating" IS DISTINCT FROM agg.avg_score
       OR p."rating_count" IS DISTINCT FROM agg.cnt);

-- 2) Onaylı yorumu OLMAYAN ürünler → sıfırla. Kartın "puan yok" dalına düşmesi
--    için ortalama NULL olmalı (0.00 gerçek bir puan gibi görünürdü).
UPDATE "products" p
SET "average_rating" = NULL,
    "rating_count"   = 0
WHERE (p."average_rating" IS NOT NULL OR p."rating_count" <> 0)
  AND NOT EXISTS (
    SELECT 1
    FROM "product_ratings" pr
    WHERE pr."product_id" = p."id"
      AND pr."status" = 'approved'
  );
