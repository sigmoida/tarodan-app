import { Prisma, ProductStatus } from '@prisma/client';

/**
 * Shared interface for product filter params.
 * Both ProductQueryDto (REST) and SearchOptions (ES fallback) conform to this shape.
 */
export interface ProductFilterParams {
  search?: string;
  categoryId?: string;
  sellerId?: string;
  brandId?: string;
  condition?: string;
  brand?: string;
  scale?: string;
  material?: string;
  vehicleType?: string;
  manufacturer?: string;
  manufacturerId?: string;
  carModelId?: string;
  tradeOnly?: boolean;
  preOrder?: boolean;
  limited?: boolean;
  set?: boolean;
  minPrice?: number;
  maxPrice?: number;
}

export interface BuildWhereOptions {
  /**
   * Pre-filtered product IDs from full-text search (tsvector/tsquery).
   * When provided, adds an `id IN (...)` condition to the where clause.
   */
  fulltextIds?: string[];
}

/**
 * Builds a Prisma ProductWhereInput from filter params using only
 * index-friendly operations: ID equality, enum/boolean checks, ranges,
 * and attribute-join based lookups.
 *
 * Deliberately NOT included:
 * - discountOnly: requires async service access (DiscountService), must be
 *   applied by the caller after calling this function
 */
export function buildProductWhere(
  params: ProductFilterParams,
  options: BuildWhereOptions = {},
): Prisma.ProductWhereInput {
  const {
    search, categoryId, sellerId, brandId, condition,
    brand, scale, material, vehicleType, manufacturer, manufacturerId,
    carModelId, tradeOnly, preOrder, limited,
    set: setFilter, minPrice, maxPrice,
  } = params;

  const andConditions: Prisma.ProductWhereInput[] = [
    { OR: [{ quantity: { gt: 0 } }, { quantity: null }] },
  ];

  const where: Prisma.ProductWhereInput = {
    status: ProductStatus.active,
    NOT: { id: { startsWith: 'membership-' } },
  };

  // ── Full-text search results (pre-filtered via tsvector/tsquery) ──
  if (options.fulltextIds && options.fulltextIds.length > 0) {
    andConditions.push({ id: { in: options.fulltextIds } });
  } else if (options.fulltextIds && options.fulltextIds.length === 0 && search) {
    // Search was requested but full-text returned nothing – force empty result
    andConditions.push({ id: { equals: '__NO_MATCH__' } });
  }

  // ── ID-based filters (exact match on indexed foreign keys) ──
  if (categoryId) where.categoryId = categoryId;
  if (sellerId) where.sellerId = sellerId;
  if (carModelId) where.carModelId = carModelId;

  if (brandId) {
    where.brandId = brandId;
  } else if (brand) {
    where.brand = { name: { equals: brand, mode: 'insensitive' as const } };
  }

  if (manufacturerId) {
    where.manufacturerId = manufacturerId;
  } else if (manufacturer) {
    where.manufacturer = { name: { equals: manufacturer, mode: 'insensitive' as const } };
  }

  // ── Enum/boolean filters (indexed columns) ──
  if (condition) where.condition = condition as any;
  if (tradeOnly) where.isTradeEnabled = true;
  if (preOrder) where.isPreorder = true;
  if (limited) where.isLimited = true;
  if (setFilter) where.isSet = true;

  // ── Range filters ──
  if (minPrice !== undefined || maxPrice !== undefined) {
    const priceFilter: Record<string, number> = {};
    if (minPrice !== undefined) priceFilter.gte = minPrice;
    if (maxPrice !== undefined) priceFilter.lte = maxPrice;
    where.price = priceFilter;
  }

  // ── Attribute-based filters (via ProductAttribute join, indexed) ──

  // Scale: match via attribute group "scale" (value or slug)
  if (scale) {
    const scaleSlug = scale.replace(/\s/g, '').replace(/[:\/]/g, '');
    andConditions.push({
      productAttributes: {
        some: {
          attribute: {
            isActive: true,
            group: { slug: 'scale', isActive: true },
            OR: [{ value: scale }, { slug: scaleSlug }],
          },
        },
      },
    });
  }

  // Material: match via attribute group "material" (slug)
  if (material) {
    andConditions.push({
      productAttributes: {
        some: {
          attribute: {
            isActive: true,
            group: { slug: 'material', isActive: true },
            slug: material,
          },
        },
      },
    });
  }

  // Vehicle type: match via attribute group "vehicle_type" (slug)
  if (vehicleType) {
    andConditions.push({
      productAttributes: {
        some: {
          attribute: {
            isActive: true,
            group: { slug: 'vehicle_type', isActive: true },
            slug: vehicleType,
          },
        },
      },
    });
  }

  where.AND = andConditions;
  return where;
}
