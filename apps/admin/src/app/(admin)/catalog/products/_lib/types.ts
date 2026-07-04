import { productStatusConfig, type StatusConfig } from '@tarodan/ui';
import { statusFilterOptions } from '@/lib/utils';

/** AI görsel-denetim durumu → rozet. Bilinen değerler dışında "Temiz" sayılır. */
export const aiCheckConfig: Record<string, StatusConfig> = {
  flagged: { label: 'Uygunsuz', variant: 'danger' },
  review: { label: 'İnceleme', variant: 'warning' },
  passed: { label: 'Temiz', variant: 'success' },
};

/** aiCheckStatus'u config anahtarına indirger (flagged/review dışı → passed). */
export const aiCheckKey = (s?: string | null) =>
  s === 'flagged' || s === 'review' ? s : 'passed';

export interface Product {
  id: string;
  title: string;
  price: number;
  originalPrice?: number | null;
  salePrice?: number | null;
  isOnSale?: boolean;
  status: 'pending' | 'active' | 'rejected' | 'sold' | 'inactive' | 'reserved' | 'deleted';
  condition: string;
  seller: { id: string; displayName: string };
  category: { name: string };
  imageUrl?: string;
  createdAt: string;
  aiCheckStatus?: string | null;
}

const PLACEHOLDER = 'https://placehold.co/100x100/f3f4f6/666?text=Ürün';

/** Normalize the varied product payload (image url shapes, numeric strings). */
export function mapProducts(raw: any[]): Product[] {
  return raw.map((p: any) => ({
    id: p.id,
    title: p.title,
    price: Number(p.price),
    originalPrice: p.originalPrice != null ? Number(p.originalPrice) : null,
    salePrice: p.salePrice != null ? Number(p.salePrice) : null,
    isOnSale: p.isOnSale,
    status: p.status,
    condition: p.condition,
    seller: p.seller || { id: p.sellerId, displayName: 'Satıcı' },
    category: p.category || { name: 'Kategori' },
    imageUrl: (() => {
      let url = p.imageUrl || p.images?.[0]?.url || p.images?.[0] || '';
      if (url && !url.startsWith('/') && !url.startsWith('http')) url = '/' + url;
      return url || PLACEHOLDER;
    })(),
    createdAt: p.createdAt,
    aiCheckStatus: p.aiCheckStatus ?? null,
  }));
}

/** Status filter options derived from productStatusConfig (badge-consistent). */
export const productStatusOptions = statusFilterOptions(productStatusConfig, {
  allLabel: 'Tüm Ürünler',
});

/** list ↔ AI Denetim tabs (shared by the list and the AI branch). */
export const PRODUCT_TABS = [
  { key: 'list', label: 'Ürünler' },
  { key: 'ai', label: 'AI Denetim' },
];
