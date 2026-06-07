/**
 * Web paritesi: apps/web/src/app/listings/page.tsx `filters` state'i + `buildListParams`.
 * Tüm ürün arama/listeleme ekranları (Search tab, Listings) bu tek kaynağı kullanır.
 */

export type ProductFilters = {
  search: string;
  brand: string;
  brandId: string;
  carModel: string;
  carModelId: string;
  scale: string;
  material: string;
  condition: string;
  minPrice: string;
  maxPrice: string;
  tradeOnly: boolean;
  discountOnly: boolean;
  preOrder: boolean;
  limited: boolean;
  set: boolean;
  sortBy: string;
  category: string;
  categoryId: string;
  manufacturer: string;
  manufacturerId: string;
};

export const EMPTY_FILTERS: ProductFilters = {
  search: '',
  brand: '',
  brandId: '',
  carModel: '',
  carModelId: '',
  scale: '',
  material: '',
  condition: '',
  minPrice: '',
  maxPrice: '',
  tradeOnly: false,
  discountOnly: false,
  preOrder: false,
  limited: false,
  set: false,
  sortBy: 'created_desc',
  category: '',
  categoryId: '',
  manufacturer: '',
  manufacturerId: '',
};

/** Web ProductQueryDto-uyumlu sort değerleri (search.tsx eski 'newest'/'sort' yerine). */
export const SORT_OPTIONS: { value: string; label: string; icon: string }[] = [
  { value: 'created_desc', label: 'En Yeni', icon: 'time-outline' },
  { value: 'created_asc', label: 'En Eski', icon: 'time-outline' },
  { value: 'view_count_desc', label: 'Popüler', icon: 'star-outline' },
  { value: 'price_asc', label: 'Fiyat (Düşük)', icon: 'arrow-up' },
  { value: 'price_desc', label: 'Fiyat (Yüksek)', icon: 'arrow-down' },
  { value: 'rating_desc', label: 'En Yüksek Puan', icon: 'ribbon-outline' },
];

/** Web SidebarFilters CONDITIONS ile aynı (slug + TR etiket). */
export const CONDITION_OPTIONS: { value: string; label: string }[] = [
  { value: 'new', label: 'Yeni' },
  { value: 'like_new', label: 'Yeni Gibi' },
  { value: 'very_good', label: 'Çok İyi' },
  { value: 'good', label: 'İyi' },
  { value: 'fair', label: 'Orta' },
];

export const MATERIAL_FALLBACK: { slug: string; label: string }[] = [
  { slug: 'diecast', label: 'Diecast (Metal)' },
  { slug: 'resin', label: 'Resin (Reçine)' },
  { slug: 'composite', label: 'Composite (Kompozit)' },
  { slug: 'plastic', label: 'Plastic (Plastik)' },
];

export const SCALE_FALLBACK = ['1:18', '1:24', '1:43', '1:64', '1:87'];

/**
 * Web listings/page.tsx `buildListParams` ile birebir aynı param mantığı.
 * brandId varsa brand'i ezme, manufacturerId varsa manufacturer'ı ezme.
 */
export function buildListParams(
  f: ProductFilters,
  page: number,
  limit: number,
): Record<string, any> {
  const p: Record<string, any> = { limit, page };
  if (f.search) p.search = f.search;
  if (f.categoryId) p.categoryId = f.categoryId;
  if (f.condition) p.condition = f.condition;
  if (f.minPrice) p.minPrice = Number(f.minPrice);
  if (f.maxPrice) p.maxPrice = Number(f.maxPrice);
  if (f.brandId) p.brandId = f.brandId;
  else if (f.brand) p.brand = f.brand;
  if (f.carModelId) p.carModelId = f.carModelId;
  if (f.scale) p.scale = f.scale;
  if (f.material) p.material = f.material;
  if (f.manufacturerId) p.manufacturerId = f.manufacturerId;
  else if (f.manufacturer) p.manufacturer = f.manufacturer;
  if (f.tradeOnly) p.tradeOnly = true;
  if (f.discountOnly) p.discountOnly = true;
  if (f.preOrder) p.preOrder = true;
  if (f.limited) p.limited = true;
  if (f.set) p.set = true;
  if (f.sortBy) p.sortBy = f.sortBy;
  return p;
}

/** Aktif filtre sayısı — eşli anahtarlar (brand+brandId vb.) tek sayılır; sortBy/search hariç. */
export function countActiveFilters(f: ProductFilters): number {
  let count = 0;
  if (f.search) count += 1;
  if (f.brand || f.brandId) count += 1;
  if (f.manufacturer || f.manufacturerId) count += 1;
  if (f.category || f.categoryId) count += 1;
  if (f.carModel || f.carModelId) count += 1;
  if (f.scale) count += 1;
  if (f.material) count += 1;
  if (f.condition) count += 1;
  if (f.minPrice || f.maxPrice) count += 1;
  if (f.tradeOnly) count += 1;
  if (f.discountOnly) count += 1;
  if (f.preOrder) count += 1;
  if (f.limited) count += 1;
  if (f.set) count += 1;
  return count;
}

/** API yanıtından ürün dizisini çıkar (dizi / {data} / {products} / {items}). */
export function extractListings(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.products)) return raw.products;
  if (Array.isArray(raw?.items)) return raw.items;
  if (Array.isArray(raw?.results)) return raw.results;
  return [];
}

/** API yanıtından sayfalama meta'sını çıkar. */
export function extractMeta(
  raw: any,
  page: number,
  limit: number,
): { total: number; page: number; limit: number; totalPages: number } {
  const m = raw?.meta;
  const items = extractListings(raw);
  return {
    total: m?.total ?? items.length,
    page: m?.page ?? page,
    limit: m?.limit ?? limit,
    totalPages: m?.totalPages ?? 1,
  };
}
