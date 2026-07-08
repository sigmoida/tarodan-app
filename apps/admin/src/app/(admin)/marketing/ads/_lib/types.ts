import { z } from 'zod';

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
  { name: 'Leaderboard', width: 728, height: 90, device: 'desktop' },
  { name: 'Medium Rectangle', width: 300, height: 250, device: 'all' },
  { name: 'Wide Skyscraper', width: 160, height: 600, device: 'desktop' },
  { name: 'Half Page', width: 300, height: 600, device: 'desktop' },
  { name: 'Billboard', width: 970, height: 250, device: 'desktop' },
  { name: 'Mobile Leaderboard', width: 320, height: 50, device: 'mobile' },
  { name: 'Mobile Banner', width: 320, height: 100, device: 'mobile' },
  { name: 'Large Mobile Banner', width: 320, height: 480, device: 'mobile' },
  { name: 'Square', width: 250, height: 250, device: 'all' },
  { name: 'Small Square', width: 200, height: 200, device: 'all' },
];

export const positionLabels: Record<string, string> = {
  header: 'Üst Banner',
  sidebar: 'Yan Panel',
  footer: 'Alt Banner',
  inline: 'İçerik Arası',
  popup: 'Popup',
};

export const deviceLabels: Record<string, string> = {
  desktop: 'Masaüstü',
  mobile: 'Mobil',
  all: 'Tümü',
};

export const positionFilterOptions = [
  { value: 'all', label: 'Tüm Pozisyonlar' },
  ...Object.entries(positionLabels).map(([value, label]) => ({ value, label })),
];

export const deviceFilterOptions = [
  { value: 'all', label: 'Tüm Cihazlar' },
  ...Object.entries(deviceLabels).map(([value, label]) => ({ value, label })),
];

export const positionOptions = Object.entries(positionLabels).map(([value, label]) => ({
  value,
  label,
}));
export const deviceOptions = Object.entries(deviceLabels).map(([value, label]) => ({
  value,
  label,
}));

export const isIabSize = (width?: number | null, height?: number | null) =>
  !!width && !!height && IAB_SIZES.some((s) => s.width === width && s.height === height);

/** Form schema (validation-only; numbers/nulls shaped in the mutationFn). */
export const adSchema = z.object({
  title: z.string().min(1, 'Başlık gerekli'),
  imageUrl: z.string().optional().default(''),
  linkUrl: z.string().optional().default(''),
  altText: z.string().optional().default(''),
  content: z.string().optional().default(''),
  width: z.number().optional().default(0),
  height: z.number().optional().default(0),
  position: z.string().default('header'),
  deviceType: z.string().default('all'),
  displayOrder: z.string().optional().default('0'),
  isActive: z.boolean().default(true),
  startDate: z.string().optional().default(''),
  endDate: z.string().optional().default(''),
});

export type AdFormValues = z.infer<typeof adSchema>;

export const emptyAdForm: AdFormValues = {
  title: '',
  imageUrl: '',
  linkUrl: '',
  altText: '',
  content: '',
  width: 0,
  height: 0,
  position: 'header',
  deviceType: 'all',
  displayOrder: '0',
  isActive: true,
  startDate: '',
  endDate: '',
};

export function adToForm(ad: Ad): AdFormValues {
  return {
    title: ad.title,
    imageUrl: ad.imageUrl ?? '',
    linkUrl: ad.linkUrl ?? '',
    altText: ad.altText ?? '',
    content: ad.content ?? '',
    width: ad.width ?? 0,
    height: ad.height ?? 0,
    position: ad.position,
    deviceType: ad.deviceType ?? 'all',
    displayOrder: String(ad.displayOrder ?? 0),
    isActive: ad.isActive,
    startDate: ad.startDate ? ad.startDate.slice(0, 10) : '',
    endDate: ad.endDate ? ad.endDate.slice(0, 10) : '',
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
