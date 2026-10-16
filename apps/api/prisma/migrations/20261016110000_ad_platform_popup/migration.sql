-- Reklam platformu (web / uygulama / ikisi) + popup gösterim sıklığı.
--
-- `platform`, `device_type`'ın (desktop / mobile / all) yerini alır: masaüstü
-- ile mobil tarayıcı ayrımı yerine site ile mobil uygulama ayrımı. Eski
-- değerler birebir taşınır: desktop → web, mobile → app, all → all.
-- `device_type` kolonu SİLİNMEZ: eski mobil sürümler yanıttaki `deviceType`'a
-- göre süzüyor; API onu artık `platform`'dan türetir ve yazar.
--
-- `ContentPlatform` tipi hero slaytlarıyla ortaktır; hangi göç önce çalışırsa
-- o kurar (`duplicate_object` yutulur), öbürü var olanı kullanır.
--
-- CANLI VERİ GÜVENLİĞİ: yalnız ekleme + geri doldurma; satır silinmez.
DO $$ BEGIN CREATE TYPE "ContentPlatform" AS ENUM ('web', 'app', 'all'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TYPE "AdPopupFrequency" AS ENUM ('every_visit', 'until_dismissed');

ALTER TABLE "advertisements"
    ADD COLUMN "platform" "ContentPlatform" NOT NULL DEFAULT 'all',
    ADD COLUMN "popup_frequency" "AdPopupFrequency" NOT NULL DEFAULT 'until_dismissed',
    ADD COLUMN "popup_version" INTEGER NOT NULL DEFAULT 1;

-- Geri doldurma: `updated_at`'e dokunulmaz (içerik değişmedi).
UPDATE "advertisements"
   SET "platform" = CASE "device_type"
       WHEN 'desktop' THEN 'web'::"ContentPlatform"
       WHEN 'mobile' THEN 'app'::"ContentPlatform"
       ELSE 'all'::"ContentPlatform"
   END;

-- Public okuma artık yuva + platform + anahtar ile süzer.
DROP INDEX IF EXISTS "advertisements_position_device_type_is_active_idx";
CREATE INDEX "advertisements_position_platform_is_active_idx"
ON "advertisements"("position", "platform", "is_active");
