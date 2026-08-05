import { ProductKind } from "@prisma/client";
import { catalogProductWhere } from "./catalog-product-where";

describe("catalogProductWhere", () => {
  it("only permits real marketplace listings", () => {
    expect(catalogProductWhere()).toEqual({ kind: ProductKind.listing });
  });
});
