import { z } from "zod";
import type { useTranslations } from "next-intl";
import {
  CONTENT_PLATFORMS,
  HERO_IMAGE_SIDES,
  HERO_PLACEMENTS,
  HERO_TEXT_LIMITS,
  type AdminHeroSlideDto,
  type ContentPlatform,
  type HeroImageSide,
  type HeroPlacement,
} from "@tarodan/types";
import {
  endOfIstanbulDayIso,
  istanbulDateOf,
  startOfIstanbulDayIso,
} from "@/lib/istanbul-dates";
import { isValidLink } from "@/lib/links";
import {
  addLocalizedIssues,
  localizedFromForm,
  localizedShape,
  localizedToForm,
} from "@/lib/localized-form";

type T = ReturnType<typeof useTranslations<never>>;

export type { ContentPlatform, HeroImageSide, HeroPlacement };

/** API satırı (`GET /admin/hero-slides`) — sözleşme `@tarodan/types`ta. */
export type HeroSlide = AdminHeroSlideDto;

/** Çift dilli alanların taban adları (form: `<ad>Tr` / `<ad>En`). */
export const HERO_LOCALIZED_FIELDS = [
  "title",
  "subtitle",
  "imageAlt",
  "cta1Label",
  "cta2Label",
] as const;
export type HeroLocalizedField = (typeof HERO_LOCALIZED_FIELDS)[number];

/** Yalnız başlık zorunlu; diğer metinler boş bırakılabilir. */
const REQUIRED_FIELDS: readonly HeroLocalizedField[] = ["title"];

/** Alan → sınır (`HERO_TEXT_LIMITS` ile tek kaynak). */
const FIELD_LIMIT: Record<HeroLocalizedField, number> = {
  title: HERO_TEXT_LIMITS.title,
  subtitle: HERO_TEXT_LIMITS.subtitle,
  imageAlt: HERO_TEXT_LIMITS.imageAlt,
  cta1Label: HERO_TEXT_LIMITS.ctaLabel,
  cta2Label: HERO_TEXT_LIMITS.ctaLabel,
};

const CTAS = [
  { label: "cta1Label", href: "cta1Href" },
  { label: "cta2Label", href: "cta2Href" },
] as const;

/** Bir çift dilli alanın uzunluk şeması (sınır `FIELD_LIMIT`'ten). */
const maxShape = <K extends HeroLocalizedField>(t: T, base: K) =>
  localizedShape(
    base,
    FIELD_LIMIT[base],
    t("admin.marketing.hero.validation.maxLength", { max: FIELD_LIMIT[base] }),
  );

/** Form schema (validation-only; null/ISO shaping happens in `heroFormToPayload`). */
export const heroSchema = (t: T) =>
  z
    .object({
      placement: z.enum(HERO_PLACEMENTS),
      platform: z.enum(CONTENT_PLATFORMS),
      imageSide: z.enum(HERO_IMAGE_SIDES),
      imageUrl: z.string().optional().default(""),
      mobileImageUrl: z.string().optional().default(""),
      ...maxShape(t, "title"),
      ...maxShape(t, "subtitle"),
      ...maxShape(t, "imageAlt"),
      ...maxShape(t, "cta1Label"),
      ...maxShape(t, "cta2Label"),
      cta1Href: z.string().optional().default(""),
      cta2Href: z.string().optional().default(""),
      hideOnIos: z.boolean().default(false),
      isActive: z.boolean().default(true),
      startDate: z.string().optional().default(""),
      endDate: z.string().optional().default(""),
    })
    .superRefine((v, ctx) => {
      if (!v.imageUrl.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["imageUrl"],
          message: t("admin.marketing.hero.validation.imageRequired"),
        });
      }
      for (const base of HERO_LOCALIZED_FIELDS) {
        addLocalizedIssues(ctx, v, base, REQUIRED_FIELDS.includes(base), {
          required: t("admin.marketing.hero.validation.trRequired"),
          trRequiredForEn: t("admin.marketing.hero.validation.trRequiredForEn"),
        });
      }
      // CTA çifti: etiket ile adres birlikte dolu ya da birlikte boş olmalı.
      for (const { label, href } of CTAS) {
        const rec = v as Record<string, unknown>;
        const hasLabel = Boolean(String(rec[`${label}Tr`] ?? "").trim());
        const url = String(rec[href] ?? "").trim();
        if (hasLabel && !url) {
          ctx.addIssue({
            code: "custom",
            path: [href],
            message: t("admin.marketing.hero.validation.ctaHrefRequired"),
          });
        } else if (!hasLabel && url) {
          ctx.addIssue({
            code: "custom",
            path: [`${label}Tr`],
            message: t("admin.marketing.hero.validation.ctaLabelRequired"),
          });
        }
        if (url && !isValidLink(url)) {
          ctx.addIssue({
            code: "custom",
            path: [href],
            message: t("admin.marketing.hero.validation.linkInvalid"),
          });
        }
      }
      if (v.startDate && v.endDate && v.endDate < v.startDate) {
        ctx.addIssue({
          code: "custom",
          path: ["endDate"],
          message: t("admin.marketing.hero.validation.endBeforeStart"),
        });
      }
    });

