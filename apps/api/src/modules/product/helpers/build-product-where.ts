import { Prisma, ProductStatus } from "@prisma/client";
import { saleCapableSellerWhere } from "../../membership/helpers/membership.util";
import { catalogProductWhere } from "./catalog-product-where";

/**
 * Shared interface for product filter params.
 * Both ProductQueryDto (REST) and SearchOptions (ES fallback) conform to this shape.
 */
export interface ProductFilterParams {
  search?: string;
  categoryId?: string;
  sellerId?: string;
  /**
   * Explicit status filter.
   * - Verilirse: tam o statüye eşitlenir (örn. 'active' → yalnızca aktif + stoklu).
   *   Öne çıkan/boosted/discount/trade carousel'leri `status=active` gönderdiği için
   *   bu yolla stok-içi kalır.
   * - Verilmezse: kapsayıcı küme uygulanır (aktif + tükenen + satıldı) — genel gözatma.
   */
  status?: ProductStatus;
  brandId?: string;
  condition?: string;
  brand?: string;
  scale?: string;
  material?: string;
  manufacturer?: string;
  manufacturerId?: string;
  carModelId?: string;
  tradeOnly?: boolean;
  /**
   * `tradeOnly` filtresine satıcı yetkisi de eklenir. Ücretsiz katmanda takas
   * AÇIKSA (admin öyle ayarladıysa) herkes yetkilidir ve ek şart gerekmez —
   * o durumda çağıran `undefined` geçer. Bkz. `tradeCapableSellerWhere`.
   */
  tradeCapableSeller?: Prisma.UserWhereInput;
  boostedOnly?: boolean;
  /** Home showcase (Vitrin) — only products with an active `showcaseOnHome` boost. */
  homeShowcase?: boolean;
  preOrder?: boolean;
  limited?: boolean;
  set?: boolean;
  minPrice?: number;
  maxPrice?: number;
  /**
   * DEPRECATED. Comma-separated attribute slugs, AND-combined.
   * Use `attrGroups` for OR-within-group / AND-across-groups semantics.
   */
  attributeSlugs?: string;

