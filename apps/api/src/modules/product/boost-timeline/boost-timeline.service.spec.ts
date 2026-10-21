import {
  BoostStatus,
  MembershipTierType,
  Prisma,
  SubscriptionStatus,
} from "@prisma/client";
import { BoostTimelineService } from "./boost-timeline.service";
import { BoostTimelineStore } from "./boost-timeline-store.service";
import { BoostActivationService } from "./boost-activation.service";
import { BoostStaffTimelineService } from "./boost-staff-timeline.service";
import { BoostSystemPauseService } from "./boost-system-pause.service";
import {
  RELEVANCE_BOOST_BONUS,
  RELEVANCE_PREMIUM_BONUS,
  RELEVANCE_QUALITY_WEIGHT,
} from "../helpers/relevance-score";

/**
 * Behaviour pin of the listing boost timeline. The logic moved here from
 * payment fulfilment (`applyBoostInTx`) and the admin boost screen
 * (`refreshProductPromotion`); these cases fix what it did there.
 *
 * The fake transaction keeps products and boosts in memory and yields between
 * operations, like a database round trip, so the concurrency cases below can
 * interleave two transactions.
 */

const NOW = new Date("2026-10-21T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const at = (ms: number) => new Date(NOW.getTime() + ms);

type BoostRow = {
  id: string;
  productId: string;
  userId?: string;
  orderId?: string | null;
  pausedBySystem?: boolean;
  durationDays: number;
  showcaseOnHome: boolean;
  status: BoostStatus;
  startsAt: Date | null;
  endsAt: Date | null;
  showcaseEndsAt: Date | null;
  purchasedAt: Date | null;
  pausedAt: Date | null;
  pausedRemainingSeconds: number | null;
  pausedShowcaseSeconds: number | null;
  extendedDays: number;
  source?: string;
  price?: number;
  packageId?: string | null;
  packageName?: string | null;
  grantedById?: string | null;
  grantReason?: string | null;
  cancelledAt?: Date | null;
  cancelledById?: string | null;
  cancelReason?: string | null;
  refundedAmount?: Prisma.Decimal | null;
  baselineViewCount: number | null;
  baselineLikeCount: number | null;
  baselineClickCount: number | null;
};

type ProductRow = {
  id: string;
  kind: string;
  status: string;
  sellerId: string;
  boostedUntil: Date | null;
  boostedAt: Date | null;
  homeShowcaseUntil: Date | null;
  rankTier: number;
  relevanceScore: number;
  qualityScore: number;
  popularityScore: number;
  viewCount: number;
  likeCount: number;
  clickCount: number;
  seller: {
    businessStatus: null;
    companyName: null;
    taxId: null;
    membership: {
      status: SubscriptionStatus;
      currentPeriodEnd: Date;
      tier: { type: MembershipTierType; isActive: boolean };
    } | null;
  };
};

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

/** A boost row copy (shallow: dates and decimals are never mutated in place). */
const copy = <T extends object>(row: T): T => ({ ...row });

type Where = Record<string, unknown>;

function matches(row: Record<string, unknown>, where: Where): boolean {
  return Object.entries(where).every(([key, cond]) => {
    const value = row[key];
    if (cond && typeof cond === "object" && !(cond instanceof Date)) {
      const c = cond as { not?: unknown; gt?: Date; in?: unknown[] };
      if ("not" in c && value === c.not) return false;
      if (c.gt !== undefined && !(value instanceof Date && value > c.gt))
        return false;
      if (c.in !== undefined && !c.in.includes(value)) return false;
      return true;
    }
    return value === cond;
  });
}

function applyData<T extends Record<string, unknown>>(row: T, data: Where) {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === "object" && "increment" in value) {
      (row as Record<string, unknown>)[key] =
        ((row[key] as number) ?? 0) +
        (value as { increment: number }).increment;
    } else {
      (row as Record<string, unknown>)[key] = value;
    }
  }
}

/** In-memory products + boosts with row locks that block like Postgres. */
function fakeDb() {
  const products = new Map<string, ProductRow>();
  const boosts = new Map<string, BoostRow>();
  const lockOwner = new Map<string, number>();
  const lockWaiters = new Map<string, Array<() => void>>();
  const lockSql: string[] = [];
  /** Order of the reads and locks, to prove the lock comes first. */
  const events: string[] = [];
  let nextTx = 1;

  const acquire = async (productId: string, txId: number) => {
    while (lockOwner.has(productId) && lockOwner.get(productId) !== txId) {
      await new Promise<void>((resolve) => {
        const queue = lockWaiters.get(productId) ?? [];
        queue.push(resolve);
        lockWaiters.set(productId, queue);
      });
    }
    lockOwner.set(productId, txId);
  };
  const releaseAll = (txId: number) => {
    for (const [productId, owner] of [...lockOwner]) {
      if (owner !== txId) continue;
      lockOwner.delete(productId);
      lockWaiters.get(productId)?.shift()?.();
    }
  };

  const makeTx = (txId: number) => ({
    $queryRaw: jest.fn(
      async (strings: TemplateStringsArray, ...values: unknown[]) => {
        await tick();
        const sql = strings.join("?");
        lockSql.push(sql.replace(/\s+/g, " ").trim());
        events.push(`lock:${String(values[0])}`);
        if (/FOR UPDATE/i.test(sql)) await acquire(String(values[0]), txId);
        return [];
      },
    ),
    product: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        await tick();
        events.push("product.read");
        const row = products.get(where.id);
        return row ? structuredClone(row) : null;
      }),
      update: jest.fn(
        async ({ where, data }: { where: { id: string }; data: Where }) => {
          await tick();
          const row = products.get(where.id);
          if (!row) throw new Error(`no product ${where.id}`);
          applyData(row, data);
          return structuredClone(row);
        },
      ),
      updateMany: jest.fn(
        async ({ where, data }: { where: Where; data: Where }) => {
          await tick();
          const rows = [...products.values()].filter((p) =>
            matches(p as unknown as Record<string, unknown>, where),
          );
          rows.forEach((row) => applyData(row, data));
          return { count: rows.length };
        },
      ),
    },
    productBoost: {
      findUnique: jest.fn(
        async ({ where }: { where: { id?: string; orderId?: string } }) => {
          await tick();
          events.push("boost.read");
          const row = where.id
            ? boosts.get(where.id)
            : [...boosts.values()].find((b) => b.orderId === where.orderId);
          return row ? copy(row) : null;
        },
      ),
      findFirst: jest.fn(
        async ({
          where,
          orderBy,
        }: {
          where: Where;
          orderBy?: { endsAt: "desc" };
        }) => {
          await tick();
          const rows = [...boosts.values()].filter((b) => matches(b, where));
          if (orderBy) {
            rows.sort(
              (a, b) => (b.endsAt?.getTime() ?? 0) - (a.endsAt?.getTime() ?? 0),
            );
          }
          return rows[0] ? copy(rows[0]) : null;
        },
      ),
      findMany: jest.fn(
        async ({
          where,
          orderBy,
        }: {
          where: Where;
          orderBy?: { endsAt: "desc" };
        }) => {
          await tick();
          const rows = [...boosts.values()].filter((b) => matches(b, where));
          if (orderBy) {
            rows.sort(
              (a, b) => (b.endsAt?.getTime() ?? 0) - (a.endsAt?.getTime() ?? 0),
            );
          }
          return rows.map((r) => copy(r));
        },
      ),
      update: jest.fn(
        async ({ where, data }: { where: { id: string }; data: Where }) => {
          await tick();
          const row = boosts.get(where.id);
          if (!row) throw new Error(`no boost ${where.id}`);
          applyData(row, data);
          return copy(row);
        },
      ),
      updateMany: jest.fn(
        async ({ where, data }: { where: Where; data: Where }) => {
          await tick();
          const rows = [...boosts.values()].filter((b) => matches(b, where));
          rows.forEach((row) => applyData(row, data));
          return { count: rows.length };
        },
      ),
      create: jest.fn(async ({ data }: { data: Partial<BoostRow> }) => {
        await tick();
        const row = boostRow({ id: `boost-${boosts.size + 1}`, ...data });
        boosts.set(row.id, row);
        return copy(row);
      }),
    },
  });

  return {
    products,
    boosts,
    lockSql,
    events,
    makeTx,
    /** Runs `fn` as one transaction: its row locks are held until it ends. */
    async transaction<T>(
      fn: (tx: Prisma.TransactionClient) => Promise<T>,
    ): Promise<T> {
      const txId = nextTx++;
      try {
        return await fn(makeTx(txId) as unknown as Prisma.TransactionClient);
      } finally {
        releaseAll(txId);
      }
    },
  };
}

