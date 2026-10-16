-- Hero slaytının hedef istemcisi (docs/HERO_CMS.md): `web` site, `app` mobil
-- uygulama, `all` ikisi. Public okuma `?platform=` ile süzer.
--
-- CANLI VERİ GÜVENLİĞİ: yalnız ekleme. Yeni kolon varsayılanla gelir — mevcut
-- slaytlar `all` olur, bugünkü görünürlük değişmez.
--
-- `ContentPlatform` reklamla ortaktır; iki göçten hangisi önce koşarsa tipi o
-- kurar, öbürü atlar (duplicate_object yutulur). Değerler iki göçte birebir
-- aynıdır.

DO $$ BEGIN CREATE TYPE "ContentPlatform" AS ENUM ('web', 'app', 'all'); EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "hero_slides" ADD COLUMN "platform" "ContentPlatform" NOT NULL DEFAULT 'all';
