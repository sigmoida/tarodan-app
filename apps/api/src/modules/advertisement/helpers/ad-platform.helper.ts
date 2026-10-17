import type { AdDeviceType, AdPosition, Prisma } from "@prisma/client";
import { locales } from "@tarodan/i18n";
import { trCalendarDate } from "../../../common/helpers/tr-calendar";
import {
  CLIENT_PLATFORMS,
  clientPlatformsOf,
  contentPlatformsFor,
  type ClientPlatform,
  type ContentPlatform,
} from "@tarodan/types";

/**
 * Reklamın platformu (web / uygulama / ikisi) ve "bir yuvada tek reklam"
 * kuralı — saf yardımcılar. Platform anlamının tek kaynağı
 * `@tarodan/types` (`content-platform`); burada yalnız reklama özgü
 * eşlemeler var.
 */

/**
 * DEPRECATED `deviceType`'ın `platform`'dan türetilmiş değeri. Eski mobil
 * sürümler yanıttaki `deviceType`'ı `all | mobile` ile süzüyor; kolon da her
 * yazımda bununla güncel tutulur (geri dönüşte veri tutarlı kalsın).
 */
const DEVICE_TYPE_BY_PLATFORM = {
  web: "desktop",
  app: "mobile",
  all: "all",
} as const satisfies Record<ContentPlatform, AdDeviceType>;

export function adDeviceTypeFor(platform: ContentPlatform): AdDeviceType {
  return DEVICE_TYPE_BY_PLATFORM[platform];
}

const isClientPlatform = (value: string): value is ClientPlatform =>
  (CLIENT_PLATFORMS as readonly string[]).includes(value);

/**
 * Is this `GET /ads/active` request from a legacy mobile build (store 1.0.5
 * and older)? Those builds send no query parameter at all; every newer client
 * sends `platform` (mobile `app`, web `web`), and the old web client sent
 * `device`. The one source of the "legacy app" rule: both the client
 * resolution and the legacy `linkUrl` fallback read it.
 */
export function isLegacyAppRequest(
  platform?: string,
  legacyDevice?: string,
): boolean {
  return !platform && !legacyDevice;
}

/**
 * The client of a `GET /ads/active` request. `platform` wins; an unknown value
 * is `null` (no ad matches). Without it:
 * - the legacy `device` parameter means the old web client (only web sent
 *   it) -> `web`;
 * - no parameter at all means a legacy mobile build -> `app`.
 */
export function resolveAdClientPlatform(
  platform?: string,
  legacyDevice?: string,
): ClientPlatform | null {
  if (platform) return isClientPlatform(platform) ? platform : null;
  return isLegacyAppRequest(platform, legacyDevice) ? "app" : "web";
}

/** The fields the public `linkUrl` is derived from. */
export interface AdLinkFields {
  linkUrl: string | null;
  /** In display order (`AD_HOTSPOT_ORDER_BY`). */
  hotspots: readonly { linkUrl: string }[];
}

/**
 * Digital-sales pages (membership, boost, ...), web and mobile names, with an
 * optional locale prefix. Current mobile builds refuse to open these from an
 * ad (Apple 3.1.1/3.1.3, Play payments policy); legacy builds have no such
 * guard, so the fallback below never hands them one. Mirrors tarodan-mobile
 * `src/lib/ads/purchasePath.ts`; it lives and dies with the fallback.
 */
const LEGACY_PURCHASE_PATH = new RegExp(
  `^(?:/(?:${locales.join("|")}))?` +
    "/(?:membership|pricing|upgrade|boost|premium|subscription" +
    "|profile/(?:membership|boost|subscription)|settings/subscription)(?:/|$)",
  "i",
);

/** Path of a relative or absolute link; any host counts (conservative). */
function isPurchaseLink(link: string): boolean {
  let path: string;
  try {
    path = new URL(link.trim(), "http://relative.invalid").pathname;
  } catch {
    // Not a parseable link: a legacy build could not open it either.
    return true;
  }
  return LEGACY_PURCHASE_PATH.test(path);
}

/**
 * The `linkUrl` a `GET /ads/active` response carries.
 *
 * Image ads keep `linkUrl` null: their links live in the hotspots
 * (migration `20261012100000_ad_hotspots`). Legacy mobile builds read only
 * `linkUrl`, so for a legacy request (`isLegacyAppRequest`) an ad without
 * its own link falls back to its first hotspot (display order) that is not
 * a digital-sales page: the whole banner opens that target, as it did
 * before hotspots. Only image ads have hotspots, so text ads and requests
 * with `platform` get the stored value unchanged.
 *
 * Remove this fallback (and `isLegacyAppRequest` if nothing else reads it)
 * once `min_supported_app_version_ios` and `min_supported_app_version_android`
 * are both above 1.0.5; removing it is an API change and needs a contract
 * delta (tarodan-ops `compat.md`).
 */
export function adPublicLinkUrl(
  ad: AdLinkFields,
  legacyApp: boolean,
): string | null {
  if (!legacyApp || ad.linkUrl) return ad.linkUrl;
  return ad.hotspots.find((h) => !isPurchaseLink(h.linkUrl))?.linkUrl ?? null;
}

/**
 * Bu platformdaki bir reklamla aynı ekrana düşebilecek platformlar: `all`
 * her ikisiyle çakışır, `web` ile `app` çakışmaz.
 */
export function overlappingAdPlatforms(
  platform: ContentPlatform,
): ContentPlatform[] {
  return [...new Set(clientPlatformsOf(platform).flatMap(contentPlatformsFor))];
}

