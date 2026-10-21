import { ProductSchedulerService } from "./product-scheduler.service";

/**
 * The expire-boosts cron writes a listing's promotion columns under the same
 * listing lock as BoostTimelineService, so a boost activated while the cron
 * runs is never overwritten (a downgrade wiping a fresh boost, a system
 * resume replacing a fresh boost's end with the paused remainder).
 */
describe("ProductSchedulerService expire-boosts under the listing lock", () => {
  const NOW = new Date("2026-10-21T12:00:00.000Z");
  const HOUR = 60 * 60 * 1000;
  const at = (ms: number) => new Date(NOW.getTime() + ms);

  const makeTx = () => ({
    product: { findUnique: jest.fn(), update: jest.fn() },
    productBoost: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  });

  const make = () => {
    const tx = makeTx();
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

  it("system pause locks the listing, pauses only rows still active and rebuilds the columns", async () => {
    const { service, prisma, tx, timeline } = make();
    prisma.productBoost.findMany.mockResolvedValueOnce([
      { id: "b1", productId: "p1", endsAt: at(2 * HOUR) },
    ]);

    const count = await (
      service as unknown as {
        pauseBoostsOfDelistedProducts(now: Date): Promise<number>;
      }
    ).pauseBoostsOfDelistedProducts(NOW);

    expect(count).toBe(1);
    expect(timeline.lockProduct).toHaveBeenCalledWith(tx, "p1");
    expect(tx.productBoost.updateMany).toHaveBeenCalledWith({
      where: { id: "b1", status: "active" },
      data: expect.objectContaining({
        status: "paused",
        pausedBySystem: true,
        pausedRemainingSeconds: 7200,
      }),
    });
    expect(timeline.refreshProductPromotion).toHaveBeenCalledWith(
      tx,
      "p1",
      NOW,
    );
    const lockOrder = timeline.lockProduct.mock.invocationCallOrder[0];
    expect(lockOrder).toBeLessThan(
      tx.productBoost.updateMany.mock.invocationCallOrder[0],
    );
  });

  const resume = (service: ProductSchedulerService) =>
    (
      service as unknown as {
        resumeSystemPausedBoosts(now: Date): Promise<number>;
      }
    ).resumeSystemPausedBoosts(NOW);

  const pausedRow = {
    id: "b1",
    productId: "p1",
    showcaseOnHome: false,
    pausedRemainingSeconds: 3600,
    product: { qualityScore: 10, popularityScore: 1 },
  };

  it("system resume stacks the remainder after a boost activated while the listing was offline", async () => {
    const { service, prisma, tx, timeline } = make();
    prisma.productBoost.findMany.mockResolvedValueOnce([pausedRow]);
    tx.product.findUnique.mockResolvedValue({
      boostedUntil: at(7 * 24 * HOUR),
      homeShowcaseUntil: null,
    });

    await resume(service);

    expect(timeline.lockProduct).toHaveBeenCalledWith(tx, "p1");
    expect(tx.productBoost.updateMany).toHaveBeenCalledWith({
      where: { id: "b1", status: "paused", pausedBySystem: true },
      data: expect.objectContaining({
        status: "active",
        endsAt: at(7 * 24 * HOUR + HOUR),
      }),
    });
    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: expect.objectContaining({
        boostedUntil: at(7 * 24 * HOUR + HOUR),
        rankTier: 2,
      }),
    });
  });

  it("system resume runs the remainder from now on an unboosted listing", async () => {
    const { service, prisma, tx } = make();
    prisma.productBoost.findMany.mockResolvedValueOnce([pausedRow]);
    tx.product.findUnique.mockResolvedValue({
      boostedUntil: null,
      homeShowcaseUntil: null,
    });

    await resume(service);

    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: expect.objectContaining({
        boostedUntil: at(HOUR),
        homeShowcaseUntil: null,
      }),
    });
  });

  it("system resume writes nothing when staff changed the row meanwhile", async () => {
    const { service, prisma, tx } = make();
    prisma.productBoost.findMany.mockResolvedValueOnce([pausedRow]);
    tx.product.findUnique.mockResolvedValue({
      boostedUntil: null,
      homeShowcaseUntil: null,
    });
    tx.productBoost.updateMany.mockResolvedValue({ count: 0 });

    await resume(service);

    expect(tx.product.update).not.toHaveBeenCalled();
  });
});
