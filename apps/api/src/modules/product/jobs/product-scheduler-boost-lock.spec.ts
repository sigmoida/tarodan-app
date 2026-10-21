import { ProductSchedulerService } from "./product-scheduler.service";

/**
 * The expire-boosts cron changes a listing's boost timeline only through
 * BoostTimelineService, one transaction per listing under its lock, so a boost
 * activated while the cron runs is never overwritten (a downgrade wiping a
 * fresh boost, a system resume replacing a fresh boost's end with the paused
 * remainder) and stacked boosts keep their own time across a system pause.
 * The expiry and reminder notices are queued by the timeline with the change
 * and sent by the cron right after each commit.
 */
describe("ProductSchedulerService expire-boosts under the listing lock", () => {
  const NOW = new Date("2026-10-21T12:00:00.000Z");
  const HOUR = 60 * 60 * 1000;

  const make = () => {
    // Passed through to the timeline untouched; the cron never writes on it.
    const tx = { marker: "tx" };
    const prisma = {
      $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
      $queryRaw: jest.fn().mockResolvedValue([]),
      product: { findMany: jest.fn().mockResolvedValue([]) },
      productBoost: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const timeline = {
      lockProduct: jest.fn().mockResolvedValue(undefined),
      refreshProductPromotion: jest.fn().mockResolvedValue(undefined),
      expireEnded: jest.fn().mockResolvedValue({ expired: 0, notice: null }),
      remindEndingSoon: jest.fn().mockResolvedValue(null),
      pauseForDelisting: jest.fn().mockResolvedValue(0),
      resumeSystemPaused: jest.fn().mockResolvedValue(0),
    };
    const notices = { flush: jest.fn().mockResolvedValue(undefined) };
    const service = new ProductSchedulerService(
      prisma as never,
      {} as never, // notifications
      {} as never, // scheduled queue
      {} as never, // cache
      {} as never, // search
      {} as never, // seller trust
      timeline as never,
      notices as never,
    );
    return { service, prisma, tx, timeline, notices };
  };

  describe("expiry", () => {
    it("runs per listing through the timeline, one transaction each, ended boosts and stale promotions alike", async () => {
      const { service, prisma, tx, timeline } = make();
      // Listings with an ended active boost...
      prisma.productBoost.findMany.mockResolvedValueOnce([
        { productId: "p2" },
        { productId: "p3" },
      ]);
      // ...and listings whose promotion columns outlived their boosts.
      prisma.product.findMany.mockResolvedValueOnce([
        { id: "p1" },
        { id: "p2" },
      ]);

      await service.runExpireBoosts();

      expect(timeline.expireEnded.mock.calls).toEqual([
        [tx, "p2", expect.any(Date)],
        [tx, "p3", expect.any(Date)],
        [tx, "p1", expect.any(Date)],
      ]);
      expect(prisma.$transaction).toHaveBeenCalledTimes(3);
      // The cron never rewrites the promotion columns itself.
      expect(timeline.refreshProductPromotion).not.toHaveBeenCalled();
    });

    it("reads bounded, ordered candidates: ended active boosts and ended promotions", async () => {
      const { service, prisma } = make();

      await service.runExpireBoosts();

      const [endedQuery] = prisma.productBoost.findMany.mock.calls[0] as [
        { where: { endsAt: { lte: Date } } },
      ];
      expect(endedQuery).toEqual({
        where: { status: "active", endsAt: { lte: expect.any(Date) } },
        select: { productId: true },
        distinct: ["productId"],
        orderBy: { productId: "asc" },
        take: 500,
      });
      expect(prisma.product.findMany).toHaveBeenCalledWith({
        where: {
          boostedAt: { not: null },
          boostedUntil: { lt: expect.any(Date) },
        },
        select: { id: true },
        orderBy: { id: "asc" },
        take: 500,
      });
    });

    it("sends each queued 'ended' notice after its commit, and nothing for a listing still featured", async () => {
      const { service, prisma, timeline, notices } = make();
      prisma.productBoost.findMany.mockResolvedValueOnce([
        { productId: "p1" },
        { productId: "p2" },
      ]);
      timeline.expireEnded
        .mockResolvedValueOnce({
          expired: 1,
          notice: { boostId: "b1", kind: "expired" },
        })
        // p2: the first of two stacked boosts ended, the second still runs.
        .mockResolvedValueOnce({ expired: 1, notice: null });

      const result = await service.runExpireBoosts();

      expect(notices.flush).toHaveBeenCalledTimes(1);
      expect(notices.flush).toHaveBeenCalledWith({
        boostId: "b1",
        kind: "expired",
      });
      expect(result.stats).toMatchObject({
        downgraded: 2,
        expired: 2,
        endedNotices: 1,
      });
    });

    it("one listing that fails never stops the others, and its notice is not sent", async () => {
      const { service, prisma, timeline, notices } = make();
      prisma.productBoost.findMany.mockResolvedValueOnce([
        { productId: "p1" },
        { productId: "p2" },
      ]);
      timeline.expireEnded
        .mockRejectedValueOnce(new Error("lock timeout"))
        .mockResolvedValueOnce({
          expired: 1,
          notice: { boostId: "b2", kind: "expired" },
        });

      await expect(service.runExpireBoosts()).resolves.toBeDefined();

      expect(timeline.expireEnded).toHaveBeenCalledTimes(2);
      expect(notices.flush).toHaveBeenCalledTimes(1);
      expect(notices.flush).toHaveBeenCalledWith({
        boostId: "b2",
        kind: "expired",
      });
    });
  });

  describe("ending-soon reminder", () => {
    const sqlOf = (prisma: ReturnType<typeof make>["prisma"]) => {
      const [strings, ...values] = prisma.$queryRaw.mock.calls[0] as [
        TemplateStringsArray,
        ...unknown[],
      ];
      return { sql: strings.join("?").replace(/\s+/g, " "), values };
    };

    it("claims each candidate listing through the timeline and sends the queued notice", async () => {
      const { service, prisma, tx, timeline, notices } = make();
      prisma.$queryRaw.mockResolvedValueOnce([
        { productId: "p1" },
        { productId: "p2" },
      ]);
      const notice = {
        boostId: "b1",
        kind: "ending_soon",
        at: "2026-10-21T12:00:00.000Z",
      };
      timeline.remindEndingSoon
        .mockResolvedValueOnce(notice)
        // p2: claimed meanwhile by another run (or no longer due).
        .mockResolvedValueOnce(null);

      const result = await service.runExpireBoosts();

      expect(timeline.remindEndingSoon.mock.calls).toEqual([
        [tx, "p1", expect.any(Date)],
        [tx, "p2", expect.any(Date)],
      ]);
      expect(notices.flush).toHaveBeenCalledWith(notice);
      expect(notices.flush).toHaveBeenCalledTimes(1);
      expect(result.stats).toMatchObject({ reminded: 1 });
    });

    it("selects only due tails of live listings that asked for it, bounded and ordered", async () => {
      // Reminded tails and earlier stacked boosts are never candidates, so
      // they cannot crowd out the batch for up to a day.
      const { service, prisma } = make();

      await service.runExpireBoosts();

      const { sql, values } = sqlOf(prisma);
      // The reminder is the listing's: any running or paused boost asked.
      expect(sql).toMatch(
        /AND EXISTS \( SELECT 1 FROM "product_boosts" asked WHERE asked\."product_id" = b\."product_id" AND asked\."status" IN \(\?::"BoostStatus", \?::"BoostStatus"\) AND asked\."auto_renew" = true \)/,
      );
      expect(sql).toContain(
        'b."reminder_sent_at" IS NULL OR b."reminder_sent_at" < b."ends_at" - make_interval(mins => ?::int)',
      );
      expect(sql).toContain('p."status" = ?::"ProductStatus"');
      expect(sql).toMatch(
        /NOT EXISTS \( SELECT 1 FROM "product_boosts" later WHERE later\."product_id" = b\."product_id" AND later\."status" = \?::"BoostStatus" AND later\."ends_at" > b\."ends_at" \)/,
      );
      expect(sql).toContain(
        'ORDER BY b."ends_at" ASC, b."product_id" ASC LIMIT ?',
      );
      const [status, now, horizon, leadMinutes, productStatus] = values as [
        string,
        Date,
        Date,
        number,
        string,
      ];
      expect(status).toBe("active");
      expect(horizon.getTime() - now.getTime()).toBe(24 * HOUR);
      expect(leadMinutes).toBe(24 * 60);
      expect(productStatus).toBe("active");
      expect(values[values.length - 1]).toBe(500);
    });
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

  it("never writes boost rows itself except failing stale pending ones", async () => {
    // Expiry goes through the timeline; a late-paid boost still pending
    // within a day is left alone, and nothing ever moves a failed boost.
    const { service, prisma } = make();

    await service.runExpireBoosts();

    const updates = prisma.productBoost.updateMany.mock.calls.map(
      ([arg]: [{ where: Record<string, unknown>; data: unknown }]) => arg,
    );
    expect(updates).toEqual([
      {
        where: { status: "pending", createdAt: { lt: expect.any(Date) } },
        data: { status: "failed" },
      },
    ]);
    const [endedQuery] = prisma.productBoost.findMany.mock.calls[0] as [
      { where: { endsAt: { lte: Date } } },
    ];
    const failBefore = updates[0].where.createdAt as { lt: Date };
    expect(
      endedQuery.where.endsAt.lte.getTime() - failBefore.lt.getTime(),
    ).toBe(24 * HOUR);
  });
});
