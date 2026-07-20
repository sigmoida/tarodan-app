import { z } from "zod";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

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

export const positionLabels = (t: T): Record<string, string> => ({
  header: t("admin.marketing.ads.position.header"),
  sidebar: t("admin.marketing.ads.position.sidebar"),
  footer: t("admin.marketing.ads.position.footer"),
  inline: t("admin.marketing.ads.position.inline"),
  popup: t("admin.marketing.ads.position.popup"),
});

export const deviceLabels = (t: T): Record<string, string> => ({
  desktop: t("admin.marketing.ads.device.desktop"),
  mobile: t("admin.marketing.ads.device.mobile"),
  all: t("common.all"),
});

export const positionFilterOptions = (t: T) => [
  { value: "all", label: t("admin.marketing.ads.allPositions") },
  ...Object.entries(positionLabels(t)).map(([value, label]) => ({
    value,
    label,
  })),
];

export const deviceFilterOptions = (t: T) => [
  { value: "all", label: t("admin.marketing.ads.allDevices") },
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

/** Form schema (validation-only; numbers/nulls shaped in the mutationFn). */
export const adSchema = (t: T) =>
  z.object({
    title: z.string().min(1, t("admin.marketing.ads.validation.titleRequired")),
    imageUrl: z.string().optional().default(""),
    linkUrl: z.string().optional().default(""),
    altText: z.string().optional().default(""),
    content: z.string().optional().default(""),
    width: z.number().optional().default(0),
    height: z.number().optional().default(0),
    position: z.string().default("header"),
    deviceType: z.string().default("all"),
    displayOrder: z.string().optional().default("0"),
    isActive: z.boolean().default(true),
    startDate: z.string().optional().default(""),
    endDate: z.string().optional().default(""),
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
    startDate: ad.startDate ? ad.startDate.slice(0, 10) : "",
    endDate: ad.endDate ? ad.endDate.slice(0, 10) : "",
  };
}

/** Shape form values into the create/update API payload. */
export function adFormToPayload(v: AdFormValues) {
  return {
    title: v.title.trim(),
    imageUrl: v.imageUrl?.trim() || undefined,
    linkUrl: v.linkUrl?.trim() || undefined,
    content: v.content?.trim() || undefined,
    altText: v.altText?.trim() || undefined,
    width: v.width || undefined,
    height: v.height || undefined,
    position: v.position,
    deviceType: v.deviceType,
    displayOrder: Number(v.displayOrder) || 0,
    isActive: v.isActive,
    startDate: v.startDate || undefined,
    endDate: v.endDate || undefined,
  };
}
