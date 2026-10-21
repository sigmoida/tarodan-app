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
    expect(
      savedSearchToRouteParams(
        { brandId: "b1", manufacturerId: UUID, carModelId: UUID },
        { brandId: "Ferrari", manufacturerId: "Bburago", carModelId: "F40" },
      ),
    ).toEqual({
      brandId: "b1",
      brand: "Ferrari",
      manufacturerId: UUID,
      manufacturer: "Bburago",
      carModelId: UUID,
      carModel: "F40",
    });
  });

  it("round-trips through the canonical form", () => {
    const query = canonicalizeSavedSearchQuery({
      search: "f40",
      color: "red,black",
      preOrder: true,
      maxPrice: 900,
    });
    const params = savedSearchToRouteParams(query);
    expect(canonicalizeSavedSearchQuery(params)).toEqual(query);
  });
});
