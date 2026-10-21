import { describe, expect, it } from "vitest";
import { boostPurchaseFilterFields, boostPurchaseListParams } from "./filters";

const t = ((key: string) => key) as never;

describe("boostPurchaseFilterFields", () => {
  it("offers a source filter with all, purchase and free grant", () => {
    const source = boostPurchaseFilterFields(t, []).find(
      (f) => "name" in f && f.name === "source",
    );
    expect(source).toMatchObject({
      type: "select",
      label: "admin.marketing.boostPurchases.sourceLabel",
    });
    expect(
      (source as { options: { value: string }[] }).options.map((o) => o.value),
    ).toEqual(["all", "purchase", "admin_grant"]);
  });
});

describe("boostPurchaseListParams", () => {
  it("sends the source filter as the API names it", () => {
    expect(
      boostPurchaseListParams({ page: 2, limit: 20, source: "admin_grant" }),
    ).toEqual({
      page: 2,
      limit: 20,
      search: undefined,
      packageId: undefined,
      status: undefined,
      source: "admin_grant",
    });
    expect(boostPurchaseListParams({ source: "purchase" }).source).toBe(
      "purchase",
    );
  });

  it("leaves out 'all', empty and unknown filters", () => {
    expect(
      boostPurchaseListParams({
        search: "",
        packageId: "all",
        status: "all",
        source: "all",
      }),
    ).toMatchObject({
      search: undefined,
      packageId: undefined,
      status: undefined,
      source: undefined,
    });
    expect(
      boostPurchaseListParams({ status: "refunded", source: "gift" }),
    ).toMatchObject({ status: undefined, source: undefined });
  });

  it("keeps a package, a known status and the search", () => {
    expect(
      boostPurchaseListParams({
        packageId: "pkg-1",
        status: "cancelled",
        search: "vitrin",
      }),
    ).toMatchObject({
      packageId: "pkg-1",
      status: "cancelled",
      search: "vitrin",
    });
  });
});
