/**
 * Saved searches: the stored, canonical `GET /products` query of a user's
 * search, its display labels and the rules every surface must agree on.
 *
 * The API canonicalises and hashes the query (duplicates answer 409), web
 * `/listings` and mobile `/search` rebuild their URL from it with
 * `savedSearchToRouteParams`. Mobile vendors this file into `src/types/`.
 * Durable reference: `docs/SAVED_SEARCHES.md`.
 */

/**
 * The allow-list: the `GET /products` filters a saved search keeps. Anything
 * else (`page`, `limit`, `sellerId`, `status`, `boostedOnly`, `homeShowcase`,
 * `tradeEligible`, `inactiveReason`, the deprecated `attributeSlugs`) is
 * dropped by `canonicalizeSavedSearchQuery` and never stored.
 */
export const SAVED_SEARCH_QUERY_KEYS = [
  "search",
  "categoryId",
  "brandId",
  "brand",
  "manufacturerId",
  "manufacturer",
  "carModelId",
  "scale",
  "material",
  "color",
  "condition",
  "minPrice",
  "maxPrice",
  "tradeOnly",
  "discountOnly",
  "preOrder",
  "limited",
  "set",
  "attrGroups",
  "sortBy",
] as const;

export type SavedSearchQueryKey = (typeof SAVED_SEARCH_QUERY_KEYS)[number];

/**
 * The explicit sorts of `GET /products`. Its default ranking ("relevance",
 * also what an unknown value falls back to) is the absence of `sortBy`.
 */
export const SAVED_SEARCH_SORTS = [
  "price_asc",
  "price_desc",
  "created_asc",
  "created_desc",
  "title_asc",
  "title_desc",
  "view_count_desc",
  "view_count_asc",
  "rating_desc",
] as const;

export type SavedSearchSort = (typeof SAVED_SEARCH_SORTS)[number];

const STRING_KEYS = [
  "search",
  "categoryId",
  "brandId",
  "brand",
  "manufacturerId",
  "manufacturer",
  "carModelId",
  "scale",
  "material",
  "condition",
] as const satisfies readonly SavedSearchQueryKey[];

const FLAG_KEYS = [
  "tradeOnly",
  "discountOnly",
  "preOrder",
  "limited",
  "set",
] as const satisfies readonly SavedSearchQueryKey[];

/**
 * A canonical saved query, in `GET /products` form: send it as the query
 * string as it is. Flags are present only when `true`; `color` is a sorted,
 * comma-separated slug list; `attrGroups` is the JSON of a group -> slugs map
 * with sorted keys and slugs.
 */
export interface SavedSearchQuery {
  search?: string;
  categoryId?: string;
  brandId?: string;
  brand?: string;
  manufacturerId?: string;
  manufacturer?: string;
  carModelId?: string;
  scale?: string;
  material?: string;
  color?: string;
  condition?: string;
  minPrice?: number;
  maxPrice?: number;
  tradeOnly?: true;
  discountOnly?: true;
  preOrder?: true;
  limited?: true;
  set?: true;
  attrGroups?: string;
  sortBy?: SavedSearchSort;
}

/**
 * Display names of the values in the query, keyed by the query key (for
 * example `categoryId -> "Diecast"`). A snapshot at save time: a later rename
 * of a category or brand does not update it.
 */
export type SavedSearchLabels = Partial<Record<SavedSearchQueryKey, string>>;

/** `GET /saved-searches` item and `POST /saved-searches` answer. */
export interface SavedSearch {
  id: string;
  /** `null` when the user gave no name and none could be derived: render `savedSearch.untitled`. */
  name: string | null;
  query: SavedSearchQuery;
  labels: SavedSearchLabels;
  /** ISO 8601. */
  createdAt: string;
}

/** `POST /saved-searches` body. */
export interface CreateSavedSearchInput {
  /** Trimmed; blank or missing means "derive the default name". */
  name?: string;
  /** Any `GET /products` params; the API keeps the allow-listed ones. */
  query: Record<string, unknown>;
  labels?: SavedSearchLabels;
}

/** Longest stored name, user-given or derived. */
export const SAVED_SEARCH_NAME_MAX = 60;
/** Longest label value. */
export const SAVED_SEARCH_LABEL_MAX = 80;
/** Most label entries in one save. */
export const SAVED_SEARCH_LABELS_MAX = 20;

/** Highest `MembershipTier.maxSavedSearches` an admin can set. */
export const SAVED_SEARCH_TIER_LIMIT_MAX = 1000;

/** `errorCode` values of the saved-search routes. */
export const SAVED_SEARCH_ERROR_CODES = {
  /** 403: the tier's `maxSavedSearches` is reached; the body carries `limit`. */
  limitReached: "SAVED_SEARCH_LIMIT",
  /** 409: the same canonical query is already saved. */
  duplicate: "SAVED_SEARCH_DUPLICATE",
} as const;

export type SavedSearchErrorCode =
  (typeof SAVED_SEARCH_ERROR_CODES)[keyof typeof SAVED_SEARCH_ERROR_CODES];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const trimmed = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text === "" ? undefined : text;
};

const finiteNumber = (value: unknown): number | undefined => {
  if (typeof value === "string" && value.trim() === "") return undefined;
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
};

const sortedUnique = (values: readonly string[]): string[] =>
  [...new Set(values.map((v) => v.trim()).filter(Boolean))].sort(compare);

