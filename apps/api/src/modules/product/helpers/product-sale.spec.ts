import { ProductStatus } from "@prisma/client";
import { unstampedTransitions } from "../../../common/helpers/stamped-transition.guard";
import { productSoldData } from "./product-sale";

describe("productSoldData", () => {
  it("stamps the sale moment alongside the status", () => {
    const at = new Date("2026-05-02T09:00:00.000Z");
    expect(productSoldData(at)).toEqual({
      status: ProductStatus.sold,
      soldAt: at,
    });
  });

  it("defaults to now so callers cannot forget the stamp", () => {
    const before = Date.now();
    expect(productSoldData().soldAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  /**
   * Yalnız SATIŞ bu damgayı yazar. Takas/kayıp gibi satış olmayan stok
   * düşümleri `inactive`e gider ve ilan hunisinin son adımına girmez.
   */
  it("is the ONLY way a product is written to sold", () => {
    expect(
      unstampedTransitions({
        delegate: "product",
        statuses: ["sold"],
        enumName: "ProductStatus",
        helpers: ["productSoldData"],
      }),
    ).toEqual([]);
  });
});
