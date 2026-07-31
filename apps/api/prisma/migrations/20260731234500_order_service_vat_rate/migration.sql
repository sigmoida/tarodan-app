-- Siparişe hizmet KDV oranı snapshot'ı.
--
-- Hizmet KDV'si taraf toplamı olarak saklanıyordu (buyer/seller_service_tax_amount);
-- matrahlar da kolon olarak duruyor. Eksik olan tek şey ORAN'dı, bu yüzden ekranlar
-- "komisyon KDV'si 12 / kargo KDV'si 10 / hizmet bedeli KDV'si 10" kırılımını
-- üretemiyordu. Oranı güncel ayardan okumak geçmiş siparişi yanlış gösterirdi
-- (ayar değişirse), bu yüzden sipariş anında dondurulur.
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "service_vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- Mevcut siparişler: hizmet KDV'si tahsil edilmiş olanlara o an geçerli olan
-- ayardaki oran yazılır. KDV'si sıfır olanlar 0 kalır (oran uygulanmamıştır).
UPDATE "orders" o
SET "service_vat_rate" = COALESCE(
  (SELECT NULLIF(s."setting_value", '')::numeric
     FROM "platform_settings" s
    WHERE s."setting_key" = 'service_vat_rate'),
  20
)
WHERE o."buyer_service_tax_amount" > 0
   OR o."seller_service_tax_amount" > 0;
