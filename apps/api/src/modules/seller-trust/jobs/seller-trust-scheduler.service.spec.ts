import type { Queue } from "bull";
import type { Prisma } from "@prisma/client";
import { SELLER_TRUST_FORMULA_VERSION } from "@tarodan/types";
import {
  SELLER_TRUST_BOOTSTRAP_JOB_ID,
  SELLER_TRUST_LOCK_KEY,
  SELLER_TRUST_REFRESH_CRON,
  SELLER_TRUST_REFRESH_JOB,
  SellerTrustSchedulerService,
} from "./seller-trust-scheduler.service";
import * as environment from "../../../config/environment";

const asOf = new Date("2026-10-21T23:30:00.000Z");
const DAY = 86_400_000;

/** `$transaction` runs the callback on a tx whose raw statements are no-ops. */
function fakePrisma() {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(0),
    $queryRaw: jest.fn().mockResolvedValue([]),
  } as unknown as Prisma.TransactionClient;
  return {
    tx,
    $transaction: jest.fn(
      (fn: (t: Prisma.TransactionClient) => Promise<unknown>) => fn(tx),
    ),
  };
}

function build(candidates: string[]) {
  const prisma = fakePrisma();
  const cache = {
    setIfAbsent: jest.fn().mockResolvedValue(true),
    exists: jest.fn().mockResolvedValue(true),
    del: jest.fn().mockResolvedValue(undefined),
  };
  const sellerTrust = {
    isEmpty: jest.fn().mockResolvedValue(true),
    upsertBatch: jest.fn(async (rows: unknown[], _asOf: Date) => rows.length),
    deleteStale: jest.fn().mockResolvedValue(2),
  };
  const orderStats = {
    activeSellerIds: jest.fn().mockResolvedValue(candidates),
    fulfilmentStats: jest.fn(
      async (
        _tx: unknown,
        ids: string[],
        _window?: unknown,
        _grace?: number,
        _faultIds?: string[],
      ) =>
        ids.map((userId) => ({
          userId,
          eligible: 5,
          failures: 0,
          shipped: 5,
          late: 0,
        })),
    ),
    salesCounterparties: jest.fn(async (_tx: unknown, ids: string[]) =>
      ids.flatMap((userId) =>
        ["b1", "b2", "b3", "b4", "b5"].map((counterpartyKey) => ({
          userId,
          counterpartyKey,
          count: 1,
        })),
      ),
    ),
  };
  const refundStats = { sellerFaultOrderIds: jest.fn().mockResolvedValue([]) };
  const ratingStats = {
    sellerRatingStats: jest.fn(async (_tx: unknown, ids: string[]) =>
      ids.map((userId) => ({ userId, raters: 5, sumOfGiverMeans: 25 })),
    ),
  };
  const tradeStats = {
    activeTraderIds: jest.fn().mockResolvedValue([]),
    tradeCounterparties: jest.fn().mockResolvedValue([]),
  };
  const userStats = {
    trustEligibleUsers: jest.fn(async (_tx: unknown, ids: string[]) =>
      ids.map((id) => ({ id, createdAt: new Date(asOf.getTime() - 60 * DAY) })),
    ),
    guestBuyerId: jest.fn().mockResolvedValue("guest-user"),
  };
  const queue = {
    add: jest.fn().mockResolvedValue(undefined),
    getRepeatableJobs: jest.fn().mockResolvedValue([]),
    removeRepeatableByKey: jest.fn(),
  };

  const service = new SellerTrustSchedulerService(
    prisma as never,
    cache as never,
    sellerTrust as never,
    orderStats as never,
    refundStats as never,
    ratingStats as never,
    tradeStats as never,
    userStats as never,
    queue as unknown as Queue,
  );
  const pause = jest
    .spyOn(
      service as unknown as { pause: (ms: number) => Promise<void> },
      "pause",
    )
    .mockResolvedValue(undefined);
  return {
    service,
    prisma,
    cache,
    sellerTrust,
    orderStats,
    refundStats,
    ratingStats,
    tradeStats,
    userStats,
    queue,
    pause,
  };
}

const ids = (n: number) =>
  Array.from({ length: n }, (_, i) => `u${String(i).padStart(4, "0")}`);

