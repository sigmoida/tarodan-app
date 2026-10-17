import { ProductKind, ProductStatus } from "@prisma/client";
import { saleCapableSellerWhere } from "../../membership/helpers/membership.util";
import { buildProductWhere } from "./build-product-where";
import {
  catalogProductWhere,
  inStockWhere,
  publicListingWhere,
} from "./catalog-product-where";

describe("catalogProductWhere", () => {
  it("only permits real marketplace listings", () => {
    expect(catalogProductWhere()).toEqual({ kind: ProductKind.listing });
  });
});

describe("publicListingWhere", () => {
  it("composes catalog + active + in-stock + sale-capable seller", () => {
    const where = publicListingWhere();
    expect(where.kind).toBe(ProductKind.listing);
    expect(where.status).toBe(ProductStatus.active);
    expect(where.AND).toEqual([inStockWhere()]);
    expect(where.seller).toEqual(saleCapableSellerWhere(expect.any(Date)));
  });

  it("threads the account lane into the seller predicate", () => {
    const lane = "test" as const;
    expect(publicListingWhere(lane).seller).toEqual(
      saleCapableSellerWhere(expect.any(Date), lane),
    );
  });

  it("applies the same stock rule as the status=active list (count == list)", () => {
    const listWhere = buildProductWhere({ status: ProductStatus.active });
    expect(listWhere.AND).toEqual(expect.arrayContaining([inStockWhere()]));
    expect(inStockWhere()).toEqual({
      OR: [{ quantity: { gt: 0 } }, { quantity: null }],
    });
  });
});
