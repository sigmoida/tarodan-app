import { buildProductWhere } from "./build-product-where";

describe("buildProductWhere — hiddenSellerIds (user blocks)", () => {
  const sellerNotIn = (where: any) =>
    (where.AND as any[]).find((c) => c.sellerId?.notIn);

  it("adds a sellerId notIn condition when hidden ids are present", () => {
    const where = buildProductWhere({ hiddenSellerIds: ["s1", "s2"] });
    expect(sellerNotIn(where)).toEqual({ sellerId: { notIn: ["s1", "s2"] } });
  });

  it("adds nothing for an empty or missing list", () => {
    expect(
      sellerNotIn(buildProductWhere({ hiddenSellerIds: [] })),
    ).toBeUndefined();
    expect(sellerNotIn(buildProductWhere({}))).toBeUndefined();
  });

  it("composes with an explicit sellerId filter (storefront of a hidden seller yields nothing)", () => {
    const where = buildProductWhere({
      sellerId: "s1",
      hiddenSellerIds: ["s1"],
    });
    expect(where.sellerId).toBe("s1");
    expect(sellerNotIn(where)).toEqual({ sellerId: { notIn: ["s1"] } });
  });
});
