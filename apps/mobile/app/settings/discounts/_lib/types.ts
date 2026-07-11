export type DiscountType = 'percentage' | 'fixed_amount';
export type DiscountScope = 'seller' | 'product';

export interface Discount {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  type: DiscountType;
  value: number;
  scope: DiscountScope;
  targetProductIds: string[];
  minCartValue: number | null;
  maxDiscountAmount: number | null;
  usageLimitTotal: number | null;
  usageLimitPerUser: number;
  usedCount: number;
  isStackable: boolean;
  isActive: boolean;
  startDate: string;
  endDate: string;
  createdAt: string;
  isCurrentlyValid: boolean;
}

export interface MyProduct {
  id: string;
  title: string;
  price: number;
  status?: string;
}

export const FILTERS: Array<{ value: '' | 'active' | 'inactive' | 'expired'; label: string }> = [
  { value: '', label: 'Tümü' },
  { value: 'active', label: 'Aktif' },
  { value: 'inactive', label: 'Pasif' },
  { value: 'expired', label: 'Süresi Dolmuş' },
];

export const initialForm = () => ({
  id: '' as string | undefined,
  code: '',
  name: '',
  description: '',
  type: 'percentage' as DiscountType,
  value: '10',
  scope: 'seller' as DiscountScope,
  targetProductIds: [] as string[],
  minCartValue: '',
  maxDiscountAmount: '',
  usageLimitTotal: '',
  usageLimitPerUser: '1',
  isStackable: false,
  isActive: true,
  startDate: new Date().toISOString().split('T')[0],
  endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
});

export type DiscountForm = ReturnType<typeof initialForm>;

// İndirim kartı sunum yardımcıları.
export const formatDate = (s: string) => new Date(s).toLocaleDateString('tr-TR');

export const valueLabel = (d: Discount) =>
  d.type === 'percentage' ? `%${d.value}` : `₺${d.value.toLocaleString('tr-TR')}`;
