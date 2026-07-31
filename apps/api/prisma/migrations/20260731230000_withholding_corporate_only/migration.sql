-- Stopaj kapsamı kurumsal satıcıyla sınırlandırıldı.
--
-- 20260731200000_service_vat_amounts bu ayarı 'true' ile eklemişti (stopaj
-- bireysel satıcıdan da kesiliyordu). Kural değişti: stopaj yalnız kurumsal
-- (onaylı işletme + VKN) satıcıdan kesilir. Satır zaten var olduğu için INSERT
-- ... ON CONFLICT DO NOTHING mevcut kurulumlarda etkisiz kalırdı; bu yüzden
-- açıkça UPDATE ediliyor.
UPDATE "platform_settings"
SET "setting_value" = 'false',
    "description"   = 'Stopaj bireysel (vergi mükellefi olmayan) satıcıdan da kesilsin mi (kapalı = yalnız kurumsal)',
    "updated_at"    = NOW()
WHERE "setting_key" = 'withholding_applies_to_individual';

-- Ayarın hiç bulunmadığı kurulumlar (ör. taze DB) için güvenlik ağı.
INSERT INTO "platform_settings" ("id", "setting_key", "setting_value", "setting_type", "description", "created_at", "updated_at")
VALUES (gen_random_uuid(), 'withholding_applies_to_individual', 'false', 'boolean',
        'Stopaj bireysel (vergi mükellefi olmayan) satıcıdan da kesilsin mi (kapalı = yalnız kurumsal)', NOW(), NOW())
ON CONFLICT ("setting_key") DO NOTHING;
