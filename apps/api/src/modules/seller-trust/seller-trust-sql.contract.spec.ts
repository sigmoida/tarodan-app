import { Prisma } from "@prisma/client";
import { OrderSellerTrustStatsService } from "../order/stats/order-seller-trust-stats.service";
import { ORDER_CANCEL_REASON } from "../order/helpers/order-cancel-reasons";
import { RatingSellerTrustStatsService } from "../rating/stats/rating-seller-trust-stats.service";
import { RefundSellerTrustStatsService } from "../refund/stats/refund-seller-trust-stats.service";
import { TradeSellerTrustStatsService } from "../trade/stats/trade-seller-trust-stats.service";
import { UserSellerTrustStatsService } from "../user/stats/user-seller-trust-stats.service";
import { SellerTrustService } from "./seller-trust.service";

/**
 * SQL text contract of the seller trust aggregates and writes (ADR 0014,
 * `docs/SELLER_TRUST.md`).
 *
 * The scheduler spec mocks every stats service, and the DB-backed proof
 * (`test/e2e/seller-trust-refresh.e2e-spec.ts`) runs only in the advisory
 * CI e2e job. This spec pins each predicate of formula v1 in the SQL itself,
 * with its bound value, so dropping or loosening one fails a unit run. It
 * cannot prove three-valued NULL logic or plans; the e2e does that.
 */

const asOf = new Date("2026-10-21T23:30:00.000Z");
const since = new Date("2025-10-21T23:30:00.000Z");
const window = { since, until: asOf };

/** Inlines the bound values so a predicate and its value read as one string. */
function literal(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (Array.isArray(value)) return `ARRAY[${value.map(literal).join(",")}]`;
  if (typeof value === "string") return `'${value}'`;
  return String(value);
}

function render(sql: Prisma.Sql): string {
  const parts = sql.sql.split("?");
  let out = parts[0];
  for (let i = 1; i < parts.length; i++) {
    out += literal(sql.values[i - 1]) + parts[i];
  }
  return out.replace(/\s+/g, " ").trim();
}

/** A tx that records every raw statement, rendered, and answers `[]` / 0. */
function recordingTx() {
  const statements: string[] = [];
  const record =
    (answer: unknown) =>
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      statements.push(render(Prisma.sql(strings, ...(values as never[]))));
      return Promise.resolve(answer);
    };
  const tx = {
    $queryRaw: jest.fn(record([])),
    $executeRaw: jest.fn(record(0)),
    user: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  return { tx: tx as unknown as Prisma.TransactionClient, statements };
}

/** The live-lane and platform-service exclusions every order query carries. */
const LIVE_SALE = [
  `"o"."is_test" = false`,
  `o."origin" <> 'platform_service'::"OrderOrigin"`,
];

