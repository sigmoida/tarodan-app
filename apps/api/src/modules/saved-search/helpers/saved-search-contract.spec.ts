// The saved-search rules live once in `@tarodan/types` (web and mobile use the
// same functions); this spec pins them for every surface.
import {
  SAVED_SEARCH_NAME_MAX,
  canonicalizeSavedSearchLabels,
  canonicalizeSavedSearchQuery,
  isEmptySavedSearchQuery,
  savedSearchDefaultName,
  savedSearchToRouteParams,
} from "@tarodan/types";
import { savedSearchQueryHash } from "./saved-search-hash";

const UUID = "3f2b8c1e-5d4a-4e6b-9a7c-1b2c3d4e5f60";

describe("canonicalizeSavedSearchQuery", () => {
  it("keeps only the allow-listed keys", () => {
    expect(
      canonicalizeSavedSearchQuery({
        search: "ferrari",
        page: 2,
        limit: 48,
        sellerId: UUID,
        status: "active",
        boostedOnly: true,
        homeShowcase: true,
        tradeEligible: true,
        inactiveReason: "expired",
        attributeSlugs: "a,b",
      }),
    ).toEqual({ search: "ferrari" });
  });

  it("trims strings and drops empty values, false flags and relevance", () => {
    expect(
      canonicalizeSavedSearchQuery({
        search: "  ferrari f40 ",
        brand: "   ",
        scale: "",
        tradeOnly: false,
        discountOnly: "false",
        preOrder: true,
        limited: "true",
        sortBy: "relevance",
        color: " , ",
        attrGroups: '{"hw-rarity":[]}',
      }),
    ).toEqual({ search: "ferrari f40", preOrder: true, limited: true });
  });

  it("writes numbers as numbers and drops a minPrice that filters nothing", () => {
    expect(
      canonicalizeSavedSearchQuery({ minPrice: "100", maxPrice: "2500.5" }),
    ).toEqual({ minPrice: 100, maxPrice: 2500.5 });
    expect(canonicalizeSavedSearchQuery({ minPrice: 0, maxPrice: 0 })).toEqual({
      maxPrice: 0,
    });
    expect(
      canonicalizeSavedSearchQuery({ minPrice: "abc", maxPrice: "" }),
    ).toEqual({});
  });

  it("sorts and dedupes colours and attribute groups", () => {
    expect(
      canonicalizeSavedSearchQuery({
        color: "red, black,red",
        attrGroups: JSON.stringify({
          "hw-segment": ["premium", "mainline", "premium"],
          "hw-rarity": [" treasure-hunt "],
          empty: [],
        }),
      }),
    ).toEqual({
      color: "black,red",
      attrGroups:
        '{"hw-rarity":["treasure-hunt"],"hw-segment":["mainline","premium"]}',
    });
  });

  it("reads attrGroups exactly as GET /products does", () => {
    // The group key as it is (GET /products does not trim it), slugs as text.
    expect(
      canonicalizeSavedSearchQuery({
        attrGroups: JSON.stringify({ " hw-rarity": ["th"], "hw-year": [2024] }),
      }),
    ).toEqual({ attrGroups: '{" hw-rarity":["th"],"hw-year":["2024"]}' });
  });

  it("keeps a negative maxPrice: GET /products applies it", () => {
    expect(canonicalizeSavedSearchQuery({ maxPrice: -1 })).toEqual({
      maxPrice: -1,
    });
  });

  it("drops malformed attrGroups, as GET /products ignores it", () => {
    expect(canonicalizeSavedSearchQuery({ attrGroups: "{nope" })).toEqual({});
    expect(canonicalizeSavedSearchQuery({ attrGroups: "[1]" })).toEqual({});
  });

  it("keeps an explicit sort and drops an unknown one", () => {
    expect(canonicalizeSavedSearchQuery({ sortBy: "price_asc" })).toEqual({
      sortBy: "price_asc",
    });
    expect(canonicalizeSavedSearchQuery({ sortBy: "cheapest" })).toEqual({});
  });

  it("writes keys in sorted order", () => {
    const query = canonicalizeSavedSearchQuery({
      tradeOnly: true,
      search: "x",
      categoryId: UUID,
      brandId: "b1",
    });
    expect(Object.keys(query)).toEqual([
      "brandId",
      "categoryId",
      "search",
      "tradeOnly",
    ]);
  });

  it("tolerates a non-object input", () => {
    expect(canonicalizeSavedSearchQuery(null)).toEqual({});
    expect(canonicalizeSavedSearchQuery("search=x")).toEqual({});
  });
});

