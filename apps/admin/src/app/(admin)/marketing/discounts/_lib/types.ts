import type { StatusConfig } from '@tarodan/ui';

export interface Discount {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  type: 'percentage' | 'fixed_amount' | 'bogo' | 'bulk_quantity';
  value: number;
  scope: 'global' | 'category' | 'product' | 'seller';
  sellerId: string | null;
  sellerName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  targetProductIds: string[];
  minCartValue: number | null;
  minQuantity: number | null;
  buyQuantity: number | null;
  getQuantity: number | null;
  maxDiscountAmount: number | null;
  usageLimitTotal: number | null;
  usageLimitPerUser: number;
  usedCount: number;
  isStackable: boolean;
  priority: number;
  isActive: boolean;
  isFlashSale: boolean;
  startDate: string;
  endDate: string;
  createdAt: string;
  isCurrentlyValid: boolean;
  remainingUsage: number | null;
}

export const SCOPE_LABELS: Record<string, string> = {
  global: 'Tüm Site',
  category: 'Kategori',
  product: 'Ürün',
  seller: 'Satıcı',
};

export const discountStatusConfig: Record<string, StatusConfig> = {
  inactive: { label: 'Pasif', variant: 'secondary' },
  active: { label: 'Aktif', variant: 'success' },
  pending: { label: 'Bekliyor', variant: 'warning' },
  expired: { label: 'Süresi Doldu', variant: 'danger' },
  unknown: { label: 'Belirsiz', variant: 'secondary' },
};

/** Current status of a discount (active flag + date window). */
export function getDiscountStatus(d: Discount): string {
  if (!d.isActive) return 'inactive';
  if (d.isCurrentlyValid) return 'active';
  const now = new Date();
  if (now < new Date(d.startDate)) return 'pending';
  if (now > new Date(d.endDate)) return 'expired';
  return 'unknown';
}

/** Turn a discount's value into a human-readable label (per type). */
export function discountValueLabel(d: Discount): string {
  if (d.type === 'percentage') return `%${d.value}`;
  if (d.type === 'fixed_amount') return `${d.value} TL`;
  if (d.type === 'bogo') {
    return `BOGO (${d.buyQuantity} Ver ${d.getQuantity} Al ${
      d.value === 100 ? 'Bedava' : `%${d.value} İndirim`
    })`;
  }
  if (d.type === 'bulk_quantity') return `${d.minQuantity} adet alımda %${d.value}`;
  return '—';
}

// ─── Filter & form options ───────────────────────────────────────────────────

export const scopeFilterOptions = [
  { value: 'all', label: 'Tüm Kapsamlar' },
  { value: 'global', label: 'Tüm Site' },
  { value: 'category', label: 'Kategori' },
  { value: 'product', label: 'Ürün' },
  { value: 'seller', label: 'Satıcı' },
];

export const activeFilterOptions = [
  { value: 'all', label: 'Tüm Durumlar' },
  { value: 'true', label: 'Aktif' },
  { value: 'false', label: 'Pasif' },
];

export const discountTypeOptions = [
  { value: 'percentage', label: 'Yüzde (%)' },
  { value: 'fixed_amount', label: 'Sabit Tutar (TL)' },
  { value: 'bogo', label: 'Alana Bedava (BOGO)' },
  { value: 'bulk_quantity', label: 'Çoklu Alım (Adet İndirimi)' },
];

export const scopeFormOptions = [
  { value: 'global', label: 'Tüm Site' },
  { value: 'category', label: 'Kategori' },
];
