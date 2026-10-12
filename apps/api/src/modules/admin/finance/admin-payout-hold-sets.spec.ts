import { AdminPayoutService } from "./admin-payout.service";
import {
  overdueHoldsWhere,
  upcomingHoldsWhere,
} from "./finance-health.where";
import { LIVE_PAYMENT } from "../../account-lane/live-lane.where";
import { HOLD_RELEASE_ORDER_SELECT } from "../../payout/helpers/hold-release-eligibility";

/**
 * Hold listelerinin dashboard ile paylaştığı kümeler: "süresi geçmiş" süzgeci
 * dashboard kuyruğunun kümesini açar, "yaklaşan ödemeler" kartı süresi
 * geçmişleri göstermez, ödeme planı test şeridini saymaz.
 */
describe("AdminPayoutService — hold sets shared with the dashboard", () => {
  const makeService = () => {
    const paymentHold = {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
      fields: { releaseAt: { __ref: "payment_holds.release_at" } },
    };
    const prisma = {
      paymentHold,
      order: { findMany: jest.fn().mockResolvedValue([]) },
      payoutTransfer: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { netAmount: 0 }, _count: { id: 0 } }),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const service = new AdminPayoutService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return { service, paymentHold };
  };

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date("2026-10-12T09:00:00.000Z") });
  });
  afterEach(() => jest.useRealTimers());

  it("overdue=true filters the escrow list to the dashboard's overdue-hold set", async () => {
    const { service, paymentHold } = makeService();

    await service.getPayoutsTransactions({ overdue: true } as any);

    const where = paymentHold.findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual([overdueHoldsWhere(new Date())]);
    // the count runs on the same where — the total matches the page
    expect(paymentHold.count).toHaveBeenCalledWith({ where });
  });

  it("without overdue the escrow list adds no release-date condition", async () => {
    const { service, paymentHold } = makeService();

    await service.getPayoutsTransactions({} as any);

    expect(paymentHold.findMany.mock.calls[0][0].where.AND).toBeUndefined();
  });

  it("next releases skip overdue and frozen holds — only what will open on its date", async () => {
    const { service, paymentHold } = makeService();

    await service.getPayoutsSummary();

    const nextReleases = paymentHold.findMany.mock.calls[0][0];
    expect(nextReleases.where).toEqual(upcomingHoldsWhere(new Date()));
    expect(nextReleases.where.releaseAt).toEqual({ gt: new Date() });
    expect(nextReleases.where.frozenByRefundId).toBeNull();
  });

  it("the release schedule leaves test-lane holds out", async () => {
    const { service, paymentHold } = makeService();

    await service.getPayoutsSchedule({});

    expect(paymentHold.findMany.mock.calls[0][0].where).toMatchObject({
      payment: LIVE_PAYMENT,
      status: "held",
    });
  });
});

describe("AdminPayoutService.getPayoutsTransactions — releasability flags", () => {
  const PAST = new Date("2026-10-01T09:00:00.000Z");
  const holdRow = (id: string, orderId: string, extra = {}) => ({
    id,
    orderId,
    sellerId: "s1",
    seller: { displayName: "Satıcı", email: "s@x.test" },
    payment: { paidAt: PAST },
    amount: 420,
    refundedAmount: 395,
    frozenByRefundId: null,
    status: "held",
    releaseAt: PAST,
    releasedAt: null,
    createdAt: PAST,
    ...extra,
  });

  it("flags each row with the SAME predicate the release uses, plus the order status", async () => {
    const paymentHold = {
      findMany: jest.fn().mockResolvedValue([
        holdRow("h-buyer", "o-buyer"),
        holdRow("h-seller", "o-seller"),
        holdRow("h-frozen", "o-delivered", {
          refundedAmount: 0,
          frozenByRefundId: "rr-1",
        }),
        holdRow("h-orphan", "o-missing"),
      ]),
      count: jest.fn().mockResolvedValue(4),
    };
    const order = {
      findMany: jest.fn().mockResolvedValue([
        {
          id: "o-buyer",
          orderNumber: "ORD-1",
          status: "cancelled",
          refundRequests: [
            { status: "refunded", faultParty: "buyer", policyCode: "v2" },
          ],
        },
        {
          id: "o-seller",
          orderNumber: "ORD-2",
          status: "refunded",
          refundRequests: [
            { status: "refunded", faultParty: "seller", policyCode: "v2" },
          ],
        },
        {
          id: "o-delivered",
          orderNumber: "ORD-3",
          status: "delivered",
          refundRequests: [],
        },
      ]),
    };
    const service = new AdminPayoutService(
      { paymentHold, order } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const { data } = await service.getPayoutsTransactions({} as any);
    const flags = Object.fromEntries(
      data.map((row) => [
        row.id,
        [row.releasable, row.releaseBlockedReason, row.orderStatus],
      ]),
    );

    expect(flags).toEqual({
      "h-buyer": [true, null, "cancelled"],
      "h-seller": [false, "seller_at_fault", "refunded"],
      "h-frozen": [false, "frozen", "delivered"],
      "h-orphan": [false, "order_not_terminal", null],
    });
    // the order is read with the predicate's own select
    expect(order.findMany.mock.calls[0][0].select).toMatchObject({
      id: true,
      orderNumber: true,
      ...HOLD_RELEASE_ORDER_SELECT,
    });
  });
});

describe("upcomingHoldsWhere", () => {
  const NOW = new Date("2026-10-12T09:00:00.000Z");

  it("never overlaps the overdue set: one is release ≤ now, the other > now", () => {
    expect(overdueHoldsWhere(NOW).releaseAt).toEqual({
      not: null,
      lte: NOW,
    });
    expect(upcomingHoldsWhere(NOW).releaseAt).toEqual({ gt: NOW });
  });

  it("bounds the window when an end is given", () => {
    const until = new Date("2026-10-19T09:00:00.000Z");
    expect(upcomingHoldsWhere(NOW, until)).toEqual({
      payment: LIVE_PAYMENT,
      status: "held",
      frozenByRefundId: null,
      releaseAt: { gt: NOW, lte: until },
    });
  });
});
