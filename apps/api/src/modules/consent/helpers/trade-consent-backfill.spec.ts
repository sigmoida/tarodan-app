import { ConsentAction, Prisma } from "@prisma/client";
import { TRADE_CONSENT_UNIQUE_INDEX } from "./distance-sales-trade";
import {
  TradeConsentBackfillError,
  applyTradeConsentBackfill,
  planTradeConsentBackfill,
  planTradeConsentBackfillFromDb,
} from "./trade-consent-backfill";

interface FakeRow {
  id: string;
  document: string;
  action: ConsentAction;
  tradeCashPaymentId: string | null;
  details: Record<string, unknown> | null;
  createdAt: Date;
}

const at = (minute: number) =>
  new Date(`2026-10-20T10:${String(minute).padStart(2, "0")}:00Z`);

const legacy = (
  id: string,
  tradeCashPaymentId: string,
  minute: number,
  action: ConsentAction = ConsentAction.granted,
): FakeRow => ({
  id,
  document: "distance_sales",
  action,
  tradeCashPaymentId: null,
  details: { tradeId: "t", tradeNumber: "TKS-1", tradeCashPaymentId },
  createdAt: at(minute),
});

/**
 * A Prisma fake over an in-memory `consent_records`: `$queryRaw` answers the
 * candidate query (the SQL itself is pinned by its text), `updateMany`
 * is the CAS and enforces the partial unique index and the append-only rule
 * (the column may only be filled with the row's own details reference).
 */
function makeDb(rows: FakeRow[], paymentIds: string[]) {
  const uniqueViolation = () =>
    new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
      meta: { target: TRADE_CONSENT_UNIQUE_INDEX },
    });
  const db = {
    $queryRaw: jest.fn(async () =>
      rows
        .filter(
          (r) =>
            r.document === "distance_sales" &&
            r.tradeCashPaymentId === null &&
            typeof r.details?.tradeCashPaymentId === "string",
        )
        .sort(
          (a, b) =>
            a.createdAt.getTime() - b.createdAt.getTime() ||
            a.id.localeCompare(b.id),
        )
        .map((r) => ({
          id: r.id,
          action: r.action,
          tradeCashPaymentId: r.details!.tradeCashPaymentId as string,
          createdAt: r.createdAt,
        })),
    ),
    tradeCashPayment: {
      findMany: jest.fn(
        async ({ where }: { where: { id: { in: string[] } } }) =>
          paymentIds
            .filter((id) => where.id.in.includes(id))
            .map((id) => ({ id })),
      ),
    },
    consentRecord: {
      findMany: jest.fn(
        async ({
          where,
        }: {
          where: { tradeCashPaymentId: { in: string[] }; action: string };
        }) =>
          rows
            .filter(
              (r) =>
                r.document === "distance_sales" &&
                r.action === where.action &&
                r.tradeCashPaymentId !== null &&
                where.tradeCashPaymentId.in.includes(r.tradeCashPaymentId),
            )
            .map((r) => ({ tradeCashPaymentId: r.tradeCashPaymentId })),
      ),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; tradeCashPaymentId: null };
          data: { tradeCashPaymentId: string };
        }) => {
          const row = rows.find(
            (r) => r.id === where.id && r.tradeCashPaymentId === null,
          );
          if (!row) return { count: 0 };
          if (row.details?.tradeCashPaymentId !== data.tradeCashPaymentId) {
            throw new Error("consent_records: UPDATE refused");
          }
          if (
            row.action === ConsentAction.granted &&
            rows.some(
              (r) =>
                r.action === ConsentAction.granted &&
                r.tradeCashPaymentId === data.tradeCashPaymentId,
            )
          ) {
            throw uniqueViolation();
          }
          row.tradeCashPaymentId = data.tradeCashPaymentId;
          return { count: 1 };
        },
      ),
    },
  };
  return db;
}

describe("planTradeConsentBackfill", () => {
  it("sets an existing payment, skips a missing one and keeps the earliest of a duplicate", () => {
    const plan = planTradeConsentBackfill({
      candidates: [
        { ...legacy("c1", "tcp-1", 1), tradeCashPaymentId: "tcp-1" },
        { ...legacy("c2", "tcp-gone", 2), tradeCashPaymentId: "tcp-gone" },
        { ...legacy("c3", "tcp-1", 3), tradeCashPaymentId: "tcp-1" },
        { ...legacy("c4", "tcp-held", 4), tradeCashPaymentId: "tcp-held" },
        {
          ...legacy("c5", "tcp-1", 5, ConsentAction.withdrawn),
          tradeCashPaymentId: "tcp-1",
        },
      ],
      existingPaymentIds: new Set(["tcp-1", "tcp-held"]),
      heldPaymentIds: new Set(["tcp-held"]),
    });

    expect(plan.map((r) => [r.consentRecordId, r.outcome])).toEqual([
      ["c1", "set"],
      ["c2", "payment_missing"],
      ["c3", "duplicate"],
      ["c4", "duplicate"],
      // Only granted rows are unique per payment.
      ["c5", "set"],
    ]);
  });
});