function productRow(over: Partial<ProductRow> = {}): ProductRow {
  return {
    id: "prod-1",
    kind: "listing",
    status: "active",
    sellerId: "seller-1",
    boostedUntil: null,
    boostedAt: null,
    homeShowcaseUntil: null,
    rankTier: 0,
    relevanceScore: 0,
    qualityScore: 40,
    popularityScore: 7,
    viewCount: 100,
    likeCount: 5,
    clickCount: 9,
    seller: {
      businessStatus: null,
      companyName: null,
      taxId: null,
      membership: null,
    },
    ...over,
  };
}

function boostRow(over: Partial<BoostRow> = {}): BoostRow {
  return {
    id: "boost-1",
    productId: "prod-1",
    durationDays: 7,
    showcaseOnHome: false,
    status: BoostStatus.pending,
    startsAt: null,
    endsAt: null,
    showcaseEndsAt: null,
    purchasedAt: null,
    pausedAt: null,
    pausedRemainingSeconds: null,
    pausedShowcaseSeconds: null,
    extendedDays: 0,
    baselineViewCount: null,
    baselineLikeCount: null,
    baselineClickCount: null,
    ...over,
  };
}

const premiumMembership = {
  status: SubscriptionStatus.active,
  currentPeriodEnd: at(30 * DAY),
  tier: { type: MembershipTierType.premium, isActive: true },
};

const boostRelevance = (p: ProductRow) =>
  RELEVANCE_BOOST_BONUS +
  p.qualityScore * RELEVANCE_QUALITY_WEIGHT +
  p.popularityScore;

/** The facade over its slices, as the module wires it. */
function makeTimeline(outbox?: { enqueue: jest.Mock }) {
  const store = new BoostTimelineStore(undefined, outbox as never);
  const timeline = new BoostTimelineService(
    store,
    new BoostActivationService(store),
    new BoostStaffTimelineService(store),
    new BoostSystemPauseService(store),
  );
  return { timeline, store };
}

