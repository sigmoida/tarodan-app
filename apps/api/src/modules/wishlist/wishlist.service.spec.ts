import { WishlistService } from "./wishlist.service";

/**
 * `GET /wishlist` row mapping. The web Favorites cards apply the shared card
 * rule (`productCardAction`), which needs the stock as `availableQuantity`
 * (quantity - reservedQuantity; missing = unlimited). A cart line added from
 * Favorites also needs the listing's `maxQuantityPerOrder` (missing = no
 * per-order limit).
 */
describe("WishlistService.getWishlist", () => {
  const wishlist = {
    id: "w1",
    userId: "u1",
    createdAt: new Date("2026-01-01T00:00:00Z"),
  };

  const row = (product: Record<string, unknown>) => ({
    id: `item-${product.id}`,
    addedAt: new Date("2026-01-02T00:00:00Z"),
    product: {
      title: "Model",
      price: 100,
      condition: "new",
      status: "active",
      sellerId: "s1",
      categoryId: "c1",
      images: [],
      seller: { id: "s1", username: "seller" },
      quantity: null,
      reservedQuantity: 0,
      maxQuantityPerOrder: null,
      ...product,
    },
  });

  let findMany: jest.Mock;
  const build = (items: unknown[]) => {
    findMany = jest.fn().mockResolvedValue(items);
    const prisma = {
      wishlist: { findUnique: jest.fn().mockResolvedValue(wishlist) },
      wishlistItem: { findMany },
    };
    const discount = {
      getEffectiveDisplayPrice: jest.fn().mockResolvedValue(null),
    };
    const blocks = { getHiddenUserIds: jest.fn().mockResolvedValue([]) };
    return new WishlistService(
      prisma as never,
      {} as never,
      {} as never,
      discount as never,
      undefined as never,
      blocks as never,
    );
  };

  it("returns the available stock as quantity minus reserved", async () => {
    const service = build([
      row({ id: "p1", quantity: 5, reservedQuantity: 2 }),
    ]);
    const result = await service.getWishlist("u1");
    expect(result.items[0].availableQuantity).toBe(3);
  });

  it("returns 0 when every unit is reserved", async () => {
    const service = build([
      row({ id: "p1", quantity: 2, reservedQuantity: 2 }),
    ]);
    const result = await service.getWishlist("u1");
    expect(result.items[0].availableQuantity).toBe(0);
  });

  it("omits it for unlimited stock", async () => {
    const service = build([row({ id: "p1", quantity: null })]);
    const result = await service.getWishlist("u1");
    expect(result.items[0].availableQuantity).toBeUndefined();
    expect(result.items[0].sellerId).toBe("s1");
  });

  it("returns the listing's per-order cap", async () => {
    const service = build([
      row({ id: "p1", quantity: 10, maxQuantityPerOrder: 2 }),
    ]);
    const result = await service.getWishlist("u1");
    expect(result.items[0].maxQuantityPerOrder).toBe(2);
    expect(result.items[0].availableQuantity).toBe(10);
  });

  it("reads the per-order cap and the stock inputs from the product", async () => {
    const service = build([]);
    await service.getWishlist("u1");
    const { select } = findMany.mock.calls[0][0];
    expect(select.product.select).toMatchObject({
      maxQuantityPerOrder: true,
      quantity: true,
      reservedQuantity: true,
      sellerId: true,
      status: true,
    });
  });

  it("omits the per-order cap when the listing has none or a non-positive one", async () => {
    const service = build([
      row({ id: "p1", maxQuantityPerOrder: null }),
      row({ id: "p2", maxQuantityPerOrder: undefined }),
      row({ id: "p3", maxQuantityPerOrder: 0 }),
      row({ id: "p4", maxQuantityPerOrder: -1 }),
    ]);
    const result = await service.getWishlist("u1");
    expect(result.items).toHaveLength(4);
    for (const item of result.items) {
      expect(item.maxQuantityPerOrder).toBeUndefined();
      expect(JSON.parse(JSON.stringify(item))).not.toHaveProperty(
        "maxQuantityPerOrder",
      );
    }
  });
});