describe("the dedupe hash", () => {
  const hashOf = (raw: Record<string, unknown>) =>
    savedSearchQueryHash(canonicalizeSavedSearchQuery(raw));

  it("is equal for the same search in another key order, spacing or colour order", () => {
    const a = hashOf({
      search: "porsche 911",
      color: "red,black",
      tradeOnly: true,
      minPrice: 100,
      page: 1,
    });
    const b = hashOf({
      minPrice: "100",
      tradeOnly: "true",
      color: "black, red",
      search: "porsche 911 ",
      page: 3,
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differs for a different filter or sort", () => {
    expect(hashOf({ search: "porsche" })).not.toBe(
      hashOf({ search: "porsche", sortBy: "price_asc" }),
    );
    expect(hashOf({ search: "porsche" })).not.toBe(
      hashOf({ search: "Porsche" }),
    );
  });
});

describe("isEmptySavedSearchQuery", () => {
  it("is true for nothing or a sort only", () => {
    expect(isEmptySavedSearchQuery({})).toBe(true);
    expect(isEmptySavedSearchQuery({ sortBy: "price_asc" })).toBe(true);
  });

  it("is false with any filter", () => {
    expect(isEmptySavedSearchQuery({ tradeOnly: true })).toBe(false);
    expect(isEmptySavedSearchQuery({ maxPrice: 0 })).toBe(false);
  });
});

describe("canonicalizeSavedSearchLabels", () => {
  it("keeps trimmed string labels of keys in the query, in sorted order", () => {
    const query = canonicalizeSavedSearchQuery({
      categoryId: UUID,
      brandId: "b1",
    });
    const labels = canonicalizeSavedSearchLabels(
      {
        categoryId: " Diecast ",
        brandId: "Ferrari",
        manufacturerId: "Not in the query",
        scale: 64,
        page: "x",
      },
      query,
    );
    expect(labels).toEqual({ brandId: "Ferrari", categoryId: "Diecast" });
    expect(Object.keys(labels)).toEqual(["brandId", "categoryId"]);
  });

  it("cuts a long label", () => {
    const labels = canonicalizeSavedSearchLabels(
      { brand: "x".repeat(200) },
      { brand: "x" },
    );
    expect(labels.brand).toHaveLength(80);
  });
});

describe("savedSearchDefaultName", () => {
  it("joins search, category, brand, manufacturer, car model and scale", () => {
    expect(
      savedSearchDefaultName(
        {
          search: "f40",
          categoryId: UUID,
          brandId: "b1",
          manufacturerId: UUID,
          carModelId: UUID,
          scale: "1:18",
          tradeOnly: true,
        },
        {
          categoryId: "Diecast",
          brandId: "Ferrari",
          manufacturerId: "Bburago",
          carModelId: "F40",
        },
      ),
    ).toBe("f40 · Diecast · Ferrari · Bburago · F40 · 1:18");
  });

  it("uses the name filters themselves when there is no id", () => {
    expect(
      savedSearchDefaultName({ brand: "Porsche", manufacturer: "Minichamps" }),
    ).toBe("Porsche · Minichamps");
  });

  it("is empty when only unnamed filters are set", () => {
    expect(
      savedSearchDefaultName({ tradeOnly: true, categoryId: UUID }, {}),
    ).toBe("");
  });

  it("is cut to the name limit", () => {
    const name = savedSearchDefaultName({ search: "ş".repeat(100) });
    expect(Array.from(name)).toHaveLength(SAVED_SEARCH_NAME_MAX);
  });
});

describe("savedSearchToRouteParams", () => {
  it("emits the names web /listings and mobile /search read", () => {
    expect(
      savedSearchToRouteParams({
        search: "f40",
        categoryId: UUID,
        tradeOnly: true,
        minPrice: 100,
        color: "black,red",
        sortBy: "price_asc",
        attrGroups:
          '{"hw-rarity":["treasure-hunt"],"hw-segment":["mainline","premium"]}',
      }),
    ).toEqual({
      search: "f40",
      categoryId: UUID,
      tradeOnly: "true",
      minPrice: "100",
      color: "black,red",
      sortBy: "price_asc",
      "attr.hw-rarity": "treasure-hunt",
      "attr.hw-segment": "mainline,premium",
    });
  });

  it("never emits the old q or tradeAvailable names", () => {
    const params = savedSearchToRouteParams({ search: "x", tradeOnly: true });
    expect(params).not.toHaveProperty("q");
    expect(params).not.toHaveProperty("tradeAvailable");
  });

  it("adds the display names the filter chips read", () => {
    // Web /listings and mobile /search show a category chip (and web its
    // title) from `category`; without it web shows no chip and mobile the
    // generic "Category" for a subcategory id.
    expect(
      savedSearchToRouteParams(
        {
          categoryId: UUID,
          brandId: "b1",
          manufacturerId: UUID,
          carModelId: UUID,
        },
        {
          categoryId: "Diecast",
          brandId: "Ferrari",
          manufacturerId: "Bburago",
          carModelId: "F40",
        },
      ),
    ).toEqual({
      categoryId: UUID,
      category: "Diecast",
      brandId: "b1",
      brand: "Ferrari",
      manufacturerId: UUID,
      manufacturer: "Bburago",
      carModelId: UUID,
      carModel: "F40",
    });
  });

  it("adds no display name without a label", () => {
    expect(
      savedSearchToRouteParams({ categoryId: UUID, brandId: "b1" }),
    ).toEqual({ categoryId: UUID, brandId: "b1" });
  });

  it("round-trips through the canonical form, display names included", () => {
    const query = canonicalizeSavedSearchQuery({
      search: "f40",
      color: "red,black",
      preOrder: true,
      maxPrice: 900,
      categoryId: UUID,
      carModelId: UUID,
    });
    const params = savedSearchToRouteParams(query, {
      categoryId: "Diecast",
      carModelId: "F40",
    });
    expect(canonicalizeSavedSearchQuery(params)).toEqual(query);
  });
});

/**
 * Web `/listings` and mobile `/search` build their `GET /products` params with
 * the same builder rules (`buildListApiParams` on web, its mirror in mobile
 * `productFilters.ts`): numbers for prices, `true` for set flags, `color` as a
 * comma list, `attrGroups` as the JSON of the selected groups in selection
 * order, plus `page` and `limit`. Both clients send that object as the saved
 * query and use the canonical form for the disabled state and the default
 * name, so these are the inputs the canonicaliser must agree on.
 */
describe("the inputs web and mobile send", () => {
  const CAR_MODEL = "6a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

  const hashOf = (raw: Record<string, unknown>) =>
    savedSearchQueryHash(canonicalizeSavedSearchQuery(raw));

  const fromBuilder = (
    over: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    limit: 48,
    page: 2,
    search: "f40",
    categoryId: UUID,
    condition: "very_good",
    minPrice: 100,
    maxPrice: 2500,
    brandId: "b1",
    carModelId: CAR_MODEL,
    scale: "1:18",
    color: "red,black",
    manufacturerId: UUID,
    tradeOnly: true,
    preOrder: true,
    sortBy: "price_asc",
    attrGroups: JSON.stringify({
      "hw-segment": ["premium", "mainline"],
      "hw-rarity": ["treasure-hunt"],
    }),
    ...over,
  });

  it("keeps every filter of a full builder object, without page and limit", () => {
    expect(canonicalizeSavedSearchQuery(fromBuilder())).toEqual({
      attrGroups:
        '{"hw-rarity":["treasure-hunt"],"hw-segment":["mainline","premium"]}',
      brandId: "b1",
      carModelId: CAR_MODEL,
      categoryId: UUID,
      color: "black,red",
      condition: "very_good",
      manufacturerId: UUID,
      maxPrice: 2500,
      minPrice: 100,
      preOrder: true,
      scale: "1:18",
      search: "f40",
      sortBy: "price_asc",
      tradeOnly: true,
    });
  });

  it("hashes the same search equal whatever order the user picked the filters in", () => {
    const picked = fromBuilder({
      page: 1,
      color: "black,red",
      attrGroups: JSON.stringify({
        "hw-rarity": ["treasure-hunt"],
        "hw-segment": ["mainline", "premium"],
      }),
    });
    expect(hashOf(picked)).toBe(hashOf(fromBuilder()));
  });

  it("tells apart searches that differ in one attribute slug", () => {
    expect(
      hashOf(
        fromBuilder({ attrGroups: JSON.stringify({ "hw-rarity": ["sth"] }) }),
      ),
    ).not.toBe(
      hashOf(
        fromBuilder({ attrGroups: JSON.stringify({ "hw-rarity": ["th"] }) }),
      ),
    );
  });

  it("drops a price a client could not parse (NaN, or null after JSON)", () => {
    expect(
      canonicalizeSavedSearchQuery({
        search: "x",
        minPrice: Number("1,5"),
        maxPrice: Infinity,
      }),
    ).toEqual({ search: "x" });
    expect(
      canonicalizeSavedSearchQuery(
        JSON.parse(JSON.stringify({ search: "x", minPrice: Number.NaN })),
      ),
    ).toEqual({ search: "x" });
  });

  it("sees nothing to save in the builder object of a bare listings page", () => {
    // `/listings` with only the default sort: page and limit, nothing else.
    expect(
      isEmptySavedSearchQuery(
        canonicalizeSavedSearchQuery({ limit: 48, page: 1 }),
      ),
    ).toBe(true);
    expect(
      isEmptySavedSearchQuery(
        canonicalizeSavedSearchQuery({
          limit: 48,
          page: 1,
          sortBy: "created_desc",
        }),
      ),
    ).toBe(true);
  });

  it("is idempotent: a canonical query (a stored row, a re-save) stays byte-equal", () => {
    const once = canonicalizeSavedSearchQuery(fromBuilder());
    const twice = canonicalizeSavedSearchQuery(
      JSON.parse(JSON.stringify(once)),
    );
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
    expect(savedSearchQueryHash(twice)).toBe(savedSearchQueryHash(once));
  });

  it("round-trips attrGroups through the attr.<group> route params", () => {
    const query = canonicalizeSavedSearchQuery(fromBuilder());
    const params = savedSearchToRouteParams(query);

    // What both listings pages do with the URL: `attr.<group>=a,b` back into
    // groups, then `attrGroups` as their JSON (web `parseCustomAttrs`).
    const groups: Record<string, string[]> = {};
    const rest: Record<string, string> = {};
    for (const [key, value] of Object.entries(params)) {
      if (key.startsWith("attr.")) {
        groups[key.slice("attr.".length)] = value.split(",");
      } else {
        rest[key] = value;
      }
    }
    expect(Object.keys(groups).sort()).toEqual(["hw-rarity", "hw-segment"]);
    expect(
      canonicalizeSavedSearchQuery({
        ...rest,
        attrGroups: JSON.stringify(groups),
      }),
    ).toEqual(query);
  });
});
