import type { Prisma } from "@prisma/client";
import { inBoundedWrite, inReadOnlySnapshot } from "./bounded-transaction";

/** Records every raw statement in order, with its bound values. */
function fakePrisma() {
  const statements: Array<{ sql: string; values: unknown[] }> = [];
  const record = (strings: TemplateStringsArray, ...values: unknown[]) => {
    statements.push({ sql: strings.join("?").replace(/\s+/g, " "), values });
    return Promise.resolve([]);
  };
  const tx = {
    $executeRaw: jest.fn(record),
    $queryRaw: jest.fn(record),
  } as unknown as Prisma.TransactionClient;
  const $transaction = jest.fn(
    (fn: (t: Prisma.TransactionClient) => Promise<unknown>, _opts: unknown) =>
      fn(tx),
  );
  return { prisma: { $transaction } as never, $transaction, tx, statements };
}

describe("inReadOnlySnapshot", () => {
  it("opens a read-only repeatable-read snapshot before anything else", async () => {
    const { prisma, $transaction, statements } = fakePrisma();
    const body = jest.fn(async () => "rows");

    const result = await inReadOnlySnapshot(
      prisma,
      { statementTimeoutMs: 15_000, transactionTimeoutMs: 30_000 },
      body,
    );

    expect(result).toBe("rows");
    expect(statements[0].sql).toBe(
      "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY",
    );
    expect(statements[1].sql).toContain(
      "set_config('statement_timeout', ?, true)",
    );
    expect(statements[1].values).toEqual(["15000"]);
    expect(body).toHaveBeenCalledTimes(1);
    expect($transaction).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 30_000,
      maxWait: 5_000,
    });
  });

  it("propagates a failure so the batch fails as a whole", async () => {
    const { prisma } = fakePrisma();
    await expect(
      inReadOnlySnapshot(
        prisma,
        { statementTimeoutMs: 1, transactionTimeoutMs: 1 },
        async () => {
          throw new Error("canceling statement due to statement timeout");
        },
      ),
    ).rejects.toThrow("statement timeout");
  });
});

describe("inBoundedWrite", () => {
  it("sets transaction-local lock and statement timeouts first", async () => {
    const { prisma, $transaction, statements } = fakePrisma();
    await inBoundedWrite(
      prisma,
      {
        lockTimeoutMs: 2_000,
        statementTimeoutMs: 10_000,
        transactionTimeoutMs: 15_000,
      },
      async () => undefined,
    );
    expect(statements[0].sql).toContain("set_config('lock_timeout', ?, true)");
    expect(statements[0].sql).toContain(
      "set_config('statement_timeout', ?, true)",
    );
    expect(statements[0].values).toEqual(["2000", "10000"]);
    expect($transaction).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 15_000,
      maxWait: 5_000,
    });
  });
});