describe("trade consent backfill against a Prisma fake", () => {
  const seed = (): FakeRow[] => [
    legacy("c1", "tcp-1", 1),
    legacy("c2", "tcp-gone", 2),
    legacy("c3", "tcp-1", 3),
    legacy("c4", "tcp-2", 4),
    // Already written with the column: not a candidate.
    {
      id: "c5",
      document: "distance_sales",
      action: ConsentAction.granted,
      tradeCashPaymentId: "tcp-3",
      details: { tradeCashPaymentId: "tcp-3" },
      createdAt: at(5),
    },
    // A cart consent: no trade reference, never touched.
    {
      id: "c6",
      document: "distance_sales",
      action: ConsentAction.granted,
      tradeCashPaymentId: null,
      details: null,
      createdAt: at(6),
    },
  ];

  it("the dry run lists what it would set and writes nothing", async () => {
    const rows = seed();
    const db = makeDb(rows, ["tcp-1", "tcp-2", "tcp-3"]);

    const plan = await planTradeConsentBackfillFromDb(db as never);

    expect(plan).toEqual([
      { consentRecordId: "c1", tradeCashPaymentId: "tcp-1", outcome: "set" },
      {
        consentRecordId: "c2",
        tradeCashPaymentId: "tcp-gone",
        outcome: "payment_missing",
      },
      {
        consentRecordId: "c3",
        tradeCashPaymentId: "tcp-1",
        outcome: "duplicate",
      },
      { consentRecordId: "c4", tradeCashPaymentId: "tcp-2", outcome: "set" },
    ]);
    expect(db.consentRecord.updateMany).not.toHaveBeenCalled();
    expect(rows.filter((r) => r.tradeCashPaymentId !== null)).toHaveLength(1);
  });

  it("applies the plan with a CAS and is idempotent on a re-run", async () => {
    const rows = seed();
    const db = makeDb(rows, ["tcp-1", "tcp-2", "tcp-3"]);

    const first = await applyTradeConsentBackfill(
      db as never,
      await planTradeConsentBackfillFromDb(db as never),
    );
    expect(first).toEqual({ updated: 2, skipped: 0 });
    expect(
      Object.fromEntries(rows.map((r) => [r.id, r.tradeCashPaymentId])),
    ).toEqual({
      c1: "tcp-1",
      c2: null,
      c3: null,
      c4: "tcp-2",
      c5: "tcp-3",
      c6: null,
    });
    expect(db.consentRecord.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", tradeCashPaymentId: null },
      data: { tradeCashPaymentId: "tcp-1" },
    });

    // Second run: c1 now holds tcp-1, so c3 is a duplicate; nothing is set.
    const replan = await planTradeConsentBackfillFromDb(db as never);
    expect(replan.filter((r) => r.outcome === "set")).toEqual([]);
    const second = await applyTradeConsentBackfill(db as never, replan);
    expect(second).toEqual({ updated: 0, skipped: 0 });
  });

  it("re-applying a stale plan changes nothing (the CAS finds the column set)", async () => {
    const rows = seed();
    const db = makeDb(rows, ["tcp-1", "tcp-2", "tcp-3"]);
    const plan = await planTradeConsentBackfillFromDb(db as never);

    await applyTradeConsentBackfill(db as never, plan);
    const again = await applyTradeConsentBackfill(db as never, plan);

    expect(again).toEqual({ updated: 0, skipped: 2 });
  });

  it("skips a row whose payment another row took between plan and write", async () => {
    const rows = [legacy("c1", "tcp-1", 1)];
    const db = makeDb(rows, ["tcp-1"]);
    const plan = await planTradeConsentBackfillFromDb(db as never);
    // A new image's write of the same payment lands in between.
    rows.push({
      id: "c-new",
      document: "distance_sales",
      action: ConsentAction.granted,
      tradeCashPaymentId: "tcp-1",
      details: { tradeCashPaymentId: "tcp-1" },
      createdAt: at(9),
    });

    await expect(applyTradeConsentBackfill(db as never, plan)).resolves.toEqual(
      { updated: 0, skipped: 1 },
    );
    expect(rows[0].tradeCashPaymentId).toBeNull();
  });

  it("stops on any other error and reports the progress", async () => {
    const rows = seed();
    const db = makeDb(rows, ["tcp-1", "tcp-2", "tcp-3"]);
    const plan = await planTradeConsentBackfillFromDb(db as never);
    db.consentRecord.updateMany
      .mockImplementationOnce(async () => ({ count: 1 }))
      .mockImplementationOnce(async () => {
        throw new Error("connection lost");
      });

    const failure = await applyTradeConsentBackfill(db as never, plan).catch(
      (e: unknown) => e,
    );
    expect(failure).toBeInstanceOf(TradeConsentBackfillError);
    expect((failure as TradeConsentBackfillError).progress).toEqual({
      updated: 1,
      skipped: 0,
    });
  });

  it("selects only legacy distance sales rows with a string reference, oldest first", async () => {
    const db = makeDb([], []);

    await planTradeConsentBackfillFromDb(db as never);

    const [query] = db.$queryRaw.mock.calls[0] as unknown as [Prisma.Sql];
    const sql = query.sql.replace(/\s+/g, " ");
    expect(sql).toContain("FROM consent_records");
    expect(sql).toContain("document = 'distance_sales'");
    expect(sql).toContain("trade_cash_payment_id IS NULL");
    expect(sql).toContain(
      "jsonb_typeof(details -> 'tradeCashPaymentId') = 'string'",
    );
    expect(sql).toContain("ORDER BY created_at ASC, id ASC");
    // No lookups for an empty candidate set.
    expect(db.tradeCashPayment.findMany).not.toHaveBeenCalled();
  });
});
