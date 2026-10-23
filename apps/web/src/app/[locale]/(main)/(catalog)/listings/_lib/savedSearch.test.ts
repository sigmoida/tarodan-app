/** @format */

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  canonicalizeSavedSearchQuery,
  savedSearchToRouteParams,
  type SavedSearchQuery,
} from "@tarodan/types";
import { parseListingsFilters } from "./params";
import { buildSavedSearchDraft, toCreateSavedSearchInput } from "./savedSearch";

const sp = (query: string) => new URLSearchParams(query);
const filters = (query = "") => parseListingsFilters(sp(query));

describe("buildSavedSearchDraft", () => {
  it("is empty for no filters and for a sort alone", () => {
    expect(buildSavedSearchDraft(filters(), undefined).isEmpty).toBe(true);
    expect(
      buildSavedSearchDraft(filters("sortBy=price_asc"), undefined).isEmpty,
    ).toBe(true);
  });

  it("serialises the grid's own params without page and limit", () => {
    const draft = buildSavedSearchDraft(
      filters("search=mustang&color=red,black&tradeOnly=true&minPrice=10"),
      undefined,
    );
    expect(draft.isEmpty).toBe(false);
    expect(draft.query).toEqual({
      color: "black,red",
      minPrice: 10,
      search: "mustang",
      tradeOnly: true,
    });
    expect(draft.query).not.toHaveProperty("page");
    expect(draft.query).not.toHaveProperty("limit");
  });

  it("sends display names as labels for the id-keyed filters", () => {
    const draft = buildSavedSearchDraft(
      filters(
        "categoryId=c1&category=Diecast&brandId=b1&brand=Hot%20Wheels&manufacturerId=m1&manufacturer=Mattel&carModelId=cm1&carModel=Mustang",
      ),
      "c1",
    );
    expect(draft.query).toMatchObject({
      categoryId: "c1",
      brandId: "b1",
      manufacturerId: "m1",
      carModelId: "cm1",
    });
    expect(draft.labels).toEqual({
      brandId: "Hot Wheels",
      carModelId: "Mustang",
      categoryId: "Diecast",
      manufacturerId: "Mattel",
    });
    expect(draft.defaultName).toBe("Diecast · Hot Wheels · Mattel · Mustang");
  });

  it("uses the resolved category id when the category came as a slug", () => {
    const draft = buildSavedSearchDraft(
      { ...filters("category=Diecast"), categoryId: "" },
      "c1",
    );
    expect(draft.query.categoryId).toBe("c1");
    expect(draft.labels.categoryId).toBe("Diecast");
  });

  it("keeps a name-only brand as the `brand` text and adds no label", () => {
    const draft = buildSavedSearchDraft(filters("brand=Porsche"), undefined);
    expect(draft.query.brand).toBe("Porsche");
    expect(draft.labels).toEqual({});
  });

  it("is already canonical (re-canonicalising changes nothing)", () => {
    const { query } = buildSavedSearchDraft(
      filters("search=a&color=red,black&attr.hw-rarity=b,a&sortBy=price_asc"),
      undefined,
    );
    expect(canonicalizeSavedSearchQuery(query)).toEqual(query);
    expect(query.attrGroups).toBe('{"hw-rarity":["a","b"]}');
  });

  it("round trips: the run params parse back into the saved filters", () => {
    const saved = filters(
      "search=mustang&categoryId=c1&category=Diecast&brandId=b1&brand=Hot%20Wheels&carModelId=cm1&carModel=Mustang&scale=1%3A64&material=diecast&color=black,red&condition=new&minPrice=10&maxPrice=99&tradeOnly=true&discountOnly=true&preOrder=true&limited=true&set=true&attr.hw-rarity=a,b&sortBy=price_asc",
    );
    const { query, labels } = buildSavedSearchDraft(saved, saved.categoryId);
    const run = parseListingsFilters(
      new URLSearchParams(savedSearchToRouteParams(query, labels)),
    );
    expect(run).toEqual({ ...saved, colors: ["black", "red"] });
  });
});

// The API's dedupe key (`saved-search-hash.ts`): SHA-256 of the canonical
// query's JSON. Mirrored here to pin that price parsing changes no stored hash.
const queryHash = (query: SavedSearchQuery) =>
  createHash("sha256").update(JSON.stringify(query)).digest("hex");

describe("saved-search price criteria", () => {
  // Stored criteria hold plain numbers, as the old clients saved them.
  it.each<[string, SavedSearchQuery]>([
    ["whole bounds", { maxPrice: 1000, minPrice: 100 }],
    ["a decimal bound", { maxPrice: 1250.5, minPrice: 99.99 }],
    ["a min alone", { minPrice: 1000, search: "mustang" }],
    ["a max alone", { maxPrice: 500, tradeOnly: true }],
    ["a min above the max", { maxPrice: 100, minPrice: 500 }],
  ])("re-saving a run search keeps the stored hash (%s)", (_, stored) => {
    const run = parseListingsFilters(
      new URLSearchParams(savedSearchToRouteParams(stored)),
    );
    const { query } = buildSavedSearchDraft(run, undefined);
    expect(query).toEqual(stored);
    expect(queryHash(query)).toBe(queryHash(stored));
  });

  // Two stored shapes a run no longer applies (pinned): no TL amount has three
  // decimals ("99.999" reads like a grouped 99 thousand), and a 0 max is no
  // bound. The stored rows and their hashes stay as they are; only the run
  // ignores the bound.
  it.each<[string, SavedSearchQuery, SavedSearchQuery]>([
    ["three decimals", { minPrice: 99.999, search: "a" }, { search: "a" }],
    ["a zero max", { maxPrice: 0, search: "a" }, { search: "a" }],
  ])("a run ignores a stored bound with %s", (_, stored, run) => {
    const runFilters = parseListingsFilters(
      new URLSearchParams(savedSearchToRouteParams(stored)),
    );
    expect(buildSavedSearchDraft(runFilters, undefined).query).toEqual(run);
  });

  it("saves typed text as the same canonical numbers as plain input", () => {
    const typed = buildSavedSearchDraft(
      { ...filters(), minPrice: "1250,50", maxPrice: "2000,00" },
      undefined,
    );
    const plain = buildSavedSearchDraft(
      filters("minPrice=1250.5&maxPrice=2000"),
      undefined,
    );
    expect(typed.query).toEqual({ maxPrice: 2000, minPrice: 1250.5 });
    expect(queryHash(typed.query)).toBe(queryHash(plain.query));
  });

  it('saves no bound for refused text (never 1 TL for "1.000")', () => {
    const draft = buildSavedSearchDraft(
      { ...filters("search=mustang"), minPrice: "1.000" },
      undefined,
    );
    expect(draft.query).toEqual({ search: "mustang" });
  });
});

describe("toCreateSavedSearchInput", () => {
  const draft = buildSavedSearchDraft(filters("search=a"), undefined);

  it("omits a blank name so the API derives one", () => {
    expect(toCreateSavedSearchInput(draft, "   ")).toEqual({
      query: { search: "a" },
      labels: {},
    });
  });

  it("sends the trimmed name", () => {
    expect(toCreateSavedSearchInput(draft, "  Mine ").name).toBe("Mine");
  });
});
