-- Hizmet bedeli KDV'si: "alıcıya verdiğimiz her hizmet için alıcıdan, satıcıya
-- verdiğimiz her hizmet için satıcıdan %20 KDV".
--
-- İki toplam saklanır, kalem bazında KDV saklanmaz: matrahların hepsi (komisyon,
-- hizmet bedeli, kargo payı) zaten bu tabloda kolon olarak duruyor, kırılım
-- oradan türetilir.
ALTER TABLE "orders" ADD COLUMN "buyer_service_tax_amount"  DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN "seller_service_tax_amount" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Vergi politikası ayarları — hiçbir oran koda gömülü değil, hepsi admin'den.
-- Mevcut kurulumda satır varsa dokunulmaz (ON CONFLICT DO NOTHING).
INSERT INTO "platform_settings"
  ("id", "setting_key", "setting_value", "setting_type", "description", "created_at", "updated_at")
VALUES
  -- Ürün KDV'si KAPALI: vitrin fiyatı KDV dahil kabul edilir, beyanı satıcı yapar.
  -- TaxRule/TaxRate altyapısı KALDIRILMADI; bu ayar true yapılınca geri devreye girer.
  (gen_random_uuid(), 'product_vat_enabled', 'false', 'boolean',
   'Ürün bedeline KDV uygulansın mı (kapalıysa vitrin fiyatı KDV dahil sayılır)', NOW(), NOW()),
  (gen_random_uuid(), 'service_vat_enabled', 'true', 'boolean',
   'Hizmet bedellerine (komisyon, hizmet bedeli, kargo payı) KDV uygulansın mı', NOW(), NOW()),
  (gen_random_uuid(), 'service_vat_rate', '20', 'number',
   'Hizmet bedeli KDV oranı (%)', NOW(), NOW()),
  -- Stopaj artık bireysel satıcıdan da kesilir.
  (gen_random_uuid(), 'withholding_applies_to_individual', 'true', 'boolean',
   'Stopaj bireysel (vergi mükellefi olmayan) satıcıdan da kesilsin mi', NOW(), NOW())
ON CONFLICT ("setting_key") DO NOTHING;
