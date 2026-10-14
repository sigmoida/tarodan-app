import { resolveSalePrice } from "./product-sale-window";
import { onSaleWhere } from "./product-on-sale-where";

describe("onSaleWhere", () => {
  const now = new Date("2026-10-14T12:00:00Z");
  const priceRef = { _ref: "price" } as any;

  it("requires oldPrice > price (column ref) and an open sale window", () => {
    const where = onSaleWhere(now, priceRef) as any;
    expect(where.AND).toEqual([
      { oldPrice: { not: null } },
      { oldPrice: { gt: priceRef } },
      { OR: [{ saleStartDate: null }, { saleStartDate: { lte: now } }] },
      { OR: [{ saleEndDate: null }, { saleEndDate: { gte: now } }] },
    ]);
  });

  it("mirrors resolveSalePrice window semantics (closed window => not on sale)", () => {
    const closed = {
      price: 80,
      oldPrice: 100,
      saleEndDate: new Date("2026-10-01T00:00:00Z"),
    };
    expect(resolveSalePrice(closed, now).isOnSale).toBe(false);
    const open = { price: 80, oldPrice: 100, saleEndDate: null };
    expect(resolveSalePrice(open, now).isOnSale).toBe(true);
  });
});
