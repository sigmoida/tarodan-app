import { pickLocalized, type LocalizedText } from "@tarodan/types";
import type { LocaleLang } from "@/lib/localized-form";
import type { HeroFormValues, HeroImageSide } from "./types";

/** Önizleme için seçili dilde metin; EN boşsa TR'ye düşer (`pickLocalized`). */
export function previewText(
  value: LocalizedText | null | undefined,
  lang: LocaleLang,
): string {
  return value ? pickLocalized(value, lang) : "";
}

const pair = (tr: string, en: string): LocalizedText | null =>
  tr.trim() ? { tr: tr.trim(), en: en.trim() || null } : null;

export interface HeroPreviewModel {
  imageUrl: string;
  imageSide: HeroImageSide;
  title: string;
  subtitle: string;
  imageAlt: string;
  /** Yalnız etiketi dolu düğmeler (adres olmasa da önizlemede görünür). */
  buttons: string[];
}

/** Form değerlerinden, seçili dilde sadeleştirilmiş hero modeli. */
export function heroPreviewModel(
  v: Partial<HeroFormValues>,
  lang: LocaleLang,
): HeroPreviewModel {
  const field = (tr?: string, en?: string) =>
    previewText(pair(tr ?? "", en ?? ""), lang);
  return {
    imageUrl: v.imageUrl?.trim() ?? "",
    imageSide: v.imageSide ?? "right",
    title: field(v.titleTr, v.titleEn),
    subtitle: field(v.subtitleTr, v.subtitleEn),
    imageAlt: field(v.imageAltTr, v.imageAltEn),
    buttons: [
      field(v.cta1LabelTr, v.cta1LabelEn),
      field(v.cta2LabelTr, v.cta2LabelEn),
    ].filter(Boolean),
  };
}
