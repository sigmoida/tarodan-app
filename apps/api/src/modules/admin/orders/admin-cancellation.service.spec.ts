import { Prisma } from "@prisma/client";
import {
  ADMIN_CANCELLATION_BUCKETS,
  ADMIN_CANCELLATION_TABS,
} from "@tarodan/types";
import {
  AdminCancellationService,
  groupsWithLines,
  looseLines,
} from "./admin-cancellation.service";
import { cancellationSourceWheres } from "./helpers/cancellation-where";

const D = (n: number) => new Prisma.Decimal(n);
const party = (id: string) => ({
  id,
  displayName: `name-${id}`,
  email: `${id}@x.com`,
  adminCode: `K-${id}`,
});
const product = (id: string) => ({
  id,
  title: `title-${id}`,
  productCode: null,
  modelCode: null,
  price: D(100),
  brand: null,
  images: [],
});

function line(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    orderNumber: `ORD-${id}`,
    origin: "direct_sale",
    status: "cancelled",
    cancellationType: "iptal",
    cancelledBy: "buyer",
    cancelledAt: new Date("2026-09-21T10:00:00.000Z"),
    cancelReason: null,
    cancellationReasonCode: null,
    quantity: 1,
    unitPrice: D(100),
    subtotal: D(100),
    totalAmount: D(100),
    preparingDeadline: null,
    deliveredAt: null,
    createdAt: new Date("2026-09-20T10:00:00.000Z"),
    checkoutGroupId: "g1",
    packageId: "p1",
    shippingAddress: null,
    financialSnapshot: null,
    sellerCommissionAmount: D(0),
    buyerCommissionAmount: D(0),
    sellerPlatformFeeAmount: D(0),
    buyerServiceFeeAmount: D(0),
    buyer: party("b1"),
    seller: party("s1"),
    product: product(`pr-${id}`),
    package: { packageNumber: "PKG-1" },
    shipment: null,
    offer: null,
    refundRequests: [],
    payment: null,
    checkoutGroup: null,
    refundAttempts: [],
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
      groupBy: jest.fn().mockResolvedValue([]),
    },
    trade: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn((queries: Promise<number>[]) => Promise.all(queries)),
  };
}

