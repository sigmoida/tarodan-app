import { Prisma } from "@prisma/client";
import {
  pickSellerTrustFormulaParams,
  SELLER_TRUST_LAB_POPULATION_MAX_ROWS,
  type SellerTrustComponentsV1,
  type SellerTrustFormulaParams,
  type SellerTrustInputs,
} from "@tarodan/types";
import { OrderSellerTrustStatsService } from "../../order/stats/order-seller-trust-stats.service";
import { RefundSellerTrustStatsService } from "../../refund/stats/refund-seller-trust-stats.service";
import { RatingSellerTrustStatsService } from "../../rating/stats/rating-seller-trust-stats.service";
import { TradeSellerTrustStatsService } from "../../trade/stats/trade-seller-trust-stats.service";
import { UserSellerTrustStatsService } from "../../user/stats/user-seller-trust-stats.service";
import { SellerTrustService } from "../seller-trust.service";
import { computeSellerTrust } from "../helpers/trust-formula";
import { explainSellerTrust } from "../helpers/trust-explain";
import { TRUST_FORMULA_V1 } from "../helpers/trust-formula.constants";
import { SELLER_TRUST_GOLDEN_V1 } from "../helpers/trust-golden-v1";
import { SellerTrustInputsReader } from "../inputs/seller-trust-inputs.reader";
import { trustInputs } from "../testing/trust-inputs-fixture";
import { SellerTrustLabService } from "./seller-trust-lab.service";

const DAY = 86_400_000;
const storedAt = new Date("2026-11-02T23:30:00.000Z");
const v1 = (): SellerTrustFormulaParams =>
  pickSellerTrustFormulaParams(TRUST_FORMULA_V1);
/** A valid candidate that differs from v1: reliability weighs more. */
const candidateParams = (): SellerTrustFormulaParams => ({
  ...v1(),
  weights: {
    rating: 0.3,
    reliability: 0.35,
    onTime: 0.15,
    volume: 0.15,
    tenure: 0.05,
  },
});

/** Keys no lab response may carry (AC-A11, plan 4.7). */
const FORBIDDEN_KEYS = [
  "counterpartyKey",
  "orderId",
  "tradeId",
  "buyerId",
  "email",
  "guestEmail",
  "displayName",
];

function allKeys(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      allKeys(v, out);
    }
  }
  return out;
}

/**
 * A Prisma double for the lab: the root client only opens transactions;
 * any other root access throws, so a read that skipped the snapshot fails
 * the spec. The tx records statements and refuses every write.
 */
function fakePrisma(tx: Record<string, unknown>) {
  const transaction = jest.fn(
    async (fn: (t: unknown) => Promise<unknown>, _opts?: unknown) => fn(tx),
  );
  const root = new Proxy(
    { $transaction: transaction },
    {
      get(target, prop) {
        if (prop === "$transaction") return target.$transaction;
        if (prop === "then") return undefined;
        throw new Error(
          `root Prisma access outside the snapshot: ${String(prop)}`,
        );
      },
    },
  );
  return { root, transaction };
}

const sqlText = (args: unknown[]) =>
  Prisma.sql(args[0] as TemplateStringsArray, ...args.slice(1)).text;

/** The snapshot's statements: the READ ONLY switch must come first. */
function baseTx() {
  const executed: string[] = [];
  return {
    executed,
    $executeRaw: jest.fn(async (...args: unknown[]) => {
      const text = sqlText(args);
      executed.push(text);
      if (
        !/^SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY$/.test(
          text,
        )
      ) {
        throw new Error(`write statement in the lab: ${text}`);
      }
      return 0;
    }),
    // The statement timeout (`set_config`); domain reads are mocked here.
    $queryRaw: jest.fn(async (..._args: unknown[]): Promise<unknown[]> => []),
  };
}

