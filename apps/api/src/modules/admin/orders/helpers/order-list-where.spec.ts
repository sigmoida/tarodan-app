import {
  cartBucketWhere,
  groupLines,
  offerBucketWhere,
  singleLine,
} from "./order-bucket-where";
import {
  offerFilterWhere,
  orderLineFilterWhere,
  orderLineScopeWhere,
  orderListScopeOf,
  orderListSourceWheres,
} from "./order-list-where";

const NOW = new Date("2026-09-17T12:00:00.000Z");
const contains = (term: string) => ({ contains: term, mode: "insensitive" });

describe("orderLineFilterWhere", () => {
  it("is empty without filters so an unfiltered list stays unfiltered", () => {
    expect(orderLineFilterWhere({})).toEqual({});
  });

  it("party matches buyer or seller by name, e-mail or user code", () => {
    expect(orderLineFilterWhere({ party: " K010001 " })).toEqual({
      AND: [
        {
          OR: [
            { buyer: { displayName: contains("K010001") } },
            { buyer: { email: contains("K010001") } },
            { buyer: { adminCode: contains("K010001") } },
            { seller: { displayName: contains("K010001") } },
            { seller: { email: contains("K010001") } },
            { seller: { adminCode: contains("K010001") } },
          ],
        },
      ],
    });
  });

  it("each code filter targets only its own column", () => {
    expect(
      orderLineFilterWhere({
        orderNumber: "ORD-1",
        packageNumber: "PKG-1",
        groupNumber: "GRP-1",
        productQuery: "MC-9",
      }),
    ).toEqual({
      AND: [
        { OR: [{ orderNumber: contains("ORD-1") }] },
        { OR: [{ package: { packageNumber: contains("PKG-1") } }] },
        { OR: [{ checkoutGroup: { groupNumber: contains("GRP-1") } }] },
        {
          OR: [
            { product: { title: contains("MC-9") } },
            { product: { modelCode: contains("MC-9") } },
            { product: { productCode: contains("MC-9") } },
          ],
        },
      ],
    });
  });

  it("the date range is inclusive of the end day", () => {
    const where = orderLineFilterWhere({
      startDate: "2026-09-01",
      endDate: "2026-09-02",
    }) as { AND: Array<{ createdAt: { gte: Date; lte: Date } }> };
    expect(where.AND[0].createdAt.gte).toEqual(new Date("2026-09-01"));
    expect(where.AND[0].createdAt.lte.getHours()).toBe(23);
  });

  it("the deep-link user filter narrows by role", () => {
    expect(orderLineScopeWhere({ userId: "u1", userRole: "seller" })).toEqual({
      AND: [{ sellerId: "u1" }],
    });
    expect(orderLineScopeWhere({ userId: "u1" })).toEqual({
      AND: [{ OR: [{ buyerId: "u1" }, { sellerId: "u1" }] }],
    });
    expect(orderLineScopeWhere({ productId: "p1" })).toEqual({
      AND: [{ productId: "p1" }],
    });
  });

  it("free search spans every code, party and product column", () => {
    const where = orderLineFilterWhere({ search: "abc" }) as {
      AND: Array<{ OR: unknown[] }>;
    };
    expect(where.AND[0].OR).toEqual(
      expect.arrayContaining([
        { orderNumber: contains("abc") },
        { package: { packageNumber: contains("abc") } },
        { checkoutGroup: { groupNumber: contains("abc") } },
        { buyer: { adminCode: contains("abc") } },
        { product: { modelCode: contains("abc") } },
      ]),
    );
  });
});

