import {
  BoostStatus,
  MembershipTierType,
  ProductStatus,
  SubscriptionStatus,
} from "@prisma/client";
import { BoostExpiryService, isBoostReminderDue } from "./boost-expiry.service";
import { BoostTimelineStore } from "./boost-timeline-store.service";

/**
 * Behaviour pin of the end of a listing's boosts (the expire-boosts cron, per
 * listing): the "ended" notice once per listing when its promotion really
 * ends, never per stacked boost, and the premium ending-soon reminder once per
 * end, again after the end moved later.
 */

const NOW = new Date("2026-10-21T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const at = (ms: number) => new Date(NOW.getTime() + ms);

type Boost = {
  id: string;
  productId: string;
  status: BoostStatus;
  endsAt: Date | null;
  autoRenew: boolean;
  reminderSentAt: Date | null;
  finalViewCount?: number | null;
  finalLikeCount?: number | null;
  finalClickCount?: number | null;
};

// The premium check reads the wall clock: a period end far in the future.
const PREMIUM = {
  status: SubscriptionStatus.active,
  currentPeriodEnd: new Date("2999-01-01T00:00:00.000Z"),
  tier: { type: MembershipTierType.premium, isActive: true },
};

type Where = Record<string, unknown>;

function matches(row: Record<string, unknown>, where: Where): boolean {
  return Object.entries(where).every(([key, cond]) => {
    const value = row[key];
    if (cond === null) return value == null;
    if (cond instanceof Date) {
      return value instanceof Date && value.getTime() === cond.getTime();
    }
    if (typeof cond === "object") {
      const c = cond as { in?: unknown[]; lte?: Date; gt?: Date };
      if (c.in) return c.in.includes(value);
      if (c.lte) return value instanceof Date && value <= c.lte;
      if (c.gt) return value instanceof Date && value > c.gt;
    }
    return value === cond;
  });
}

function setup(
  opts: {
    boosts?: Boost[];
    productStatus?: ProductStatus;
    membership?: typeof PREMIUM | null;
  } = {},
) {
  const boosts = new Map((opts.boosts ?? []).map((b) => [b.id, { ...b }]));
  const product = {
    id: "prod-1",
    status: opts.productStatus ?? ProductStatus.active,
    viewCount: 120,
    likeCount: 7,
    clickCount: 30,
  };
  const membership = opts.membership === undefined ? PREMIUM : opts.membership;
  const events: string[] = [];
  const of = (where: Where) =>
    [...boosts.values()].filter((b) =>
      matches(b as unknown as Record<string, unknown>, where),
    );
  const tx = {
    $queryRaw: jest.fn(async (strings: TemplateStringsArray) => {
      events.push(`lock:${strings.join("?").includes("FOR UPDATE")}`);
      return [];
    }),
    product: {
      findUnique: jest.fn(async () => {
        events.push("product.read");
        return { ...product };
      }),
    },
    productBoost: {
      findMany: jest.fn(async ({ where }: { where: Where }) => {
        events.push("boost.read");
        return of(where).map((b) => ({ id: b.id, endsAt: b.endsAt }));
      }),
      findFirst: jest.fn(async ({ where }: { where: Where }) => {
        events.push("boost.read");
        const [tail] = of(where).sort(
          (a, b) =>
            (b.endsAt?.getTime() ?? 0) - (a.endsAt?.getTime() ?? 0) ||
            b.id.localeCompare(a.id),
        );
        if (!tail) return null;
        return {
          ...tail,
          product: { status: product.status },
          user: {
            businessStatus: null,
            companyName: null,
            taxId: null,
            membership,
          },
        };
      }),
      updateMany: jest.fn(
        async ({ where, data }: { where: Where; data: Where }) => {
          const rows = of(where);
          rows.forEach((row) => Object.assign(row, data));
          return { count: rows.length };
        },
      ),
      count: jest.fn(async ({ where }: { where: Where }) => of(where).length),
    },
  };
  const outbox = { enqueue: jest.fn().mockResolvedValue(undefined) };
  const sentry = { addBreadcrumb: jest.fn(), captureMessage: jest.fn() };
  const store = new BoostTimelineStore(sentry as never, outbox as never);
  const refresh = jest
    .spyOn(store, "refreshProductPromotion")
    .mockImplementation(async () => {
      events.push("refresh");
    });
  const service = new BoostExpiryService(store);
  return { service, tx, boosts, outbox, sentry, refresh, events };
}

const boost = (over: Partial<Boost> & { id: string }): Boost => ({
  productId: "prod-1",
  status: BoostStatus.active,
  endsAt: at(3 * DAY),
  autoRenew: false,
  reminderSentAt: null,
  ...over,
});

describe("BoostExpiryService.expireEnded", () => {
  it("locks the listing before it reads the boosts", async () => {
    const { service, tx, events } = setup({
      boosts: [boost({ id: "b1", endsAt: at(-HOUR) })],
    });

    await service.expireEnded(tx as never, "prod-1", NOW);

    expect(events[0]).toBe("lock:true");
  });

  it("stacked boosts: the first ending while the second runs expires it and tells nobody", async () => {
    const { service, tx, boosts, outbox, refresh } = setup({
      boosts: [
        boost({ id: "b1", endsAt: at(-HOUR) }),
        boost({ id: "b2", endsAt: at(4 * DAY) }),
      ],
    });

    const result = await service.expireEnded(tx as never, "prod-1", NOW);

    expect(result).toEqual({ expired: 1, notice: null });
    expect(boosts.get("b1")?.status).toBe(BoostStatus.expired);
    expect(boosts.get("b2")?.status).toBe(BoostStatus.active);
    expect(outbox.enqueue).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledWith(tx, "prod-1", NOW);
  });

  it("the listing's promotion ending sends exactly one notice, keyed by the boost that ended last", async () => {
    // Both stacked boosts ran out between two runs (the cron was down): one
    // listing, one notice.
    const { service, tx, boosts, outbox } = setup({
      boosts: [
        boost({ id: "b1", endsAt: at(-5 * HOUR) }),
        boost({ id: "b2", endsAt: at(-HOUR) }),
      ],
    });

    const result = await service.expireEnded(tx as never, "prod-1", NOW);

    expect(result).toEqual({
      expired: 2,
      notice: { boostId: "b2", kind: "expired" },
    });
    expect([...boosts.values()].map((b) => b.status)).toEqual([
      BoostStatus.expired,
      BoostStatus.expired,
    ]);
    expect(outbox.enqueue).toHaveBeenCalledTimes(1);
    expect(outbox.enqueue).toHaveBeenCalledWith(tx, {
      type: "boost.notice",
      payload: { boostId: "b2", kind: "expired" },
      dedupeKey: "boost.notice:expired:b2",
    });
  });

  it("a later run after the second boost ends sends the one notice then", async () => {
    const { service, tx, boosts, outbox } = setup({
      boosts: [
        boost({ id: "b1", endsAt: at(-HOUR) }),
        boost({ id: "b2", endsAt: at(4 * DAY) }),
      ],
    });
    await service.expireEnded(tx as never, "prod-1", NOW);

    const later = at(5 * DAY);
    const result = await service.expireEnded(tx as never, "prod-1", later);

    expect(result.notice).toEqual({ boostId: "b2", kind: "expired" });
    expect(boosts.get("b2")?.status).toBe(BoostStatus.expired);
    expect(outbox.enqueue).toHaveBeenCalledTimes(1);
  });

  it("keeps the listing's final counters on the ended boosts (performance view)", async () => {
    const { service, tx, boosts } = setup({
      boosts: [boost({ id: "b1", endsAt: at(-HOUR) })],
    });

    await service.expireEnded(tx as never, "prod-1", NOW);

    expect(boosts.get("b1")).toMatchObject({
      finalViewCount: 120,
      finalLikeCount: 7,
      finalClickCount: 30,
    });
  });

  it("a listing with nothing ended only has its promotion rebuilt (stale columns), no notice", async () => {
    const { service, tx, refresh, outbox } = setup({
      boosts: [boost({ id: "b1", endsAt: at(DAY) })],
    });

    await expect(
      service.expireEnded(tx as never, "prod-1", NOW),
    ).resolves.toEqual({ expired: 0, notice: null });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it("a rerun after the expiry changes nothing and sends nothing again", async () => {
    const { service, tx, outbox } = setup({
      boosts: [boost({ id: "b1", endsAt: at(-HOUR) })],
    });
    await service.expireEnded(tx as never, "prod-1", NOW);

    await expect(
      service.expireEnded(tx as never, "prod-1", NOW),
    ).resolves.toEqual({ expired: 0, notice: null });
    expect(outbox.enqueue).toHaveBeenCalledTimes(1);
  });

  it("never touches paused, cancelled or pending boosts", async () => {
    const { service, tx, boosts } = setup({
      boosts: [
        boost({ id: "p", status: BoostStatus.paused, endsAt: at(-HOUR) }),
        boost({ id: "c", status: BoostStatus.cancelled, endsAt: at(-HOUR) }),
        boost({ id: "n", status: BoostStatus.pending, endsAt: null }),
      ],
    });

    await expect(
      service.expireEnded(tx as never, "prod-1", NOW),
    ).resolves.toEqual({ expired: 0, notice: null });
    expect([...boosts.values()].map((b) => b.status)).toEqual([
      BoostStatus.paused,
      BoostStatus.cancelled,
      BoostStatus.pending,
    ]);
  });
});

describe("isBoostReminderDue", () => {
  const tail = (over: Partial<Parameters<typeof isBoostReminderDue>[0]>) => ({
    endsAt: at(10 * HOUR),
    autoRenew: true,
    reminderSentAt: null,
    ...over,
  });

  it.each([
    ["within 24 h, asked for, never sent", tail({}), true],
    ["exactly 24 h before the end", tail({ endsAt: at(24 * HOUR) }), true],
    ["more than 24 h before the end", tail({ endsAt: at(25 * HOUR) }), false],
    ["the seller did not ask", tail({ autoRenew: false }), false],
    ["already ended", tail({ endsAt: NOW }), false],
    [
      "sent for this end already",
      tail({ reminderSentAt: at(-13 * HOUR) }),
      false,
    ],
    [
      "sent for an earlier end (the end moved later since)",
      tail({ endsAt: at(10 * HOUR), reminderSentAt: at(-15 * HOUR) }),
      true,
    ],
  ])("%s", (_name, input, expected) => {
    expect(isBoostReminderDue(input, NOW)).toBe(expected);
  });
});

describe("BoostExpiryService.remindEndingSoon", () => {
  it("claims the tail with a stamp and queues one notice keyed by it", async () => {
    const { service, tx, boosts, outbox, events } = setup({
      boosts: [boost({ id: "b1", endsAt: at(10 * HOUR), autoRenew: true })],
    });

    const notice = await service.remindEndingSoon(tx as never, "prod-1", NOW);

    expect(events[0]).toBe("lock:true");
    expect(notice).toEqual({
      boostId: "b1",
      kind: "ending_soon",
      at: NOW.toISOString(),
    });
    expect(boosts.get("b1")?.reminderSentAt).toEqual(NOW);
    expect(outbox.enqueue).toHaveBeenCalledWith(tx, {
      type: "boost.notice",
      payload: notice,
      dedupeKey: `boost.notice:ending_soon:b1:${NOW.toISOString()}`,
    });
    // CAS on the stamp it read: a concurrent run that claimed first wins.
    expect(tx.productBoost.updateMany).toHaveBeenCalledWith({
      where: { id: "b1", reminderSentAt: null },
      data: { reminderSentAt: NOW },
    });
  });

  it("is not repeated on later cron runs for the same end", async () => {
    const { service, tx, outbox } = setup({
      boosts: [boost({ id: "b1", endsAt: at(10 * HOUR), autoRenew: true })],
    });
    await service.remindEndingSoon(tx as never, "prod-1", NOW);

    for (const later of [at(15 * 60 * 1000), at(5 * HOUR), at(9 * HOUR)]) {
      await expect(
        service.remindEndingSoon(tx as never, "prod-1", later),
      ).resolves.toBeNull();
    }
    expect(outbox.enqueue).toHaveBeenCalledTimes(1);
  });

  it("re-arms after an extension: the seller bought more time (a new tail row)", async () => {
    const { service, tx, boosts, outbox } = setup({
      boosts: [boost({ id: "b1", endsAt: at(10 * HOUR), autoRenew: true })],
    });
    await service.remindEndingSoon(tx as never, "prod-1", NOW);
    // A stacked purchase with the reminder on: it ends 7 days after b1.
    boosts.set(
      "b2",
      boost({ id: "b2", endsAt: at(10 * HOUR + 7 * DAY), autoRenew: true }),
    );

    // Not before 24 h ahead of the new end...
    await expect(
      service.remindEndingSoon(tx as never, "prod-1", at(5 * DAY)),
    ).resolves.toBeNull();
    // ...then exactly once.
    const reminder = at(10 * HOUR + 6 * DAY + HOUR);
    await expect(
      service.remindEndingSoon(tx as never, "prod-1", reminder),
    ).resolves.toEqual({
      boostId: "b2",
      kind: "ending_soon",
      at: reminder.toISOString(),
    });
    await expect(
      service.remindEndingSoon(
        tx as never,
        "prod-1",
        at(10 * HOUR + 7 * DAY - HOUR),
      ),
    ).resolves.toBeNull();
    expect(outbox.enqueue).toHaveBeenCalledTimes(2);
  });

  it("re-arms after a staff extension of the same boost (its end moved later)", async () => {
    const { service, tx, boosts, outbox } = setup({
      boosts: [boost({ id: "b1", endsAt: at(10 * HOUR), autoRenew: true })],
    });
    await service.remindEndingSoon(tx as never, "prod-1", NOW);
    const extended = boosts.get("b1") as Boost;
    extended.endsAt = at(10 * HOUR + 3 * DAY);

    const reminder = at(10 * HOUR + 2 * DAY + HOUR);
    const notice = await service.remindEndingSoon(
      tx as never,
      "prod-1",
      reminder,
    );

    expect(notice).toEqual({
      boostId: "b1",
      kind: "ending_soon",
      at: reminder.toISOString(),
    });
    // Its own outbox row: the first reminder's row would dedupe it away.
    expect(outbox.enqueue.mock.calls.map(([, row]) => row.dedupeKey)).toEqual([
      `boost.notice:ending_soon:b1:${NOW.toISOString()}`,
      `boost.notice:ending_soon:b1:${reminder.toISOString()}`,
    ]);
  });

  it("reminds about the listing's end: an earlier stacked boost is never the one", async () => {
    // b1 ends within 24 h, but the listing stays featured with b2 after it.
    const { service, tx, outbox } = setup({
      boosts: [
        boost({ id: "b1", endsAt: at(10 * HOUR), autoRenew: true }),
        boost({ id: "b2", endsAt: at(10 * HOUR + 7 * DAY), autoRenew: true }),
      ],
    });

    await expect(
      service.remindEndingSoon(tx as never, "prod-1", NOW),
    ).resolves.toBeNull();
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it.each([
    [
      "the reminder is off",
      { boosts: [boost({ id: "b1", endsAt: at(10 * HOUR) })] },
    ],
    [
      "the seller is no longer premium",
      {
        boosts: [boost({ id: "b1", endsAt: at(10 * HOUR), autoRenew: true })],
        membership: null,
      },
    ],
    [
      "the listing is not live",
      {
        boosts: [boost({ id: "b1", endsAt: at(10 * HOUR), autoRenew: true })],
        productStatus: ProductStatus.inactive,
      },
    ],
    ["the listing has no running boost", { boosts: [] }],
  ])("sends nothing when %s", async (_name, opts) => {
    const { service, tx, outbox, boosts } = setup(opts);

    await expect(
      service.remindEndingSoon(tx as never, "prod-1", NOW),
    ).resolves.toBeNull();
    expect(outbox.enqueue).not.toHaveBeenCalled();
    expect([...boosts.values()].every((b) => b.reminderSentAt === null)).toBe(
      true,
    );
  });

  it("a lost claim (another run stamped first) sends nothing", async () => {
    const { service, tx, outbox } = setup({
      boosts: [boost({ id: "b1", endsAt: at(10 * HOUR), autoRenew: true })],
    });
    tx.productBoost.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.remindEndingSoon(tx as never, "prod-1", NOW),
    ).resolves.toBeNull();
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });
});
