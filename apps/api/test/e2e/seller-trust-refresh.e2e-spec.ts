import {
  CancellationActor,
  OrderOrigin,
  OrderStatus,
  Prisma,
  RatingStatus,
  RefundFaultParty,
  RefundReason,
  RefundRequestStatus,
  TradeStatus,
} from "@prisma/client";
import type { SellerTrustComponentsV1 } from "@tarodan/types";
import type { Queue } from "bull";
import {
  disconnectPrisma,
  getPrisma,
  seedBaseline,
  truncateAll,
} from "../test-utils/db";
import { SellerTrustSchedulerService } from "../../src/modules/seller-trust/jobs/seller-trust-scheduler.service";
import { SellerTrustService } from "../../src/modules/seller-trust/seller-trust.service";
import { OrderSellerTrustStatsService } from "../../src/modules/order/stats/order-seller-trust-stats.service";
import { RefundSellerTrustStatsService } from "../../src/modules/refund/stats/refund-seller-trust-stats.service";
import { RatingSellerTrustStatsService } from "../../src/modules/rating/stats/rating-seller-trust-stats.service";
import { TradeSellerTrustStatsService } from "../../src/modules/trade/stats/trade-seller-trust-stats.service";
import { UserSellerTrustStatsService } from "../../src/modules/user/stats/user-seller-trust-stats.service";
import { ORDER_CANCEL_REASON } from "../../src/modules/order/helpers/order-cancel-reasons";
import { SYSTEM_GUEST_EMAIL } from "../../src/modules/invoicing/invoice/guest-recipient";

/**
 * Seller trust refresh against a real Postgres (ADR 0014,
 * docs/SELLER_TRUST.md): the SQL of every owning domain plus the batch.
 *
 * Data-layer test: no Nest app (no Redis, Bull or Elasticsearch). The services
 * are built over the test Prisma client; the run lock is an in-memory fake.
 * Every case runs with a fixed `asOf` so the windows are exact.
 */
const DAY = 86_400_000;
const HOUR = 3_600_000;
const asOf = new Date("2026-10-21T23:30:00.000Z");
const ago = (ms: number) => new Date(asOf.getTime() - ms);

let categoryId: string;
let seq = 0;
const uniq = () => `${Date.now()}-${++seq}`;

function buildRunner() {
  const prisma = getPrisma();
  const locks = new Set<string>();
  const cache = {
    setIfAbsent: async (key: string) =>
      locks.has(key) ? false : (locks.add(key), true),
    del: async (key: string) => void locks.delete(key),
  };
  const service = new SellerTrustSchedulerService(
    prisma as never,
    cache as never,
    new SellerTrustService(prisma as never),
    new OrderSellerTrustStatsService(),
    new RefundSellerTrustStatsService(),
    new RatingSellerTrustStatsService(),
    new TradeSellerTrustStatsService(),
    new UserSellerTrustStatsService(),
    { add: jest.fn() } as unknown as Queue,
  );
  jest
    .spyOn(service as unknown as { pause: () => Promise<void> }, "pause")
    .mockResolvedValue(undefined);
  return { service, locks };
}

async function user(
  over: Partial<Prisma.UserUncheckedCreateInput> = {},
): Promise<string> {
  const u = await getPrisma().user.create({
    data: {
      email: `u-${uniq()}@test.local`,
      passwordHash: "x",
      displayName: "Trust Fixture",
      createdAt: ago(60 * DAY),
      ...over,
    },
  });
  return u.id;
}

const products = new Map<string, string>();
async function productOf(sellerId: string): Promise<string> {
  const existing = products.get(sellerId);
  if (existing) return existing;
  const p = await getPrisma().product.create({
    data: {
      sellerId,
      categoryId,
      title: `Trust Fixture ${uniq()}`,
      description: "fixture",
      price: new Prisma.Decimal(100),
      condition: "new" as never,
      status: "active" as never,
      quantity: 1,
      reservedQuantity: 0,
    },
  });
  products.set(sellerId, p.id);
  return p.id;
}

