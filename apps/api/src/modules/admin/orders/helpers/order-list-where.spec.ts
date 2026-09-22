import { ADMIN_ORDER_TABS } from "@tarodan/types";
import { cartBucketWhere, groupLines, singleLine } from "./order-bucket-where";
import {
  orderLineFilterWhere,
  orderLineScopeWhere,
  orderListScopeOf,
  orderListSourceWheres,
} from "./order-list-where";

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

describe("orderListSourceWheres", () => {
  const LOOSE = {
    checkoutGroupId: null,
    product: { kind: "listing" },
  };

  it("all tab = every checkout group + groupless direct/offer orders", () => {
    expect(orderListSourceWheres("all", undefined, {})).toEqual({
      group: { AND: [] },
      loose: {
        AND: [{ ...LOOSE, origin: { in: ["direct_sale", "offer"] } }],
      },
    });
  });

  it("the all bucket adds no bucket condition — same as no bucket", () => {
    const filters = { userId: "u1" };
    for (const tab of ADMIN_ORDER_TABS) {
      expect(orderListSourceWheres(tab, "all", filters)).toEqual(
        orderListSourceWheres(tab, undefined, filters),
      );
    }
  });

  it("direct sale tab keeps legacy groupless direct orders reachable", () => {
    expect(orderListSourceWheres("direct_sale", "delivered", {})).toEqual({
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
    expect(orderListSourceWheres("all", "new", filters).group).toEqual({
      AND: [
        { orders: { some: orderLineFilterWhere(filters) } },
        cartBucketWhere("new", groupLines),
      ],
    });
  });

  it("offers turned into orders = groupless offer orders only, bucketed like any cart", () => {
    const filters = { party: "ali" };
    expect(orderListSourceWheres("offer_order", "shipped", filters)).toEqual({
      loose: {
        AND: [
          { ...LOOSE, origin: { in: ["offer"] } },
          orderLineFilterWhere(filters),
          cartBucketWhere("shipped", singleLine),
        ],
      },
    });
  });

  it("the all tab's groupless source is the union of the other two tabs' origins", () => {
    const origins = (tab: (typeof ADMIN_ORDER_TABS)[number]) =>
      (
        orderListSourceWheres(tab, undefined, {}).loose
          .AND as unknown as Array<{
          origin?: { in: string[] };
        }>
      )[0].origin?.in;
    expect(origins("all")).toEqual([
      ...(origins("direct_sale") ?? []),
      ...(origins("offer_order") ?? []),
    ]);
  });
});

describe("legacy status filter", () => {
  it("narrows orders by their status", () => {
    expect(orderLineFilterWhere({ status: "delivered" })).toEqual({
      AND: [{ status: "delivered" }],
    });
  });
});

describe("orderListScopeOf", () => {
  it("defaults to the all tab and the all bucket", () => {
    expect(orderListScopeOf({})).toEqual(
      expect.objectContaining({ tab: "all", bucket: "all" }),
    );
    expect(orderListScopeOf({ tab: "offer_order", bucket: "" }).bucket).toBe(
      "all",
    );
  });

  it("keeps an explicit all bucket (deep-link scope)", () => {
    expect(
      orderListScopeOf({ tab: "direct_sale", bucket: "all", userId: "u1" }),
    ).toEqual(expect.objectContaining({ tab: "direct_sale", bucket: "all" }));
  });

  it("maps the legacy origin and date parameters", () => {
    const scope = orderListScopeOf({
      origin: "offer",
      fromDate: "2026-09-01",
      toDate: "2026-09-02",
    });
    expect(scope.tab).toBe("offer_order");
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

  it("the removed offer buckets fall back to all (unfiltered)", () => {
    for (const bucket of ["pending", "expired", "lost"]) {
      expect(orderListScopeOf({ tab: "offer_order", bucket })).toEqual(
        expect.objectContaining({ tab: "offer_order", bucket: "all" }),
      );
    }
  });

  it("the removed offer tab key falls back to all orders", () => {
    expect(orderListScopeOf({ tab: "offer" }).tab).toBe("all");
  });
});
