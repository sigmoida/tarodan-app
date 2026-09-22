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

    const sources = orderListSourceWheres(
      "direct_sale",
      "in_transit",
      { party: "ali" },
      T1,
    );
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

describe("AdminOrderService.getOrders — offer tab", () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(T1));
  afterEach(() => jest.useRealTimers());

  it("pages offers directly with the offer bucket where", async () => {
    const prisma = makePrisma();
    prisma.offer.count.mockResolvedValue(1);
    prisma.offer.findMany.mockResolvedValue([
      {
        id: "of1",
        status: "pending",
        amount: D(900),
        expiresAt: new Date("2026-09-20T00:00:00.000Z"),
        createdAt: T0,
        buyer: party("b1"),
        seller: party("s1"),
        // listing 1150 − offer 900 → priceDifference 250
        product: { ...lineRow().product, price: D(1150) },
        order: null,
      },
    ]);
    const { service } = makeService(prisma);

    const result = await service.getOrders({
      tab: "offer",
      bucket: "pending",
      page: 1,
      limit: 20,
    });

    const { offer } = orderListSourceWheres("offer", "pending", {}, T1);
    expect(prisma.offer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: offer,
        orderBy: { createdAt: "desc" },
        skip: 0,
        take: 20,
      }),
    );
    expect(prisma.checkoutGroup.findMany).not.toHaveBeenCalled();
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        kind: "offer",
        offer: expect.objectContaining({ priceDifference: 250 }),
      }),
    );
  });

  it("the legacy origin=offer parameter selects the offer tab", async () => {
    const { service, prisma } = makeService();
    await service.getOrders({ origin: "offer" });
    expect(prisma.offer.findMany).toHaveBeenCalled();
    expect(prisma.checkoutGroup.findMany).not.toHaveBeenCalled();
  });
});

describe("AdminOrderService.getOrderCounts", () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(T1));
  afterEach(() => jest.useRealTimers());

  it("counts every tab's buckets in a single transaction with the filters applied", async () => {
    const prisma = makePrisma();
    prisma.checkoutGroup.count.mockResolvedValue(2);
    prisma.order.count.mockResolvedValue(1);
    prisma.offer.count.mockResolvedValue(3);
    const { service } = makeService(prisma);

    const counts = await service.getOrderCounts({ party: "ali" });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // group source is identical for "all" and "direct_sale" → counted once
    expect(prisma.checkoutGroup.count).toHaveBeenCalledTimes(6);
    expect(prisma.order.count).toHaveBeenCalledTimes(12);
    expect(prisma.offer.count).toHaveBeenCalledTimes(8);
    // the same where-builder as the list, filters included
    expect(prisma.offer.count).toHaveBeenCalledWith({
      where: orderListSourceWheres("offer", "new", { party: "ali" }, T1).offer,
    });
    expect(prisma.checkoutGroup.count).toHaveBeenCalledWith({
      where: orderListSourceWheres("all", "other", { party: "ali" }, T1).group,
    });
    // "Tümü" counts the tab with the list's own unbucketed where
    expect(prisma.offer.count).toHaveBeenCalledWith({
      where: orderListSourceWheres("offer", undefined, { party: "ali" }, T1)
        .offer,
    });
    expect(prisma.order.count).toHaveBeenCalledWith({
      where: orderListSourceWheres(
        "direct_sale",
        undefined,
        { party: "ali" },
        T1,
      ).loose,
    });

    // the total is the all bucket's count, not a sum over the buckets
    expect(counts.all).toEqual({
      total: 3,
      buckets: {
        all: 3,
        new: 3,
        shipped: 3,
        in_transit: 3,
        delivered: 3,
        other: 3,
      },
    });
    expect(counts.direct_sale.total).toBe(3);
    expect(counts.offer).toEqual({
      total: 3,
      buckets: {
        all: 3,
        new: 3,
        pending: 3,
        expired: 3,
        shipped: 3,
        in_transit: 3,
        delivered: 3,
        other: 3,
      },
    });
  });
});