describe("SellerTrustLabService (collaborators mocked)", () => {
  const storedComponents = (
    inputs: SellerTrustInputs,
  ): SellerTrustComponentsV1 => computeSellerTrust(inputs).components;

  function build(
    opts: {
      subject?: Partial<{
        deleted: boolean;
        banned: boolean;
        testLane: boolean;
      }> | null;
      stored?: {
        scoreX100: number | null;
        formulaVersion?: number;
        components: unknown;
      } | null;
      live?: SellerTrustInputs;
    } = {},
  ) {
    const tx = baseTx();
    const { root, transaction } = fakePrisma(tx);
    const users = {
      trustLabSubject: jest.fn(async () =>
        opts.subject === null
          ? null
          : {
              id: "u1",
              username: "seller_one",
              deleted: false,
              banned: false,
              testLane: false,
              ...opts.subject,
            },
      ),
      usernames: jest.fn(
        async (_tx: unknown, ids: string[]) =>
          new Map(ids.map((id) => [id, `name-${id}`])),
      ),
    };
    const sellerTrust = {
      readStoredRow: jest.fn(async () =>
        opts.stored
          ? {
              userId: "u1",
              scoreX100: opts.stored.scoreX100,
              formulaVersion: opts.stored.formulaVersion ?? 1,
              components: opts.stored.components,
              computedAt: storedAt,
            }
          : null,
      ),
      countStored: jest.fn(),
      readStoredPage: jest.fn(),
    };
    const guest = { id: "guest", brand: true };
    const reader = {
      windowsAt: jest.fn((asOf: Date) =>
        new SellerTrustInputsReader(
          {} as never,
          {} as never,
          {} as never,
          {} as never,
          {} as never,
        ).windowsAt(asOf),
      ),
      guestBuyerId: jest.fn(async () => guest),
      readInputs: jest.fn(async () => [
        { userId: "u1", inputs: opts.live ?? trustInputs() },
      ]),
    };
    const service = new SellerTrustLabService(
      root as never,
      sellerTrust as never,
      reader as never,
      users as never,
    );
    return { service, tx, transaction, users, sellerTrust, reader, guest };
  }

  describe("params, scenarios and scenario (no database)", () => {
    it("serves v1 params, limits, components and the environment, with no database", () => {
      const t = build();
      const p = t.service.params();
      expect(p).toMatchObject({
        formulaVersion: 1,
        v1: v1(),
        components: ["rating", "reliability", "onTime", "volume", "tenure"],
        populationMaxRows: 20_000,
        environment: { env: "test", isProd: false },
      });
      expect(Object.keys(p.v1)).not.toContain("windows");
      expect(t.transaction).not.toHaveBeenCalled();
    });

    it("lists the ten golden scenarios with v1 results equal to the approved ones", () => {
      const t = build();
      const list = t.service.scenarios();
      expect(list).toHaveLength(10);
      for (const s of list) {
        const g = SELLER_TRUST_GOLDEN_V1.find((x) => x.key === s.key)!;
        expect(s.approved).toEqual({ scoreX100: g.scoreX100, level: g.level });
        expect(s.v1.scoreX100).toBe(g.scoreX100);
        expect(s.v1.level).toBe(g.level);
      }
      expect(t.transaction).not.toHaveBeenCalled();
    });

    it("explains a scenario with v1 and, when given, the candidate", () => {
      const t = build();
      const inputs = SELLER_TRUST_GOLDEN_V1[3].inputs;
      expect(t.service.scenario(inputs, null)).toEqual({
        v1: explainSellerTrust(inputs),
        candidate: null,
      });
      expect(t.service.scenario(inputs, candidateParams()).candidate).toEqual(
        explainSellerTrust(inputs, candidateParams()),
      );
      expect(t.transaction).not.toHaveBeenCalled();
    });
  });

  describe("seller", () => {
    const live = SELLER_TRUST_GOLDEN_V1[3].inputs;

    it("404s an unknown user after one read-only snapshot", async () => {
      const t = build({ subject: null });
      await expect(t.service.seller("u1", "now", null)).rejects.toMatchObject({
        status: 404,
        response: { i18nKey: "server.user.notFound" },
      });
      expect(t.transaction).toHaveBeenCalledTimes(1);
      expect(t.reader.readInputs).not.toHaveBeenCalled();
    });

    it.each([
      [{ deleted: true, banned: true }, "deleted"],
      [{ banned: true, testLane: true }, "banned"],
      [{ testLane: true }, "testLane"],
    ] as const)(
      "answers not scored (%j -> %s) with no live read and no score",
      async (flags, reason) => {
        const t = build({
          subject: flags,
          stored: { scoreX100: 437, components: storedComponents(live) },
        });
        const r = await t.service.seller("u1", "now", null);
        expect(r.notScored).toBe(reason);
        expect(r.live).toBeNull();
        expect(r.stored?.scoreX100).toBe(437);
        expect(t.reader.readInputs).not.toHaveBeenCalled();
      },
    );

    it("reproduces the stored score as of the stored run with the guest resolved in the snapshot", async () => {
      const t = build({
        stored: {
          scoreX100: computeSellerTrust(live).scoreX100,
          components: storedComponents(live),
        },
        live,
      });
      const r = await t.service.seller("u1", "stored", null);
      expect(t.reader.readInputs).toHaveBeenCalledWith(
        t.tx,
        ["u1"],
        storedAt,
        t.guest,
      );
      expect(r.asOf).toEqual({
        requested: "stored",
        used: "stored",
        at: storedAt.toISOString(),
      });
      expect(r.windows.volume).toEqual({
        since: new Date(storedAt.getTime() - 730 * DAY).toISOString(),
        until: storedAt.toISOString(),
      });
      expect(r.live?.comparison).toEqual({
        sameScore: true,
        changedInputs: [],
      });
      expect(r.live?.v1).toEqual(explainSellerTrust(live));
      expect(r.live?.candidate).toBeNull();
      expect(r.live?.hasActivity).toBe(true);
      expect(t.transaction).toHaveBeenCalledTimes(1);
      expect(t.tx.executed[0]).toBe(
        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY",
      );
    });

    it("names the inputs that changed since the stored run", async () => {
      const before = { ...live, failures: live.failures + 2 };
      const t = build({
        stored: {
          scoreX100: computeSellerTrust(before).scoreX100,
          components: storedComponents(before),
        },
        live,
      });
      const r = await t.service.seller("u1", "now", null);
      expect(r.live?.comparison).toEqual({
        sameScore: false,
        changedInputs: [
          { field: "failures", stored: before.failures, live: live.failures },
        ],
      });
    });

    it("falls back to now without a stored row and has no comparison", async () => {
      const t = build({ stored: null, live });
      const before = Date.now();
      const r = await t.service.seller("u1", "stored", null);
      expect(r.asOf.requested).toBe("stored");
      expect(r.asOf.used).toBe("now");
      expect(new Date(r.asOf.at).getTime()).toBeGreaterThanOrEqual(before);
      expect(r.stored).toBeNull();
      expect(r.live?.comparison).toBeNull();
    });

    it("never relabels a stored row of another formula version as v1", async () => {
      const t = build({
        stored: { scoreX100: 420, formulaVersion: 2, components: { v2: true } },
        live,
      });
      const r = await t.service.seller("u1", "stored", null);
      expect(r.stored).toMatchObject({ formulaVersion: 2, components: null });
      expect(r.live?.comparison).toBeNull();
    });

    it("shows a candidate through explainSellerTrust, without a formula version", async () => {
      const t = build({ live });
      const r = await t.service.seller("u1", "now", candidateParams());
      expect(r.live?.candidate).toEqual(
        explainSellerTrust(live, candidateParams()),
      );
      expect(allKeys(r.live?.candidate)).not.toContain("version");
    });

    it("returns no counterparty, order or contact key", async () => {
      const t = build({
        stored: { scoreX100: 437, components: storedComponents(live) },
        live,
      });
      const r = await t.service.seller("u1", "now", candidateParams());
      const keys = allKeys(r);
      for (const k of FORBIDDEN_KEYS) expect(keys).not.toContain(k);
    });
  });

  describe("population", () => {
    const row = (
      userId: string,
      inputs: SellerTrustInputs,
      over: Partial<{ scoreX100: number | null; formulaVersion: number }> = {},
    ) => {
      const r = computeSellerTrust(inputs);
      return {
        userId,
        scoreX100: "scoreX100" in over ? over.scoreX100! : r.scoreX100,
        formulaVersion: over.formulaVersion ?? 1,
        components: r.components,
        computedAt: storedAt,
      };
    };

    it("refuses more than the cap with 422 before reading a row", async () => {
      const t = build();
      t.sellerTrust.countStored.mockResolvedValue(
        SELLER_TRUST_LAB_POPULATION_MAX_ROWS + 1,
      );
      await expect(
        t.service.population(candidateParams(), {}),
      ).rejects.toMatchObject({
        status: 422,
        response: {
          i18nKey: "server.sellerTrustLab.populationTooLarge",
          i18nParams: { limit: 20_000 },
        },
      });
      expect(t.sellerTrust.readStoredPage).not.toHaveBeenCalled();
    });

    it("reads keyset pages within the count and summarises against stored", async () => {
      const t = build();
      const golden = SELLER_TRUST_GOLDEN_V1.map((g, i) =>
        row(`u${String(i).padStart(2, "0")}`, g.inputs),
      );
      const all = [
        ...golden,
        row("v2", trustInputs({ transactions: 9 }), { formulaVersion: 2 }),
        { ...row("zz", trustInputs()), components: { version: 1 } },
      ];
      t.sellerTrust.countStored.mockResolvedValue(all.length);
      t.sellerTrust.readStoredPage.mockImplementation(
        async (_tx, _f, after: string | null, take: number) => {
          const start =
            after === null ? 0 : all.findIndex((r) => r.userId === after) + 1;
          return all.slice(start, start + Math.min(take, 5));
        },
      );

      const filters = { levels: ["trusted" as const] };
      const r = await t.service.population(candidateParams(), filters);

      const takes = t.sellerTrust.readStoredPage.mock.calls.map((c) => c[3]);
      expect(takes).toEqual([12, 7, 2]);
      for (const c of t.sellerTrust.readStoredPage.mock.calls) {
        expect(c[0]).toBe(t.tx);
        expect(c[1]).toBe(filters);
      }
      expect(t.sellerTrust.countStored).toHaveBeenCalledWith(t.tx, filters);
      expect(r.summary).toMatchObject({
        rowsRead: 12,
        skippedOtherVersion: 1,
        skippedUnreadable: 1,
        rowsCompared: 10,
        v1Consistency: { matched: 10, offByOne: 0, mismatched: 0 },
      });
      expect(r.params).toEqual(candidateParams());
      expect(r.filters).toBe(filters);
      expect(t.transaction).toHaveBeenCalledTimes(1);

      // Usernames of the movers only, in one query, on the snapshot.
      expect(t.users.usernames).toHaveBeenCalledTimes(1);
      const [tx, ids] = t.users.usernames.mock.calls[0];
      expect(tx).toBe(t.tx);
      expect(ids.sort()).toEqual(
        [...r.movers.up, ...r.movers.down].map((m) => m.userId).sort(),
      );
      for (const m of [...r.movers.up, ...r.movers.down]) {
        expect(m.username).toBe(`name-${m.userId}`);
      }
    });

    it("exports a proposal without any seller identifier", async () => {
      const t = build();
      const all = SELLER_TRUST_GOLDEN_V1.map((g, i) => row(`u${i}`, g.inputs));
      t.sellerTrust.countStored.mockResolvedValue(all.length);
      t.sellerTrust.readStoredPage.mockResolvedValueOnce(all);
      const r = await t.service.population(candidateParams(), {});
      expect(r.movers.up.length + r.movers.down.length).toBeGreaterThan(0);
      expect(r.proposal).toMatchObject({
        kind: "seller-trust-candidate-proposal",
        baseVersion: 1,
        environment: { env: "test", isProd: false },
        params: candidateParams(),
        filters: {},
        summary: r.summary,
      });
      const keys = allKeys(r.proposal);
      for (const k of ["userId", "username", ...FORBIDDEN_KEYS]) {
        expect(keys).not.toContain(k);
      }
      const json = JSON.stringify(r.proposal);
      for (const m of r.movers.up) expect(json).not.toContain(m.userId);
    });

    it("reads nothing more for an empty table", async () => {
      const t = build();
      t.sellerTrust.countStored.mockResolvedValue(0);
      const r = await t.service.population(candidateParams(), {});
      expect(t.sellerTrust.readStoredPage).not.toHaveBeenCalled();
      expect(r.summary.rowsRead).toBe(0);
      expect(r.movers).toEqual({ up: [], down: [] });
    });
  });
});

