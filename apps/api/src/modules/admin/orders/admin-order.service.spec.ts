import { Prisma } from "@prisma/client";
import { AdminOrderService } from "./admin-order.service";
import {
  orderLineScopeWhere,
  orderListSourceWheres,
} from "./helpers/order-list-where";

const D = (n: number) => new Prisma.Decimal(n);
const T0 = new Date("2026-09-10T10:00:00.000Z");
const T1 = new Date("2026-09-11T10:00:00.000Z");

const party = (id: string) => ({
  id,
  displayName: `name-${id}`,
  email: `${id}@x.com`,
  adminCode: `K-${id}`,
});

function lineRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "o1",
    orderNumber: "ORD-1",
    origin: "direct_sale",
    status: "paid",
    cancellationType: null,
    cancelledBy: null,
    quantity: 1,
    unitPrice: D(100),
    subtotal: D(100),
    totalAmount: D(120),
    preparingDeadline: null,
    deliveredAt: null,
    createdAt: T0,
    checkoutGroupId: "g1",
    packageId: "p1",
    shippingAddress: null,
    financialSnapshot: null,
    sellerCommissionAmount: D(10),
    buyerCommissionAmount: D(0),
    sellerPlatformFeeAmount: D(2),
    buyerServiceFeeAmount: D(0),
    buyer: party("b1"),
    seller: party("s1"),
    product: {
      id: "pr1",
      title: "Car",
      productCode: "U1",
      modelCode: "MC1",
      price: D(150),
      brand: null,
      images: [],
    },
    package: { packageNumber: "PKG-1" },
    shipment: null,
    offer: null,
    refundRequests: [],
    ...overrides,
  };
}

function makePrisma() {
  return {
    checkoutGroup: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    order: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    offer: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    elogoInvoice: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((queries: unknown[]) =>
      Promise.all(queries as Promise<number>[]),
    ),
  };
}

function makeService(prisma = makePrisma()) {
  const service = new AdminOrderService(
    prisma as never,
    {} as never,
    undefined as never,
  );
  return { service, prisma };
}

