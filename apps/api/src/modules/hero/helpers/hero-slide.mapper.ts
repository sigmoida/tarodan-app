import { Prisma, type HeroSlide } from "@prisma/client";
import {
  parseLocalizedText,
  type AdminHeroSlideDto,
  type HeroCtaDto,
  type HeroCtaSlot,
  type HeroSlideDto,
  type LocalizedText,
} from "@tarodan/types";
import { isHeroSlideLive } from "./hero-live.helper";

/**
 * Hero slaytı satırı → yanıt şekilleri (`@tarodan/types` sözleşmesi) ve
 * `LocalizedText` ↔ Prisma `Json` dönüşümü. Ham Prisma satırı asla dönmez.
 */

/** Okunan JSON bozuksa başlık boş Türkçe metne düşer (istemci boşluktan karar verir). */
const EMPTY_TEXT: LocalizedText = { tr: "", en: null };

type CtaFields = Pick<
  HeroSlide,
  "cta1Label" | "cta1Href" | "cta2Label" | "cta2Href"
>;

/**
 * Bir butonun gösterilebilir hali — etiket VE hedef birlikte varsa. Vitrin
 * yanıtı ile tık sayımı ("bu slaytın N. butonu var mı") aynı kuralı okur.
 */
export function heroSlideCta(
  slide: CtaFields,
  slot: HeroCtaSlot,
): HeroCtaDto | null {
  const label = parseLocalizedText(
    slot === 1 ? slide.cta1Label : slide.cta2Label,
  );
  const href = slot === 1 ? slide.cta1Href : slide.cta2Href;
  return label && href ? { label, href } : null;
}

export function toHeroSlideDto(slide: HeroSlide): HeroSlideDto {
  return {
    id: slide.id,
    placement: slide.placement,
    imageUrl: slide.imageUrl,
    mobileImageUrl: slide.mobileImageUrl,
    imageSide: slide.imageSide,
    title: parseLocalizedText(slide.title) ?? EMPTY_TEXT,
    subtitle: parseLocalizedText(slide.subtitle),
    imageAlt: parseLocalizedText(slide.imageAlt),
    cta1: heroSlideCta(slide, 1),
    cta2: heroSlideCta(slide, 2),
    hideOnIos: slide.hideOnIos,
  };
}

export function toAdminHeroSlideDto(
  slide: HeroSlide,
  now: Date = new Date(),
): AdminHeroSlideDto {
  return {
    id: slide.id,
    placement: slide.placement,
    isActive: slide.isActive,
    isLive: isHeroSlideLive(slide, now),
    displayOrder: slide.displayOrder,
    startDate: slide.startDate?.toISOString() ?? null,
    endDate: slide.endDate?.toISOString() ?? null,
    imageUrl: slide.imageUrl,
    mobileImageUrl: slide.mobileImageUrl,
    imageSide: slide.imageSide,
    title: parseLocalizedText(slide.title) ?? EMPTY_TEXT,
    subtitle: parseLocalizedText(slide.subtitle),
    imageAlt: parseLocalizedText(slide.imageAlt),
    cta1Label: parseLocalizedText(slide.cta1Label),
    cta1Href: slide.cta1Href,
    cta2Label: parseLocalizedText(slide.cta2Label),
    cta2Href: slide.cta2Href,
    hideOnIos: slide.hideOnIos,
    impressionCount: slide.impressionCount,
    clickCount: slide.clickCount,
    cta1ClickCount: slide.cta1ClickCount,
    cta2ClickCount: slide.cta2ClickCount,
    createdAt: slide.createdAt.toISOString(),
    updatedAt: slide.updatedAt.toISOString(),
  };
}

/** Zorunlu JSON kolonuna yazılacak değer (doğrulanmış + normalize edilmiş metin). */
export function localizedJson(text: LocalizedText): Prisma.InputJsonObject {
  return { tr: text.tr, en: text.en ?? null };
}

/**
 * Temizlenebilir JSON kolonuna yazılacak değer: `undefined` = dokunma,
 * `null` = temizle (Prisma'da `DbNull`), metin = yaz.
 */
export function nullableLocalizedJson(
  text: LocalizedText | null | undefined,
): Prisma.InputJsonObject | typeof Prisma.DbNull | undefined {
  if (text === undefined) return undefined;
  return text === null ? Prisma.DbNull : localizedJson(text);
}