/**
 * The real read graph (table owner, inputs reader, every domain stats
 * service) over a Prisma double whose root client throws: every lab read
 * must go through the snapshot's tx, which takes no write (plan 4.3, proof
 * 3). The domain SQL itself runs against Postgres in the e2e.
 */
describe("SellerTrustLabService over a Prisma double (no root access, no write)", () => {
  function build() {
    const tx = {
      ...baseTx(),
      $queryRaw: jest.fn(async (...args: unknown[]) => {
        const text = sqlText(args);
        if (text.includes("set_config")) return [];
        if (text.includes('"is_test_account" = false')) {
          return [{ id: "u1", createdAt: new Date(Date.now() - 400 * DAY) }];
        }
        if (text.includes("guestEmail")) {
          // A guest counterparty: its key must never reach the response.
          return [{ userId: "u1", counterpartyKey: "guest:abc", count: 2 }];
        }
        return [];
      }),
      user: {
        findUnique: jest.fn(async (args: { where: Record<string, string> }) =>
          args.where.id
            ? {
                id: "u1",
                username: "seller_one",
                deletedAt: null,
                isBanned: false,
                isTestAccount: false,
              }
            : { id: "guest-account" },
        ),
        findMany: jest.fn(async () => []),
      },
      sellerTrustScore: {
        findUnique: jest.fn(async () => null),
        findMany: jest.fn(async () => []),
        count: jest.fn(async () => 0),
      },
    };
    // Any write method on the tx models throws.
    for (const model of [tx.user, tx.sellerTrustScore] as Array<
      Record<string, unknown>
    >) {
      for (const m of [
        "create",
        "createMany",
        "update",
        "updateMany",
        "upsert",
        "delete",
        "deleteMany",
      ]) {
        model[m] = jest.fn(() => {
          throw new Error(`write in the lab: ${m}`);
        });
      }
    }
    const { root, transaction } = fakePrisma(tx);
    const users = new UserSellerTrustStatsService();
    const service = new SellerTrustLabService(
      root as never,
      new SellerTrustService(root as never),
      new SellerTrustInputsReader(
        new OrderSellerTrustStatsService(),
        new RefundSellerTrustStatsService(),
        new RatingSellerTrustStatsService(),
        new TradeSellerTrustStatsService(),
        users,
      ),
      users,
    );
    return { service, tx, transaction };
  }

  it("explains a seller on one READ ONLY snapshot and leaks no counterparty key", async () => {
    const t = build();
    const r = await t.service.seller("u1", "now", candidateParams());
    expect(t.transaction).toHaveBeenCalledTimes(1);
    expect(t.transaction.mock.calls[0][1]).toMatchObject({ timeout: 10_000 });
    expect(t.tx.executed).toEqual([
      "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY",
    ]);
    const timeouts = t.tx.$queryRaw.mock.calls
      .map((c) => Prisma.sql(c[0] as TemplateStringsArray, ...c.slice(1)))
      .filter((q) => q.text.includes("statement_timeout"));
    expect(timeouts.map((q) => q.values)).toEqual([["5000"]]);
    expect(r.live?.inputs).toMatchObject({
      transactions: 2,
      counterparties: 1,
      tenureDays: 400,
    });
    expect(JSON.stringify(r)).not.toContain("guest:abc");
  });

  it("runs a population on one READ ONLY snapshot with no write", async () => {
    const t = build();
    await t.service.population(candidateParams(), { minTransactions: 5 });
    expect(t.transaction).toHaveBeenCalledTimes(1);
    expect(t.transaction.mock.calls[0][1]).toMatchObject({ timeout: 20_000 });
    expect(t.tx.executed).toEqual([
      "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY",
    ]);
    expect(t.tx.sellerTrustScore.count).toHaveBeenCalledTimes(1);
  });

  it("serves params, scenarios and a scenario without touching the client", () => {
    const t = build();
    t.service.params();
    t.service.scenarios();
    t.service.scenario(
      trustInputs({ transactions: 5, counterparties: 3 }),
      null,
    );
    expect(t.transaction).not.toHaveBeenCalled();
  });
});
