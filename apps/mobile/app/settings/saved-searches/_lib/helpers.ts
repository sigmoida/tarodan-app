import type { SavedSearch } from './types';

export const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('tr-TR');

/** Filtre nesnesinden okunabilir tek-satır özet üret. */
export const getFilterSummary = (filters: SavedSearch['filters']): string => {
  const parts: string[] = [];
  if (filters.brand) parts.push(filters.brand);
  if (filters.scale) parts.push(filters.scale);
  if (filters.condition) parts.push(filters.condition);
  if (filters.minPrice || filters.maxPrice) {
    const min = filters.minPrice ? `₺${filters.minPrice}` : '';
    const max = filters.maxPrice ? `₺${filters.maxPrice}` : '';
    parts.push(`${min}-${max}`);
  }
  if (filters.tradeAvailable) parts.push('Takas');
  return parts.length > 0 ? parts.join(' • ') : 'Filtre yok';
};

/** Kayıtlı aramayı /search rota parametrelerine çevir. */
export const buildSearchParams = (search: SavedSearch): string => {
  const params = new URLSearchParams();
  if (search.query) params.set('q', search.query);
  if (search.filters.category) params.set('category', search.filters.category);
  if (search.filters.brand) params.set('brand', search.filters.brand);
  if (search.filters.scale) params.set('scale', search.filters.scale);
  if (search.filters.condition) params.set('condition', search.filters.condition);
  if (search.filters.minPrice) params.set('minPrice', search.filters.minPrice.toString());
  if (search.filters.maxPrice) params.set('maxPrice', search.filters.maxPrice.toString());
  if (search.filters.tradeAvailable) params.set('tradeAvailable', 'true');
  return params.toString();
};