describe("SellerTrustSchedulerService.runRefresh", () => {
  it("skips without reading or writing when another run holds the lock", async () => {
    const t = build(ids(3));
    t.cache.setIfAbsent.mockResolvedValue(false);

    const result = await t.service.runRefresh(undefined, asOf);

    expect(result.summary).toBe("skipped: locked");
    expect(t.prisma.$transaction).not.toHaveBeenCalled();
    expect(t.sellerTrust.upsertBatch).not.toHaveBeenCalled();
    expect(t.sellerTrust.deleteStale).not.toHaveBeenCalled();
    // It never held the lock, so it must not release someone else's.
    expect(t.cache.del).not.toHaveBeenCalled();
  });

  it("fails (for a retry and the cron alert) when Redis cannot be reached", async () => {
    const t = build(ids(3));
    // setIfAbsent answers false on a Redis error; no lock is actually held.
    t.cache.setIfAbsent.mockResolvedValue(false);
    t.cache.exists.mockResolvedValue(false);

    await expect(t.service.runRefresh(undefined, asOf)).rejects.toThrow(
      "run lock unavailable",
    );
    expect(t.prisma.$transaction).not.toHaveBeenCalled();
    expect(t.cache.del).not.toHaveBeenCalled();
  });

  it("takes the lock with a TTL and releases it after the run", async () => {
    const t = build(ids(2));
    await t.service.runRefresh(undefined, asOf);
    expect(t.cache.setIfAbsent).toHaveBeenCalledWith(
      SELLER_TRUST_LOCK_KEY,
      7200,
    );
    expect(t.cache.del).toHaveBeenCalledWith(SELLER_TRUST_LOCK_KEY);
  });

  it("anchors every window to one asOf and writes rows stamped with it", async () => {
    const t = build(ids(2));
    const result = await t.service.runRefresh(undefined, asOf);

    const since = (days: number) => new Date(asOf.getTime() - days * DAY);
    expect(t.orderStats.activeSellerIds).toHaveBeenCalledWith(
      t.prisma.tx,
      since(760),
    );
    expect(t.tradeStats.activeTraderIds).toHaveBeenCalledWith(
      t.prisma.tx,
      since(730),
    );
    expect(t.orderStats.fulfilmentStats).toHaveBeenCalledWith(
      t.prisma.tx,
      ids(2),
      { since: since(365), until: asOf },
      120,
      [],
    );
    expect(t.orderStats.salesCounterparties).toHaveBeenCalledWith(
      t.prisma.tx,
      ids(2),
      { since: since(730), until: asOf },
      "guest-user",
    );
    expect(t.ratingStats.sellerRatingStats).toHaveBeenCalledWith(
      t.prisma.tx,
      ids(2),
      { since: since(730), until: asOf },
    );

    const [rows, stamp] = t.sellerTrust.upsertBatch.mock.calls[0] as [
      Array<{ userId: string; scoreX100: number; formulaVersion: number }>,
      Date,
    ];
    expect(stamp).toBe(asOf);
    // Case D of the plan (5 buyers, 5 five-star givers, perfect, 60 days).
    expect(rows).toEqual([
      expect.objectContaining({
        userId: "u0000",
        scoreX100: 395,
        formulaVersion: SELLER_TRUST_FORMULA_VERSION,
      }),
      expect.objectContaining({ userId: "u0001", scoreX100: 395 }),
    ]);
    expect(t.sellerTrust.deleteStale).toHaveBeenCalledWith(asOf);
    expect(result.stats).toEqual({
      candidates: 2,
      batches: 1,
      eligible: 2,
      scored: 2,
      notEnoughData: 0,
      written: 2,
      deleted: 2,
      failedBatches: 0,
    });
  });

  it("reads the fault refunds first and hands them to the order query", async () => {
    const t = build(ids(1));
    t.refundStats.sellerFaultOrderIds.mockResolvedValue(["o-fault"]);
    await t.service.runRefresh(undefined, asOf);
    expect(t.refundStats.sellerFaultOrderIds).toHaveBeenCalledWith(
      t.prisma.tx,
      ids(1),
      new Date(asOf.getTime() - 365 * DAY),
    );
    expect(t.orderStats.fulfilmentStats.mock.calls[0][4]).toEqual(["o-fault"]);
  });

  it("unions sellers and traders, sorted, in batches of 500 with a pause between", async () => {
    const t = build(ids(1100).slice(0, 700));
    t.tradeStats.activeTraderIds.mockResolvedValue([
      ...ids(1100).slice(600),
      "u0000",
    ]);

    const result = await t.service.runRefresh(undefined, asOf);

    const batchIds = t.userStats.trustEligibleUsers.mock.calls.map(
      (c) => c[1] as string[],
    );
    expect(batchIds.map((b) => b.length)).toEqual([500, 500, 100]);
    expect(batchIds.flat()).toEqual(ids(1100));
    expect(t.pause).toHaveBeenCalledTimes(2);
    expect(t.pause).toHaveBeenCalledWith(100);
    expect(result.stats).toMatchObject({ candidates: 1100, batches: 3 });
  });

  it("leaves ineligible users and users without activity unwritten", async () => {
    const t = build(["banned", "idle", "seller"]);
    // Banned, deleted and test-lane accounts are filtered by the user domain.
    t.userStats.trustEligibleUsers.mockResolvedValue([
      { id: "idle", createdAt: new Date(asOf.getTime() - 900 * DAY) },
      { id: "seller", createdAt: new Date(asOf.getTime() - 60 * DAY) },
    ]);
    t.orderStats.fulfilmentStats.mockResolvedValue([
      { userId: "seller", eligible: 1, failures: 0, shipped: 1, late: 0 },
    ]);
    t.orderStats.salesCounterparties.mockResolvedValue([]);
    t.ratingStats.sellerRatingStats.mockResolvedValue([]);

    const result = await t.service.runRefresh(undefined, asOf);

    const [rows] = t.sellerTrust.upsertBatch.mock.calls[0] as unknown as [
      Array<{ userId: string; scoreX100: number | null }>,
    ];
    expect(rows.map((r) => r.userId)).toEqual(["seller"]);
    expect(rows[0].scoreX100).toBeNull(); // below the minimum data rule
    expect(result.stats).toMatchObject({
      eligible: 2,
      written: 1,
      scored: 0,
      notEnoughData: 1,
    });
  });

  it("keeps going after a failed batch, cleans nothing and fails the job", async () => {
    const t = build(ids(1200));
    t.orderStats.fulfilmentStats.mockImplementation(
      async (_tx: unknown, batch: string[]) => {
        if (batch[0] === "u0500") {
          throw Object.assign(new Error("canceling statement u0500"), {
            code: "P2010",
          });
        }
        return [];
      },
    );
    const log = jest.fn();

    await expect(t.service.runRefresh(log, asOf)).rejects.toThrow(
      "1 of 3 batches failed",
    );

    expect(t.sellerTrust.upsertBatch).toHaveBeenCalledTimes(2);
    expect(t.sellerTrust.deleteStale).not.toHaveBeenCalled();
    expect(t.cache.del).toHaveBeenCalledWith(SELLER_TRUST_LOCK_KEY);
    // The log names the batch and the error class, never ids or messages.
    const lines = log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(lines).toContain("batch 1 failed: Error(P2010)");
    expect(lines).not.toContain("u0500");
    expect(lines).toContain("failedBatches=1");
  });

  it("cleans nothing and fails the job when a batch's write fails", async () => {
    const t = build(ids(1200));
    t.sellerTrust.upsertBatch.mockImplementation(async (rows: unknown[]) => {
      if ((rows[0] as { userId: string }).userId === "u1000") {
        throw Object.assign(new Error("lock timeout"), { code: "P2010" });
      }
      return rows.length;
    });

    await expect(t.service.runRefresh(undefined, asOf)).rejects.toThrow(
      "1 of 3 batches failed",
    );
    // The earlier batches were written; the failed one keeps yesterday's rows.
    expect(t.sellerTrust.upsertBatch).toHaveBeenCalledTimes(3);
    expect(t.sellerTrust.deleteStale).not.toHaveBeenCalled();
    expect(t.cache.del).toHaveBeenCalledWith(SELLER_TRUST_LOCK_KEY);
  });

  it("stops at the run budget, cleans nothing and fails the job", async () => {
    const t = build(ids(1200));
    let now = 0;
    const clock = jest.spyOn(Date, "now").mockImplementation(() => now);
    // The first batch takes 91 minutes; the budget is 90.
    t.sellerTrust.upsertBatch.mockImplementation(async (rows: unknown[]) => {
      now += 91 * 60 * 1000;
      return rows.length;
    });
    const log = jest.fn();

    try {
      await expect(t.service.runRefresh(log, asOf)).rejects.toThrow(
        "2 of 3 batches failed",
      );
    } finally {
      clock.mockRestore();
    }

    expect(t.sellerTrust.upsertBatch).toHaveBeenCalledTimes(1);
    expect(t.sellerTrust.deleteStale).not.toHaveBeenCalled();
    expect(t.cache.del).toHaveBeenCalledWith(SELLER_TRUST_LOCK_KEY);
    expect(log.mock.calls.map((c) => String(c[0]))).toContain(
      "run budget exhausted before batch 1",
    );
  });

  it("writes nothing and releases the lock when the candidate read fails", async () => {
    const t = build(ids(3));
    t.orderStats.activeSellerIds.mockRejectedValue(
      new Error("canceling statement due to statement timeout"),
    );

    await expect(t.service.runRefresh(undefined, asOf)).rejects.toThrow(
      "statement timeout",
    );
    expect(t.sellerTrust.upsertBatch).not.toHaveBeenCalled();
    expect(t.sellerTrust.deleteStale).not.toHaveBeenCalled();
    expect(t.cache.del).toHaveBeenCalledWith(SELLER_TRUST_LOCK_KEY);
  });

  it("keeps every row when a run writes nothing (no candidates)", async () => {
    const t = build([]);
    const result = await t.service.runRefresh(undefined, asOf);
    expect(t.sellerTrust.upsertBatch).not.toHaveBeenCalled();
    expect(t.sellerTrust.deleteStale).not.toHaveBeenCalled();
    expect(result.summary).toMatch(/^cleanup skipped: /);
    expect(result.stats).toMatchObject({
      candidates: 0,
      batches: 0,
      written: 0,
      deleted: 0,
    });
  });

  it("keeps every row when no candidate is eligible", async () => {
    const t = build(ids(3));
    t.userStats.trustEligibleUsers.mockResolvedValue([]);
    await t.service.runRefresh(undefined, asOf);
    expect(t.sellerTrust.deleteStale).not.toHaveBeenCalled();
  });

  it("reports the deleted count in the summary", async () => {
    const t = build(ids(1));
    const result = await t.service.runRefresh(undefined, asOf);
    expect(result.summary).toContain("deleted=2");
  });

  it("runs every read inside a read-only snapshot with a statement timeout", async () => {
    const t = build(ids(1));
    await t.service.runRefresh(undefined, asOf);
    // Candidates + one batch = two snapshots.
    expect(t.prisma.$transaction).toHaveBeenCalledTimes(2);
    const executed = (t.prisma.tx.$executeRaw as jest.Mock).mock.calls.map(
      (c) => (c[0] as TemplateStringsArray).join("?"),
    );
    expect(executed).toEqual([
      "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY",
      "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY",
    ]);
  });
});

