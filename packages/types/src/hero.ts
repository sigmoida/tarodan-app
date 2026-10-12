import type { LocalizedText } from "./localized-text";

/**
 * Admin'in yönettiği vitrin hero'su (ana sayfa slider'ı, giriş/kayıt ekranı
 * görseli) ve ana sayfa güven rozetleri — API, admin, web ve mobil aynı
 * sözleşmeyi okur. Kaynak yalnız veritabanıdır: kodda yedek slayt yoktur.
 * Ayrıntı: docs/HERO_CMS.md.
 */

/** Slaytın gösterildiği yer. `auth_register` kayıt ekranları, `auth_default` diğer giriş ekranları. */
export const HERO_PLACEMENTS = ["home", "auth_default", "auth_register"] as const;
export type HeroPlacement = (typeof HERO_PLACEMENTS)[number];

/** Görselin geniş ekranda durduğu taraf; metin öbür tarafa yerleşir. */
export const HERO_IMAGE_SIDES = ["left", "right"] as const;
export type HeroImageSide = (typeof HERO_IMAGE_SIDES)[number];

/** Bir yerleşimde AYNI ANDA yayında olabilecek en çok slayt. */
export const HERO_MAX_SLIDES = 5;

/** Metin alanlarının dil başına en çok uzunluğu. */
export const HERO_TEXT_LIMITS = {
  title: 120,
  subtitle: 240,
  ctaLabel: 40,
  imageAlt: 160,
} as const;

/** Slayttaki buton sırası (`POST /hero-slides/:id/click?cta=1|2`). */
export const HERO_CTA_SLOTS = [1, 2] as const;
export type HeroCtaSlot = (typeof HERO_CTA_SLOTS)[number];

export interface HeroCtaDto {
  label: LocalizedText;
  /** Mutlak http(s) URL ya da tek `/` ile başlayan site içi yol. */
  href: string;
}

/** `GET /hero-slides?placement=` öğesi — iki dil birden döner. */
export interface HeroSlideDto {
  id: string;
  placement: HeroPlacement;
  imageUrl: string;
  /** Mobil görsel; yoksa `imageUrl` kullanılır. */
  mobileImageUrl: string | null;
  imageSide: HeroImageSide;
  title: LocalizedText;
  subtitle: LocalizedText | null;
  imageAlt: LocalizedText | null;
  cta1: HeroCtaDto | null;
  cta2: HeroCtaDto | null;
  /** Mobil uygulama iOS'ta bu slaytı göstermez; web yok sayar. */
  hideOnIos: boolean;
}

/**
 * Admin listesi/detayı (`/admin/hero-slides`) — yazma gövdesiyle aynı düz
 * alanlar + durum + sayaçlar. Tarihler ISO dizesidir.
 */
export interface AdminHeroSlideDto {
  id: string;
  placement: HeroPlacement;
  isActive: boolean;
  /** Şu an vitrinde mi (anahtar açık + tarih penceresinin içinde). */
  isLive: boolean;
  displayOrder: number;
  startDate: string | null;
  endDate: string | null;
  imageUrl: string;
  mobileImageUrl: string | null;
  imageSide: HeroImageSide;
  title: LocalizedText;
  subtitle: LocalizedText | null;
  imageAlt: LocalizedText | null;
  cta1Label: LocalizedText | null;
  cta1Href: string | null;
  cta2Label: LocalizedText | null;
  cta2Href: string | null;
  hideOnIos: boolean;
  impressionCount: number;
  /** Slayta yapılan tüm tıklar (görsel + iki buton). */
  clickCount: number;
  cta1ClickCount: number;
  cta2ClickCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Güven rozeti ikonları — sabit liste (heroicons outline adları). İstemci
 * anahtarı kendi ikon setine eşler; bilinmeyen anahtarı göstermez.
 */
export const TRUST_BADGE_ICONS = [
  "shield-check",
  "truck",
  "arrow-path",
  "credit-card",
  "rectangle-stack",
  "arrows-right-left",
] as const;
export type TrustBadgeIcon = (typeof TRUST_BADGE_ICONS)[number];

export const TRUST_BADGE_LIMITS = {
  title: 60,
  description: 160,
} as const;

/**
 * `GET /trust-badges` öğesi. Metindeki herkese açık süre belirteçleri
 * (`{returnWindowDays}` …) API'de güncel değerle doldurulmuş gelir.
 */
export interface TrustBadgeDto {
  id: string;
  icon: TrustBadgeIcon;
  title: LocalizedText;
  description: LocalizedText | null;
}

/** Admin listesi/detayı (`/admin/trust-badges`) — metin ham (belirteçli) döner. */
export interface AdminTrustBadgeDto extends TrustBadgeDto {
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}
