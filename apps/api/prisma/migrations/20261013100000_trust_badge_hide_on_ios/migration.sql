-- Güven rozetlerine hero slaytındaki `hide_on_ios` bayrağının aynısı:
-- mobil uygulama (iOS ve Android) işaretli rozeti göstermez, web yok sayar
-- (dijital satış native'de kapalı; docs/HERO_CMS.md).
--
-- CANLI VERİ GÜVENLİĞİ: yalnız ekleme. Sabit varsayılanlı NOT NULL kolon
-- (false) mevcut satırlara anında uygulanır; hiçbir rozetin davranışı değişmez
-- ve geri alma tek `DROP COLUMN`dur.
ALTER TABLE "trust_badges" ADD COLUMN "hide_on_ios" BOOLEAN NOT NULL DEFAULT false;