describe("AdminOrderService.getOrders — cart tabs", () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(T1));
  afterEach(() => jest.useRealTimers());

  it("queries both cart sources with the shared bucket where and page*limit candidates", async () => {
    const { service, prisma } = makeService();

    await service.getOrders({
      tab: "direct_sale",
      bucket: "in_transit",
      party: "ali",
      page: 2,
      limit: 5,
    });

    const sources = orderListSourceWheres("direct_sale", "in_transit", {
      party: "ali",
    });
    expect(prisma.checkoutGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: sources.group,
        take: 10,
        orderBy: [{ createdAt: "desc" }, { createdAt: "desc" }, { id: "asc" }],
      }),
    );
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: sources.loose, take: 10 }),
    );
    expect(prisma.checkoutGroup.count).toHaveBeenCalledWith({
      where: sources.group,
    });
    expect(prisma.order.count).toHaveBeenCalledWith({ where: sources.loose });
  });

  it("merges groups and groupless orders into one page of cart rows", async () => {
    const prisma = makePrisma();
    prisma.checkoutGroup.count.mockResolvedValue(1);
    prisma.order.count.mockResolvedValue(1);
    prisma.checkoutGroup.findMany.mockResolvedValue([
      {
        id: "g1",
        groupNumber: "GRP-1",
        totalAmount: D(240),
        createdAt: T0,
        buyer: { displayName: "B" },
      },
    ]);
    prisma.order.findMany
      // candidate heads of the groupless source
      .mockResolvedValueOnce([
        {
          id: "o9",
          orderNumber: "ORD-9",
          totalAmount: D(50),
          createdAt: T1,
          buyer: { displayName: "B" },
        },
      ])
      // full lines of the selected carts
      .mockResolvedValueOnce([
        lineRow(),
        lineRow({ id: "o2", orderNumber: "ORD-2", packageId: "p2" }),
        lineRow({
          id: "o9",
          orderNumber: "ORD-9",
          origin: "offer",
          checkoutGroupId: null,
          packageId: "p9",
          createdAt: T1,
        }),
      ]);
    const { service } = makeService(prisma);

    const result = await service.getOrders({ tab: "all", bucket: "new" });

    // newest first: the groupless offer order (T1) before the group (T0)
    expect(result.data.map((row) => [row.kind, row.number])).toEqual([
      ["order", "ORD-9"],
      ["group", "GRP-1"],
    ]);
    expect(result.data[1].packages.map((p) => p.packageNumber)).toHaveLength(2);
    expect(result.meta).toEqual({
      total: 2,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
  });

  it("breaks equal sort values the same way in both sources and in memory", async () => {
    const prisma = makePrisma();
    prisma.checkoutGroup.findMany.mockResolvedValue([
      {
        id: "g1",
        groupNumber: "GRP-1",
        totalAmount: D(100),
        createdAt: T0,
        buyer: { displayName: "B" },
      },
    ]);
    prisma.order.findMany
      .mockResolvedValueOnce([
        {
          id: "o9",
          orderNumber: "ORD-9",
          totalAmount: D(100),
          createdAt: T1,
          buyer: { displayName: "B" },
        },
      ])
      .mockResolvedValueOnce([
        lineRow(),
        lineRow({ id: "o9", checkoutGroupId: null, createdAt: T1 }),
      ]);
    const { service } = makeService(prisma);

    const result = await service.getOrders({
      sortBy: "totalAmount",
      sortOrder: "asc",
    });

    expect(prisma.checkoutGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ totalAmount: "asc" }, { createdAt: "desc" }, { id: "asc" }],
      }),
    );
    // equal amounts → createdAt DESC: the newer groupless order first
    expect(result.data.map((row) => row.id)).toEqual(["o9", "g1"]);
  });

  it("loads group lines within the deep-link scope only", async () => {
    const prisma = makePrisma();
    prisma.checkoutGroup.findMany.mockResolvedValue([
      {
        id: "g1",
        groupNumber: "GRP-1",
        totalAmount: D(100),
        createdAt: T0,
        buyer: { displayName: "B" },
      },
    ]);
    prisma.order.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([lineRow()]);
    const { service } = makeService(prisma);

    await service.getOrders({ userId: "s1", userRole: "seller" });

    expect(prisma.order.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            {
              AND: [
                { checkoutGroupId: { in: ["g1"] } },
                orderLineScopeWhere({ userId: "s1", userRole: "seller" }),
              ],
            },
          ],
        },
      }),
    );
  });

  it("reads every invoice of the page in ONE query, by package and legacy order id", async () => {
    const prisma = makePrisma();
    prisma.checkoutGroup.findMany.mockResolvedValue([
      {
        id: "g1",
        groupNumber: "GRP-1",
        totalAmount: D(100),
        createdAt: T0,
        buyer: { displayName: "B" },
      },
    ]);
    prisma.order.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        lineRow(),
        lineRow({ id: "o2", packageId: "p1" }),
        lineRow({ id: "o3", packageId: "p2" }),
      ]);
    prisma.elogoInvoice.findMany.mockResolvedValue([
      {
        id: "i1",
        type: "seller_commission",
        status: "sent",
        sourceId: "p2",
        invoiceNumber: "TRD1",
        ettn: "E",
        pdfUrl: null,
      },
    ]);
    const { service } = makeService(prisma);

    const result = await service.getOrders({});

    expect(prisma.elogoInvoice.findMany).toHaveBeenCalledTimes(1);
    const where = prisma.elogoInvoice.findMany.mock.calls[0][0].where;
    expect([...where.sourceId.in].sort()).toEqual(
      ["o1", "o2", "o3", "p1", "p2"].sort(),
    );
    expect(where.type.in).not.toContain("return_invoice");
    const pkg2 = result.data[0].packages.find((p) => p.key === "p2");
    expect(pkg2?.invoices.map((i) => i.id)).toEqual(["i1"]);
  });

  it("skips the line and invoice reads for an empty page", async () => {
    const { service, prisma } = makeService();
    const result = await service.getOrders({ tab: "all", bucket: "other" });
    expect(result.data).toEqual([]);
    expect(prisma.order.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.elogoInvoice.findMany).not.toHaveBeenCalled();
  });
});