export type HeroFormValues = z.infer<ReturnType<typeof heroSchema>>;

export const emptyHeroForm = (placement: HeroPlacement): HeroFormValues => ({
  placement,
  platform: "all",
  imageSide: "right",
  imageUrl: "",
  mobileImageUrl: "",
  ...localizedToForm("title"),
  ...localizedToForm("subtitle"),
  ...localizedToForm("imageAlt"),
  ...localizedToForm("cta1Label"),
  ...localizedToForm("cta2Label"),
  cta1Href: "",
  cta2Href: "",
  hideOnIos: false,
  isActive: true,
  startDate: "",
  endDate: "",
});

export function heroToForm(slide: HeroSlide): HeroFormValues {
  return {
    placement: slide.placement,
    platform: slide.platform,
    imageSide: slide.imageSide,
    imageUrl: slide.imageUrl ?? "",
    mobileImageUrl: slide.mobileImageUrl ?? "",
    ...localizedToForm("title", slide.title),
    ...localizedToForm("subtitle", slide.subtitle),
    ...localizedToForm("imageAlt", slide.imageAlt),
    ...localizedToForm("cta1Label", slide.cta1Label),
    ...localizedToForm("cta2Label", slide.cta2Label),
    cta1Href: slide.cta1Href ?? "",
    cta2Href: slide.cta2Href ?? "",
    hideOnIos: slide.hideOnIos,
    isActive: slide.isActive,
    startDate: istanbulDateOf(slide.startDate),
    endDate: istanbulDateOf(slide.endDate),
  };
}

export type HeroPayloadMode = "create" | "update";

/**
 * Form değerlerini API gövdesine çevirir.
 * - create: boş alanlar gövdeden çıkarılır.
 * - update: boşaltılan alanlar `null` gider (API `null`'ı temizler, atlananı
 *   değiştirmez) — CTA kaldırma, mobil görsel kaldırma, tarih temizleme.
 * `displayOrder` formda yok: sıra liste ekranındaki yukarı/aşağı ile yönetilir.
 */
export function heroFormToPayload(v: HeroFormValues, mode: HeroPayloadMode) {
  const empty = mode === "update" ? null : undefined;
  const text = (s?: string) => s?.trim() || empty;
  return {
    placement: v.placement,
    platform: v.platform,
    imageSide: v.imageSide,
    imageUrl: v.imageUrl.trim(),
    mobileImageUrl: text(v.mobileImageUrl),
    title: localizedFromForm(v, "title", mode),
    subtitle: localizedFromForm(v, "subtitle", mode),
    imageAlt: localizedFromForm(v, "imageAlt", mode),
    cta1Label: localizedFromForm(v, "cta1Label", mode),
    cta1Href: text(v.cta1Href),
    cta2Label: localizedFromForm(v, "cta2Label", mode),
    cta2Href: text(v.cta2Href),
    hideOnIos: v.hideOnIos,
    isActive: v.isActive,
    startDate: v.startDate ? startOfIstanbulDayIso(v.startDate) : empty,
    endDate: v.endDate ? endOfIstanbulDayIso(v.endDate) : empty,
  };
}

export const placementOptions = (t: T) =>
  HERO_PLACEMENTS.map((value) => ({
    value,
    label: t(`admin.marketing.hero.placement.${value}`),
  }));

export const platformOptions = (t: T) =>
  CONTENT_PLATFORMS.map((value) => ({
    value,
    label: t(`admin.marketing.hero.platform.${value}`),
  }));

export const imageSideOptions = (t: T) =>
  HERO_IMAGE_SIDES.map((value) => ({
    value,
    label: t(`admin.marketing.hero.imageSide.${value}`),
  }));