interface OrderFixture {
  sellerId: string;
  buyerId: string;
  status?: OrderStatus;
  origin?: OrderOrigin;
  /** Paid: the (current) preparing deadline. Null = never paid. */
  deadline?: Date | null;
  originalDeadline?: Date | null;
  shippedAt?: Date | null;
  completedAt?: Date | null;
  cancelledBy?: CancellationActor | null;
  cancelReason?: string | null;
  adminCancelReasonCode?: string | null;
}

/** Defaults: a completed, on-time order paid 10 days before asOf. */
async function order(f: OrderFixture): Promise<string> {
  const prisma = getPrisma();
  const deadline = f.deadline === undefined ? ago(10 * DAY) : f.deadline;
  const o = await prisma.order.create({
    data: {
      orderNumber: `TR-${uniq()}`,
      buyerId: f.buyerId,
      sellerId: f.sellerId,
      productId: await productOf(f.sellerId),
      origin: f.origin ?? OrderOrigin.direct_sale,
      totalAmount: new Prisma.Decimal(100),
      commissionAmount: new Prisma.Decimal(0),
      paymentExpiresAt: ago(12 * DAY),
      status: f.status ?? OrderStatus.completed,
      preparingDeadline: deadline,
      originalPreparingDeadline: f.originalDeadline ?? null,
      completedAt:
        f.completedAt === undefined
          ? (f.status ?? OrderStatus.completed) === OrderStatus.completed
            ? ago(2 * DAY)
            : null
          : f.completedAt,
      cancelledBy: f.cancelledBy ?? null,
      cancelReason: f.cancelReason ?? null,
      adminCancelReasonCode: f.adminCancelReasonCode ?? null,
    },
  });
  const shippedAt =
    f.shippedAt === undefined
      ? deadline &&
        (f.status ?? OrderStatus.completed) !== OrderStatus.cancelled
        ? new Date(deadline.getTime() - HOUR)
        : null
      : f.shippedAt;
  if (shippedAt) {
    await prisma.shipment.create({
      data: { orderId: o.id, provider: "surat", shippedAt },
    });
  }
  return o.id;
}

async function rate(
  giverId: string,
  receiverId: string,
  score: number,
  ref: { orderId?: string; tradeId?: string },
  createdAt: Date = ago(DAY),
) {
  await getPrisma().rating.create({
    data: {
      giverId,
      receiverId,
      score,
      status: RatingStatus.approved,
      createdAt,
      ...ref,
    },
  });
}

async function trade(
  initiatorId: string,
  receiverId: string,
  completedAt: Date = ago(5 * DAY),
): Promise<string> {
  const t = await getPrisma().trade.create({
    data: {
      tradeNumber: `TT-${uniq()}`,
      initiatorId,
      receiverId,
      status: TradeStatus.completed,
      responseDeadline: ago(20 * DAY),
      completedAt,
    },
  });
  return t.id;
}

async function refund(
  orderId: string,
  requesterId: string,
  faultParty: RefundFaultParty,
  status: RefundRequestStatus,
) {
  await getPrisma().refundRequest.create({
    data: {
      refundNumber: `RF-${uniq()}`,
      orderId,
      requesterId,
      reason: RefundReason.not_as_described,
      amount: new Prisma.Decimal(100),
      status,
      faultParty,
    },
  });
}

/** Plan case D: 5 buyers, each one on-time completed order and a 5-star rating. */
async function caseD(sellerId: string) {
  for (let i = 0; i < 5; i++) {
    const buyerId = await user();
    const orderId = await order({ sellerId, buyerId });
    await rate(buyerId, sellerId, 5, { orderId });
  }
}

async function scoreOf(userId: string) {
  return getPrisma().sellerTrustScore.findUnique({ where: { userId } });
}
const components = (row: { components: Prisma.JsonValue } | null) =>
  row?.components as unknown as SellerTrustComponentsV1;

