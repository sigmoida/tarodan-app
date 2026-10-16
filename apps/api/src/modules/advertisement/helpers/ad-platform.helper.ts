import type { AdDeviceType, AdPosition, Prisma } from "@prisma/client";
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
 * `GET /ads/active` isteğinin istemcisi. `platform` esastır; bilinmeyen değer
 * `null` (hiçbir reklam eşleşmez). Yoksa:
 * - eski `device` parametresi varsa istek eski web istemcisidir (o parametreyi
 *   yalnız web gönderiyordu) → `web`;
 * - hiç parametre yoksa eski mobil sürümdür → `app`.
 */
export function resolveAdClientPlatform(
  platform?: string,
  legacyDevice?: string,
): ClientPlatform | null {
  if (platform) return isClientPlatform(platform) ? platform : null;
  return legacyDevice ? "web" : "app";
}

/**
 * Bu platformdaki bir reklamla aynı ekrana düşebilecek platformlar: `all`
 * her ikisiyle çakışır, `web` ile `app` çakışmaz.
 */
export function overlappingAdPlatforms(
  platform: ContentPlatform,
): ContentPlatform[] {
  return [
    ...new Set(clientPlatformsOf(platform).flatMap(contentPlatformsFor)),
  ];
}

/** Tek-reklam kuralının baktığı alanlar (kaydedilecek SONUÇ reklam). */
export interface AdSlotCandidate {
  position: AdPosition;
  platform: ContentPlatform;
  isActive: boolean;
  startDate: Date | null;
  endDate: Date | null;
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
