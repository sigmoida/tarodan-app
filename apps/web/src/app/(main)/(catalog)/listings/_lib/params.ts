/**
 * Shared, pure parsing/param logic for the marketplace listings route.
 *
 * This module is the SINGLE source of truth used by BOTH the server page
 * (`page.tsx`) and the client (`ListingsClient.tsx`). The whole point of SSR
 * hydration here is that the server-seeded query key MUST be byte-for-byte
 * equal to the client's first-render key — which only holds if both sides
 * derive `filters`, the page number, and the API params from the exact same
 * pure functions. Do NOT branch behavior by environment; keep this free of
 * `'use client'` and React so it runs identically on both.
 */

/** Search terms that are really brands; when the search box matches one, we
 *  treat it as a brand filter instead of a free-text search. */
export const KNOWN_BRANDS = [
  'Porsche', 'Ferrari', 'BMW', 'Mercedes', 'Audi', 'Lamborghini',
  'McLaren', 'Bugatti', 'Koenigsegg', 'Pagani',
] as const;

/** Page size for the listings grid. */
export const PAGE_LIMIT = 48;

/** The exact filter state shape the listings page initializes. */
export interface Filters {
  search: string;
  brand: string;
  brandId: string;
  carModelId: string;
  carModel: string;
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
  customAttributes: Record<string, string[]>;
}

/**
 * If the search string exactly matches a known brand (case-insensitive), return
 * that brand's canonical name; otherwise ''. Mirrors the client's inline
 * auto-detect so search→brand promotion is identical on server and client.
 */
export function detectBrand(search: string): string {
  return search
    ? KNOWN_BRANDS.find((b) => b.toLowerCase() === search.toLowerCase()) || ''
    : '';
}

/**
 * Parse manufacturer-scoped custom attributes URL-encoded as
 * `attr.<groupSlug>=<a,b,c>`.
 * Example: `?attr.hw-rarity=treasure-hunt&attr.hw-segment=mainline,premium`
 */
export function parseCustomAttrs(sp: URLSearchParams): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  sp.forEach((value, key) => {
    if (!key.startsWith('attr.') || !value) return;
    const groupSlug = key.slice('attr.'.length);
    if (!groupSlug) return;
    out[groupSlug] = value.split(',').filter(Boolean);
  });
  return out;
}

/**
 * Build the initial `filters` object from the URL. This is the EXACT shape and
 * defaults the client seeds into `useState`, including the search→brand
 * auto-detect (a search that matches a known brand becomes an empty search +
 * a brand filter).
 */
export function parseListingsFilters(sp: URLSearchParams): Filters {
  const urlSearch = sp.get('search') || '';
  const autoDetectedBrand = detectBrand(urlSearch);

  return {
    search: autoDetectedBrand ? '' : urlSearch,
    brand: sp.get('brand') || autoDetectedBrand || '',
    brandId: sp.get('brandId') || '',
    carModelId: sp.get('carModelId') || '',
    carModel: sp.get('carModel') || '',
    scale: sp.get('scale') || '',
    material: sp.get('material') || '',
    condition: sp.get('condition') || '',
    minPrice: sp.get('minPrice') || '',
    maxPrice: sp.get('maxPrice') || '',
    tradeOnly: sp.get('tradeOnly') === 'true',
    discountOnly: sp.get('discountOnly') === 'true',
    preOrder: sp.get('preOrder') === 'true',
    limited: sp.get('limited') === 'true',
    set: sp.get('set') === 'true',
    sortBy: sp.get('sortBy') || 'relevance',
    category: sp.get('category') || '',
    categoryId: sp.get('categoryId') || '',
    manufacturer: sp.get('manufacturer') || '',
    manufacturerId: sp.get('manufacturerId') || '',
    customAttributes: parseCustomAttrs(sp),
  };
}

/** Current page from the URL (`?page=N`), defaulting to 1. */
export function getListingsPage(sp: URLSearchParams): number {
  const pageParam = sp.get('page');
  return pageParam ? parseInt(pageParam, 10) : 1;
}

/**
 * Build the params object sent to `GET /products`. This is the EXACT object the
 * client's queryFn assembles (`buildListParams`), so the server first-page fetch
 * and the client refetch produce the same result set. Includes the TR→enum
 * condition map, `attrGroups` JSON encoding, and dropping the default
 * 'relevance' sort (the server's implicit ranking).
 */
export function buildListApiParams(
  filters: Filters,
  resolvedCategoryId: string | undefined,
  page: number,
  limit: number,
): Record<string, string | number | boolean> {
  const conditionMap: Record<string, string> = {
    'Yeni': 'new', 'Mükemmel': 'very_good', 'İyi': 'good', 'Orta': 'fair',
  };
  const mappedCondition = filters.condition
    ? conditionMap[filters.condition] || filters.condition
    : undefined;

  const p: Record<string, string | number | boolean> = { limit, page };
  if (filters.search) p.search = filters.search;
  if (resolvedCategoryId) p.categoryId = resolvedCategoryId;
  if (mappedCondition) p.condition = mappedCondition;
  if (filters.minPrice) p.minPrice = Number(filters.minPrice);
  if (filters.maxPrice) p.maxPrice = Number(filters.maxPrice);
  if (filters.brandId) p.brandId = filters.brandId;
  else if (filters.brand) p.brand = filters.brand;
  if (filters.carModelId) p.carModelId = filters.carModelId;
  if (filters.scale) p.scale = filters.scale;
  if (filters.material) p.material = filters.material;
  if (filters.manufacturerId) p.manufacturerId = filters.manufacturerId;
  else if (filters.manufacturer) p.manufacturer = filters.manufacturer;
  if (filters.tradeOnly) p.tradeOnly = true;
  if (filters.discountOnly) p.discountOnly = true;
  if (filters.preOrder) p.preOrder = true;
  if (filters.limited) p.limited = true;
  if (filters.set) p.set = true;
  // 'relevance' is the server-side default ranking (relevanceScore); don't send it as an explicit sort.
  if (filters.sortBy && filters.sortBy !== 'relevance') p.sortBy = filters.sortBy;
  // Manufacturer-scoped attribute selections, sent group-aware so backend can apply
  // OR-within-group + AND-across-groups semantics. Empty groups are dropped.
  if (filters.customAttributes) {
    const nonEmpty = Object.fromEntries(
      Object.entries(filters.customAttributes).filter(
        ([, slugs]) => Array.isArray(slugs) && slugs.length > 0,
      ),
    );
    if (Object.keys(nonEmpty).length > 0) {
      p.attrGroups = JSON.stringify(nonEmpty);
    }
  }
  return p;
}