describe("seller-trust-refresh (E2E, data layer)", () => {
  afterAll(async () => {
    await disconnectPrisma();
  });
  beforeEach(async () => {
    await truncateAll();
    products.clear();
    ({ categoryId } = await seedBaseline());
  });

  it("scores plan case D at 3.95 with the matching breakdown", async () => {
    const seller = await user();
    await caseD(seller);

    const result = await buildRunner().service.runRefresh(undefined, asOf);

    const row = await scoreOf(seller);
    expect(row?.scoreX100).toBe(395);
    expect(row?.formulaVersion).toBe(1);
    expect(row?.computedAt.toISOString()).toBe(asOf.toISOString());
    expect(components(row)).toMatchObject({
      rating: { raters: 5, smoothed: 4.5 },
      reliability: { eligibleOrders: 5, failures: 0 },
      onTime: { shipped: 5, late: 0 },
      volume: { transactions: 5, counterparties: 5 },
      tenure: { days: 60 },
    });
    expect(result.stats).toMatchObject({ scored: 1, failedBatches: 0 });
  });

  it("ignores test-lane, platform-service, buyer-cancelled and unpaid orders and seller-given ratings", async () => {
    const seller = await user();
    await caseD(seller);
    const buyer = await user();
    const testBuyer = await user({ isTestAccount: true });

    // Test lane (the trigger stamps is_test from the buyer's account).
    const testOrder = await order({ sellerId: seller, buyerId: testBuyer });
    await rate(testBuyer, seller, 1, { orderId: testOrder });
    // Platform service order (membership / boost).
    await order({
      sellerId: seller,
      buyerId: buyer,
      origin: OrderOrigin.platform_service,
    });
    // Buyer cancelled after payment: neither success nor failure.
    await order({
      sellerId: seller,
      buyerId: buyer,
      status: OrderStatus.cancelled,
      cancelledBy: CancellationActor.buyer,
    });
    // Never paid.
    await order({
      sellerId: seller,
      buyerId: buyer,
      status: OrderStatus.cancelled,
      deadline: null,
      cancelledBy: CancellationActor.system,
      cancelReason: ORDER_CANCEL_REASON.paymentWindowExpired,
    });
    // Ratings are two-way: the seller's rating of its buyer belongs to the
    // buyer, who sells nothing, so it counts for nobody.
    const ownOrder = await order({
      sellerId: seller,
      buyerId: buyer,
      status: OrderStatus.delivered,
      completedAt: null,
    });
    await rate(seller, buyer, 1, { orderId: ownOrder });

    await buildRunner().service.runRefresh(undefined, asOf);

    expect(components(await scoreOf(seller))).toMatchObject({
      rating: { raters: 5 },
      // case D's 5 plus the delivered order (paid, deadline passed, not cancelled)
      reliability: { eligibleOrders: 6, failures: 0 },
      volume: { transactions: 5, counterparties: 5 },
    });
    expect(await scoreOf(buyer)).toBeNull();
    expect(await scoreOf(testBuyer)).toBeNull();
  });

  it("caps one buyer at 3 transactions and counts their ratings as one vote", async () => {
    const seller = await user();
    await caseD(seller);
    const loyal = await user();
    for (let i = 0; i < 10; i++) {
      const orderId = await order({ sellerId: seller, buyerId: loyal });
      if (i < 3) await rate(loyal, seller, 1, { orderId });
    }

    await buildRunner().service.runRefresh(undefined, asOf);

    const c = components(await scoreOf(seller));
    expect(c.volume).toMatchObject({ transactions: 8, counterparties: 6 });
    // (5 * 4 + 5 * 5 + 1) / (5 + 6)
    expect(c.rating.raters).toBe(6);
    expect(c.rating.smoothed).toBeCloseTo(46 / 11, 4);
  });

  it("counts each guest checkout as its own counterparty", async () => {
    const seller = await user();
    const guest = await user({ email: SYSTEM_GUEST_EMAIL });
    for (let i = 0; i < 4; i++)
      await order({ sellerId: seller, buyerId: guest });
    await order({ sellerId: seller, buyerId: await user() });

    await buildRunner().service.runRefresh(undefined, asOf);

    const row = await scoreOf(seller);
    expect(components(row).volume).toMatchObject({
      transactions: 5,
      counterparties: 5,
    });
    expect(row?.scoreX100).not.toBeNull();
  });

  it("counts seller-caused failures only, on fields that are populated", async () => {
    const seller = await user();
    const buyer = await user();
    const cancelled = (o: Partial<OrderFixture>) =>
      order({
        sellerId: seller,
        buyerId: buyer,
        status: OrderStatus.cancelled,
        completedAt: null,
        ...o,
      });

    // Failures:
    // - legacy not-shipped-in-time auto-cancel (no actor before 2026-09-18)
    await cancelled({
      cancelReason: ORDER_CANCEL_REASON.sellerShipDeadlineExpired,
    });
    // - platform cancel for a seller-fault code
    await cancelled({
      cancelledBy: CancellationActor.platform,
      adminCancelReasonCode: "stock_error",
    });
    // - reviewed seller-fault refund that was paid out
    const faulty = await order({
      sellerId: seller,
      buyerId: buyer,
      status: OrderStatus.refunded,
      completedAt: null,
    });
    await refund(
      faulty,
      buyer,
      RefundFaultParty.seller,
      RefundRequestStatus.refunded,
    );
    // Left out (neither success nor failure):
    await cancelled({
      cancelledBy: CancellationActor.platform,
      adminCancelReasonCode: "user_request",
    });
    await cancelled({}); // legacy cancellation with no actor and no known reason
    // Successes, even with a claim against the seller that was not upheld:
    const claimed = await order({ sellerId: seller, buyerId: buyer });
    await refund(
      claimed,
      buyer,
      RefundFaultParty.seller,
      RefundRequestStatus.pending_review,
    );
    const buyerFault = await order({
      sellerId: seller,
      buyerId: buyer,
      status: OrderStatus.refunded,
      completedAt: null,
    });
    await refund(
      buyerFault,
      buyer,
      RefundFaultParty.buyer,
      RefundRequestStatus.refunded,
    );

    await buildRunner().service.runRefresh(undefined, asOf);

    expect(components(await scoreOf(seller)).reliability).toMatchObject({
      eligibleOrders: 5,
      failures: 3,
    });
  });

  it("measures on-time against the first deadline with a 2 h grace (D4)", async () => {
    const seller = await user();
    const buyer = await user();
    const first = ago(20 * DAY);
    const extended = new Date(first.getTime() + 3 * DAY);
    // Extended, shipped after the first deadline: late although inside the extension.
    await order({
      sellerId: seller,
      buyerId: buyer,
      originalDeadline: first,
      deadline: extended,
      shippedAt: new Date(first.getTime() + 3 * HOUR),
    });
    // Within the sync-lag grace: on time.
    await order({
      sellerId: seller,
      buyerId: buyer,
      deadline: first,
      shippedAt: new Date(first.getTime() + 90 * 60_000),
    });
    // Paid, deadline passed, never handed over: in E, not in S.
    await order({
      sellerId: seller,
      buyerId: buyer,
      status: OrderStatus.preparing,
      completedAt: null,
      deadline: first,
      shippedAt: null,
    });
    // Deadline not passed yet: not counted at all.
    await order({
      sellerId: seller,
      buyerId: buyer,
      status: OrderStatus.preparing,
      completedAt: null,
      deadline: new Date(asOf.getTime() + DAY),
      shippedAt: null,
    });

    await buildRunner().service.runRefresh(undefined, asOf);

    const c = components(await scoreOf(seller));
    expect(c.reliability.eligibleOrders).toBe(3);
    expect(c.onTime).toMatchObject({ shipped: 2, late: 1 });
  });

  it("respects the window edges", async () => {
    const seller = await user({ createdAt: ago(1000 * DAY) });
    const buyer = await user();
    // Volume: 730 days.
    await order({
      sellerId: seller,
      buyerId: buyer,
      deadline: ago(735 * DAY),
      completedAt: ago(731 * DAY),
    });
    await order({
      sellerId: seller,
      buyerId: buyer,
      deadline: ago(735 * DAY),
      completedAt: ago(729 * DAY),
    });
    // Operations: first deadline within 365 days.
    await order({
      sellerId: seller,
      buyerId: buyer,
      deadline: ago(366 * DAY),
      completedAt: ago(300 * DAY),
    });
    await order({
      sellerId: seller,
      buyerId: buyer,
      deadline: ago(364 * DAY),
      completedAt: ago(300 * DAY),
    });
    // Ratings: 730 days.
    const rated = await order({ sellerId: seller, buyerId: buyer });
    const rater2 = await user();
    const rated2 = await order({ sellerId: seller, buyerId: rater2 });
    await rate(buyer, seller, 5, { orderId: rated }, ago(731 * DAY));
    await rate(rater2, seller, 5, { orderId: rated2 }, ago(729 * DAY));

    await buildRunner().service.runRefresh(undefined, asOf);

    const c = components(await scoreOf(seller));
    // completed in window: 729d, 300d, 300d, and the two rated ones; one buyer is capped at 3
    expect(c.volume).toMatchObject({ transactions: 4, counterparties: 2 });
    // deadlines in window: 364d plus the two rated ones (10 days ago)
    expect(c.reliability.eligibleOrders).toBe(3);
    expect(c.rating.raters).toBe(1);
    expect(c.tenure).toMatchObject({ days: 1000, subScore: 1 });
  });

  it("includes completed trades for both sides and their ratings", async () => {
    const trader = await user();
    for (let i = 0; i < 5; i++) {
      const other = await user();
      const tradeId =
        i % 2 ? await trade(trader, other) : await trade(other, trader);
      await rate(other, trader, 4, { tradeId });
    }

    await buildRunner().service.runRefresh(undefined, asOf);

    const row = await scoreOf(trader);
    expect(components(row)).toMatchObject({
      rating: { raters: 5 },
      volume: { transactions: 5, counterparties: 5 },
    });
    expect(row?.scoreX100).not.toBeNull();
  });

  it("scores the platform account by its real sales only (D5)", async () => {
    const platform = await user({ sellerType: "platform" });
    await caseD(platform);
    for (let i = 0; i < 20; i++) {
      await order({
        sellerId: platform,
        buyerId: await user(),
        origin: OrderOrigin.platform_service,
      });
    }

    await buildRunner().service.runRefresh(undefined, asOf);

    expect((await scoreOf(platform))?.scoreX100).toBe(395);
  });

  it("is idempotent for one asOf and removes rows of banned, deleted and test-lane sellers", async () => {
    const kept = await user();
    const banned = await user();
    const deleted = await user();
    const laned = await user();
    for (const s of [kept, banned, deleted, laned]) await caseD(s);
    const { service } = buildRunner();

    await service.runRefresh(undefined, asOf);
    const first = await getPrisma().sellerTrustScore.findMany({
      orderBy: { userId: "asc" },
    });
    expect(first).toHaveLength(4);

    await service.runRefresh(undefined, asOf);
    const second = await getPrisma().sellerTrustScore.findMany({
      orderBy: { userId: "asc" },
    });
    expect(second).toEqual(first);

    await getPrisma().user.update({
      where: { id: banned },
      data: { isBanned: true },
    });
    await getPrisma().user.update({
      where: { id: deleted },
      data: { deletedAt: asOf },
    });
    await getPrisma().user.update({
      where: { id: laned },
      data: { isTestAccount: true },
    });
    await service.runRefresh(undefined, new Date(asOf.getTime() + DAY));

    const left = await getPrisma().sellerTrustScore.findMany();
    expect(left.map((r) => r.userId)).toEqual([kept]);
  });

  it("writes nothing while another run holds the lock", async () => {
    const seller = await user();
    await caseD(seller);
    const { service, locks } = buildRunner();
    locks.add("seller-trust:refresh-lock");

    const result = await service.runRefresh(undefined, asOf);

    expect(result.summary).toBe("skipped: locked");
    expect(await getPrisma().sellerTrustScore.count()).toBe(0);
  });

  it("drops a giver once banned", async () => {
    const seller = await user();
    await caseD(seller);
    const giver = await getPrisma().rating.findFirstOrThrow({
      where: { receiverId: seller },
    });
    await getPrisma().user.update({
      where: { id: giver.giverId },
      data: { isBanned: true },
    });

    await buildRunner().service.runRefresh(undefined, asOf);

    expect(components(await scoreOf(seller)).rating.raters).toBe(4);
  });
});