describe("offerFilterWhere", () => {
  it("reads order codes through the offer's order", () => {
    expect(
      offerFilterWhere({ orderNumber: "ORD-1", packageNumber: "PKG-1" }),
    ).toEqual({
      AND: [
        { OR: [{ order: { orderNumber: contains("ORD-1") } }] },
        {
          OR: [{ order: { package: { packageNumber: contains("PKG-1") } } }],
        },
      ],
    });
  });

  it("a group-number filter matches no offer (offers never have a group)", () => {
    expect(offerFilterWhere({ groupNumber: "GRP-1" })).toEqual({
      AND: [{ id: { in: [] } }],
    });
  });

  it("uses the same party columns as orders", () => {
    expect(offerFilterWhere({ party: "ali", userId: "u1" })).toEqual(
      expect.objectContaining({
        AND: expect.arrayContaining([
          expect.objectContaining({
            OR: expect.arrayContaining([
              { seller: { adminCode: contains("ali") } },
            ]),
          }),
          { OR: [{ buyerId: "u1" }, { sellerId: "u1" }] },
        ]),
      }),
    );
  });
});

describe("orderListSourceWheres", () => {
  const LOOSE = {
    checkoutGroupId: null,
    product: { kind: "listing" },
  };

  it("all tab = every checkout group + groupless direct/offer orders", () => {
    expect(orderListSourceWheres("all", undefined, {}, NOW)).toEqual({
      group: { AND: [] },
      loose: {
        AND: [{ ...LOOSE, origin: { in: ["direct_sale", "offer"] } }],
      },
    });
  });

  it("direct sale tab keeps legacy groupless direct orders reachable", () => {
    expect(orderListSourceWheres("direct_sale", "delivered", {}, NOW)).toEqual({
      group: { AND: [cartBucketWhere("delivered", groupLines)] },
      loose: {
        AND: [
          { ...LOOSE, origin: { in: ["direct_sale"] } },
          cartBucketWhere("delivered", singleLine),
        ],
      },
    });
  });

  it("a group matches the filters through one of its lines", () => {
    const filters = { orderNumber: "ORD-1" };
    expect(orderListSourceWheres("all", "new", filters, NOW).group).toEqual({
      AND: [
        { orders: { some: orderLineFilterWhere(filters) } },
        cartBucketWhere("new", groupLines),
      ],
    });
  });

  it("offer tab lists offers only", () => {
    const filters = { party: "ali" };
    expect(orderListSourceWheres("offer", "pending", filters, NOW)).toEqual({
      offer: {
        AND: [offerFilterWhere(filters), offerBucketWhere("pending", NOW)],
      },
    });
  });
});

describe("legacy status filter", () => {
  it("narrows orders by their status and offers through their order", () => {
    expect(orderLineFilterWhere({ status: "delivered" })).toEqual({
      AND: [{ status: "delivered" }],
    });
    expect(offerFilterWhere({ status: "delivered" })).toEqual({
      AND: [{ order: { is: { status: "delivered" } } }],
    });
  });
});

describe("orderListScopeOf", () => {
  it("defaults to the all tab without a bucket", () => {
    expect(orderListScopeOf({})).toEqual(
      expect.objectContaining({ tab: "all", bucket: undefined }),
    );
  });

  it("maps the legacy origin and date parameters", () => {
    const scope = orderListScopeOf({
      origin: "offer",
      fromDate: "2026-09-01",
      toDate: "2026-09-02",
    });
    expect(scope.tab).toBe("offer");
    expect(scope.filters).toEqual(
      expect.objectContaining({
        startDate: "2026-09-01",
        endDate: "2026-09-02",
      }),
    );
  });

  it("an explicit tab wins over origin", () => {
    expect(orderListScopeOf({ tab: "all", origin: "offer" }).tab).toBe("all");
  });

  it("a bucket the tab does not have falls back to the tab's first bucket", () => {
    expect(orderListScopeOf({ tab: "direct_sale", bucket: "pending" })).toEqual(
      expect.objectContaining({ tab: "direct_sale", bucket: "new" }),
    );
    expect(orderListScopeOf({ tab: "offer", bucket: "expired" }).bucket).toBe(
      "expired",
    );
  });
});
