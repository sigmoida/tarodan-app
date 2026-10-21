import { ProductSchedulerService } from "./product-scheduler.service";

/**
 * The expire-boosts cron changes a listing's boost timeline only through
 * BoostTimelineService, one transaction per listing under its lock, so a boost
 * activated while the cron runs is never overwritten (a downgrade wiping a
 * fresh boost, a system resume replacing a fresh boost's end with the paused
 * remainder) and stacked boosts keep their own time across a system pause.
 */
describe("ProductSchedulerService expire-boosts under the listing lock", () => {
  const NOW = new Date("2026-10-21T12:00:00.000Z");
  const HOUR = 60 * 60 * 1000;

  const make = () => {
    // Passed through to the timeline untouched; the cron never writes on it.
    const tx = { marker: "tx" };
    const prisma = {
      $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
      product: { findMany: jest.fn().mockResolvedValue([]) },
      productBoost: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const timeline = {
      lockProduct: jest.fn().mockResolvedValue(undefined),
      refreshProductPromotion: jest.fn().mockResolvedValue(undefined),
      pauseForDelisting: jest.fn().mockResolvedValue(0),
      resumeSystemPaused: jest.fn().mockResolvedValue(0),
    };
    const service = new ProductSchedulerService(
      prisma as never,
      {} as never, // notifications
      {} as never, // scheduled queue
      {} as never, // cache
      {} as never, // search
      {} as never, // seller trust
      timeline as never,
    );
    return { service, prisma, tx, timeline };
  };

  it("downgrades an ended promotion through the timeline, one transaction per listing", async () => {
    const { service, prisma, tx, timeline } = make();
    prisma.product.findMany.mockResolvedValueOnce([{ id: "p1" }, { id: "p2" }]);

    await service.runExpireBoosts();

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(timeline.refreshProductPromotion).toHaveBeenCalledWith(
      tx,
      "p1",
      expect.any(Date),
    );
    expect(timeline.refreshProductPromotion).toHaveBeenCalledWith(
      tx,
      "p2",
      expect.any(Date),
    );
  });

  const privateOf = (service: ProductSchedulerService) =>
    service as unknown as {
      pauseBoostsOfDelistedProducts(now: Date): Promise<number>;
      resumeSystemPausedBoosts(now: Date): Promise<number>;
    };

  it("system pause runs per offline listing through the timeline, one transaction each", async () => {
    // The timeline keeps each boost's own remaining time; the cron only
    // finds the listings (BoostTimelineService.pauseForDelisting).
    const { service, prisma, tx, timeline } = make();
    prisma.productBoost.findMany.mockResolvedValueOnce([
      { productId: "p1" },
      { productId: "p2" },
    ]);
    timeline.pauseForDelisting
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);

    const count = await privateOf(service).pauseBoostsOfDelistedProducts(NOW);

    expect(count).toBe(3);
    expect(prisma.productBoost.findMany).toHaveBeenCalledWith({
      where: {
        status: "active",
        endsAt: { gt: NOW },
        product: { status: { not: "active" } },
      },
      select: { productId: true },
      distinct: ["productId"],
      orderBy: { productId: "asc" },
      take: 200,
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(timeline.pauseForDelisting).toHaveBeenNthCalledWith(
      1,
      tx,
      "p1",
      NOW,
    );
    expect(timeline.pauseForDelisting).toHaveBeenNthCalledWith(
      2,
      tx,
      "p2",
      NOW,
    );
  });

  it("one listing that fails never stops the others", async () => {
    const { service, prisma, timeline } = make();
    prisma.productBoost.findMany.mockResolvedValueOnce([
      { productId: "p1" },
      { productId: "p2" },
    ]);
    timeline.pauseForDelisting
      .mockRejectedValueOnce(new Error("lock timeout"))
      .mockResolvedValueOnce(1);

    await expect(
      privateOf(service).pauseBoostsOfDelistedProducts(NOW),
    ).resolves.toBe(1);
    expect(timeline.pauseForDelisting).toHaveBeenCalledTimes(2);
  });

  it("system resume runs per live listing through the timeline", async () => {
    const { service, prisma, tx, timeline } = make();
    prisma.productBoost.findMany.mockResolvedValueOnce([{ productId: "p1" }]);
    timeline.resumeSystemPaused.mockResolvedValueOnce(2);

    await expect(
      privateOf(service).resumeSystemPausedBoosts(NOW),
    ).resolves.toBe(2);

    expect(timeline.resumeSystemPaused).toHaveBeenCalledWith(tx, "p1", NOW);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("system resume takes at most 200 distinct listings a run, in a stable order", async () => {
    const { service, prisma } = make();

    await privateOf(service).resumeSystemPausedBoosts(NOW);

    expect(prisma.productBoost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { productId: true },
        distinct: ["productId"],
        orderBy: { productId: "asc" },
        take: 200,
      }),
    );
  });

  it("system resume only picks boosts the system paused, on live listings", async () => {
    // A staff pause has pausedBySystem=false: the cron never resumes it.
    const { service, prisma } = make();

    await privateOf(service).resumeSystemPausedBoosts(NOW);

    expect(prisma.productBoost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "paused",
          pausedBySystem: true,
          product: { status: "active" },
        },
      }),
    );
  });

  it("expires only ended active boosts and fails only stale pending ones", async () => {
    // A late-paid boost is active (or still pending within a day): neither
    // sweep may touch it, and nothing ever moves a failed boost.
    const { service, prisma } = make();

    await service.runExpireBoosts();

    const updates = prisma.productBoost.updateMany.mock.calls.map(
      ([arg]: [{ where: Record<string, unknown>; data: unknown }]) => arg,
    );
    expect(updates).toEqual([
      {
        where: { status: "active", endsAt: { lt: expect.any(Date) } },
        data: { status: "expired" },
      },
      {
        where: { status: "pending", createdAt: { lt: expect.any(Date) } },
        data: { status: "failed" },
      },
    ]);
    const [expireNow, failBefore] = [
      updates[0].where.endsAt as { lt: Date },
      updates[1].where.createdAt as { lt: Date },
    ];
    expect(expireNow.lt.getTime() - failBefore.lt.getTime()).toBe(24 * HOUR);
  });
});