describe("BoostTimelineService", () => {
  const service = makeTimeline().timeline;

  function setup(product: ProductRow, ...rows: BoostRow[]) {
    const db = fakeDb();
    db.products.set(product.id, product);
    rows.forEach((r) => db.boosts.set(r.id, r));
    return db;
  }

  describe("activate", () => {
    it("starts an unboosted listing's boost now and promotes it", async () => {
      const product = productRow();
      const db = setup(product, boostRow());

      const result = await db.transaction((tx) =>
        service.activate(tx, "boost-1", NOW),
      );

      expect(result).toEqual({ productId: "prod-1", endsAt: at(7 * DAY) });
      expect(db.boosts.get("boost-1")).toMatchObject({
        status: BoostStatus.active,
        startsAt: NOW,
        endsAt: at(7 * DAY),
        purchasedAt: NOW,
        baselineViewCount: 100,
        baselineLikeCount: 5,
        baselineClickCount: 9,
      });
      expect(db.products.get("prod-1")).toMatchObject({
        boostedUntil: at(7 * DAY),
        boostedAt: NOW,
        homeShowcaseUntil: null,
        rankTier: 2,
        relevanceScore: boostRelevance(product),
      });
    });

    it("stacks on the listing's running boost", async () => {
      const db = setup(
        productRow({ boostedUntil: at(5 * DAY), rankTier: 2 }),
        boostRow({ durationDays: 3 }),
      );

      await db.transaction((tx) => service.activate(tx, "boost-1", NOW));

      expect(db.boosts.get("boost-1")?.endsAt).toEqual(at(8 * DAY));
      expect(db.products.get("prod-1")?.boostedUntil).toEqual(at(8 * DAY));
    });

    it("starts from now when the old boost already ended", async () => {
      const db = setup(productRow({ boostedUntil: at(-HOUR) }), boostRow());

      await db.transaction((tx) => service.activate(tx, "boost-1", NOW));

      expect(db.products.get("prod-1")?.boostedUntil).toEqual(at(7 * DAY));
    });

    it("adds only a showcase package's own days to the showcase window", async () => {
      // 30 days of search priority left and 2 days of showcase: a 3-day
      // showcase package stacks behind the 30 days for search, but the
      // showcase gets 3 more days, not 33.
      const db = setup(
        productRow({
          boostedUntil: at(30 * DAY),
          homeShowcaseUntil: at(2 * DAY),
        }),
        boostRow({ durationDays: 3, showcaseOnHome: true }),
      );

      await db.transaction((tx) => service.activate(tx, "boost-1", NOW));

      expect(db.products.get("prod-1")).toMatchObject({
        boostedUntil: at(33 * DAY),
        homeShowcaseUntil: at(5 * DAY),
      });
    });

    it("leaves the showcase window alone for a search-only package", async () => {
      const db = setup(
        productRow({ homeShowcaseUntil: at(2 * DAY) }),
        boostRow({ showcaseOnHome: false }),
      );

      await db.transaction((tx) => service.activate(tx, "boost-1", NOW));

      expect(db.products.get("prod-1")?.homeShowcaseUntil).toEqual(at(2 * DAY));
    });

    it("returns null and writes nothing for an unknown boost", async () => {
      const db = setup(productRow());

      const result = await db.transaction((tx) =>
        service.activate(tx, "missing", NOW),
      );

      expect(result).toBeNull();
      expect(db.products.get("prod-1")?.rankTier).toBe(0);
    });
  });

  describe("pause", () => {
    it("keeps the remaining seconds and takes the promotion off", async () => {
      const db = setup(
        productRow({
          boostedUntil: at(2 * HOUR),
          boostedAt: at(-DAY),
          rankTier: 2,
        }),
        boostRow({
          status: BoostStatus.active,
          endsAt: at(2 * HOUR),
          purchasedAt: at(-DAY),
        }),
      );

      await db.transaction((tx) => service.pause(tx, "boost-1", NOW));

      expect(db.boosts.get("boost-1")).toMatchObject({
        status: BoostStatus.paused,
        pausedAt: NOW,
        pausedRemainingSeconds: 7200,
      });
      expect(db.products.get("prod-1")).toMatchObject({
        boostedUntil: null,
        boostedAt: null,
        homeShowcaseUntil: null,
        rankTier: 0,
      });
    });

    it("keeps at least one second for a boost about to end", async () => {
      const db = setup(
        productRow(),
        boostRow({ status: BoostStatus.active, endsAt: at(10) }),
      );

      await db.transaction((tx) => service.pause(tx, "boost-1", NOW));

      expect(db.boosts.get("boost-1")?.pausedRemainingSeconds).toBe(1);
    });

    it.each([
      ["a paused boost", { status: BoostStatus.paused, endsAt: at(DAY) }],
      ["an ended boost", { status: BoostStatus.active, endsAt: at(-1) }],
      ["a pending boost", { status: BoostStatus.pending }],
    ])("refuses %s", async (_label, over) => {
      const db = setup(productRow(), boostRow(over));

      await expect(
        db.transaction((tx) => service.pause(tx, "boost-1", NOW)),
      ).rejects.toMatchObject({
        response: { i18nKey: "server.admin.adPackage.pauseActiveOnly" },
      });
    });

    it("refuses an unknown boost", async () => {
      const db = setup(productRow());
      await expect(
        db.transaction((tx) => service.pause(tx, "missing", NOW)),
      ).rejects.toMatchObject({
        response: { i18nKey: "server.admin.adPackage.pauseActiveOnly" },
      });
    });
  });

  describe("resume", () => {
    it("runs the remaining time after the listing's latest other boost", async () => {
      const db = setup(
        productRow({ boostedUntil: at(DAY) }),
        boostRow({
          status: BoostStatus.paused,
          pausedAt: at(-HOUR),
          pausedRemainingSeconds: 3600,
          purchasedAt: at(-2 * DAY),
        }),
        boostRow({
          id: "boost-2",
          status: BoostStatus.active,
          endsAt: at(DAY),
          purchasedAt: at(-DAY),
        }),
      );

      await db.transaction((tx) => service.resume(tx, "boost-1", NOW));

      expect(db.boosts.get("boost-1")).toMatchObject({
        status: BoostStatus.active,
        endsAt: at(DAY + HOUR),
        pausedAt: null,
        pausedRemainingSeconds: null,
      });
      expect(db.products.get("prod-1")).toMatchObject({
        boostedUntil: at(DAY + HOUR),
        // the latest activation stays the LIFO key
        boostedAt: at(-DAY),
        rankTier: 2,
      });
    });

    it("runs the remaining time from now without another boost", async () => {
      const db = setup(
        productRow(),
        boostRow({ status: BoostStatus.paused, pausedRemainingSeconds: 3600 }),
      );

      await db.transaction((tx) => service.resume(tx, "boost-1", NOW));

      expect(db.boosts.get("boost-1")?.endsAt).toEqual(at(HOUR));
    });

    it("refuses a boost that is not paused", async () => {
      const db = setup(
        productRow(),
        boostRow({ status: BoostStatus.active, endsAt: at(DAY) }),
      );
      await expect(
        db.transaction((tx) => service.resume(tx, "boost-1", NOW)),
      ).rejects.toMatchObject({
        response: { i18nKey: "server.admin.adPackage.resumePausedOnly" },
      });
    });
  });

  describe("extend", () => {
    it("adds whole days to an active boost's end", async () => {
      const db = setup(
        productRow({ boostedUntil: at(DAY) }),
        boostRow({
          status: BoostStatus.active,
          endsAt: at(DAY),
          purchasedAt: at(-DAY),
          extendedDays: 1,
        }),
      );

      await db.transaction((tx) => service.extend(tx, "boost-1", 2, NOW));

      expect(db.boosts.get("boost-1")).toMatchObject({
        endsAt: at(3 * DAY),
        extendedDays: 3,
      });
      expect(db.products.get("prod-1")?.boostedUntil).toEqual(at(3 * DAY));
    });

    it("extends an active boost whose end passed from now", async () => {
      const db = setup(
        productRow(),
        boostRow({ status: BoostStatus.active, endsAt: at(-HOUR) }),
      );

      await db.transaction((tx) => service.extend(tx, "boost-1", 1, NOW));

      expect(db.boosts.get("boost-1")?.endsAt).toEqual(at(DAY));
    });

    it("adds the days to a paused boost's remaining seconds", async () => {
      const db = setup(
        productRow(),
        boostRow({ status: BoostStatus.paused, pausedRemainingSeconds: 60 }),
      );

      await db.transaction((tx) => service.extend(tx, "boost-1", 2, NOW));

      expect(db.boosts.get("boost-1")).toMatchObject({
        status: BoostStatus.paused,
        pausedRemainingSeconds: 60 + 2 * 86400,
        extendedDays: 2,
      });
    });

    it.each([BoostStatus.expired, BoostStatus.cancelled, BoostStatus.pending])(
      "refuses a %s boost",
      async (status) => {
        const db = setup(productRow(), boostRow({ status }));
        await expect(
          db.transaction((tx) => service.extend(tx, "boost-1", 1, NOW)),
        ).rejects.toMatchObject({
          response: {
            i18nKey: "server.admin.adPackage.extendActiveOrPausedOnly",
          },
        });
      },
    );

    it.each([0, 366])("refuses %p days", async (days) => {
      const db = setup(
        productRow(),
        boostRow({ status: BoostStatus.active, endsAt: at(DAY) }),
      );
      await expect(
        db.transaction((tx) => service.extend(tx, "boost-1", days, NOW)),
      ).rejects.toMatchObject({
        response: { i18nKey: "server.admin.adPackage.extensionRange" },
      });
    });
  });

  describe("refreshProductPromotion", () => {
    it("drops a premium seller's listing to rank tier 1 without a boost", async () => {
      const product = productRow({
        rankTier: 2,
        boostedUntil: at(-HOUR),
        seller: { ...productRow().seller, membership: premiumMembership },
      });
      const db = setup(product);

      await db.transaction((tx) =>
        service.refreshProductPromotion(tx, "prod-1", NOW),
      );

      expect(db.products.get("prod-1")).toMatchObject({
        boostedUntil: null,
        rankTier: 1,
        relevanceScore:
          RELEVANCE_PREMIUM_BONUS +
          product.qualityScore * RELEVANCE_QUALITY_WEIGHT +
          product.popularityScore,
      });
    });

    // A 30-day search boost with a 3-day showcase boost stacked behind it: the
    // showcase boost ends its search time at +33 days but its showcase at +3.
    const stackedShowcase = (
      vitrin: Partial<BoostRow>,
      product = productRow(),
    ) =>
      setup(
        product,
        boostRow({
          id: "econ",
          status: BoostStatus.active,
          endsAt: at(30 * DAY),
          durationDays: 30,
          purchasedAt: at(-2 * DAY),
        }),
        boostRow({
          id: "vitrin",
          status: BoostStatus.active,
          showcaseOnHome: true,
          durationDays: 3,
          endsAt: at(33 * DAY),
          purchasedAt: at(-DAY),
          ...vitrin,
        }),
        boostRow({ id: "old", status: BoostStatus.expired, endsAt: at(-DAY) }),
      );

    it("takes the latest end, the latest activation and the showcase boost's own showcase end", async () => {
      const db = stackedShowcase({ showcaseEndsAt: at(3 * DAY) });

      await db.transaction((tx) =>
        service.refreshProductPromotion(tx, "prod-1", NOW),
      );

      // The showcase boost's own 3 days, not its search end (+33 days): the
      // gap LB1 pinned, where a staff action gave 30 free showcase days.
      expect(db.products.get("prod-1")).toMatchObject({
        boostedUntil: at(33 * DAY),
        boostedAt: at(-DAY),
        homeShowcaseUntil: at(3 * DAY),
        rankTier: 2,
      });
    });

    it("keeps the listing's showcase end for a row written before the column", async () => {
      const db = stackedShowcase(
        { showcaseEndsAt: null },
        productRow({ homeShowcaseUntil: at(3 * DAY) }),
      );

      await db.transaction((tx) =>
        service.refreshProductPromotion(tx, "prod-1", NOW),
      );

      expect(db.products.get("prod-1")?.homeShowcaseUntil).toEqual(at(3 * DAY));
    });

    it("ends the showcase once the showcase boost's own showcase time is over", async () => {
      const db = stackedShowcase({ showcaseEndsAt: at(-HOUR) });

      await db.transaction((tx) =>
        service.refreshProductPromotion(tx, "prod-1", NOW),
      );

      expect(db.products.get("prod-1")).toMatchObject({
        boostedUntil: at(33 * DAY),
        homeShowcaseUntil: null,
      });
    });
  });

  describe("activateForOrder", () => {
    it("activates the boost of a paid order", async () => {
      const db = setup(productRow(), boostRow({ orderId: "ord-1" }));

      const result = await db.transaction((tx) =>
        service.activateForOrder(tx, "ord-1", NOW),
      );

      expect(result).toEqual({
        found: true,
        activation: { productId: "prod-1", endsAt: at(7 * DAY) },
      });
    });

    it("tells an order without a boost from an already active boost", async () => {
      const db = setup(
        productRow(),
        boostRow({ orderId: "ord-1", status: BoostStatus.active }),
      );

      await expect(
        db.transaction((tx) => service.activateForOrder(tx, "ord-2", NOW)),
      ).resolves.toEqual({ found: false, activation: null });
      await expect(
        db.transaction((tx) => service.activateForOrder(tx, "ord-1", NOW)),
      ).resolves.toEqual({ found: true, activation: null });
    });
  });

  describe("staff pause and resume own the pause", () => {
    it("a staff pause of a boost the system paused before is never auto-resumed", async () => {
      // The system paused it once (listing offline), staff resumed it, and
      // now staff pause it on purpose: the cron must leave it paused.
      const db = setup(
        productRow(),
        boostRow({
          status: BoostStatus.active,
          endsAt: at(DAY),
          pausedBySystem: true,
        }),
      );

      await db.transaction((tx) => service.pause(tx, "boost-1", NOW));

      expect(db.boosts.get("boost-1")?.pausedBySystem).toBe(false);
    });

    it("a staff resume clears the system pause flag", async () => {
      const db = setup(
        productRow(),
        boostRow({
          status: BoostStatus.paused,
          pausedRemainingSeconds: 60,
          pausedBySystem: true,
        }),
      );

      await db.transaction((tx) => service.resume(tx, "boost-1", NOW));

      expect(db.boosts.get("boost-1")).toMatchObject({
        status: BoostStatus.active,
        pausedBySystem: false,
      });
    });
  });

  describe("activation is idempotent", () => {
    it("does not stack an already active boost a second time", async () => {
      const db = setup(
        productRow({ boostedUntil: at(7 * DAY), rankTier: 2 }),
        boostRow({ status: BoostStatus.active, endsAt: at(7 * DAY) }),
      );

      const result = await db.transaction((tx) =>
        service.activate(tx, "boost-1", NOW),
      );

      expect(result).toBeNull();
      expect(db.boosts.get("boost-1")?.endsAt).toEqual(at(7 * DAY));
      expect(db.products.get("prod-1")?.boostedUntil).toEqual(at(7 * DAY));
    });

    it.each([BoostStatus.paused, BoostStatus.expired, BoostStatus.cancelled])(
      "leaves a %s boost alone",
      async (status) => {
        const db = setup(productRow(), boostRow({ status }));

        const result = await db.transaction((tx) =>
          service.activate(tx, "boost-1", NOW),
        );

        expect(result).toBeNull();
        expect(db.boosts.get("boost-1")?.status).toBe(status);
        expect(db.products.get("prod-1")?.rankTier).toBe(0);
      },
    );

    it("activates a late payment of a boost the sweep marked failed", async () => {
      const db = setup(productRow(), boostRow({ status: BoostStatus.failed }));

      const result = await db.transaction((tx) =>
        service.activate(tx, "boost-1", NOW),
      );

      expect(result?.endsAt).toEqual(at(7 * DAY));
      expect(db.boosts.get("boost-1")?.status).toBe(BoostStatus.active);
    });
  });

  describe("listing row lock", () => {
    it("is SELECT ... FOR UPDATE on the listing row", async () => {
      const db = setup(productRow(), boostRow());

      await db.transaction((tx) => service.activate(tx, "boost-1", NOW));

      expect(db.lockSql[0]).toBe(
        "SELECT id FROM products WHERE id = ? FOR UPDATE",
      );
    });

    it("is taken before activation reads the boost status or the timeline", async () => {
      const db = setup(productRow(), boostRow());

      await db.transaction((tx) => service.activate(tx, "boost-1", NOW));

      // The first boost read only finds the listing id; status and the
      // listing's boostedUntil are read after the lock.
      expect(db.events.slice(0, 4)).toEqual([
        "boost.read",
        "lock:prod-1",
        "boost.read",
        "product.read",
      ]);
    });

    it.each([
      [
        "pause",
        boostRow({ status: BoostStatus.active, endsAt: at(DAY) }),
        (tx: Prisma.TransactionClient) => service.pause(tx, "boost-1", NOW),
      ],
      [
        "resume",
        boostRow({ status: BoostStatus.paused, pausedRemainingSeconds: 60 }),
        (tx: Prisma.TransactionClient) => service.resume(tx, "boost-1", NOW),
      ],
      [
        "extend",
        boostRow({ status: BoostStatus.active, endsAt: at(DAY) }),
        (tx: Prisma.TransactionClient) => service.extend(tx, "boost-1", 1, NOW),
      ],
      [
        "refresh",
        boostRow({ status: BoostStatus.active, endsAt: at(DAY) }),
        (tx: Prisma.TransactionClient) =>
          service.refreshProductPromotion(tx, "prod-1", NOW),
      ],
    ])("is taken by %s before it reads the boost", async (_name, row, run) => {
      const db = setup(productRow(), row);

      await db.transaction(run);

      const firstLock = db.events.indexOf("lock:prod-1");
      expect(firstLock).toBeGreaterThanOrEqual(0);
      // At most the listing-id lookup happens before the lock.
      expect(["", "boost.read"]).toContain(
        db.events.slice(0, firstLock).join(","),
      );
    });
  });

  describe("concurrent writers on one listing", () => {
    function twoPaidBoosts() {
      // The listing is boosted for 5 more days; a 7-day and a 3-day boost are
      // paid and fulfilled at the same moment.
      return setup(
        productRow({ boostedUntil: at(5 * DAY), rankTier: 2 }),
        boostRow({ id: "boost-7", durationDays: 7 }),
        boostRow({ id: "boost-3", durationDays: 3 }),
      );
    }

    it("two fulfilments end with the summed time", async () => {
      const db = twoPaidBoosts();

      await Promise.all([
        db.transaction((tx) => service.activate(tx, "boost-7", NOW)),
        db.transaction((tx) => service.activate(tx, "boost-3", NOW)),
      ]);

      expect(db.products.get("prod-1")?.boostedUntil).toEqual(at(15 * DAY));
      const ends = [
        db.boosts.get("boost-7")?.endsAt,
        db.boosts.get("boost-3")?.endsAt,
      ].map((d) => d?.getTime());
      // One stacked on the old end, the other on the first one's end.
      expect(ends).toContain(at(15 * DAY).getTime());
      expect(
        ends.some(
          (t) => t === at(12 * DAY).getTime() || t === at(8 * DAY).getTime(),
        ),
      ).toBe(true);
    });

    it("loses a duration without the lock (the race this guards)", async () => {
      const db = twoPaidBoosts();
      const { timeline: unlocked, store } = makeTimeline();
      jest.spyOn(store, "lockProduct").mockResolvedValue(undefined);

      await Promise.all([
        db.transaction((tx) => unlocked.activate(tx, "boost-7", NOW)),
        db.transaction((tx) => unlocked.activate(tx, "boost-3", NOW)),
      ]);

      // Both read boostedUntil = +5 days, so exactly one duration is lost:
      // the listing ends at +12 days (7 kept) or +8 days (3 kept).
      expect([at(12 * DAY).getTime(), at(8 * DAY).getTime()]).toContain(
        db.products.get("prod-1")?.boostedUntil?.getTime(),
      );
    });

    it("activates one boost once when two callbacks fulfil it at the same time", async () => {
      // A duplicate PayTR callback that got past the payment claim: the
      // second activation waits for the listing lock, then sees `active`.
      const db = setup(
        productRow({ boostedUntil: at(5 * DAY), rankTier: 2 }),
        boostRow({ durationDays: 7 }),
      );

      const results = await Promise.all([
        db.transaction((tx) => service.activate(tx, "boost-1", NOW)),
        db.transaction((tx) => service.activate(tx, "boost-1", NOW)),
      ]);

      expect(results.filter((r) => r !== null)).toEqual([
        { productId: "prod-1", endsAt: at(12 * DAY) },
      ]);
      expect(db.boosts.get("boost-1")?.endsAt).toEqual(at(12 * DAY));
      expect(db.products.get("prod-1")?.boostedUntil).toEqual(at(12 * DAY));
    });

    it("the status compare-and-set alone still stops a second activation", async () => {
      // The database-level guard: even when both activations read `pending`,
      // only the one whose update claims the row writes the listing (Postgres
      // re-checks the WHERE of an UPDATE that waited for the row).
      const db = setup(
        productRow({ boostedUntil: at(5 * DAY), rankTier: 2 }),
        boostRow({ durationDays: 7 }),
      );
      const { timeline: unlocked, store } = makeTimeline();
      jest.spyOn(store, "lockProduct").mockResolvedValue(undefined);

      const results = await Promise.all([
        db.transaction((tx) => unlocked.activate(tx, "boost-1", NOW)),
        db.transaction((tx) => unlocked.activate(tx, "boost-1", NOW)),
      ]);

      expect(results.filter((r) => r !== null)).toHaveLength(1);
      expect(db.products.get("prod-1")?.boostedUntil).toEqual(at(12 * DAY));
    });

    it("keeps both a fulfilment and a staff extension running at once", async () => {
      const db = setup(
        productRow({ boostedUntil: at(5 * DAY), rankTier: 2 }),
        boostRow({
          id: "running",
          status: BoostStatus.active,
          endsAt: at(5 * DAY),
          purchasedAt: at(-DAY),
        }),
        boostRow({ id: "paid", durationDays: 3 }),
      );

      await Promise.all([
        db.transaction((tx) => service.extend(tx, "running", 2, NOW)),
        db.transaction((tx) => service.activate(tx, "paid", NOW)),
      ]);

      // Whichever ran first, both the extension and the new boost count:
      // extend first: running -> +7d, paid stacks on +7d -> +10d.
      // activate first: paid -> +8d; the extension moves running to +7d and
      // the paid boost queued behind it to +10d (it used to stay at +8d and
      // the two days were lost).
      expect(db.products.get("prod-1")?.boostedUntil).toEqual(at(10 * DAY));
      expect(db.boosts.get("running")?.endsAt).toEqual(at(7 * DAY));
      expect(db.boosts.get("paid")?.endsAt).toEqual(at(10 * DAY));
    });
  });

  /**
   * The LB1 review gap: a stacked boost's `endsAt` already holds the time of
   * the boosts before it, so reading "end minus now" as its remainder gave
   * free days on every pause and resume. Example: 7 days, then 5 days stacked
   * (12 paid days); pausing and resuming the stacked one gave 17.
   */
  describe("stacked boosts keep their own time", () => {
    // Two days into a 7-day boost with a 5-day boost stacked behind it:
    // the first has 5 days left (ends +5d), the second ends at +10d.
    function sevenThenFive(over: Partial<ProductRow> = {}) {
      return setup(
        productRow({ boostedUntil: at(10 * DAY), rankTier: 2, ...over }),
        boostRow({
          id: "seven",
          status: BoostStatus.active,
          durationDays: 7,
          endsAt: at(5 * DAY),
          purchasedAt: at(-2 * DAY),
        }),
        boostRow({
          id: "five",
          status: BoostStatus.active,
          durationDays: 5,
          endsAt: at(10 * DAY),
          purchasedAt: at(-2 * DAY + HOUR),
        }),
      );
    }

    it("pausing the stacked boost keeps its own 5 days, not 10", async () => {
      const db = sevenThenFive();

      await db.transaction((tx) => service.pause(tx, "five", NOW));

      expect(db.boosts.get("five")?.pausedRemainingSeconds).toBe(5 * 86400);
      expect(db.products.get("prod-1")?.boostedUntil).toEqual(at(5 * DAY));
    });

    it("pause and resume of the stacked boost end where the 12 paid days end", async () => {
      const db = sevenThenFive();

      await db.transaction((tx) => service.pause(tx, "five", NOW));
      await db.transaction((tx) => service.resume(tx, "five", at(DAY)));

      // Resumed behind the 7-day boost (+5d): +10d, the original end. It
      // used to end at +5d + 10d = +15d, 17 days after the purchase.
      expect(db.boosts.get("five")?.endsAt).toEqual(at(10 * DAY));
      expect(db.products.get("prod-1")?.boostedUntil).toEqual(at(10 * DAY));
    });

    it("pausing the first boost moves the stacked one up, resume queues it behind", async () => {
      const db = sevenThenFive();

      await db.transaction((tx) => service.pause(tx, "seven", NOW));

      expect(db.boosts.get("seven")?.pausedRemainingSeconds).toBe(5 * 86400);
      // The 5-day boost runs now instead of after the paused one.
      expect(db.boosts.get("five")?.endsAt).toEqual(at(5 * DAY));
      expect(db.products.get("prod-1")?.boostedUntil).toEqual(at(5 * DAY));

      await db.transaction((tx) => service.resume(tx, "seven", at(DAY)));

      expect(db.boosts.get("seven")?.endsAt).toEqual(at(10 * DAY));
      expect(db.products.get("prod-1")?.boostedUntil).toEqual(at(10 * DAY));
    });

    it("a system pause and resume of an offline listing keeps 12 days, not 17", async () => {
      const db = sevenThenFive({ status: "inactive" });

      const paused = await db.transaction((tx) =>
        service.pauseForDelisting(tx, "prod-1", NOW),
      );

      expect(paused).toBe(2);
      expect(db.boosts.get("seven")).toMatchObject({
        status: BoostStatus.paused,
        pausedBySystem: true,
        pausedRemainingSeconds: 5 * 86400,
      });
      expect(db.boosts.get("five")?.pausedRemainingSeconds).toBe(5 * 86400);
      expect(db.products.get("prod-1")).toMatchObject({
        boostedUntil: null,
        rankTier: 0,
      });

      db.products.get("prod-1")!.status = "active";
      const resumed = await db.transaction((tx) =>
        service.resumeSystemPaused(tx, "prod-1", at(3 * DAY)),
      );

      expect(resumed).toBe(2);
      // 10 own days from the resume (+3d), in purchase order.
      expect(db.boosts.get("seven")).toMatchObject({
        status: BoostStatus.active,
        endsAt: at(8 * DAY),
        pausedBySystem: false,
        pausedRemainingSeconds: null,
      });
      expect(db.boosts.get("five")?.endsAt).toEqual(at(13 * DAY));
      expect(db.products.get("prod-1")).toMatchObject({
        boostedUntil: at(13 * DAY),
        rankTier: 2,
        // Back online, it leads the boosted LIFO order again.
        boostedAt: at(3 * DAY),
      });
    });

    it("a system pause skips a listing that is live again under the lock", async () => {
      const db = sevenThenFive();

      await expect(
        db.transaction((tx) => service.pauseForDelisting(tx, "prod-1", NOW)),
      ).resolves.toBe(0);
      expect(db.boosts.get("seven")?.status).toBe(BoostStatus.active);
    });

    it("a system resume leaves a staff pause and an offline listing alone", async () => {
      const db = setup(
        productRow(),
        boostRow({
          id: "staff",
          status: BoostStatus.paused,
          pausedBySystem: false,
          pausedRemainingSeconds: 3600,
        }),
      );

      await expect(
        db.transaction((tx) => service.resumeSystemPaused(tx, "prod-1", NOW)),
      ).resolves.toBe(0);
      db.products.get("prod-1")!.status = "inactive";
      db.boosts.get("staff")!.pausedBySystem = true;
      await expect(
        db.transaction((tx) => service.resumeSystemPaused(tx, "prod-1", NOW)),
      ).resolves.toBe(0);
      expect(db.boosts.get("staff")?.status).toBe(BoostStatus.paused);
    });

    it("a system resume queues behind a boost bought while the listing was offline", async () => {
      const db = setup(
        productRow({ boostedUntil: at(7 * DAY), rankTier: 2 }),
        boostRow({
          id: "new",
          status: BoostStatus.active,
          endsAt: at(7 * DAY),
          purchasedAt: at(-HOUR),
        }),
        boostRow({
          id: "old",
          status: BoostStatus.paused,
          pausedBySystem: true,
          pausedRemainingSeconds: 3600,
          purchasedAt: at(-3 * DAY),
        }),
      );

      await db.transaction((tx) =>
        service.resumeSystemPaused(tx, "prod-1", NOW),
      );

      expect(db.boosts.get("new")?.endsAt).toEqual(at(7 * DAY));
      expect(db.boosts.get("old")?.endsAt).toEqual(at(7 * DAY + HOUR));
    });

    it("caps a remainder paused before the fix at the boost's bought days", async () => {
      // An old pause stored 10 days for the stacked 5-day boost (its end
      // minus now): it resumes with its own 5 days.
      const db = setup(
        productRow(),
        boostRow({
          status: BoostStatus.paused,
          durationDays: 5,
          pausedRemainingSeconds: 10 * 86400,
        }),
      );

      await db.transaction((tx) => service.resume(tx, "boost-1", NOW));

      expect(db.boosts.get("boost-1")?.endsAt).toEqual(at(5 * DAY));
    });

    it("an extension of the first boost moves the stacked one back", async () => {
      const db = sevenThenFive();

      await db.transaction((tx) => service.extend(tx, "seven", 2, NOW));

      expect(db.boosts.get("seven")).toMatchObject({
        endsAt: at(7 * DAY),
        extendedDays: 2,
      });
      expect(db.boosts.get("five")?.endsAt).toEqual(at(12 * DAY));
      expect(db.products.get("prod-1")?.boostedUntil).toEqual(at(12 * DAY));
    });
  });

  describe("showcase boosts keep their own showcase time", () => {
    // A 30-day search boost, then a 3-day showcase boost stacked behind it:
    // search until +33d, showcase until +3d.
    function econThenVitrin() {
      return setup(
        productRow({
          boostedUntil: at(33 * DAY),
          homeShowcaseUntil: at(3 * DAY),
          rankTier: 2,
        }),
        boostRow({
          id: "econ",
          status: BoostStatus.active,
          durationDays: 30,
          endsAt: at(30 * DAY),
          purchasedAt: at(-DAY),
        }),
        boostRow({
          id: "vitrin",
          status: BoostStatus.active,
          showcaseOnHome: true,
          durationDays: 3,
          endsAt: at(33 * DAY),
          showcaseEndsAt: at(3 * DAY),
          purchasedAt: at(-DAY + HOUR),
        }),
      );
    }

    it("activation records the boost's own showcase end", async () => {
      const db = setup(
        productRow({ boostedUntil: at(30 * DAY) }),
        boostRow({ durationDays: 3, showcaseOnHome: true }),
      );

      await db.transaction((tx) => service.activate(tx, "boost-1", NOW));

      expect(db.boosts.get("boost-1")).toMatchObject({
        endsAt: at(33 * DAY),
        showcaseEndsAt: at(3 * DAY),
      });
    });

    it("a staff action on the search boost leaves the showcase at +3d, not +33d", async () => {
      const db = econThenVitrin();

      await db.transaction((tx) => service.extend(tx, "econ", 1, NOW));

      expect(db.products.get("prod-1")).toMatchObject({
        boostedUntil: at(34 * DAY),
        homeShowcaseUntil: at(3 * DAY),
      });
      expect(db.boosts.get("vitrin")).toMatchObject({
        endsAt: at(34 * DAY),
        showcaseEndsAt: at(3 * DAY),
      });
    });

    it("pause and resume of the showcase boost keep its own showcase days", async () => {
      const db = econThenVitrin();

      await db.transaction((tx) => service.pause(tx, "vitrin", at(DAY)));

      expect(db.boosts.get("vitrin")).toMatchObject({
        pausedRemainingSeconds: 3 * 86400,
        pausedShowcaseSeconds: 2 * 86400,
      });
      expect(db.products.get("prod-1")?.homeShowcaseUntil).toBeNull();

      await db.transaction((tx) => service.resume(tx, "vitrin", at(5 * DAY)));

      expect(db.boosts.get("vitrin")).toMatchObject({
        status: BoostStatus.active,
        endsAt: at(33 * DAY),
        showcaseEndsAt: at(7 * DAY),
        pausedShowcaseSeconds: null,
      });
      expect(db.products.get("prod-1")).toMatchObject({
        boostedUntil: at(33 * DAY),
        homeShowcaseUntil: at(7 * DAY),
      });
    });

    it("an extension of a showcase boost adds the days to its showcase too", async () => {
      const db = econThenVitrin();

      await db.transaction((tx) => service.extend(tx, "vitrin", 2, NOW));

      expect(db.boosts.get("vitrin")).toMatchObject({
        endsAt: at(35 * DAY),
        showcaseEndsAt: at(5 * DAY),
      });
      expect(db.products.get("prod-1")?.homeShowcaseUntil).toEqual(at(5 * DAY));
    });

    it("an extension of a paused showcase boost adds to both remainders", async () => {
      const db = setup(
        productRow(),
        boostRow({
          status: BoostStatus.paused,
          showcaseOnHome: true,
          pausedRemainingSeconds: 3 * 86400,
          pausedShowcaseSeconds: 86400,
        }),
      );

      await db.transaction((tx) => service.extend(tx, "boost-1", 2, NOW));

      expect(db.boosts.get("boost-1")).toMatchObject({
        pausedRemainingSeconds: 5 * 86400,
        pausedShowcaseSeconds: 3 * 86400,
      });
    });

    it("a showcase boost paused before the column resumes its showcase with its search remainder", async () => {
      const db = setup(
        productRow(),
        boostRow({
          status: BoostStatus.paused,
          showcaseOnHome: true,
          durationDays: 3,
          pausedRemainingSeconds: 2 * 86400,
          pausedShowcaseSeconds: null,
        }),
      );

      await db.transaction((tx) => service.resume(tx, "boost-1", NOW));

      expect(db.products.get("prod-1")?.homeShowcaseUntil).toEqual(at(2 * DAY));
    });
  });

  describe("cancel (revoke, refund and stop)", () => {
    const stop = { actorId: "admin-user", reason: "Seller asked for it" };

    function headAndStacked() {
      return setup(
        productRow({ boostedUntil: at(10 * DAY), rankTier: 2 }),
        boostRow({
          id: "head",
          status: BoostStatus.active,
          durationDays: 7,
          endsAt: at(5 * DAY),
          purchasedAt: at(-2 * DAY),
          price: 59,
        }),
        boostRow({
          id: "stacked",
          status: BoostStatus.active,
          durationDays: 5,
          endsAt: at(10 * DAY),
          purchasedAt: at(-DAY),
        }),
      );
    }

    it("drops the head boost's unused time and moves the stacked one up by it", async () => {
      const db = headAndStacked();

      const result = await db.transaction((tx) =>
        service.cancel(tx, "head", stop, NOW),
      );

      expect(result).toEqual({
        stopped: true,
        boostId: "head",
        productId: "prod-1",
        unconsumedSeconds: 5 * 86400,
      });
      expect(db.boosts.get("head")).toMatchObject({
        status: BoostStatus.cancelled,
        cancelledAt: NOW,
        cancelledById: "admin-user",
        cancelReason: "Seller asked for it",
        endsAt: NOW,
      });
      // A revoke records no refund.
      expect(db.boosts.get("head")?.refundedAmount).toBeUndefined();
      expect(db.boosts.get("stacked")?.endsAt).toEqual(at(5 * DAY));
      expect(db.products.get("prod-1")?.boostedUntil).toEqual(at(5 * DAY));
    });

    it("drops a stacked boost's own days and leaves the head boost alone", async () => {
      const db = headAndStacked();

      const result = await db.transaction((tx) =>
        service.cancel(tx, "stacked", stop, NOW),
      );

      expect(result).toMatchObject({ unconsumedSeconds: 5 * 86400 });
      expect(db.boosts.get("head")?.endsAt).toEqual(at(5 * DAY));
      expect(db.products.get("prod-1")?.boostedUntil).toEqual(at(5 * DAY));
    });

    it("a refund records its amount on the stopped boost", async () => {
      const db = headAndStacked();

      await db.transaction((tx) =>
        service.cancel(tx, "head", { ...stop, refundedAmount: 20 }, NOW),
      );

      expect(Number(db.boosts.get("head")?.refundedAmount)).toBe(20);
      expect(db.boosts.get("head")?.status).toBe(BoostStatus.cancelled);
    });

    it("stops a showcase boost's showcase with it", async () => {
      const db = setup(
        productRow({
          boostedUntil: at(33 * DAY),
          homeShowcaseUntil: at(3 * DAY),
          rankTier: 2,
        }),
        boostRow({
          id: "econ",
          status: BoostStatus.active,
          durationDays: 30,
          endsAt: at(30 * DAY),
          purchasedAt: at(-DAY),
        }),
        boostRow({
          id: "vitrin",
          status: BoostStatus.active,
          showcaseOnHome: true,
          durationDays: 3,
          endsAt: at(33 * DAY),
          showcaseEndsAt: at(3 * DAY),
          purchasedAt: at(-DAY + HOUR),
        }),
      );

      await db.transaction((tx) => service.cancel(tx, "vitrin", stop, NOW));

      expect(db.boosts.get("vitrin")).toMatchObject({
        endsAt: NOW,
        showcaseEndsAt: NOW,
      });
      expect(db.products.get("prod-1")).toMatchObject({
        boostedUntil: at(30 * DAY),
        homeShowcaseUntil: null,
      });
    });

    it("stops a paused boost without touching the running ones", async () => {
      const db = setup(
        productRow({ boostedUntil: at(DAY), rankTier: 2 }),
        boostRow({
          id: "paused",
          status: BoostStatus.paused,
          pausedRemainingSeconds: 7200,
        }),
        boostRow({
          id: "running",
          status: BoostStatus.active,
          endsAt: at(DAY),
          purchasedAt: at(-DAY),
        }),
      );

      const result = await db.transaction((tx) =>
        service.cancel(tx, "paused", stop, NOW),
      );

      expect(result).toMatchObject({ stopped: true, unconsumedSeconds: 7200 });
      expect(db.boosts.get("paused")?.status).toBe(BoostStatus.cancelled);
      expect(db.boosts.get("running")?.endsAt).toEqual(at(DAY));
      expect(db.products.get("prod-1")?.boostedUntil).toEqual(at(DAY));
    });

    it("records a refund on a boost that ended a moment ago, but a revoke refuses it", async () => {
      const ended = () =>
        setup(
          productRow(),
          boostRow({ status: BoostStatus.expired, endsAt: at(-HOUR) }),
        );

      const revoked = ended();
      await expect(
        revoked.transaction((tx) => service.cancel(tx, "boost-1", stop, NOW)),
      ).resolves.toEqual({ stopped: false, status: BoostStatus.expired });
      expect(revoked.boosts.get("boost-1")?.status).toBe(BoostStatus.expired);

      const refunded = ended();
      await refunded.transaction((tx) =>
        service.cancel(tx, "boost-1", { ...stop, refundedAmount: 59 }, NOW),
      );
      expect(refunded.boosts.get("boost-1")).toMatchObject({
        status: BoostStatus.cancelled,
        cancelledById: "admin-user",
      });
      expect(Number(refunded.boosts.get("boost-1")?.refundedAmount)).toBe(59);
    });

    it.each([BoostStatus.cancelled, BoostStatus.pending, BoostStatus.failed])(
      "leaves a %s boost alone, so a replay never records a refund twice",
      async (status) => {
        const db = setup(
          productRow(),
          boostRow({ status, refundedAmount: new Prisma.Decimal(59) }),
        );

        await expect(
          db.transaction((tx) =>
            service.cancel(tx, "boost-1", { ...stop, refundedAmount: 59 }, NOW),
          ),
        ).resolves.toEqual({ stopped: false, status });
        expect(Number(db.boosts.get("boost-1")?.refundedAmount)).toBe(59);
      },
    );

    it("is idempotent: a second stop changes nothing", async () => {
      const db = headAndStacked();

      await db.transaction((tx) =>
        service.cancel(tx, "head", { ...stop, refundedAmount: 59 }, NOW),
      );
      const again = await db.transaction((tx) =>
        service.cancel(tx, "head", { ...stop, refundedAmount: 59 }, at(HOUR)),
      );

      expect(again).toEqual({ stopped: false, status: BoostStatus.cancelled });
      expect(Number(db.boosts.get("head")?.refundedAmount)).toBe(59);
      expect(db.boosts.get("stacked")?.endsAt).toEqual(at(5 * DAY));
    });

    it("takes the listing lock before it reads the boost status", async () => {
      const db = headAndStacked();

      await db.transaction((tx) => service.cancel(tx, "head", stop, NOW));

      expect(db.events.slice(0, 3)).toEqual([
        "boost.read",
        "lock:prod-1",
        "boost.read",
      ]);
    });

    it("stopForRefund finds the boost of the refunded order", async () => {
      const db = setup(
        productRow({ boostedUntil: at(DAY), rankTier: 2 }),
        boostRow({
          orderId: "ord-1",
          status: BoostStatus.active,
          endsAt: at(DAY),
          purchasedAt: at(-DAY),
        }),
      );

      await expect(
        db.transaction((tx) =>
          service.stopForRefund(
            tx,
            "ord-2",
            { actorId: null, reason: null, refundedAmount: 59 },
            NOW,
          ),
        ),
      ).resolves.toBeNull();
      await expect(
        db.transaction((tx) =>
          service.stopForRefund(
            tx,
            "ord-1",
            { actorId: null, reason: null, refundedAmount: 59 },
            NOW,
          ),
        ),
      ).resolves.toMatchObject({ stopped: true, boostId: "boost-1" });
      expect(db.boosts.get("boost-1")).toMatchObject({
        status: BoostStatus.cancelled,
        cancelledById: null,
      });
      expect(db.products.get("prod-1")?.boostedUntil).toBeNull();
    });
  });

  describe("grant", () => {
    const grant = {
      productId: "prod-1",
      packageId: "pkg-1",
      packageName: "Vitrin",
      showcaseOnHome: true,
      durationDays: 7,
      grantedById: "admin-user",
      reason: "Compensation for a listing outage",
    };

    it("creates a free, active boost stacked on the running one", async () => {
      const db = setup(
        productRow({ boostedUntil: at(5 * DAY), rankTier: 2 }),
        boostRow({
          id: "paid",
          status: BoostStatus.active,
          endsAt: at(5 * DAY),
          purchasedAt: at(-DAY),
        }),
      );

      const result = await db.transaction((tx) =>
        service.grant(tx, grant, NOW),
      );

      expect(result).toEqual({
        boostId: "boost-2",
        productId: "prod-1",
        endsAt: at(12 * DAY),
      });
      expect(db.boosts.get("boost-2")).toMatchObject({
        source: "admin_grant",
        price: 0,
        userId: "seller-1",
        packageId: "pkg-1",
        packageName: "Vitrin",
        showcaseOnHome: true,
        durationDays: 7,
        grantedById: "admin-user",
        grantReason: "Compensation for a listing outage",
        status: BoostStatus.active,
        endsAt: at(12 * DAY),
        showcaseEndsAt: at(7 * DAY),
      });
      // No order: a grant is not a sale.
      expect(db.boosts.get("boost-2")?.orderId).toBeUndefined();
      expect(db.products.get("prod-1")?.boostedUntil).toEqual(at(12 * DAY));
    });

    it("locks the listing before it reads it", async () => {
      const db = setup(productRow());

      await db.transaction((tx) => service.grant(tx, grant, NOW));

      expect(db.events[0]).toBe("lock:prod-1");
    });

    it.each([
      ["an inactive listing", { status: "inactive" }],
      ["a sold listing", { status: "sold" }],
      ["a virtual product", { kind: "boost" }],
    ])("refuses %s", async (_label, over) => {
      const db = setup(productRow(over));

      await expect(
        db.transaction((tx) => service.grant(tx, grant, NOW)),
      ).rejects.toMatchObject({
        response: { i18nKey: "server.admin.boost.grantListingNotActive" },
      });
      expect(db.boosts.size).toBe(0);
    });

    it("answers 404 for an unknown listing", async () => {
      const db = setup(productRow());

      await expect(
        db.transaction((tx) =>
          service.grant(tx, { ...grant, productId: "missing" }, NOW),
        ),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("seller notices go out with the change", () => {
    function withOutbox() {
      const outbox = { enqueue: jest.fn().mockResolvedValue(undefined) };
      return {
        outbox,
        service: makeTimeline(outbox).timeline,
      };
    }

    it.each([
      ["a revoke", undefined, "cancelled"],
      ["a refund", 59, "refunded"],
    ] as const)(
      "%s queues one notice in the stop's transaction",
      async (_label, refundedAmount, kind) => {
        const { outbox, service: withNotices } = withOutbox();
        const db = setup(
          productRow(),
          boostRow({ status: BoostStatus.active, endsAt: at(DAY) }),
        );

        await db.transaction((tx) =>
          withNotices.cancel(
            tx,
            "boost-1",
            { actorId: "admin-user", reason: "reason", refundedAmount },
            NOW,
          ),
        );

        expect(outbox.enqueue).toHaveBeenCalledTimes(1);
        expect(outbox.enqueue).toHaveBeenCalledWith(expect.anything(), {
          type: "boost.notice",
          payload: { boostId: "boost-1", kind },
          dedupeKey: `boost.notice:${kind}:boost-1`,
        });
      },
    );

    it("a grant queues the granted notice", async () => {
      const { outbox, service: withNotices } = withOutbox();
      const db = setup(productRow());

      await db.transaction((tx) =>
        withNotices.grant(
          tx,
          {
            productId: "prod-1",
            packageId: null,
            packageName: null,
            showcaseOnHome: false,
            durationDays: 3,
            grantedById: "admin-user",
            reason: "Compensation for a listing outage",
          },
          NOW,
        ),
      );

      expect(outbox.enqueue).toHaveBeenCalledWith(expect.anything(), {
        type: "boost.notice",
        payload: { boostId: "boost-1", kind: "granted" },
        dedupeKey: "boost.notice:granted:boost-1",
      });
    });

    it("a stop that changes nothing queues nothing", async () => {
      const { outbox, service: withNotices } = withOutbox();
      const db = setup(
        productRow(),
        boostRow({ status: BoostStatus.cancelled }),
      );

      await db.transaction((tx) =>
        withNotices.cancel(
          tx,
          "boost-1",
          { actorId: null, reason: null, refundedAmount: 59 },
          NOW,
        ),
      );

      expect(outbox.enqueue).not.toHaveBeenCalled();
    });
  });
});
