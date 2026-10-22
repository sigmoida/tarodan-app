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
import { parseTlAmount } from "@tarodan/shared";

/** Search terms that are really brands; when the search box matches one, we
 *  treat it as a brand filter instead of a free-text search. */
export const KNOWN_BRANDS = [
  "Porsche",
  "Ferrari",
  "BMW",
  "Mercedes",
  "Audi",
  "Lamborghini",
  "McLaren",
  "Bugatti",
  "Koenigsegg",
  "Pagani",
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
  /** Seçili renk slug'ları — URL'de `?color=red,black` olarak taşınır. */
  colors: string[];
  condition: string;
  /**
   * Price bounds as text: what the user typed, or the URL value. Every reader
   * goes through {@link priceFilterBound}; the URL and the API get
   * {@link priceFilterParam} / the bound, never this text.
   */
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
 * The bound a price filter text sets, read with the shared TL parser
 * (`parseTlAmount`, the one reader of typed TL amounts): `undefined` when the
 * text is empty, zero or refused, so such text never filters. "1.000" is
 * refused (a Turkish user means one thousand), never read as 1 TL; that also
 * holds for a legacy URL or saved-search value, whose bound is then ignored.
 * Plain numbers ("1000", "1250.5", the canonical URL form) and a decimal comma
 * ("1250,5") read as written. A min above the max is kept as it is (the API
 * then finds nothing), the same as before.
 */
export function priceFilterBound(text: string): number | undefined {
  const parsed = parseTlAmount(text);
  return parsed.status === "ok" ? parsed.amount : undefined;
}

/** True when the price text is not an amount (`validation.amountFormatRefused`). */
export function isPriceFilterRefused(text: string): boolean {
  return parseTlAmount(text).status === "refused";
}

/**
 * The canonical URL value of a price bound: a plain number with a dot
 * ("1000", "1250.5"), or "" when the text sets no bound. The URL and saved
 * searches never carry the typed text.
 */
export function priceFilterParam(text: string): string {
  const bound = priceFilterBound(text);
  return bound === undefined ? "" : String(bound);
}

/** True when either price text sets a bound (the chip and the filter count). */
export function hasPriceFilter(
  filters: Pick<Filters, "minPrice" | "maxPrice">,
): boolean {
  return (
    priceFilterBound(filters.minPrice) !== undefined ||
    priceFilterBound(filters.maxPrice) !== undefined
  );
}

/**
 * If the search string exactly matches a known brand (case-insensitive), return
 * that brand's canonical name; otherwise ''. Mirrors the client's inline
 * auto-detect so search→brand promotion is identical on server and client.
 */
export function detectBrand(search: string): string {
  return search
    ? KNOWN_BRANDS.find((b) => b.toLowerCase() === search.toLowerCase()) || ""
    : "";
}

/**
 * Parse manufacturer-scoped custom attributes URL-encoded as
 * `attr.<groupSlug>=<a,b,c>`.
 * Example: `?attr.hw-rarity=treasure-hunt&attr.hw-segment=mainline,premium`
 */
export function parseCustomAttrs(
  sp: URLSearchParams,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  sp.forEach((value, key) => {
    if (!key.startsWith("attr.") || !value) return;
    const groupSlug = key.slice("attr.".length);
    if (!groupSlug) return;
    out[groupSlug] = value.split(",").filter(Boolean);
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
  const urlSearch = sp.get("search") || "";
  const autoDetectedBrand = detectBrand(urlSearch);

  return {
    search: autoDetectedBrand ? "" : urlSearch,
    brand: sp.get("brand") || autoDetectedBrand || "",
    brandId: sp.get("brandId") || "",
    carModelId: sp.get("carModelId") || "",
    carModel: sp.get("carModel") || "",
    scale: sp.get("scale") || "",
    material: sp.get("material") || "",
    colors: (sp.get("color") || "")
      .split(",")
      .map((slug) => slug.trim())
      .filter(Boolean),
    condition: sp.get("condition") || "",
    minPrice: sp.get("minPrice") || "",
    maxPrice: sp.get("maxPrice") || "",
    tradeOnly: sp.get("tradeOnly") === "true",
    discountOnly: sp.get("discountOnly") === "true",
    preOrder: sp.get("preOrder") === "true",
    limited: sp.get("limited") === "true",
    set: sp.get("set") === "true",
    sortBy: sp.get("sortBy") || "relevance",
    category: sp.get("category") || "",
    categoryId: sp.get("categoryId") || "",
    manufacturer: sp.get("manufacturer") || "",
    manufacturerId: sp.get("manufacturerId") || "",
    customAttributes: parseCustomAttrs(sp),
  };
}

/**
 * The `/listings` URL query of a filter state: the writing side of
 * {@link parseListingsFilters}, so a written URL parses back into the same
 * search. Price bounds are written canonical ({@link priceFilterParam}).
 */
export function buildListingsUrlParams(
  f: Filters,
  page: number,
): URLSearchParams {
  const params = new URLSearchParams();
  if (f.search) params.set("search", f.search);
  if (f.brand) params.set("brand", f.brand);
  if (f.brandId) params.set("brandId", f.brandId);
  if (f.carModel) params.set("carModel", f.carModel);
  if (f.carModelId) params.set("carModelId", f.carModelId);
  if (f.scale) params.set("scale", f.scale);
  if (f.material) params.set("material", f.material);
  if (f.colors?.length) params.set("color", f.colors.join(","));
  if (f.condition) params.set("condition", f.condition);
  // The canonical bound ("1000", "1250.5"), never the typed text.
  const minPrice = priceFilterParam(f.minPrice);
  if (minPrice) params.set("minPrice", minPrice);
  const maxPrice = priceFilterParam(f.maxPrice);
  if (maxPrice) params.set("maxPrice", maxPrice);
  if (f.tradeOnly) params.set("tradeOnly", "true");
  if (f.discountOnly) params.set("discountOnly", "true");
  if (f.preOrder) params.set("preOrder", "true");
  if (f.limited) params.set("limited", "true");
  if (f.set) params.set("set", "true");
  if (f.sortBy && f.sortBy !== "relevance") params.set("sortBy", f.sortBy);
  if (f.category) params.set("category", f.category);
  if (f.categoryId) params.set("categoryId", f.categoryId);
  if (f.manufacturer) params.set("manufacturer", f.manufacturer);
  if (f.manufacturerId) params.set("manufacturerId", f.manufacturerId);
  // Encode manufacturer-scoped attribute selections as attr.<groupSlug>=a,b,c
  if (f.customAttributes) {
    for (const [groupSlug, slugs] of Object.entries(f.customAttributes)) {
      if (slugs && slugs.length > 0)
        params.set(`attr.${groupSlug}`, slugs.join(","));
    }
  }
  if (page > 1) params.set("page", page.toString());
  return params;
}

/** Boş grupları atarak, anahtar sırasından bağımsız karşılaştırılabilir biçim —
 *  URL boş grupları yazmaz, bu yüzden `{a: []}` ile `{}` aynı filtredir. */
function customAttrsKey(attrs: Record<string, string[]>): string {
  return JSON.stringify(
    Object.entries(attrs)
      .filter(([, slugs]) => slugs?.length)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

/** İki filtre durumu aynı aramayı mı ifade ediyor? Dizi/nesne alanları değere göre. */
function sameFilters(a: Filters, b: Filters): boolean {
  return (Object.keys(a) as (keyof Filters)[]).every((k) => {
    if (k === "colors") return a.colors.join(",") === b.colors.join(",");
    if (k === "customAttributes")
      return (
        customAttrsKey(a.customAttributes) ===
        customAttrsKey(b.customAttributes)
      );
    return a[k] === b[k];
  });
}

/**
 * URL değişince (geri/ileri, menü linki) mevcut filtre durumunu URL'e eşitle.
 * HER alan `parseListingsFilters` ile — tek kaynak, sayfanın URL'e yazdığı
 * biçimle (`color=a,b`, `attr.<grup>=a,b`) — okunur; URL'de olmayan bir filtre
 * (`sortBy`, `scale`, renk, özel nitelik…) varsayılanına döner, önceki durumda
 * kalmaz ("Çok Satanlar" → "Tüm İlanlar" popüler sıralamayı, `?color=red` →
 * `/listings` rengi taşımaz). Değişiklik yoksa aynı nesne döner, böylece
 * gereksiz render/URL yazımı olmaz.
 */
export function mergeUrlFilters(prev: Filters, sp: URLSearchParams): Filters {
  const next = parseListingsFilters(sp);
  return sameFilters(prev, next) ? prev : next;
}

/** Current page from the URL (`?page=N`), defaulting to 1. */
export function getListingsPage(sp: URLSearchParams): number {
  const pageParam = sp.get("page");
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
    Yeni: "new",
    Mükemmel: "very_good",
    İyi: "good",
    Orta: "fair",
  };
  const mappedCondition = filters.condition
    ? conditionMap[filters.condition] || filters.condition
    : undefined;

  const p: Record<string, string | number | boolean> = { limit, page };
  if (filters.search) p.search = filters.search;
  if (resolvedCategoryId) p.categoryId = resolvedCategoryId;
  if (mappedCondition) p.condition = mappedCondition;
  const minPrice = priceFilterBound(filters.minPrice);
  if (minPrice !== undefined) p.minPrice = minPrice;
  const maxPrice = priceFilterBound(filters.maxPrice);
  if (maxPrice !== undefined) p.maxPrice = maxPrice;
  if (filters.brandId) p.brandId = filters.brandId;
  else if (filters.brand) p.brand = filters.brand;
  if (filters.carModelId) p.carModelId = filters.carModelId;
  if (filters.scale) p.scale = filters.scale;
  if (filters.material) p.material = filters.material;
  if (filters.colors?.length) p.color = filters.colors.join(",");
  if (filters.manufacturerId) p.manufacturerId = filters.manufacturerId;
  else if (filters.manufacturer) p.manufacturer = filters.manufacturer;
  if (filters.tradeOnly) p.tradeOnly = true;
  if (filters.discountOnly) p.discountOnly = true;
  if (filters.preOrder) p.preOrder = true;
  if (filters.limited) p.limited = true;
  if (filters.set) p.set = true;
  // 'relevance' is the server-side default ranking (relevanceScore); don't send it as an explicit sort.
  if (filters.sortBy && filters.sortBy !== "relevance")
    p.sortBy = filters.sortBy;
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