describe("AdminOrderService.getOrders — offers turned into orders", () => {
  it("pages only groupless offer orders — no group source, never the Offer table", async () => {
    const prisma = makePrisma();
    prisma.order.count.mockResolvedValue(1);
    prisma.order.findMany
      .mockResolvedValueOnce([
        {
          id: "o9",
          orderNumber: "ORD-9",
          totalAmount: D(900),
          createdAt: T1,
          buyer: { displayName: "B" },
        },
      ])
      .mockResolvedValueOnce([
        lineRow({
          id: "o9",
          orderNumber: "ORD-9",
          origin: "offer",
          checkoutGroupId: null,
          packageId: "p9",
          package: { packageNumber: "PKG-9" },
        }),
      ]);
    const { service } = makeService(prisma);

    const result = await service.getOrders({
      tab: "offer_order",
      bucket: "new",
    });

    const { loose, group } = orderListSourceWheres("offer_order", "new", {});
    expect(group).toBeUndefined();
    expect(prisma.order.count).toHaveBeenCalledWith({ where: loose });
    expect(prisma.checkoutGroup.count).not.toHaveBeenCalled();
    expect(prisma.checkoutGroup.findMany).not.toHaveBeenCalled();
    expect(prisma.offer.findMany).not.toHaveBeenCalled();
    expect(result.data.map((row) => [row.kind, row.number])).toEqual([
      ["order", "ORD-9"],
    ]);
    expect(result.meta.total).toBe(1);
  });

  it("the legacy origin=offer parameter selects the offer-order tab", async () => {
    const { service, prisma } = makeService();
    await service.getOrders({ origin: "offer" });
    expect(prisma.order.count).toHaveBeenCalledWith({
      where: orderListSourceWheres("offer_order", "all", {}).loose,
    });
    expect(prisma.checkoutGroup.findMany).not.toHaveBeenCalled();
    expect(prisma.offer.findMany).not.toHaveBeenCalled();
  });
});

describe("AdminOrderService.getOrderCounts", () => {
  it("counts every tab's buckets in a single transaction with the filters applied", async () => {
    const prisma = makePrisma();
    prisma.checkoutGroup.count.mockResolvedValue(2);
    prisma.order.count.mockResolvedValue(1);
    const { service } = makeService(prisma);

    const counts = await service.getOrderCounts({ party: "ali" });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // group source is identical for "all" and "direct_sale" → counted once;
    // the offer-order tab has no group source
    expect(prisma.checkoutGroup.count).toHaveBeenCalledTimes(6);
    // the groupless source differs per tab (its origins) → 3 tabs × 6 buckets
    expect(prisma.order.count).toHaveBeenCalledTimes(18);
    expect(prisma.offer.count).not.toHaveBeenCalled();
    // the same where-builder as the list, filters included
    expect(prisma.order.count).toHaveBeenCalledWith({
      where: orderListSourceWheres("offer_order", "new", { party: "ali" })
        .loose,
    });
    expect(prisma.checkoutGroup.count).toHaveBeenCalledWith({
      where: orderListSourceWheres("all", "other", { party: "ali" }).group,
    });
    // "Tümü" counts the tab with the list's own unbucketed where
    expect(prisma.order.count).toHaveBeenCalledWith({
      where: orderListSourceWheres("direct_sale", undefined, { party: "ali" })
        .loose,
    });

    const cartBuckets = (n: number) => ({
      total: n,
      buckets: {
        all: n,
        new: n,
        shipped: n,
        in_transit: n,
        delivered: n,
        other: n,
      },
    });
    // the total is the all bucket's count, not a sum over the buckets
    expect(counts.all).toEqual(cartBuckets(3));
    expect(counts.direct_sale).toEqual(cartBuckets(3));
    expect(counts.offer_order).toEqual(cartBuckets(1));
    expect(Object.keys(counts).sort()).toEqual(
      ["all", "direct_sale", "offer_order"].sort(),
    );
  });
});