  /**
   * Group-aware attribute filter. Map of attribute group slug -> selected attribute slugs.
   * - Within a single group: OR (any of the selected slugs matches).
   * - Across groups: AND (every group must have at least one match).
   * Accepts either the parsed object or its JSON string form (controller-friendly).
   */
  attrGroups?: Record<string, string[]> | string;
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
    search,
    categoryId,
    sellerId,
    status,
    brandId,
    condition,
    brand,
    scale,
    material,
    manufacturer,
    manufacturerId,
    carModelId,
    tradeOnly,
    tradeCapableSeller,
    boostedOnly,
    homeShowcase,
    preOrder,
    limited,
    set: setFilter,
    minPrice,
    maxPrice,
    attributeSlugs,
    attrGroups,
  } = params;

  const andConditions: Prisma.ProductWhereInput[] = [];

  // Public catalog reads never expose a listing whose seller cannot currently
  // sell. The predicate is time-aware, so an expired BUSINESS term is hidden
  // even before the downgrade cron mutates the membership row.
  andConditions.push({ seller: saleCapableSellerWhere() });

  const where: Prisma.ProductWhereInput = {
    ...catalogProductWhere(),
  };

  // ── Görünürlük (status / stok) ──
  if (status) {
    // Açık statü istendi: tam eşitle. 'active' için stok-içi semantiğini koru
    // (qty > 0 veya null = sınırsız). Bu yol öne çıkan/promosyon carousel'leri için.
    where.status = status;
    if (status === ProductStatus.active) {
      andConditions.push({ OR: [{ quantity: { gt: 0 } }, { quantity: null }] });
    }
  } else {
    // Statü verilmedi (genel gözatma): aktif (stoklu) + otomatik tükenen + satıldı.
    // Elle pasife alınan (inactive + quantity > 0), draft/pending/reserved/rejected gizli kalır.
    andConditions.push({
      OR: [
        { status: ProductStatus.active },
        { AND: [{ status: ProductStatus.inactive }, { quantity: 0 }] },
        { status: ProductStatus.sold },
      ],
    });
  }

  // ── Full-text search results (pre-filtered via tsvector/tsquery) ──
  if (options.fulltextIds && options.fulltextIds.length > 0) {
    andConditions.push({ id: { in: options.fulltextIds } });
  } else if (
    options.fulltextIds &&
    options.fulltextIds.length === 0 &&
    search
  ) {
    // Search was requested but full-text returned nothing – force empty result
    andConditions.push({ id: { equals: "__NO_MATCH__" } });
  }

  // ── ID-based filters (exact match on indexed foreign keys) ──
  if (categoryId) where.categoryId = categoryId;
  if (sellerId) where.sellerId = sellerId;
  if (carModelId) where.carModelId = carModelId;

  if (brandId) {
    where.brandId = brandId;
  } else if (brand) {
    where.brand = { name: { equals: brand, mode: "insensitive" as const } };
  }

  if (manufacturerId) {
    where.manufacturerId = manufacturerId;
  } else if (manufacturer) {
    where.manufacturer = {
      name: { equals: manufacturer, mode: "insensitive" as const },
    };
  }

  // ── Enum/boolean filters (indexed columns) ──
  if (condition) where.condition = condition as any;
  if (tradeOnly) {
    // Bayrak satıcının NİYETİ; yetki üyelikten gelir. Üyeliği biten satıcının
    // ilanları bayrağı korur, o yüzden yetki de aranmalı — aksi halde pazaryeri
    // sahibinin kabul edemeyeceği ilanları "takasa açık" diye listeliyor.
    where.isTradeEnabled = true;
    if (tradeCapableSeller) where.seller = tradeCapableSeller;
  }
  if (boostedOnly) where.boostedUntil = { gt: new Date() };
  if (homeShowcase) where.homeShowcaseUntil = { gt: new Date() };
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

  // Scale: match via attribute group "scale" (value, displayValue, or slug)
  if (scale) {
    const scaleTrim = scale.trim();
    const scaleSlugNorm = scaleTrim.replace(/\s/g, "").replace(/[:\/]/g, ""); // "1:64" -> "164"
    const scaleSlugAlt = scaleTrim.replace(":", "-"); // "1:64" -> "1-64" (seed format)
    andConditions.push({
      productAttributes: {
        some: {
          attribute: {
            isActive: true,
            group: { slug: "scale", isActive: true },
            OR: [
              { value: scaleTrim },
              { displayValue: scaleTrim },
              { slug: scaleSlugNorm },
              { slug: scaleSlugAlt },
            ],
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
            group: { slug: "material", isActive: true },
            slug: material,
          },
        },
      },
    });
  }

  // Manufacturer-scoped attribute filter — group-aware (preferred).
  //
  // Semantic: OR within a group, AND across groups.
  // Example: { 'hw-rarity': ['treasure-hunt', 'super-treasure-hunt'], 'hw-body-color': ['red'] }
  //   → (rarity ∈ {TH, sTH}) AND (body-color = red)
  //
  // Each group becomes one `some` clause whose inner `attribute` filter uses both
  // `group.slug = <groupSlug>` AND `slug IN [...]`. Constraining to the group's own slug
  // prevents accidental matches if the same Attribute.slug ever exists under multiple groups.
  let parsedAttrGroups: Record<string, string[]> | null = null;
  if (attrGroups) {
    if (typeof attrGroups === "string") {
      try {
        const parsed = JSON.parse(attrGroups);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          parsedAttrGroups = parsed as Record<string, string[]>;
        }
      } catch {
        // Malformed JSON — ignore rather than 400; caller can rely on `attributeSlugs` fallback.
        parsedAttrGroups = null;
      }
    } else {
      parsedAttrGroups = attrGroups;
    }
  }

  if (parsedAttrGroups) {
    for (const [groupSlug, slugs] of Object.entries(parsedAttrGroups)) {
      const cleaned = Array.isArray(slugs)
        ? slugs.map((s) => String(s).trim()).filter(Boolean)
        : [];
      if (cleaned.length === 0) continue;
      andConditions.push({
        productAttributes: {
          some: {
            attribute: {
              isActive: true,
              slug: { in: cleaned },
              group: { isActive: true, slug: groupSlug },
            },
          },
        },
      });
    }
  } else if (attributeSlugs) {
    // Legacy/fallback path — flat slug list, all AND-combined.
    // Use only when `attrGroups` is absent.
    const slugs = attributeSlugs
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const slug of slugs) {
      andConditions.push({
        productAttributes: {
          some: {
            attribute: {
              isActive: true,
              slug,
              group: { isActive: true },
            },
          },
        },
      });
    }
  }

  where.AND = andConditions;
  return where;
}
