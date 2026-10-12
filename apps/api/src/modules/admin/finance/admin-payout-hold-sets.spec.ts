import { AdminPayoutService } from "./admin-payout.service";
import {
  overdueHoldsWhere,
  upcomingHoldsWhere,
} from "./finance-health.where";
import { LIVE_PAYMENT } from "../../account-lane/live-lane.where";

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

  it("the CSV honours overdue too", async () => {
    const { service, paymentHold } = makeService();

    await service.getPayoutsExport({ overdue: true } as any);

    expect(paymentHold.findMany.mock.calls[0][0].where.AND).toEqual([
      overdueHoldsWhere(new Date()),
    ]);
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
