import { BadRequestException, NotFoundException } from "@nestjs/common";
import {
  BoostSource,
  BoostStatus,
  MembershipTierType,
  Prisma,
  ProductStatus,
  SubscriptionStatus,
} from "@prisma/client";
import { BoostAudienceService } from "./boost-audience.service";
import { BoostSellerService } from "./boost-seller.service";

/**
 * "My boosts": the seller sees only their own boosts, current (active,
 * paused) or history (expired, cancelled), never an abandoned checkout, with
 * the listing's real end, the order number and the refund; the reminder
 * switch is the owner's and needs premium to turn on.
 */

const SELLER = "seller-1";
const NOW = Date.now();

const PREMIUM = {
  status: SubscriptionStatus.active,
  // The premium check reads the wall clock: a period end far in the future.
  currentPeriodEnd: new Date("2999-01-01T00:00:00.000Z"),
  tier: { type: MembershipTierType.premium, isActive: true },
  user: { businessStatus: null, companyName: null, taxId: null },
};

const record = (over: Record<string, unknown> = {}) => ({
  id: "b1",
  productId: "prod-1",
  source: BoostSource.purchase,
  packageName: "Vitrin",
  showcaseOnHome: true,
  durationDays: 7,
  extendedDays: 0,
  price: new Prisma.Decimal("59.00"),
  refundedAmount: null,
  status: BoostStatus.active,
  autoRenew: false,
  startsAt: new Date(NOW - 2 * 86_400_000),
  endsAt: new Date(NOW + 5 * 86_400_000),
  pausedRemainingSeconds: null,
  cancelledAt: null,
  orderId: "order-1",
  createdAt: new Date("2026-10-19T10:00:00.000Z"),
  baselineViewCount: 100,
  baselineLikeCount: 2,
  baselineClickCount: 10,
  finalViewCount: null,
  finalLikeCount: null,
  finalClickCount: null,
  product: {
    id: "prod-1",
    title: "Hot Wheels 1:64",
    status: ProductStatus.active,
    viewCount: 160,
    likeCount: 5,
    clickCount: 14,
    boostedUntil: new Date("2026-11-02T10:00:00.000Z"),
    homeShowcaseUntil: new Date("2026-10-28T10:00:00.000Z"),
    images: [{ cardKey: "products/p1/card.webp" }],
  },
  ...over,
});

function setup(
  opts: {
    rows?: Array<ReturnType<typeof record>>;
    total?: number;
    product?: { sellerId: string } | null;
    membership?: typeof PREMIUM | null;
    updated?: number;
  } = {},
) {
  const prisma = {
    productBoost: {
      findMany: jest.fn().mockResolvedValue(opts.rows ?? [record()]),
      count: jest
        .fn()
        .mockResolvedValue(opts.total ?? (opts.rows ?? [1]).length),
      updateMany: jest.fn().mockResolvedValue({ count: opts.updated ?? 1 }),
    },
    order: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: "order-1", orderNumber: "BST-26-ABC123" }]),
    },
    product: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          opts.product === undefined ? { sellerId: SELLER } : opts.product,
        ),
    },
    userMembership: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          opts.membership === undefined ? PREMIUM : opts.membership,
        ),
    },
  };
  const sentry = { setTag: jest.fn(), addBreadcrumb: jest.fn() };
  const service = new BoostSellerService(
    prisma as never,
    new BoostAudienceService(prisma as never),
    sentry as never,
  );
  return { service, prisma, sentry };
}

