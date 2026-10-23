import { isDigitalOrder } from "@tarodan/types";
import { OrderCommonService } from "./order-common.service";

/**
 * Every order response says what the order sells (`kind`). Membership and
 * boost purchases are orders on a virtual product sold by the platform
 * account; clients hide shipping, escrow, refund, delivery confirmation and
 * rating for them. The deprecated `isMembership` is true for both so live
 * mobile apps, which read only that flag, gate boost orders too.
 */
describe("formatOrderResponse kind", () => {
  const makeService = () =>
    new OrderCommonService(
      {
        productRating: { findFirst: jest.fn().mockResolvedValue(null) },
        rating: { findFirst: jest.fn().mockResolvedValue(null) },
      } as never,
      { del: jest.fn(), delPattern: jest.fn() } as never,
      { getPublicAssetUrl: (k: string) => `https://cdn/${k}` } as never,
    );

  const baseOrder = {
    id: "order-1",
    status: "completed",
    buyerId: "buyer-1",
    sellerId: "seller-1",
    totalAmount: 100,
    buyer: { id: "buyer-1", username: "alici" },
    seller: { id: "seller-1", username: "satici" },
  };

  const listingOrder = {
    ...baseOrder,
    orderNumber: "ORD-NGGCF4J4V4",
    productId: "3f1c2a7e-0d4b-4c1e-9a55-5d8f0b7c2e11",
    origin: "direct_sale",
    shippingAddress: { fullName: "Alici", city: "Istanbul" },
  };
  const membershipOrder = {
    ...baseOrder,
    orderNumber: "MEM-1781257318265-BENIPST9F",
    productId: "membership-tier-premium",
    origin: "platform_service",
    shippingAddress: { type: "membership", targetTierId: "tier-premium" },
  };
  const boostOrder = {
    ...baseOrder,
    orderNumber: "BST-DBN4NPYYTZ",
    productId: "boost-boost-1",
    origin: "platform_service",
    shippingAddress: { type: "boost", boostId: "boost-1" },
  };

  it("marks a listing order as `listing` and not a membership", async () => {
    const result = await makeService().formatOrderResponse(
      listingOrder,
      "buyer-1",
    );

    expect(result.kind).toBe("listing");
    expect(result.isMembership).toBe(false);
    expect(isDigitalOrder(result)).toBe(false);
  });

  it("marks a membership order as `membership`", async () => {
    const result = await makeService().formatOrderResponse(
      membershipOrder,
      "buyer-1",
    );

    expect(result.kind).toBe("membership");
    expect(result.isMembership).toBe(true);
    expect(isDigitalOrder(result)).toBe(true);
  });

  it("marks a boost order as `boost` and widens `isMembership` to it", async () => {
    const result = await makeService().formatOrderResponse(
      boostOrder,
      "buyer-1",
    );

    expect(result.kind).toBe("boost");
    expect(result.isMembership).toBe(true);
    expect(result.origin).toBe("platform_service");
    expect(isDigitalOrder(result)).toBe(true);
  });

  it("derives the kind from the virtual product, not the order number", async () => {
    // A listing order is never a membership because of a stray marker.
    const result = await makeService().formatOrderResponse(
      {
        ...listingOrder,
        shippingAddress: { type: "membership" },
      },
      "seller-1",
    );

    expect(result.kind).toBe("listing");
    expect(result.isMembership).toBe(false);
  });

  it("gives the seller the same kind as the buyer", async () => {
    const result = await makeService().formatOrderResponse(
      boostOrder,
      "seller-1",
    );

    expect(result.isSeller).toBe(true);
    expect(result.kind).toBe("boost");
    expect(result.isMembership).toBe(true);
  });
});
