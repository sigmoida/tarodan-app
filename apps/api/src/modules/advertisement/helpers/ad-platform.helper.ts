import type { AdDeviceType, AdPosition, Prisma } from "@prisma/client";
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
