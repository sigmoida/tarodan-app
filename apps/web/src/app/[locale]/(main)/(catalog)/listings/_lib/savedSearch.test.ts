/** @format */

import { describe, expect, it } from "vitest";
import {
  canonicalizeSavedSearchQuery,
  savedSearchToRouteParams,
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
