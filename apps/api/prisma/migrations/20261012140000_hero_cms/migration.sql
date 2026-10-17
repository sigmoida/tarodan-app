-- Vitrin hero'su + güven rozetleri admin'den yönetilir (docs/HERO_CMS.md).
--
-- CANLI VERİ GÜVENLİĞİ: yalnız ekleme. İki enum, iki tablo; mevcut tablolara
-- dokunulmaz. Satırlar göçle değil referans seed'iyle (`seed-production.ts`)
-- gelir: bugünkü ana sayfa slaytı, iki auth görseli ve altı rozet — tablo
-- boşken bir kez.
--
-- Metin kolonları `LocalizedText` JSON'udur (`{ tr, en? }`): tr zorunlu, en
-- boşsa istemci tr'ye düşer.

CREATE TYPE "HeroPlacement" AS ENUM ('home', 'auth_default', 'auth_register');

CREATE TYPE "HeroImageSide" AS ENUM ('left', 'right');

CREATE TABLE "hero_slides" (
    "id" TEXT NOT NULL,
    "placement" "HeroPlacement" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "image_url" TEXT NOT NULL,
    "mobile_image_url" TEXT,
    "image_side" "HeroImageSide" NOT NULL DEFAULT 'right',
    "title" JSONB NOT NULL,
    "subtitle" JSONB,
    "image_alt" JSONB,
    "cta1_label" JSONB,
    "cta1_href" TEXT,
    "cta2_label" JSONB,
    "cta2_href" TEXT,
    "hide_on_ios" BOOLEAN NOT NULL DEFAULT false,
    "impression_count" INTEGER NOT NULL DEFAULT 0,
    "click_count" INTEGER NOT NULL DEFAULT 0,
    "cta1_click_count" INTEGER NOT NULL DEFAULT 0,
    "cta2_click_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hero_slides_pkey" PRIMARY KEY ("id")
);

-- Public okuma: yerleşim + anahtar süzülür, sıra ile döner.
CREATE INDEX "hero_slides_placement_is_active_display_order_idx"
ON "hero_slides"("placement", "is_active", "display_order");

CREATE TABLE "trust_badges" (
    "id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "icon" TEXT NOT NULL,
    "title" JSONB NOT NULL,
    "description" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trust_badges_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "trust_badges_is_active_display_order_idx"
ON "trust_badges"("is_active", "display_order");
