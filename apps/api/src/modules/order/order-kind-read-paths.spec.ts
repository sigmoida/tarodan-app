import { findUniqueShaping } from "../../prisma/prisma-row-shape.testing";
import { OrderCommonService } from "./order-common.service";
import { OrderQueryService } from "./order-query.service";

/**
 * `kind` is derived from the order's `productId`. A read path whose Prisma
 * query narrowed the order with a top-level `select` that leaves `productId`
 * out would silently report a boost or membership order as `listing` (and
 * `isMembership: false`), so live clients would show shipping, refund and
 * rating UI for it again. The fake Prisma below honours `select` the way
 * Prisma does (only the selected columns come back), so these tests fail if
 * a read path stops fetching `productId`.
 *
 * The group views also carry a top-level `kind` (`group`, `package`,
 * `synthetic`); the order `kind` lives on each nested order and must not
 * replace it.
 */
describe("order kind on the read paths", () => {
  const buyer = {
    id: "buyer-1",
    username: "alici",
    avatarUrl: null,
    isVerified: false,
  };
  const platformSeller = {
    id: "platform-1",
    username: "tarodan",
    avatarUrl: null,
    isVerified: true,
  };
  const listingSeller = {
    id: "seller-1",
    username: "satici",
    avatarUrl: null,
    isVerified: true,
  };

  const boostOrder = {
    id: "o-boost",
    orderNumber: "BST-DBN4NPYYTZ",
    buyerId: "buyer-1",
    sellerId: "platform-1",
    productId: "boost-boost-1",
    origin: "platform_service",
    checkoutGroupId: null,
    packageId: null,
    package: null,
    status: "paid",
    totalAmount: 49.9,
    shippingCost: 0,
    createdAt: new Date("2026-10-20T10:00:00Z"),
    shippingAddress: { type: "boost", boostId: "boost-1" },
    product: { id: "boost-boost-1", images: [] },
    buyer,
    seller: platformSeller,
    shipment: null,
    payment: null,
    refundRequests: [],
  };

  const listingOrder = (id: string, packageId: string) => ({
    id,
    orderNumber: `ORD-${id}`,
    buyerId: "buyer-1",
    sellerId: "seller-1",
    productId: `p-${id}`,
    origin: "direct_sale",
    checkoutGroupId: "grp-1",
    packageId,
    status: "paid",
    totalAmount: 100,
    shippingCost: 0,
    createdAt: new Date("2026-10-20T10:00:00Z"),
    shippingAddress: { fullName: "Alici", city: "Istanbul" },
    product: { id: `p-${id}`, images: [] },
    buyer,
    seller: listingSeller,
    shipment: null,
    refundRequests: [],
  });

  const makeService = (
    orderRow: object | null,
    group: object | null = null,
  ) => {
    const prisma = {
      order: { findUnique: findUniqueShaping(orderRow) },
      checkoutGroup: {
        findUnique: jest.fn().mockResolvedValue(group),
      },
      paymentHold: { findMany: jest.fn().mockResolvedValue([]) },
      productRating: { findFirst: jest.fn().mockResolvedValue(null) },
      rating: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const common = new OrderCommonService(
      prisma as never,
      { del: jest.fn(), delPattern: jest.fn() } as never,
      { getPublicAssetUrl: (key: string) => `https://cdn/${key}` } as never,
    );
    return new OrderQueryService(prisma as never, common);
  };

  it("GET /orders/:id reports a boost order as `boost` to its buyer", async () => {
    const order = await makeService(boostOrder).findOne("o-boost", "buyer-1");

    expect(order.kind).toBe("boost");
    expect(order.isMembership).toBe(true);
  });

  it("GET /orders/:id/group keeps the synthetic group kind and gives the nested boost order its own kind", async () => {
    const view = await makeService(boostOrder).findGroupViewByOrder(
      "o-boost",
      "buyer-1",
    );

    expect(view.kind).toBe("synthetic");
    expect(view.orders.map((o) => [o.kind, o.isMembership])).toEqual([
      ["boost", true],
    ]);
    expect(view.packages.flatMap((p) => p.orders.map((o) => o.kind))).toEqual([
      "boost",
    ]);
  });

  it("GET /orders/groups/:id keeps the group kind and marks every listing order `listing`", async () => {
    const group = {
      id: "grp-1",
      groupNumber: "GRP-100",
      buyerId: "buyer-1",
      totalAmount: 200,
      createdAt: new Date("2026-10-20T10:00:00Z"),
      payment: null,
      packages: [{ id: "pkg-1", sellerId: "seller-1", shippingCost: 0 }],
      orders: [listingOrder("o1", "pkg-1"), listingOrder("o2", "pkg-1")],
    };

    const view = await makeService(null, group).findCheckoutGroup(
      "grp-1",
      "buyer-1",
    );

    expect(view.kind).toBe("group");
    expect(view.orders.map((o) => [o.kind, o.isMembership])).toEqual([
      ["listing", false],
      ["listing", false],
    ]);
    expect(view.packages.flatMap((p) => p.orders.map((o) => o.kind))).toEqual([
      "listing",
      "listing",
    ]);
  });

  it("the seller slice of a checkout group carries the same order kind", async () => {
    const group = {
      id: "grp-1",
      groupNumber: "GRP-100",
      buyerId: "buyer-1",
      totalAmount: 100,
      createdAt: new Date("2026-10-20T10:00:00Z"),
      payment: null,
      packages: [{ id: "pkg-1", sellerId: "seller-1", shippingCost: 0 }],
      orders: [listingOrder("o1", "pkg-1")],
    };

    const view = await makeService(null, group).findCheckoutGroup(
      "grp-1",
      "seller-1",
    );

    expect(view.viewerRole).toBe("seller");
    expect(view.orders.map((o) => o.kind)).toEqual(["listing"]);
  });
});
