import { getMetadataStorage } from "class-validator";
import { ProductQueryDto } from "../dto";
import {
  PRODUCT_LIST_CACHE_PREFIX,
  buildProductListCacheKey,
} from "./product-list-cache-key";

/**
 * GET /products cache anahtarı DTO'nun TÜM alanlarından türetilir. Staging'de
 * `manufacturer` anahtarda yoktu → `/products?manufacturer=X` filtresiz listeyle
 * aynı girdiyi paylaşıyordu. Bu spec, DTO'ya eklenecek her yeni filtrenin
 * otomatik olarak anahtara girdiğini kilitler.
 */
describe("buildProductListCacheKey", () => {
  const live = { lane: "live" as const };
  const key = (query: Partial<ProductQueryDto>, ctx = live) =>
    buildProductListCacheKey(query as ProductQueryDto, ctx);

  const dtoProperties = Array.from(
    new Set(
      getMetadataStorage()
        .getTargetValidationMetadatas(ProductQueryDto, "", false, false)
        .map((m) => m.propertyName),
    ),
  );

  /** Her alan için temsilî iki farklı değer (tipine göre). */
  const sampleValues = (prop: string): [unknown, unknown] => {
    const booleans = [
      "tradeOnly",
      "tradeEligible",
      "boostedOnly",
      "homeShowcase",
      "discountOnly",
      "preOrder",
      "limited",
      "set",
    ];
    const numbers = ["minPrice", "maxPrice", "page", "limit"];
    if (booleans.includes(prop)) return [true, false];
    if (numbers.includes(prop)) return [2, 3];
    if (prop === "status") return ["active", "sold"];
    if (prop === "condition") return ["mint", "very_good"];
    if (prop === "inactiveReason") return ["expired", "manual"];
    if (prop === "sortBy") return ["price_asc", "price_desc"];
    return ["a", "b"];
  };

  it("uses the products:list: prefix the cache invalidations rely on", () => {
    expect(key({}).startsWith(PRODUCT_LIST_CACHE_PREFIX)).toBe(true);
  });

  it("discovers the DTO's filter properties (sanity)", () => {
    expect(dtoProperties).toEqual(
      expect.arrayContaining([
        "manufacturer",
        "manufacturerId",
        "brand",
        "search",
        "inactiveReason",
        "tradeEligible",
      ]),
    );
  });

  it("separates manufacturer-filtered lists from the unfiltered list", () => {
    expect(key({ manufacturer: "Hot Wheels" })).not.toBe(key({}));
    expect(key({ manufacturer: "Hot Wheels" })).not.toBe(
      key({ manufacturer: "Matchbox" }),
    );
  });

  it("ignores the manufacturer name once manufacturerId is present", () => {
    expect(key({ manufacturerId: "m1", manufacturer: "Bruder" })).toBe(
      key({ manufacturerId: "m1", manufacturer: "Siku" }),
    );
  });

  it.each(dtoProperties)(
    "makes every DTO property part of the key: %s",
    (prop) => {
      const [a, b] = sampleValues(prop);
      const withA = key({ [prop]: a } as Partial<ProductQueryDto>);
      const withB = key({ [prop]: b } as Partial<ProductQueryDto>);
      expect(withA).not.toBe(withB);
      expect(withA).not.toBe(key({}));
    },
  );

  it("is independent of the query-string order", () => {
    expect(key({ brand: "x", scale: "1:64", page: 2 })).toBe(
      key({ page: 2, scale: "1:64", brand: "x" }),
    );
  });

  it("normalizes default paging so ?page=1&limit=20 shares the bare key", () => {
    expect(key({ page: 1, limit: 20 })).toBe(key({}));
  });

  it("keeps status undefined (inclusive) apart from status=active", () => {
    expect(key({})).not.toBe(
      key({ status: "active" } as Partial<ProductQueryDto>),
    );
  });

  it("ignores undefined filters", () => {
    expect(key({ brand: undefined })).toBe(key({}));
  });

  it("keys by lane always and by hidden sellers only when present", () => {
    expect(key({}, { lane: "test" } as any)).not.toBe(key({}));
    expect(key({})).not.toContain("hidden");
    expect(key({}, { lane: "live", hidden: "abc" } as any)).toContain(
      '"hidden":"abc"',
    );
  });
});
