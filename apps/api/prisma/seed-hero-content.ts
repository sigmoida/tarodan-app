/**
 * Vitrin hero'su + güven rozetleri — REFERANS verisi (docs/HERO_CMS.md).
 *
 * Kodda yedek slayt yok: web ve mobil yalnız veritabanından okur. Bu dosya
 * bugünkü vitrini (web'deki eski sabit tanımlar: ana sayfa 1. slaytı, auth
 * görselleri, altı rozet) bir kez kurar; sonrası admin'in işidir.
 *
 * İki koruma, ikisi de "admin'in kararını ezme" kuralı için:
 *  - `update: {}` — var olan satıra dokunulmaz (admin düzenlemesi kalıcı),
 *  - yerleşim (rozetler için tablo) BOŞSA yazılır — admin seed slaytını silip
 *    yerine kendisininkini koyduysa, her açılışta koşan seed onu geri
 *    getirmez.
 *
 * Görseller S3'teki yönetilen `seed-assets/hero/` önekindedir (web'in
 * `heroImageUrl` varsayılan kökü); mutlak URL saklanır.
 */
import type { HeroPlacement, Prisma, PrismaClient } from "@prisma/client";
import { HERO_SEED_IDS, TRUST_BADGE_SEED_IDS } from "./seed-ids";

const HERO_ASSET_BASE =
  "https://amzn-tarodan.s3.eu-west-1.amazonaws.com/seed-assets/hero";

const IMAGE_ALT = {
  tr: "Diecast model araç koleksiyonu",
  en: "Diecast model car collection",
};

export const HERO_SEED_SLIDES: ReadonlyArray<
  Prisma.HeroSlideCreateInput & { id: string; placement: HeroPlacement }
> = [
  {
    id: HERO_SEED_IDS.homeMarketplace,
    placement: "home",
    displayOrder: 0,
    imageUrl: `${HERO_ASSET_BASE}/hero-marketplace.png`,
    imageSide: "right",
    title: {
      tr: "Türkiye'nin En Büyük\nDiecast Pazaryeri",
      en: "Turkey's Largest\nDiecast Marketplace",
    },
    subtitle: {
      tr: "Diecast modelleri satın alın, satın ve takas edin. Dijital Garajınızı oluşturun ve koleksiyonunuzu sergileyin.",
      en: "Buy, sell, and trade diecast models. Create your Digital Garage and showcase your collection.",
    },
    imageAlt: IMAGE_ALT,
    cta1Label: { tr: "Koleksiyonları Keşfet", en: "Explore Collections" },
    cta1Href: "/collections",
    cta2Label: { tr: "Pazaryerini İncele", en: "Browse Marketplace" },
    cta2Href: "/listings",
  },
  {
    id: HERO_SEED_IDS.authDefault,
    placement: "auth_default",
    displayOrder: 0,
    imageUrl: `${HERO_ASSET_BASE}/hero-marketplace.png`,
    imageSide: "right",
    title: {
      tr: "Koleksiyonun Kalbi Burada",
      en: "Where Collections Come Alive",
    },
    subtitle: {
      tr: "Binlerce diecast model, tek adres. Aradığını bul, koleksiyonunu büyüt.",
      en: "Thousands of diecast models, one place. Find it, own it, grow it.",
    },
    imageAlt: IMAGE_ALT,
  },
  {
    id: HERO_SEED_IDS.authRegister,
    placement: "auth_register",
    displayOrder: 0,
    imageUrl: `${HERO_ASSET_BASE}/hero-hot-wheels.png`,
    imageSide: "left",
    title: { tr: "Koleksiyonun Başlasın", en: "Let the Collection Begin" },
    subtitle: {
      tr: "Ücretsiz katıl, ilk modelini bugün keşfet.",
      en: "Join free and discover your first model today.",
    },
    imageAlt: IMAGE_ALT,
  },
];

/**
 * İade rozetinin süresi metne gömülmez: `{returnWindowDays}` belirteci public
 * uçta Süreler ve Kurallar'ın güncel değeriyle dolar.
 */
export const TRUST_BADGE_SEED: ReadonlyArray<
  Prisma.TrustBadgeCreateInput & { id: string }
> = [
  {
    id: TRUST_BADGE_SEED_IDS.secureShopping,
    displayOrder: 0,
    icon: "shield-check",
    title: { tr: "Güvenli Alışveriş", en: "Secure Shopping" },
    description: {
      tr: "SSL sertifikalı güvenli ödeme",
      en: "SSL certified secure payment",
    },
  },
  {
    id: TRUST_BADGE_SEED_IDS.secureShipping,
    displayOrder: 1,
    icon: "truck",
    title: { tr: "Güvenli Kargo", en: "Secure Shipping" },
    description: { tr: "Hızlı takip imkanıyla", en: "With fast tracking" },
  },
  {
    id: TRUST_BADGE_SEED_IDS.returns,
    displayOrder: 2,
    icon: "arrow-path",
    title: { tr: "İade İmkanı", en: "Easy Returns" },
    description: {
      tr: "{returnWindowDays} gün koşulsuz iade",
      en: "{returnWindowDays}-day unconditional returns",
    },
  },
  {
    id: TRUST_BADGE_SEED_IDS.installments,
    displayOrder: 3,
    icon: "credit-card",
    title: { tr: "Taksit İmkanı", en: "Installments" },
    description: {
      tr: "12 aya varan taksit",
      en: "Up to 12 month installments",
    },
  },
  {
    id: TRUST_BADGE_SEED_IDS.collection,
    displayOrder: 4,
    icon: "rectangle-stack",
    title: { tr: "Koleksiyon Sergile", en: "Display Collection" },
    description: {
      tr: "Dijital garajını oluştur",
      en: "Create your digital garage",
    },
  },
  {
    id: TRUST_BADGE_SEED_IDS.trading,
    displayOrder: 5,
    icon: "arrows-right-left",
    title: { tr: "Güvenli Takas", en: "Safe Trading" },
    description: {
      tr: "Güvenli takas sistemi",
      en: "Secure trading system",
    },
  },
];

type HeroSeedClient = Pick<PrismaClient, "heroSlide" | "trustBadge">;

export async function seedHeroContent(prisma: HeroSeedClient): Promise<void> {
  for (const slide of HERO_SEED_SLIDES) {
    // Yerleşimde (silinmiş seed dahil) admin'in slaytı varsa dokunma.
    const existing = await prisma.heroSlide.count({
      where: { placement: slide.placement },
    });
    if (existing > 0) continue;
    await prisma.heroSlide.upsert({
      where: { id: slide.id },
      create: slide,
      update: {},
    });
  }

  if ((await prisma.trustBadge.count()) === 0) {
    for (const badge of TRUST_BADGE_SEED) {
      await prisma.trustBadge.upsert({
        where: { id: badge.id },
        create: badge,
        update: {},
      });
    }
  }
}
