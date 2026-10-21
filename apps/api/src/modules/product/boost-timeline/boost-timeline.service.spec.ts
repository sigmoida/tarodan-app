import {
  BoostStatus,
  MembershipTierType,
  Prisma,
  SubscriptionStatus,
} from "@prisma/client";
import { BoostTimelineService } from "./boost-timeline.service";
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
  durationDays: number;
  showcaseOnHome: boolean;
  status: BoostStatus;
  startsAt: Date | null;
  endsAt: Date | null;
  purchasedAt: Date | null;
  pausedAt: Date | null;
  pausedRemainingSeconds: number | null;
  extendedDays: number;
  baselineViewCount: number | null;
  baselineLikeCount: number | null;
  baselineClickCount: number | null;
};

type ProductRow = {
  id: string;
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
        if (/FOR UPDATE/i.test(sql)) await acquire(String(values[0]), txId);
        return [];
      },
    ),
    product: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        await tick();
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
    },
    productBoost: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        await tick();
        const row = boosts.get(where.id);
        return row ? structuredClone(row) : null;
      }),
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
          return rows[0] ? structuredClone(rows[0]) : null;
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
          return rows.map((r) => structuredClone(r));
        },
      ),
      update: jest.fn(
        async ({ where, data }: { where: { id: string }; data: Where }) => {
          await tick();
          const row = boosts.get(where.id);
          if (!row) throw new Error(`no boost ${where.id}`);
          applyData(row, data);
          return structuredClone(row);
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
    },
  });

  return {
    products,
    boosts,
    lockSql,
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
    purchasedAt: null,
    pausedAt: null,
    pausedRemainingSeconds: null,
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

describe("BoostTimelineService", () => {
  const service = new BoostTimelineService();

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

    it("takes the latest end, the latest activation and the showcase boost's end", async () => {
      const db = setup(
        productRow(),
        boostRow({
          id: "econ",
          status: BoostStatus.active,
          endsAt: at(30 * DAY),
          purchasedAt: at(-2 * DAY),
        }),
        boostRow({
          id: "vitrin",
          status: BoostStatus.active,
          showcaseOnHome: true,
          endsAt: at(33 * DAY),
          purchasedAt: at(-DAY),
        }),
        boostRow({ id: "old", status: BoostStatus.expired, endsAt: at(-DAY) }),
      );

      await db.transaction((tx) =>
        service.refreshProductPromotion(tx, "prod-1", NOW),
      );

      // Pins the known gap: the stacked showcase boost's end (33 days), not
      // the 3-day showcase window activation gave it.
      expect(db.products.get("prod-1")).toMatchObject({
        boostedUntil: at(33 * DAY),
        boostedAt: at(-DAY),
        homeShowcaseUntil: at(33 * DAY),
        rankTier: 2,
      });
    });
  });
});
