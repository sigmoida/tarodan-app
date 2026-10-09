import { z } from "zod";
import type { useTranslations } from "next-intl";
import {
  endOfIstanbulDayIso,
  istanbulDateOf,
  startOfIstanbulDayIso,
} from "./dates";

type T = ReturnType<typeof useTranslations<never>>;

/** Reklama bağlı kampanyanın yayın durumunu belirleyen alanlar. */
export interface AdCampaign {
  id: string;
  name: string;
  isActive: boolean;
  startDate: string;
  endDate: string;
}

export interface Ad {
  id: string;
  title: string;
  imageUrl: string | null;
  linkUrl: string | null;
  content: string | null;
  altText: string | null;
  width: number | null;
  height: number | null;
  position: string;
  discountId: string | null;
  /** Bağlı kampanya (API ilişkiyi döndürürse); "Kampanya bitti" durumunu besler. */
  discount?: AdCampaign | null;
  deviceType: string;
  displayOrder: number;
  isActive: boolean;
  startDate: string | null;
  endDate: string | null;
  clickCount: number;
  impressionCount: number;
  ctr: number;
  iabCompliant: boolean;
  iabSize: string | null;
  createdAt: string;
  updatedAt: string;
}

/** IAB standard ad sizes. */
export const IAB_SIZES = [
  { name: "Leaderboard", width: 728, height: 90, device: "desktop" },
  { name: "Medium Rectangle", width: 300, height: 250, device: "all" },
  { name: "Wide Skyscraper", width: 160, height: 600, device: "desktop" },
  { name: "Half Page", width: 300, height: 600, device: "desktop" },
  { name: "Billboard", width: 970, height: 250, device: "desktop" },
  { name: "Mobile Leaderboard", width: 320, height: 50, device: "mobile" },
  { name: "Mobile Banner", width: 320, height: 100, device: "mobile" },
  { name: "Large Mobile Banner", width: 320, height: 480, device: "mobile" },
  { name: "Square", width: 250, height: 250, device: "all" },
  { name: "Small Square", width: 200, height: 200, device: "all" },
];

/** API ile birebir: yan panel (sidebar) kaldırıldı, topbar eklendi. */
export const AD_POSITIONS = [
  "topbar",
  "header",
  "footer",
  "inline",
  "popup",
] as const;
export type AdPosition = (typeof AD_POSITIONS)[number];

export const positionLabels = (t: T): Record<string, string> =>
  Object.fromEntries(
    AD_POSITIONS.map((p) => [p, t(`admin.marketing.ads.position.${p}`)]),
  );

/** Formda pozisyon seçicinin altında gösterilen tek satırlık açıklama + önerilen boyutlar. */
export const positionHint = (t: T, position: string): string | undefined =>
  (AD_POSITIONS as readonly string[]).includes(position)
    ? t(`admin.marketing.ads.positionHint.${position}`)
    : undefined;

export const deviceLabels = (t: T): Record<string, string> => ({
  desktop: t("admin.marketing.ads.device.desktop"),
  mobile: t("admin.marketing.ads.device.mobile"),
  all: t("common.all"),
});

/**
 * Filtre listelerinde "hepsi" seçeneğinin değeri BOŞ dizedir, `"all"` değil.
 *
 * `deviceLabels` içinde gerçek bir `all` cihaz hedefi var ("tüm cihazlarda
 * gösterilsin"). Filtrenin kendi "hepsi" seçeneği de `"all"` değerini
 * kullandığında iki sonuç doğuyordu: aynı `value` ile iki seçenek (React
 * tekrarlanan anahtar uyarısı) ve daha kötüsü, gerçekten "tüm cihazlar"
 * hedefli reklamları SÜZMENİN yolu kalmıyordu — o değer "filtre yok" anlamına
 * geliyordu.
 */
export const FILTER_ALL = "";

export const positionFilterOptions = (t: T) => [
  { value: FILTER_ALL, label: t("admin.marketing.ads.allPositions") },
  ...Object.entries(positionLabels(t)).map(([value, label]) => ({
    value,
    label,
  })),
];

export const deviceFilterOptions = (t: T) => [
  { value: FILTER_ALL, label: t("admin.marketing.ads.allDevices") },
  ...Object.entries(deviceLabels(t)).map(([value, label]) => ({
    value,
    label,
  })),
];

export const positionOptions = (t: T) =>
  Object.entries(positionLabels(t)).map(([value, label]) => ({
    value,
    label,
  }));