describe("SellerTrustSchedulerService.onModuleInit", () => {
  afterEach(() => jest.restoreAllMocks());

  it("registers the nightly repeatable", async () => {
    const t = build([]);
    await t.service.onModuleInit();
    expect(t.queue.add).toHaveBeenCalledWith(
      SELLER_TRUST_REFRESH_JOB,
      {},
      expect.objectContaining({
        repeat: { cron: SELLER_TRUST_REFRESH_CRON, tz: "Europe/Istanbul" },
      }),
    );
  });

  it("does not enqueue the bootstrap run under tests", async () => {
    const t = build([]);
    await t.service.onModuleInit();
    expect(t.queue.add).toHaveBeenCalledTimes(1); // the repeatable only
    expect(t.sellerTrust.isEmpty).not.toHaveBeenCalled();
  });

  describe("outside tests", () => {
    beforeEach(() => jest.spyOn(environment, "isTest").mockReturnValue(false));

    it("enqueues one bootstrap run with a fixed job id when the table is empty", async () => {
      const t = build([]);
      await t.service.enqueueBootstrapIfEmpty();
      expect(t.queue.add).toHaveBeenCalledWith(
        SELLER_TRUST_REFRESH_JOB,
        {},
        expect.objectContaining({ jobId: SELLER_TRUST_BOOTSTRAP_JOB_ID }),
      );
    });

    it("enqueues nothing when the table has rows", async () => {
      const t = build([]);
      t.sellerTrust.isEmpty.mockResolvedValue(false);
      await t.service.enqueueBootstrapIfEmpty();
      expect(t.queue.add).not.toHaveBeenCalled();
    });

    it("does not fail the boot when the enqueue fails", async () => {
      const t = build([]);
      t.queue.add.mockRejectedValue(new Error("redis down"));
      await expect(
        t.service.enqueueBootstrapIfEmpty(),
      ).resolves.toBeUndefined();
    });
  });
});