describe("BoostSellerService.getMyBoosts", () => {
  it.each([
    ["current", ["active", "paused"], 100],
    ["history", ["expired", "cancelled"], 20],
  ] as const)(
    "%s: the caller's %j boosts only, newest first, default page size %i",
    async (state, statuses, limit) => {
      const { service, prisma } = setup();

      await service.getMyBoosts(SELLER, { state });

      expect(prisma.productBoost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: SELLER, status: { in: statuses } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: 0,
          take: limit,
        }),
      );
      expect(prisma.productBoost.count).toHaveBeenCalledWith({
        where: { userId: SELLER, status: { in: statuses } },
      });
    },
  );

  it("never returns an abandoned checkout (pending, failed) in either section", async () => {
    const { service, prisma } = setup();

    await service.getMyBoosts(SELLER, {});
    await service.getMyBoosts(SELLER, { state: "history" });

    const statuses = prisma.productBoost.findMany.mock.calls.flatMap(
      ([args]: [{ where: { status: { in: string[] } } }]) =>
        args.where.status.in,
    );
    expect(statuses).not.toContain("pending");
    expect(statuses).not.toContain("failed");
  });

  it("defaults to current and pages history with page and limit", async () => {
    const { service, prisma } = setup({ total: 45 });

    const result = await service.getMyBoosts(SELLER, {
      state: "history",
      page: 3,
      limit: 10,
    });

    expect(prisma.productBoost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    );
    expect(result.meta).toEqual({
      total: 45,
      page: 3,
      limit: 10,
      totalPages: 5,
    });
  });

  it("returns the row with the order number, source, refund, showcase and the listing's real end", async () => {
    const { service } = setup({
      rows: [
        record({
          status: BoostStatus.cancelled,
          refundedAmount: new Prisma.Decimal("20.50"),
          cancelledAt: new Date("2026-10-20T09:00:00.000Z"),
        }),
      ],
    });

    const { data } = await service.getMyBoosts(SELLER, { state: "history" });

    expect(data[0]).toMatchObject({
      id: "b1",
      orderId: "order-1",
      orderNumber: "BST-26-ABC123",
      source: "purchase",
      price: 59,
      refundedAmount: 20.5,
      cancelledAt: "2026-10-20T09:00:00.000Z",
      showcaseOnHome: true,
      status: "cancelled",
      isActive: false,
      remainingMs: 0,
      product: {
        id: "prod-1",
        title: "Hot Wheels 1:64",
        image: "products/p1/card.webp",
        boostedUntil: "2026-11-02T10:00:00.000Z",
        homeShowcaseUntil: "2026-10-28T10:00:00.000Z",
      },
      metrics: {
        before: { views: 100, likes: 2, clicks: 10 },
        current: { views: 160, likes: 5, clicks: 14 },
        gain: { views: 60, likes: 3, clicks: 4 },
        performanceScore: 60 + 3 * 5 + 4 * 3,
      },
    });
  });

  it("a free grant has no order and no refund", async () => {
    const { service, prisma } = setup({
      rows: [
        record({
          source: BoostSource.admin_grant,
          price: new Prisma.Decimal(0),
          orderId: null,
        }),
      ],
    });

    const { data } = await service.getMyBoosts(SELLER, {});

    expect(data[0]).toMatchObject({
      source: "admin_grant",
      price: 0,
      refundedAmount: 0,
      orderId: null,
      orderNumber: null,
    });
    expect(prisma.order.findMany).not.toHaveBeenCalled();
  });

  it("reads the page's order numbers in one query, not one per row (no N+1)", async () => {
    const { service, prisma } = setup({
      rows: [
        record({ id: "b1", orderId: "order-1" }),
        record({ id: "b2", orderId: "order-2" }),
        record({ id: "b3", orderId: "order-1" }),
      ],
    });

    await service.getMyBoosts(SELLER, {});

    expect(prisma.productBoost.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.order.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.order.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["order-1", "order-2"] } },
      select: { id: true, orderNumber: true },
    });
  });

  it("a paused boost shows its own paused remainder; a running one its own time", async () => {
    const { service } = setup({
      rows: [
        record({ id: "run" }),
        record({
          id: "pause",
          status: BoostStatus.paused,
          endsAt: null,
          pausedRemainingSeconds: 3600,
        }),
      ],
    });

    const { data } = await service.getMyBoosts(SELLER, {});

    const running = data.find((r) => r.id === "run");
    expect(running?.isActive).toBe(true);
    expect(running?.remainingMs).toBeGreaterThan(4 * 86_400_000);
    expect(data.find((r) => r.id === "pause")).toMatchObject({
      isActive: false,
      remainingMs: 3_600_000,
    });
  });

  it("marks the best performing boost of the page", async () => {
    const { service } = setup({
      rows: [
        record({ id: "low", baselineViewCount: 150 }),
        record({ id: "high", baselineViewCount: 10 }),
        record({ id: "unmeasured", baselineViewCount: null }),
      ],
    });

    const { data } = await service.getMyBoosts(SELLER, {});

    expect(data.map((r) => [r.id, r.isBest])).toEqual([
      ["low", false],
      ["high", true],
      ["unmeasured", false],
    ]);
  });
});

describe("BoostSellerService.setReminder", () => {
  it("turns the reminder on for the owner's running and paused boosts of the listing", async () => {
    const { service, prisma, sentry } = setup({ updated: 2 });

    await expect(service.setReminder(SELLER, "prod-1", true)).resolves.toEqual({
      enabled: true,
    });

    expect(prisma.productBoost.updateMany).toHaveBeenCalledWith({
      where: {
        productId: "prod-1",
        userId: SELLER,
        status: { in: ["active", "paused"] },
      },
      data: { autoRenew: true },
    });
    // Ids only in Sentry.
    expect(sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ data: { productId: "prod-1" } }),
    );
  });

  it("a free seller turning it on gets 400 boostReminderPremiumOnly and nothing changes", async () => {
    const { service, prisma } = setup({ membership: null });

    const call = service.setReminder(SELLER, "prod-1", true);

    await expect(call).rejects.toBeInstanceOf(BadRequestException);
    await expect(call).rejects.toMatchObject({
      response: { i18nKey: "server.product.boostReminderPremiumOnly" },
    });
    expect(prisma.productBoost.updateMany).not.toHaveBeenCalled();
  });

  it("a lapsed premium (period ended) counts as free", async () => {
    const { service, prisma } = setup({
      membership: { ...PREMIUM, currentPeriodEnd: new Date(NOW - 1000) },
    });

    await expect(
      service.setReminder(SELLER, "prod-1", true),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.productBoost.updateMany).not.toHaveBeenCalled();
  });

  it("anyone may turn it off, premium or not", async () => {
    const { service, prisma } = setup({ membership: null });

    await expect(service.setReminder(SELLER, "prod-1", false)).resolves.toEqual(
      { enabled: false },
    );
    expect(prisma.productBoost.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { autoRenew: false } }),
    );
  });

  it.each([
    ["someone else's listing", { sellerId: "other-seller" }],
    ["a missing listing", null],
  ])("%s is a 404 and changes nothing", async (_name, product) => {
    const { service, prisma } = setup({ product });

    await expect(
      service.setReminder(SELLER, "prod-1", false),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.productBoost.updateMany).not.toHaveBeenCalled();
  });

  it("reports off when no boost of the listing runs", async () => {
    const { service } = setup({ updated: 0 });

    await expect(service.setReminder(SELLER, "prod-1", true)).resolves.toEqual({
      enabled: false,
    });
  });
});
