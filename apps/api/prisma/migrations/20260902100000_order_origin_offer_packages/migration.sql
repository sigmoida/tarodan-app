-- Sipariş kaynağı artık AÇIK kolon. Eskiden tek ayırt edici `offer_id` idi: yönetim
-- listesi teklif siparişini doğrudan satıştan ayıramıyor, filtreleyemiyordu.
-- Geçmiş kayıtlar offer_id ve ürün türünden (üyelik/öne çıkarma = platform hizmeti)
-- doldurulur.
CREATE TYPE "OrderOrigin" AS ENUM ('direct_sale', 'offer', 'platform_service');

ALTER TABLE "orders" ADD COLUMN "origin" "OrderOrigin" NOT NULL DEFAULT 'direct_sale';

UPDATE "orders" SET "origin" = 'offer' WHERE "offer_id" IS NOT NULL;

UPDATE "orders" o
SET "origin" = 'platform_service'
FROM "products" p
WHERE p."id" = o."product_id" AND p."kind" <> 'listing' AND o."offer_id" IS NULL;

CREATE INDEX "orders_origin_idx" ON "orders"("origin");

-- Teklif siparişi de KOLİ (order_packages) taşır: tek biçim, Sürat referansı PKG-…,
-- desi/tarife koliden. Eski teklif siparişleri paketsizdi; onlara paket üretilir.
--   * Koli numarası sipariş numarasından TEK SEFERLİK türetilir (ORD-X → PKG-X):
--     tekillik order_number'dan gelir, SQL içinde rastgele kod üretmeye gerek kalmaz.
--     NOT EXISTS koruması olası çakışmada satırı atlar (paketsiz kalır, loglanır).
--   * GEÇMİŞ KARGO KODLARINA DOKUNULMAZ: shipments.tracking_number ve
--     provider_tracking_id güncellenmez. Canlı gönderisi olan siparişte
--     carrier_reference = mevcut tracking_number (ORD-…) yazılır; böylece
--     resolveCarrierReference tekrar barkod açsa bile AYNI referansı gönderir ve
--     takip/retry kesintisiz sürer. PKG- numarası bu kayıtlarda yalnız iç kimliktir.
--   * Tarife snapshot alanları NULL kalır (eski kayıtlar için şema izinli).
INSERT INTO "order_packages" (
  "id", "package_number", "carrier_reference", "checkout_group_id",
  "seller_id", "buyer_id",
  "shipping_cost", "full_shipping_amount", "buyer_shipping_amount", "seller_shipping_amount",
  "billable_desi", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  'PKG-' || substr(o."order_number", 5),
  s."tracking_number",
  NULL,
  o."seller_id", o."buyer_id",
  o."shipping_cost",
  COALESCE(o."buyer_shipping_amount", 0) + COALESCE(o."seller_shipping_amount", 0),
  o."buyer_shipping_amount", o."seller_shipping_amount",
  GREATEST(COALESCE(p."shipping_desi", 1), 1),
  o."created_at", NOW()
FROM "orders" o
JOIN "products" p ON p."id" = o."product_id"
LEFT JOIN "shipments" s ON s."order_id" = o."id"
WHERE o."offer_id" IS NOT NULL
  AND o."package_id" IS NULL
  AND p."kind" = 'listing'
  AND o."order_number" LIKE 'ORD-%'
  AND NOT EXISTS (
    SELECT 1 FROM "order_packages" x
    WHERE x."package_number" = 'PKG-' || substr(o."order_number", 5)
  );

-- Yalnız bu göçün ürettiği koliye bağla: aynı numaralı yabancı bir koli
-- (NOT EXISTS ile atlanan satır) sahiplik uyuşmazsa bağlanmaz, paketsiz kalır.
UPDATE "orders" o
SET "package_id" = x."id"
FROM "order_packages" x
WHERE o."offer_id" IS NOT NULL
  AND o."package_id" IS NULL
  AND x."package_number" = 'PKG-' || substr(o."order_number", 5)
  AND x."seller_id" = o."seller_id"
  AND x."buyer_id" = o."buyer_id"
  AND x."checkout_group_id" IS NULL;

UPDATE "shipments" s
SET "package_id" = o."package_id"
FROM "orders" o
WHERE o."id" = s."order_id" AND s."package_id" IS NULL AND o."package_id" IS NOT NULL;

-- Tam iadesi yapılmış teklif siparişinin teklifi `accepted` kalıyordu; "Ödemeyi
-- tamamla" / reactivate yeniden açılabiliyordu. Ödemesi tamamlanmış ya da iade
-- edilmiş, kapanmış sipariş = teklif kapalı. Metin OFFER_CANCEL_REASON.orderRefunded
-- ile birebir aynıdır.
UPDATE "offers" f
SET "status" = 'cancelled',
    "cancel_reason" = 'Bağlı sipariş iade edildiği için teklif kapatıldı',
    "updated_at" = NOW()
FROM "orders" o
JOIN "payments" pay ON pay."order_id" = o."id"
WHERE o."offer_id" = f."id"
  AND f."status" = 'accepted'
  AND o."status" IN ('cancelled', 'refunded')
  AND pay."status" IN ('completed', 'refunded');

-- Teklif listeleri alıcı/satıcıya göre sorgulanıyor; yönetim listesi durum+tarih ile
-- sıralıyor. Bugüne kadar yalnız product_id ve status indeksliydi.
CREATE INDEX "offers_buyer_id_status_idx" ON "offers"("buyer_id", "status");
CREATE INDEX "offers_seller_id_status_idx" ON "offers"("seller_id", "status");
CREATE INDEX "offers_status_created_at_idx" ON "offers"("status", "created_at");
