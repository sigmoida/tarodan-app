import {
  BoostSource,
  BoostStatus,
  PaymentStatus,
  Prisma,
} from "@prisma/client";
import { AdminAdPackageService } from "./admin-ad-package.service";

/**
 * The boost purchases read model (admin list and detail): where a boost came
 * from, who granted or stopped it and why, the refund made and the most a
 * refund may still return, and the order and payment behind it, read in one
 * extra query for the whole page.
 */
describe("AdminAdPackageService purchases", () => {
  const purchaseRow = (over: Record<string, unknown> = {}) => ({
    id: "boost-1",
    status: BoostStatus.active,
    source: BoostSource.purchase,
    price: new Prisma.Decimal(59),
    refundedAmount: null,
    orderId: "order-1",
    endsAt: new Date(Date.now() + 86_400_000),
    showcaseEndsAt: null,
    pausedRemainingSeconds: null,
    durationDays: 7,
    extendedDays: 0,
    showcaseOnHome: false,
    packageName: "Ekonomik",
    grantReason: null,
    cancelledAt: null,
    cancelReason: null,
    grantedBy: null,
    cancelledBy: null,
    baselineViewCount: null,
    baselineLikeCount: null,
    baselineClickCount: null,
    finalViewCount: null,
    finalLikeCount: null,
    finalClickCount: null,
    user: null,
    package: null,
    product: null,
    ...over,
  });

  const make = (rows: Array<Record<string, unknown>>) => {
    const prisma = {
      productBoost: {
        findMany: jest.fn().mockResolvedValue(rows),
        count: jest.fn().mockResolvedValue(rows.length),
        findUnique: jest.fn().mockResolvedValue(rows[0] ?? null),
      },
      order: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "order-1",
            orderNumber: "BST-100",
            payment: {
              id: "pay-1",
              status: PaymentStatus.completed,
              amount: new Prisma.Decimal(59),
              metadata: {},
            },
          },
        ]),
      },
    };
    const service = new AdminAdPackageService(prisma as never, {} as never);
    return { service, prisma };
  };

  it("shows the source, the order, the payment and the refundable amount of a paid boost", async () => {
    const { service } = make([purchaseRow()]);

    const purchase = await service.getPurchase("boost-1");

    expect(purchase).toMatchObject({
      source: "purchase",
      orderId: "order-1",
      orderNumber: "BST-100",
      paymentId: "pay-1",
      refundedAmount: 0,
      refundableAmount: 59,
      grantedBy: null,
      cancelledBy: null,
    });
  });

  it("shows a stopped refund: who, why, how much, and nothing left to refund", async () => {
    const { service } = make([
      purchaseRow({
        status: BoostStatus.cancelled,
        refundedAmount: new Prisma.Decimal("20.50"),
        cancelledAt: new Date("2026-10-21T12:00:00.000Z"),
        cancelReason: "Seller asked for a refund",
        cancelledBy: { id: "staff-1", displayName: "Ops" },
      }),
    ]);

    await expect(service.getPurchase("boost-1")).resolves.toMatchObject({
      refundedAmount: 20.5,
      refundableAmount: 0,
      cancelReason: "Seller asked for a refund",
      cancelledBy: { id: "staff-1", name: "Ops" },
    });
  });

  it("shows a free grant with its granting staff user and no order", async () => {
    const { service } = make([
      purchaseRow({
        source: BoostSource.admin_grant,
        price: new Prisma.Decimal(0),
        orderId: null,
        grantReason: "Compensation for a listing outage",
        grantedBy: { id: "staff-1", displayName: "Ops" },
      }),
    ]);

    await expect(service.getPurchase("boost-1")).resolves.toMatchObject({
      source: "admin_grant",
      grantedBy: { id: "staff-1", name: "Ops" },
      grantReason: "Compensation for a listing outage",
      orderNumber: null,
      paymentId: null,
      refundableAmount: 0,
    });
  });

  it("reads the orders of a whole page in one query", async () => {
    const { service, prisma } = make([
      purchaseRow(),
      purchaseRow({ id: "boost-2" }),
      purchaseRow({ id: "grant-1", orderId: null }),
    ]);

    await service.listPurchases({});

    expect(prisma.order.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["order-1"] } } }),
    );
  });

  it("filters by source, and ignores an unknown source or status", async () => {
    const { service, prisma } = make([]);

    await service.listPurchases({ source: "admin_grant", status: "paused" });
    await service.listPurchases({ source: "gift", status: "nope" });

    expect(prisma.productBoost.findMany.mock.calls[0][0].where).toEqual({
      source: "admin_grant",
      status: "paused",
    });
    expect(prisma.productBoost.findMany.mock.calls[1][0].where).toEqual({});
  });
});