export const deviceOptions = (t: T) =>
  Object.entries(deviceLabels(t)).map(([value, label]) => ({
    value,
    label,
  }));

export const isIabSize = (width?: number | null, height?: number | null) =>
  !!width &&
  !!height &&
  IAB_SIZES.some((s) => s.width === width && s.height === height);

/** Bağlantı: mutlak `http(s)://…` ya da site-içi `/yol` (`//` ve `/\` hariç). Boş geçerli. */
export const isValidAdLink = (v?: string | null): boolean => {
  const s = (v ?? "").trim();
  if (!s) return true;
  return /^https?:\/\/\S+$/i.test(s) || /^\/(?![/\\])\S*$/.test(s);
};

export const AD_CONTENT_MAX = 500;
export const AD_DIMENSION_MAX = 4000;

/** Form schema (validation-only; numbers/nulls shaped in the mutationFn). */
export const adSchema = (t: T) =>
  z
    .object({
      title: z
        .string()
        .min(1, t("admin.marketing.ads.validation.titleRequired")),
      imageUrl: z.string().optional().default(""),
      linkUrl: z
        .string()
        .optional()
        .default("")
        .refine(isValidAdLink, t("admin.marketing.ads.validation.linkInvalid")),
      altText: z.string().optional().default(""),
      content: z
        .string()
        .max(AD_CONTENT_MAX, t("admin.marketing.ads.validation.contentMax"))
        .optional()
        .default(""),
      width: z
        .number()
        .max(AD_DIMENSION_MAX, t("admin.marketing.ads.validation.sizeMax"))
        .optional()
        .default(0),
      height: z
        .number()
        .max(AD_DIMENSION_MAX, t("admin.marketing.ads.validation.sizeMax"))
        .optional()
        .default(0),
      position: z.string().default("header"),
      deviceType: z.string().default("all"),
      displayOrder: z.string().optional().default("0"),
      isActive: z.boolean().default(true),
      startDate: z.string().optional().default(""),
      endDate: z.string().optional().default(""),
      discountId: z.string().optional().default(""),
    })
    .refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, {
      path: ["endDate"],
      message: t("admin.marketing.ads.validation.endBeforeStart"),
    });

export type AdFormValues = z.infer<ReturnType<typeof adSchema>>;

export const emptyAdForm: AdFormValues = {
  title: "",
  imageUrl: "",
  linkUrl: "",
  altText: "",
  content: "",
  width: 0,
  height: 0,
  position: "header",
  deviceType: "all",
  displayOrder: "0",
  isActive: true,
  startDate: "",
  endDate: "",
  discountId: "",
};

export function adToForm(ad: Ad): AdFormValues {
  return {
    title: ad.title,
    imageUrl: ad.imageUrl ?? "",
    linkUrl: ad.linkUrl ?? "",
    altText: ad.altText ?? "",
    content: ad.content ?? "",
    width: ad.width ?? 0,
    height: ad.height ?? 0,
    position: ad.position,
    deviceType: ad.deviceType ?? "all",
    displayOrder: String(ad.displayOrder ?? 0),
    isActive: ad.isActive,
    startDate: istanbulDateOf(ad.startDate),
    endDate: istanbulDateOf(ad.endDate),
    discountId: ad.discountId ?? "",
  };
}

export type AdPayloadMode = "create" | "update";

/**
 * Form değerlerini API gövdesine çevirir.
 * - create: boş alanlar gövdeden çıkarılır.
 * - update: boşaltılan alanlar `null` gider (API `null`'ı temizler, atlananı
 *   değiştirmez) — "Görseli kaldır" ve tarih/kampanya temizleme böyle çalışır.
 */
export function adFormToPayload(v: AdFormValues, mode: AdPayloadMode) {
  const empty = mode === "update" ? null : undefined;
  const text = (s?: string) => s?.trim() || empty;
  const num = (n?: number) => n || empty;
  return {
    title: v.title.trim(),
    imageUrl: text(v.imageUrl),
    linkUrl: text(v.linkUrl),
    content: text(v.content),
    altText: text(v.altText),
    width: num(v.width),
    height: num(v.height),
    position: v.position,
    deviceType: v.deviceType,
    displayOrder: Number(v.displayOrder) || 0,
    isActive: v.isActive,
    startDate: v.startDate ? startOfIstanbulDayIso(v.startDate) : empty,
    endDate: v.endDate ? endOfIstanbulDayIso(v.endDate) : empty,
    discountId: v.discountId || empty,
  };
}