describe("seller trust SQL contract", () => {
  describe("orders: fulfilmentStats (E, F, S, L)", () => {
    let sql: string;
    beforeAll(async () => {
      const { tx, statements } = recordingTx();
      await new OrderSellerTrustStatsService().fulfilmentStats(
        tx,
        ["s1", "s2"],
        window,
        120,
        ["o-fault"],
      );
      [sql] = statements;
    });

    it("scopes to the batch, paid orders, the live lane and real sales", () => {
      expect(sql).toContain(`o."seller_id" = ANY(ARRAY['s1','s2']::text[])`);
      expect(sql).toContain(`o."preparing_deadline" IS NOT NULL`);
      for (const p of LIVE_SALE) expect(sql).toContain(p);
    });

    it("anchors E to the FIRST deadline, half-open on the run's window (D4)", () => {
      const first = `COALESCE(o."original_preparing_deadline", o."preparing_deadline")`;
      expect(sql).toContain(`${first} AS "first_deadline"`);
      expect(sql).toContain(`${first} >= '${since.toISOString()}'`);
      expect(sql).toContain(`${first} < '${asOf.toISOString()}'`);
      expect(sql).not.toMatch(/"preparing_deadline" <= /);
    });

    it("counts as failures exactly the seller-caused causes", () => {
      expect(sql).toContain(`o."cancelled_by" = 'seller'::"CancellationActor"`);
      // Any actor: legacy rows carry no `cancelled_by`.
      expect(sql).toContain(
        `OR o."cancel_reason" = '${ORDER_CANCEL_REASON.sellerShipDeadlineExpired}'`,
      );
      expect(sql).toContain(
        `o."cancelled_by" = 'platform'::"CancellationActor" AND o."admin_cancel_reason_code" = ANY(ARRAY['stock_error','listing_violation']::text[])`,
      );
      expect(sql).toContain(`OR o."id" = ANY(ARRAY['o-fault']::text[])`);
      // Oversold right after payment: stock is the seller's responsibility
      // (user sign-off, plan section 16). Any actor, like the deadline cancel.
      expect(sql).toContain(
        `OR o."cancel_reason" = '${ORDER_CANCEL_REASON.oversoldAfterPayment}' OR (`,
      );
      // No other actor or reason is a failure.
      expect(sql).not.toMatch(/'(buyer|system)'::"CancellationActor"/);
      for (const neutral of [
        ORDER_CANCEL_REASON.buyerCancelled,
        ORDER_CANCEL_REASON.paymentWindowExpired,
        ORDER_CANCEL_REASON.stockDepleted,
        ORDER_CANCEL_REASON.stockReservedForTrade,
        ORDER_CANCEL_REASON.replacedByNewCheckout,
      ]) {
        expect(sql).not.toContain(`'${neutral}'`);
      }
    });

    it("brings oversold-after-payment cancels into E, anchored at the cancellation", () => {
      // Payment fulfilment clears `preparing_deadline` when it cancels an
      // oversold order, so the deadline branch can never see one.
      expect(sql).toContain(
        `OR ( o."status" = 'cancelled'::"OrderStatus" AND o."cancel_reason" = '${ORDER_CANCEL_REASON.oversoldAfterPayment}' AND COALESCE(o."cancelled_at", o."created_at") >= '${since.toISOString()}' AND COALESCE(o."cancelled_at", o."created_at") < '${asOf.toISOString()}' )`,
      );
      // The paid-order branch keeps its own anchor.
      expect(sql).toContain(
        `( o."preparing_deadline" IS NOT NULL AND COALESCE(o."original_preparing_deadline", o."preparing_deadline") >= '${since.toISOString()}'`,
      );
    });

    it("leaves a cancellation that is not a failure out of E (never against the seller)", () => {
      // `failed` is NULL for an unknown actor/reason: NOT TRUE OR NULL drops
      // the row, so it is neither a success nor a failure. The e2e proves
      // the NULL case against Postgres.
      expect(sql).toContain(
        `o."status" = 'cancelled'::"OrderStatus" AS "cancelled"`,
      );
      expect(sql).toContain(`WHERE NOT b."cancelled" OR b."failed"`);
      expect(sql).toContain(
        `COUNT(*) FILTER (WHERE c."failed")::int AS "failures"`,
      );
    });

    it("measures late against the first deadline plus the grace", () => {
      expect(sql).toContain(`LEFT JOIN "shipments" s ON s."order_id" = b."id"`);
      expect(sql).toContain(`COUNT(c."shipped_at")::int AS "shipped"`);
      expect(sql).toContain(
        `WHERE c."shipped_at" > c."first_deadline" + make_interval(mins => 120::int)`,
      );
    });

    it("binds FALSE, not an empty array, when there is no fault refund", async () => {
      const { tx, statements } = recordingTx();
      await new OrderSellerTrustStatsService().fulfilmentStats(
        tx,
        ["s1"],
        window,
        120,
        [],
      );
      expect(statements[0]).toMatch(/\) \) OR FALSE \) AS "failed"/);
    });
  });

  describe("orders: salesCounterparties (volume)", () => {
    let sql: string;
    beforeAll(async () => {
      const { tx, statements } = recordingTx();
      await new OrderSellerTrustStatsService().salesCounterparties(
        tx,
        ["s1"],
        window,
        "guest-id",
      );
      [sql] = statements;
    });

    it("counts completed live sales completed inside the half-open window", () => {
      expect(sql).toContain(`o."status" = 'completed'::"OrderStatus"`);
      expect(sql).toContain(`o."completed_at" >= '${since.toISOString()}'`);
      expect(sql).toContain(`o."completed_at" < '${asOf.toISOString()}'`);
      for (const p of LIVE_SALE) expect(sql).toContain(p);
    });

    it("keys a guest by the hashed, normalised e-mail and falls back to the order id", () => {
      expect(sql).toContain(
        `WHEN o."buyer_id" IS DISTINCT FROM 'guest-id'::text THEN o."buyer_id"`,
      );
      expect(sql).toContain(
        `THEN 'guest:' || md5(lower(btrim(o."shipping_address"->>'guestEmail')))`,
      );
      expect(sql).toContain(`ELSE 'order:' || o."id"`);
      expect(sql).toContain(`GROUP BY 1, 2`);
    });
  });

  it("orders: activeSellerIds finds live, paid real-sale sellers", async () => {
    const { tx, statements } = recordingTx();
    await new OrderSellerTrustStatsService().activeSellerIds(tx, since);
    expect(statements[0]).toContain(
      `o."preparing_deadline" >= '${since.toISOString()}'`,
    );
    for (const p of LIVE_SALE) expect(statements[0]).toContain(p);
  });

  it("refunds: only completed, reviewed seller-fault refunds of live sales", async () => {
    const { tx, statements } = recordingTx();
    await new RefundSellerTrustStatsService().sellerFaultOrderIds(
      tx,
      ["s1"],
      since,
    );
    const [sql] = statements;
    expect(sql).toContain(`rr."fault_party" = 'seller'::"RefundFaultParty"`);
    expect(sql).toContain(`rr."status" = 'refunded'::"RefundRequestStatus"`);
    expect(sql).toContain(`o."seller_id" = ANY(ARRAY['s1']::text[])`);
    expect(sql).toContain(`o."preparing_deadline" >= '${since.toISOString()}'`);
    for (const p of LIVE_SALE) expect(sql).toContain(p);
    // The buyer's claimed reason is never read.
    expect(sql).not.toContain(`"reason"`);
  });

  describe("ratings: sellerRatingStats", () => {
    let sql: string;
    beforeAll(async () => {
      const { tx, statements } = recordingTx();
      await new RatingSellerTrustStatsService().sellerRatingStats(
        tx,
        ["s1"],
        window,
      );
      [sql] = statements;
    });

    it("counts published ratings inside the half-open window, banned givers dropped", () => {
      expect(sql).toContain(`r."receiver_id" = ANY(ARRAY['s1']::text[])`);
      expect(sql).toContain(`r."status" = 'approved'::"RatingStatus"`);
      expect(sql).toContain(`r."created_at" >= '${since.toISOString()}'`);
      expect(sql).toContain(`r."created_at" < '${asOf.toISOString()}'`);
      expect(sql).toContain(`JOIN "users" g ON g."id" = r."giver_id"`);
      expect(sql).toContain(`g."is_banned" = false`);
    });

    it("counts an order rating only when received as the seller of a live real sale", () => {
      expect(sql).toContain(
        `o."id" IS NOT NULL AND o."seller_id" = r."receiver_id" AND "o"."is_test" = false AND o."origin" <> 'platform_service'::"OrderOrigin"`,
      );
      expect(sql).toContain(
        `t."id" IS NOT NULL AND t."status" = 'completed'::"TradeStatus" AND "t"."is_test" = false`,
      );
    });

    it("gives each giver one vote: average per giver, then count givers", () => {
      expect(sql).toContain(
        `AVG("score")::float8 AS "mean" FROM counted GROUP BY 1, 2`,
      );
      expect(sql).toContain(`COUNT(*)::int AS "raters"`);
      expect(sql).toContain(`SUM("mean")::float8 AS "sumOfGiverMeans"`);
    });
  });

  describe("trades", () => {
    it("tradeCounterparties: completed live trades, both sides, half-open window", async () => {
      const { tx, statements } = recordingTx();
      await new TradeSellerTrustStatsService().tradeCounterparties(
        tx,
        ["u1"],
        window,
      );
      const [sql] = statements;
      for (const side of ["initiator_id", "receiver_id"]) {
        expect(sql).toContain(`t."${side}" = ANY(ARRAY['u1']::text[])`);
      }
      expect(
        sql.match(/t\."status" = 'completed'::"TradeStatus"/g),
      ).toHaveLength(2);
      expect(sql.match(/"t"\."is_test" = false/g)).toHaveLength(2);
      expect(
        sql.match(
          new RegExp(`t\\."completed_at" < '${asOf.toISOString()}'`, "g"),
        ),
      ).toHaveLength(2);
      expect(sql).toContain("UNION ALL");
    });

    it("activeTraderIds: completed live trades, both sides", async () => {
      const { tx, statements } = recordingTx();
      await new TradeSellerTrustStatsService().activeTraderIds(tx, since);
      const [sql] = statements;
      expect(sql).toContain(`SELECT t."initiator_id" AS "id"`);
      expect(sql).toContain(`SELECT t."receiver_id" FROM "trades" t`);
      expect(sql.match(/"t"\."is_test" = false/g)).toHaveLength(2);
    });
  });

  it("users: deleted, banned and test-lane accounts get no score; nothing else is filtered (D5)", async () => {
    const { tx, statements } = recordingTx();
    await new UserSellerTrustStatsService().trustEligibleUsers(tx, ["u1"]);
    const [sql] = statements;
    expect(sql).toMatch(
      /^SELECT u\."id", u\."created_at" AS "createdAt" FROM "users" u/,
    );
    const where = sql.slice(sql.indexOf("WHERE"), sql.indexOf("ORDER BY"));
    expect(where.trim()).toBe(
      `WHERE u."id" = ANY(ARRAY['u1']::text[]) AND u."deleted_at" IS NULL AND u."is_banned" = false AND u."is_test_account" = false`,
    );
  });

  describe("writes: only seller_trust_scores, never users", () => {
    function serviceWithTx() {
      const { tx, statements } = recordingTx();
      const prisma = {
        $transaction: jest.fn(
          (fn: (t: Prisma.TransactionClient) => Promise<unknown>) => fn(tx),
        ),
      };
      return {
        service: new SellerTrustService(prisma as never),
        statements,
        prisma,
      };
    }
    const row = {
      userId: "s1",
      scoreX100: 395,
      formulaVersion: 1,
      components: { version: 1 } as never,
    };

    it("upserts by user_id, stamped with asOf, in a bounded write", async () => {
      const { service, statements } = serviceWithTx();
      await service.upsertBatch([row], asOf);
      expect(statements[0]).toContain("set_config('lock_timeout'");
      const write = statements[1];
      expect(write).toMatch(/^INSERT INTO "seller_trust_scores" /);
      expect(write).toContain(
        `VALUES ('s1', 395::smallint, 1::smallint, '{"version":1}'::jsonb, '${asOf.toISOString()}')`,
      );
      expect(write).toContain(`ON CONFLICT ("user_id") DO UPDATE SET`);
      expect(write).toContain(`"computed_at" = EXCLUDED."computed_at"`);
    });

    it("writes nothing for an empty batch", async () => {
      const { service, prisma } = serviceWithTx();
      await expect(service.upsertBatch([], asOf)).resolves.toBe(0);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("cleanup deletes only rows older than the run's asOf, never the whole table", async () => {
      const { service, statements } = serviceWithTx();
      await service.deleteStale(asOf);
      expect(statements[1]).toBe(
        `DELETE FROM "seller_trust_scores" WHERE "computed_at" < '${asOf.toISOString()}'`,
      );
    });

    it("no trust statement writes to users", async () => {
      const { service, statements } = serviceWithTx();
      await service.upsertBatch([row], asOf);
      await service.deleteStale(asOf);
      const { tx, statements: reads } = recordingTx();
      const order = new OrderSellerTrustStatsService();
      await order.activeSellerIds(tx, since);
      await order.fulfilmentStats(tx, ["s1"], window, 120, []);
      await order.salesCounterparties(tx, ["s1"], window, null);
      await new RefundSellerTrustStatsService().sellerFaultOrderIds(
        tx,
        ["s1"],
        since,
      );
      await new RatingSellerTrustStatsService().sellerRatingStats(
        tx,
        ["s1"],
        window,
      );
      await new TradeSellerTrustStatsService().activeTraderIds(tx, since);
      await new TradeSellerTrustStatsService().tradeCounterparties(
        tx,
        ["s1"],
        window,
      );
      await new UserSellerTrustStatsService().trustEligibleUsers(tx, ["s1"]);
      for (const sql of [...statements, ...reads]) {
        expect(sql).not.toMatch(
          /\b(UPDATE|INSERT INTO|DELETE FROM)\s+"users"/i,
        );
      }
      // The reads write nothing at all.
      for (const sql of reads) {
        expect(sql).not.toMatch(/\b(UPDATE|INSERT|DELETE)\b/i);
      }
      // Only the one table is ever written.
      const written = statements
        .map((s) => s.match(/^(?:INSERT INTO|DELETE FROM) "([a-z_]+)"/)?.[1])
        .filter(Boolean);
      expect(written).toEqual(["seller_trust_scores", "seller_trust_scores"]);
    });
  });
});
