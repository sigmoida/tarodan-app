import { ProductKind, ProductStatus } from "@prisma/client";
import { saleCapableSellerWhere } from "../../membership/helpers/membership.util";
import { activeListingWhere } from "./active-listing-where";

describe("activeListingWhere", () => {
  it("katalog ilanı + aktif statü + satış yapabilen satıcıyı birleştirir", () => {
    const now = new Date("2026-10-14T10:00:00Z");

    expect(activeListingWhere(now)).toEqual({
      kind: ProductKind.listing,
      status: ProductStatus.active,
      seller: saleCapableSellerWhere(now),
    });
  });
});
