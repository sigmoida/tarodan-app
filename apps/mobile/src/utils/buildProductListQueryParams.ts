/**
 * Query params aligned with API ProductQueryDto (class-validator / Nest).
 * Omits invalid numbers and unknown enum values to avoid 400s from the API.
 */

const API_MAX_PRICE = 9_999_999;

/** Matches ProductQueryDto.sortBy */
const SORT_BY_VALUES = new Set<string>([
  'price_asc',
  'price_desc',
  'created_asc',
  'created_desc',
  'title_asc',
  'title_desc',
  'view_count_desc',
  'view_count_asc',
  'rating_desc',
]);

/** Matches Prisma ProductCondition (only send if UI picked a valid value) */
const CONDITION_VALUES = new Set<string>(['new', 'like_new', 'very_good', 'good', 'fair']);

const MAX_SEARCH_LEN = 500;

function parsePrice(raw: string | undefined): number | undefined {
  if (raw == null || raw.trim() === '') return undefined;
  const n = Number(raw.trim().replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.min(n, API_MAX_PRICE);
}

export type ProductListFiltersInput = {
  brand: string;
  scale: string;
  condition: string;
  minPrice: string;
  maxPrice: string;
  tradeOnly: boolean;
  sortBy: string;
};

export function buildProductListQueryParams(args: {
  page: number;
  limit: number;
  search?: string;
  categoryId?: string;
  filters: ProductListFiltersInput;
}): Record<string, string | number | boolean> {
  const { page, limit, search, categoryId, filters } = args;

  const params: Record<string, string | number | boolean> = {
    limit,
    page,
  };

  const q = search?.trim();
  if (q) params.search = q.slice(0, MAX_SEARCH_LEN);

  if (categoryId) params.categoryId = categoryId;

  const brand = filters.brand?.trim();
  if (brand) params.brand = brand;

  if (filters.scale?.trim()) params.scale = filters.scale.trim();

  if (filters.condition && CONDITION_VALUES.has(filters.condition)) {
    params.condition = filters.condition;
  }

  let minP = parsePrice(filters.minPrice);
  let maxP = parsePrice(filters.maxPrice);
  if (minP !== undefined && maxP !== undefined && minP > maxP) {
    const t = minP;
    minP = maxP;
    maxP = t;
  }
  if (minP !== undefined) params.minPrice = minP;
  if (maxP !== undefined) params.maxPrice = maxP;

  // DTO: @Transform boolean from query string; axios sends true → "true" which is fine
  if (filters.tradeOnly === true) params.tradeOnly = true;

  const sort = filters.sortBy && SORT_BY_VALUES.has(filters.sortBy) ? filters.sortBy : 'created_desc';
  params.sortBy = sort;

  return params;
}
