import type { TrustBadge } from "@prisma/client";
import {
  PUBLIC_TIMING_RULE_IDS,
  TRUST_BADGE_ICONS,
  parseLocalizedText,
  type AdminTrustBadgeDto,
  type LocalizedText,
  type TrustBadgeDto,
  type TrustBadgeIcon,
} from "@tarodan/types";

/**
 * Güven rozeti satırı → yanıt şekilleri ve metindeki süre belirteçleri.
 *
 * Rozet metni herkese açık bir süreyi anabilir ("{returnWindowDays} gün
 * koşulsuz iade"): değer Süreler ve Kurallar'dan gelir, admin metne sabit
 * sayı yazarsa ayar değişince vitrin yanlış söz verirdi. Belirteç adı = süre
 * kaydının kimliği; yalnız `PUBLIC_TIMING_RULE_IDS` doldurulur (iç eşikler
 * vitrine sızmasın), tanınmayan belirteç olduğu gibi kalır.
 */

export type PublicTimingValues = Readonly<Record<string, number>>;

const PUBLIC_IDS: ReadonlySet<string> = new Set(PUBLIC_TIMING_RULE_IDS);
const TOKEN = /\{(\w+)\}/g;

export function fillTimingTokens(
  text: string,
  values: PublicTimingValues,
): string {
  return text.replace(TOKEN, (token, id: string) =>
    PUBLIC_IDS.has(id) && typeof values[id] === "number"
      ? String(values[id])
      : token,
  );
}

function fillLocalized(
  text: LocalizedText,
  values: PublicTimingValues,
): LocalizedText {
  return {
    tr: fillTimingTokens(text.tr, values),
    en: text.en ? fillTimingTokens(text.en, values) : null,
  };
}

const ICONS: ReadonlySet<string> = new Set(TRUST_BADGE_ICONS);

export function isTrustBadgeIcon(value: string): value is TrustBadgeIcon {
  return ICONS.has(value);
}

/** Bilinmeyen ikonlu ya da başlıksız (bozuk) satır vitrinde gösterilmez. */
export function toTrustBadgeDto(
  badge: TrustBadge,
  values: PublicTimingValues,
): TrustBadgeDto | null {
  const title = parseLocalizedText(badge.title);
  if (!title || !isTrustBadgeIcon(badge.icon)) return null;
  const description = parseLocalizedText(badge.description);
  return {
    id: badge.id,
    icon: badge.icon,
    title: fillLocalized(title, values),
    description: description ? fillLocalized(description, values) : null,
    hideOnIos: badge.hideOnIos,
  };
}

/** Admin şekli — metin HAM (belirteçli) döner; admin onu düzenler. */
export function toAdminTrustBadgeDto(badge: TrustBadge): AdminTrustBadgeDto {
  return {
    id: badge.id,
    // Kayıt yolu ikonu `TRUST_BADGE_ICONS`'a göre doğrular; liste daralırsa
    // eski satır admin'de yine görünür ve düzeltilebilir.
    icon: badge.icon as TrustBadgeIcon,
    title: parseLocalizedText(badge.title) ?? { tr: "", en: null },
    description: parseLocalizedText(badge.description),
    hideOnIos: badge.hideOnIos,
    isActive: badge.isActive,
    displayOrder: badge.displayOrder,
    createdAt: badge.createdAt.toISOString(),
    updatedAt: badge.updatedAt.toISOString(),
  };
}
