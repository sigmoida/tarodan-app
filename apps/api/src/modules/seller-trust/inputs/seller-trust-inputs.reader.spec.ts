import type { Prisma } from "@prisma/client";
import { SellerTrustInputsReader } from "./seller-trust-inputs.reader";

const asOf = new Date("2026-10-21T23:30:00.000Z");
const DAY = 86_400_000;
const since = (days: number) => new Date(asOf.getTime() - days * DAY);

/** A tx that records any statement the reader would issue itself. */
function fakeTx() {
  return {
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };
}

function build() {
  const calls: string[] = [];
  const track =
    <T>(name: string, value: T) =>
    async () => {
      calls.push(name);
      return value;
    };
  const orderStats = {
    activeSellerIds: jest.fn(track("activeSellerIds", ["s2", "s1", "both"])),
    fulfilmentStats: jest.fn(
      track("fulfilmentStats", [
        { userId: "s1", eligible: 6, failures: 1, shipped: 5, late: 2 },
      ]),
    ),
    salesCounterparties: jest.fn(
      track("salesCounterparties", [
        { userId: "s1", counterpartyKey: "b1", count: 2 },
        { userId: "s1", counterpartyKey: "guest:abc", count: 4 },
      ]),
    ),
  };
  const refundStats = {
    sellerFaultOrderIds: jest.fn(track("sellerFaultOrderIds", ["o-fault"])),
  };
  const ratingStats = {
    sellerRatingStats: jest.fn(
      track("sellerRatingStats", [
        { userId: "s1", raters: 3, sumOfGiverMeans: 13 },
      ]),
    ),
  };
  const tradeStats = {
    activeTraderIds: jest.fn(track("activeTraderIds", ["t1", "both"])),
    // b1 also traded with s1: one person across sales and trades.
    tradeCounterparties: jest.fn(
      track("tradeCounterparties", [
        { userId: "s1", counterpartyKey: "b1", count: 2 },
      ]),
    ),
  };
  const userStats = {
    trustEligibleUsers: jest.fn(
      track("trustEligibleUsers", [
        { id: "s1", createdAt: new Date(asOf.getTime() - 100 * DAY - 1) },
        { id: "s2", createdAt: asOf },
      ]),
    ),
    guestBuyerId: jest.fn(track("guestBuyerId", "guest-user")),
  };
  const reader = new SellerTrustInputsReader(
    orderStats as never,
    refundStats as never,
    ratingStats as never,
    tradeStats as never,
    userStats as never,
  );
  const tx = fakeTx();
  return {
    reader,
    tx,
    txc: tx as unknown as Prisma.TransactionClient,
    calls,
    orderStats,
    refundStats,
    ratingStats,
    tradeStats,
    userStats,
  };
}

describe("SellerTrustInputsReader", () => {
  it("anchors every window of formula v1 to one asOf", () => {
    const { reader } = build();
    expect(reader.windowsAt(asOf)).toEqual({
      rating: { since: since(730), until: asOf },
      operations: { since: since(365), until: asOf },
      volume: { since: since(730), until: asOf },
    });
  });

  it("unions sellers (volume window plus a 30-day margin) and traders, deduplicated and sorted", async () => {
    const t = build();
    const ids = await t.reader.candidateIds(
      t.txc,
      asOf,
      t.reader.windowsAt(asOf),
    );
    expect(ids).toEqual(["both", "s1", "s2", "t1"]);
    expect(t.orderStats.activeSellerIds).toHaveBeenCalledWith(
      t.txc,
      since(760),
    );
    expect(t.tradeStats.activeTraderIds).toHaveBeenCalledWith(
      t.txc,
      since(730),
    );
  });

  it("reads the guest buyer through the user domain", async () => {
    const t = build();
    await expect(t.reader.guestBuyerId(t.txc)).resolves.toBe("guest-user");
    expect(t.userStats.guestBuyerId).toHaveBeenCalledWith(t.txc);
  });

  it("reads each domain once, fault refunds before the order query, on the caller's tx", async () => {
    const t = build();
    const windows = t.reader.windowsAt(asOf);

    await t.reader.readInputs(t.txc, ["s1", "s2", "x"], asOf, windows, "g");

    expect(t.calls).toEqual([
      "trustEligibleUsers",
      "sellerFaultOrderIds",
      "fulfilmentStats",
      "salesCounterparties",
      "tradeCounterparties",
      "sellerRatingStats",
    ]);
    const eligibleIds = ["s1", "s2"];
    expect(t.userStats.trustEligibleUsers).toHaveBeenCalledWith(t.txc, [
      "s1",
      "s2",
      "x",
    ]);
    expect(t.refundStats.sellerFaultOrderIds).toHaveBeenCalledWith(
      t.txc,
      eligibleIds,
      since(365),
    );
    expect(t.orderStats.fulfilmentStats).toHaveBeenCalledWith(
      t.txc,
      eligibleIds,
      windows.operations,
      120,
      ["o-fault"],
    );
    expect(t.orderStats.salesCounterparties).toHaveBeenCalledWith(
      t.txc,
      eligibleIds,
      windows.volume,
      "g",
    );
    expect(t.tradeStats.tradeCounterparties).toHaveBeenCalledWith(
      t.txc,
      eligibleIds,
      windows.volume,
    );
    expect(t.ratingStats.sellerRatingStats).toHaveBeenCalledWith(
      t.txc,
      eligibleIds,
      windows.rating,
    );
    // The caller owns the snapshot: the reader opens nothing and runs no
    // statement of its own.
    expect(t.tx.$transaction).not.toHaveBeenCalled();
    expect(t.tx.$executeRaw).not.toHaveBeenCalled();
    expect(t.tx.$queryRaw).not.toHaveBeenCalled();
  });

  it("joins the rows into formula inputs, one per eligible user, in eligible order", async () => {
    const t = build();
    const out = await t.reader.readInputs(
      t.txc,
      ["s1", "s2"],
      asOf,
      t.reader.windowsAt(asOf),
      null,
    );
    expect(out).toEqual([
      {
        userId: "s1",
        inputs: {
          raters: 3,
          sumOfGiverMeans: 13,
          eligibleOrders: 6,
          failures: 1,
          shipped: 5,
          late: 2,
          // b1: 2 sales + 2 trades capped at 3; the guest: 4 capped at 3.
          transactions: 6,
          counterparties: 2,
          tenureDays: 100,
        },
      },
      {
        userId: "s2",
        inputs: {
          raters: 0,
          sumOfGiverMeans: 0,
          eligibleOrders: 0,
          failures: 0,
          shipped: 0,
          late: 0,
          transactions: 0,
          counterparties: 0,
          tenureDays: 0,
        },
      },
    ]);
  });

  it("reads nothing more when no id is eligible", async () => {
    const t = build();
    t.userStats.trustEligibleUsers.mockResolvedValue([]);

    const out = await t.reader.readInputs(
      t.txc,
      ["banned"],
      asOf,
      t.reader.windowsAt(asOf),
      null,
    );

    expect(out).toEqual([]);
    expect(t.refundStats.sellerFaultOrderIds).not.toHaveBeenCalled();
    expect(t.orderStats.fulfilmentStats).not.toHaveBeenCalled();
    expect(t.orderStats.salesCounterparties).not.toHaveBeenCalled();
    expect(t.tradeStats.tradeCounterparties).not.toHaveBeenCalled();
    expect(t.ratingStats.sellerRatingStats).not.toHaveBeenCalled();
  });
});
