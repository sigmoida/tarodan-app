-- Ürün KDV'si kavramı sistemden kaldırıldı.
--
-- Vitrin fiyatı KDV dahil kabul edilir ve ürün bedelinin beyanı satıcıya aittir;
-- platform ürün üzerinden KDV tahsil etmez. Tahsil edilen tek KDV, platformun
-- kendi hizmetlerinin (komisyon, kargo payı, hizmet bedeli) KDV'sidir.
-- Ayar artık hiçbir kod yolunda okunmuyor — kalması, kapatılmış bir davranışın
-- hâlâ açılabilir olduğu izlenimini veriyordu.
DELETE FROM "platform_settings" WHERE "setting_key" = 'product_vat_enabled';