describe("AdminCancellationService.list", () => {
  it("merges carts (GRP), groupless orders (ORD) and trades by cancellation time", async () => {
    const prisma = makePrisma();
    // Damgalı sepet kaynağı (groupBy _max) + sepet boyu (groupBy _count).
    prisma.order.groupBy.mockImplementation((args: { _max?: unknown }) =>
      Promise.resolve(
        args._max
          ? [
              {
                checkoutGroupId: "g1",
                _max: { cancelledAt: new Date("2026-09-21T10:00:00.000Z") },
              },
            ]
          : [{ checkoutGroupId: "g1", _count: { _all: 3 } }],
      ),
    );
    prisma.checkoutGroup.count.mockResolvedValue(1);
    prisma.order.count.mockResolvedValue(1);
    prisma.trade.count.mockResolvedValue(1);
    prisma.order.findMany.mockImplementation(
      (args: { select: Record<string, unknown> }) =>
        Promise.resolve(
          // Başlık sorgusu yalnız id + cancelledAt seçer; kalem sorgusu tam seçer.
          Object.keys(args.select).length === 2
            ? [{ id: "o9", cancelledAt: new Date("2026-09-22T08:00:00.000Z") }]
            : [
                line("o1"),
                line("o2"),
                line("o9", {
                  checkoutGroupId: null,
                  origin: "offer",
                  cancelledAt: new Date("2026-09-22T08:00:00.000Z"),
                }),
              ],
        ),
    );
    prisma.checkoutGroup.findMany.mockImplementation(
      (args: { select: Record<string, unknown> }) =>
        Promise.resolve(
          "groupNumber" in args.select
            ? [
                {
                  id: "g1",
                  groupNumber: "GRP-1",
                  createdAt: new Date("2026-09-20T09:00:00.000Z"),
                },
              ]
            : [],
        ),
    );
    prisma.trade.findMany.mockImplementation(
      (args: { select: Record<string, unknown> }) =>
        Promise.resolve(
          Object.keys(args.select).length === 2
            ? [{ id: "t1", cancelledAt: new Date("2026-09-15T08:00:00.000Z") }]
            : [
                {
                  id: "t1",
                  tradeNumber: "TKS-1",
                  status: "rejected",
                  createdAt: new Date("2026-09-14T08:00:00.000Z"),
                  cancelledAt: new Date("2026-09-15T08:00:00.000Z"),
                  cancelledBy: "seller",
                  cancelReason: null,
                  refundFailureAt: null,
                  initiator: party("u1"),
                  receiver: party("u2"),
                  items: [],
                  cashPayments: [],
                },
              ],
        ),
    );

    const service = new AdminCancellationService(prisma as any);
    const result = await service.list({ tab: "all", bucket: "all" });

    expect(result.data.map((row) => [row.kind, row.number])).toEqual([
      ["order", "ORD-o9"],
      ["group", "GRP-1"],
      ["trade", "TKS-1"],
    ]);
    // Liste toplamı: damgalı sepet + grupsuz sipariş + eski sepet + takas.
    expect(result.meta.total).toBe(4);
    const group = result.data[1];
    expect(group.lineCounts).toEqual({ cancelled: 2, total: 3 });
    expect(
      group.packages.flatMap((pkg) => pkg.lines.map((l) => l.orderId)),
    ).toEqual(["o1", "o2"]);
  });

  it("loads a cart's lines through the SAME line where-builder (only cancelled lines)", async () => {
    const prisma = makePrisma();
    prisma.order.groupBy.mockImplementation((args: { _max?: unknown }) =>
      Promise.resolve(
        args._max
          ? [{ checkoutGroupId: "g1", _max: { cancelledAt: new Date() } }]
          : [],
      ),
    );
    const service = new AdminCancellationService(prisma as any);
    await service.list({ tab: "direct_sale", bucket: "buyer" });

    const lineQuery = prisma.order.findMany.mock.calls
      .map(([args]: [{ where: any; select: object }]) => args)
      .find((args) => Object.keys(args.select).length > 2);
    const { order } = cancellationSourceWheres(
      "direct_sale",
      "buyer",
      {},
      new Date(),
    );
    const groupBranch = lineQuery.where.OR[0].AND;
    expect(groupBranch[0]).toEqual({ checkoutGroupId: { in: ["g1"] } });
    // `new` alt sekmesi dışında `now`'a bağlı değildir: birebir eşit.
    expect(groupBranch[1]).toEqual(order);
  });

  it("sorts unstamped rows last in BOTH directions", async () => {
    const prisma = makePrisma();
    const service = new AdminCancellationService(prisma as any);
    await service.list({ tab: "trade", sortOrder: "asc" });
    expect(prisma.trade.findMany.mock.calls[0][0].orderBy[0]).toEqual({
      cancelledAt: { sort: "asc", nulls: "last" },
    });
  });
});

describe("AdminCancellationService.counts", () => {
  it("counts every tab × sub-tab from the list's where-builder", async () => {
    const prisma = makePrisma();
    prisma.checkoutGroup.count.mockResolvedValue(2);
    prisma.order.count.mockResolvedValue(3);
    prisma.trade.count.mockResolvedValue(5);
    const service = new AdminCancellationService(prisma as any);

    const counts = await service.counts({});

    for (const tab of ADMIN_CANCELLATION_TABS) {
      for (const bucket of ADMIN_CANCELLATION_BUCKETS) {
        const expected =
          (tab === "trade" ? 0 : 2 + 3) +
          (tab === "all" || tab === "trade" ? 5 : 0);
        expect(counts[tab].buckets[bucket]).toBe(expected);
      }
      expect(counts[tab].total).toBe(counts[tab].buckets.all);
    }

    const groupWheres = prisma.checkoutGroup.count.mock.calls.map(
      ([args]: [{ where: unknown }]) => JSON.stringify(args.where),
    );
    const looseWheres = prisma.order.count.mock.calls.map(
      ([args]: [{ where: unknown }]) => JSON.stringify(args.where),
    );
    const { order } = cancellationSourceWheres(
      "offer",
      "seller",
      {},
      new Date(),
    );
    expect(groupWheres).toContain(JSON.stringify(groupsWithLines(order!)));
    expect(looseWheres).toContain(JSON.stringify(looseLines(order!)));
  });
});