/** Tek-reklam kuralının baktığı alanlar (kaydedilecek SONUÇ reklam). */
export interface AdSlotCandidate {
  position: AdPosition;
  platform: ContentPlatform;
  isActive: boolean;
  startDate: Date | null;
  endDate: Date | null;
}

/** İki yayın ucu aynı İstanbul gününde mi (ikisi de null = aynı). */
function sameIstanbulDay(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return a === b;
  return trCalendarDate(a) === trCalendarDate(b);
}

/**
 * Güncelleme yuvayı (pozisyon, platform, anahtar, takvim) değiştiriyor mu?
 * Tarihler İstanbul GÜNÜ olarak karşılaştırılır: admin formu tarihi gün
 * sınırına (00:00 / 23:59:59.999) yuvarlayıp gönderir; gün sınırında olmayan
 * eski bir değer her düzenlemede "değişti" sayılmasın.
 */
export function adSlotChanged(
  existing: AdSlotCandidate,
  next: AdSlotCandidate,
): boolean {
  return (
    existing.position !== next.position ||
    existing.platform !== next.platform ||
    existing.isActive !== next.isActive ||
    !sameIstanbulDay(existing.startDate, next.startDate) ||
    !sameIstanbulDay(existing.endDate, next.endDate)
  );
}

/**
 * Tek-reklam kuralının kilit anahtarı: aynı pozisyona yazan eşzamanlı iki
 * işlem `pg_advisory_xact_lock(hashtext(<anahtar>))` ile sıraya girer, böylece
 * ikisi birden "yuva boş" görüp yazamaz.
 */
export function adSlotLockKey(position: AdPosition): string {
  return `ad-slot:${position}`;
}

/**
 * "Bu yuvayı başka bir reklam tutuyor mu" sorgusu; sorulacak bir şey yoksa
 * `null`. Bir yuvada (pozisyon × platform) aynı anda tek reklam yayında
 * olabilir:
 * - pasif reklam yuva tutmaz (aday pasifse sorgu yok, pasif rakip sayılmaz);
 * - pencereler `now`'dan itibaren kesişmeli: geçmişte kalmış reklam engel
 *   değildir, tamamen geçmişte kalan aday da kimseyi engellemez;
 * - null uç = sınırsız; sınırlar dahil (`withinScheduleWindow` ile aynı).
 *
 * Kampanya bağı bilinçli olarak bakılmaz: yuva admin'in anahtarı + takvimiyle
 * tutulur, kampanyanın canlılığıyla değil.
 */
export function adSlotConflictWhere(
  candidate: AdSlotCandidate,
  now: Date,
  excludeId?: string,
): Prisma.AdvertisementWhereInput | null {
  if (!candidate.isActive) return null;
  const { startDate, endDate } = candidate;
  if (endDate && endDate.getTime() < now.getTime()) return null;
  const from =
    startDate && startDate.getTime() > now.getTime() ? startDate : now;

  return {
    ...(excludeId ? { id: { not: excludeId } } : {}),
    position: candidate.position,
    platform: { in: overlappingAdPlatforms(candidate.platform) },
    isActive: true,
    AND: [
      { OR: [{ endDate: null }, { endDate: { gte: from } }] },
      ...(endDate
        ? [{ OR: [{ startDate: null }, { startDate: { lte: endDate } }] }]
        : []),
    ],
  };
}

/**
 * Güvenlik ağı: yuva başına (pozisyon) ilk reklam. Liste zaten
 * `displayOrder ASC, createdAt DESC` sıralı gelir; kurala aykırı eski veri
 * (kural öncesi aynı yuvada birden çok canlı reklam) vitrine tek reklam
 * olarak düşer.
 */
export function firstAdPerPosition<T extends { position: AdPosition }>(
  ads: readonly T[],
): T[] {
  const seen = new Set<AdPosition>();
  return ads.filter((ad) => {
    if (seen.has(ad.position)) return false;
    seen.add(ad.position);
    return true;
  });
}

/** Gölge hesabı için gereken alanlar (yayında mı + yuva + sıra). */
export interface AdShadowFields {
  id: string;
  position: AdPosition;
  platform: ContentPlatform;
}

/**
 * Admin listesi: YAYINDA olduğu halde vitrinde görünmeyen reklamlar —
 * `firstAdPerPosition` aynı yuvada önce gelen başka bir reklamı seçtiği için.
 * Reklam id'si → gizlendiği istemciler (yalnız gizlendiği yerler; hiç
 * gizlenmeyen reklam haritada yoktur). `liveAds` yalnız YAYINDAKİ reklamlar,
 * vitrinle aynı sırada (`displayOrder ASC, createdAt DESC`) olmalı — seçim
 * vitrinle birebir aynı kuralla yapılır.
 */
export function adShadowedPlatforms(
  liveAds: readonly AdShadowFields[],
): Map<string, ClientPlatform[]> {
  const shadowed = new Map<string, ClientPlatform[]>();
  for (const client of CLIENT_PLATFORMS) {
    const visible = contentPlatformsFor(client);
    const shown = new Set(
      firstAdPerPosition(
        liveAds.filter((ad) => visible.includes(ad.platform)),
      ).map((ad) => ad.id),
    );
    for (const ad of liveAds) {
      if (!visible.includes(ad.platform) || shown.has(ad.id)) continue;
      shadowed.set(ad.id, [...(shadowed.get(ad.id) ?? []), client]);
    }
  }
  return shadowed;
}