/** `{ group: [slugs] }` (object or JSON text) -> sorted map, or undefined. */
function parseAttrGroups(value: unknown): Record<string, string[]> | undefined {
  let raw: unknown = value;
  if (typeof value === "string") {
    try {
      raw = JSON.parse(value);
    } catch {
      // GET /products ignores malformed JSON too, so dropping it keeps the
      // saved search equal to what the user saw.
      return undefined;
    }
  }
  if (!isRecord(raw)) return undefined;
  const groups: Record<string, string[]> = {};
  for (const group of Object.keys(raw)
    .map((k) => k.trim())
    .sort(compare)) {
    const slugs = raw[group];
    if (!group || !Array.isArray(slugs)) continue;
    const clean = sortedUnique(
      slugs.filter((s): s is string => typeof s === "string"),
    );
    if (clean.length > 0) groups[group] = clean;
  }
  return Object.keys(groups).length > 0 ? groups : undefined;
}

/**
 * The canonical form of a `GET /products` query, so two saves of the same
 * search are byte-equal:
 *
 * - only allow-listed keys, strings trimmed, empty values dropped
 * - flags kept only when `true` (or `"true"`)
 * - numbers as numbers; `minPrice <= 0` dropped (it filters nothing)
 * - `color` and the `attrGroups` keys and slugs sorted and deduplicated
 * - `sortBy` kept only when it is an explicit sort (not "relevance")
 * - keys in sorted order, so `JSON.stringify` of the result is stable
 */
export function canonicalizeSavedSearchQuery(raw: unknown): SavedSearchQuery {
  const input = isRecord(raw) ? raw : {};
  const out: Record<string, unknown> = {};

  for (const key of STRING_KEYS) {
    const value = trimmed(input[key]);
    if (value !== undefined) out[key] = value;
  }

  const colors =
    typeof input.color === "string" ? sortedUnique(input.color.split(",")) : [];
  if (colors.length > 0) out.color = colors.join(",");

  const minPrice = finiteNumber(input.minPrice);
  if (minPrice !== undefined && minPrice > 0) out.minPrice = minPrice;
  const maxPrice = finiteNumber(input.maxPrice);
  if (maxPrice !== undefined && maxPrice >= 0) out.maxPrice = maxPrice;

  for (const key of FLAG_KEYS) {
    if (input[key] === true || input[key] === "true") out[key] = true;
  }

  const attrGroups = parseAttrGroups(input.attrGroups);
  if (attrGroups) out.attrGroups = JSON.stringify(attrGroups);

  const sortBy = trimmed(input.sortBy);
  if (sortBy && (SAVED_SEARCH_SORTS as readonly string[]).includes(sortBy)) {
    out.sortBy = sortBy;
  }

  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(out).sort(compare)) sorted[key] = out[key];
  return sorted as SavedSearchQuery;
}

/** True when nothing but a sort is left: such a search cannot be saved. */
export function isEmptySavedSearchQuery(query: SavedSearchQuery): boolean {
  return Object.keys(query).every((key) => key === "sortBy");
}

/**
 * Labels of a canonical query: string values for keys present in the query,
 * trimmed, at most `SAVED_SEARCH_LABEL_MAX` characters, in sorted key order.
 */
export function canonicalizeSavedSearchLabels(
  raw: unknown,
  query: SavedSearchQuery,
): SavedSearchLabels {
  const input = isRecord(raw) ? raw : {};
  const out: SavedSearchLabels = {};
  for (const key of (Object.keys(query) as SavedSearchQueryKey[]).sort(
    compare,
  )) {
    const value = trimmed(input[key]);
    if (value !== undefined) {
      out[key] = Array.from(value).slice(0, SAVED_SEARCH_LABEL_MAX).join("");
    }
  }
  return out;
}

/**
 * The automatic name: the search text, then the category, brand,
 * manufacturer and car model labels, then the scale, joined with " · " and
 * cut to `SAVED_SEARCH_NAME_MAX`. Empty when none of them is present.
 */
export function savedSearchDefaultName(
  query: SavedSearchQuery,
  labels: SavedSearchLabels = {},
): string {
  const parts = [
    query.search,
    query.categoryId && labels.categoryId,
    (query.brandId && labels.brandId) ||
      (query.brand && (labels.brand ?? query.brand)),
    (query.manufacturerId && labels.manufacturerId) ||
      (query.manufacturer && (labels.manufacturer ?? query.manufacturer)),
    query.carModelId && labels.carModelId,
    query.scale && (labels.scale ?? query.scale),
  ]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean);
  return Array.from(parts.join(" · "))
    .slice(0, SAVED_SEARCH_NAME_MAX)
    .join("")
    .trim();
}

/**
 * The URL params web `/listings` and mobile `/search` both read, to run a
 * saved search. `attrGroups` becomes `attr.<group>=a,b`. With `labels`, the
 * display names the filter chips read are added too (`brand`, `manufacturer`,
 * `carModel`); the list request still filters by the ids.
 */
export function savedSearchToRouteParams(
  query: SavedSearchQuery,
  labels: SavedSearchLabels = {},
): Record<string, string> {
  const params: Record<string, string> = {};
  for (const key of SAVED_SEARCH_QUERY_KEYS) {
    const value = query[key];
    if (value === undefined || key === "attrGroups") continue;
    params[key] = String(value);
  }
  const groups = parseAttrGroups(query.attrGroups);
  for (const [group, slugs] of Object.entries(groups ?? {})) {
    params[`attr.${group}`] = slugs.join(",");
  }
  if (query.brandId && !query.brand && labels.brandId) {
    params.brand = labels.brandId;
  }
  if (query.manufacturerId && !query.manufacturer && labels.manufacturerId) {
    params.manufacturer = labels.manufacturerId;
  }
  if (query.carModelId && labels.carModelId) {
    params.carModel = labels.carModelId;
  }
  return params;
}
