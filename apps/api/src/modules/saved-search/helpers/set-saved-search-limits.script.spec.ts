/**
 * The post-deploy step `maintenance/set-saved-search-limits.ts` (critical
 * path 13, docs/OPERATIONS.md): dry by default, a compare-and-set write with
 * `--apply`, and a report of what was really written. The plan itself is
 * pinned in `saved-search-tier-limits.spec.ts`; this runs the script as the
 * runbook does, against a Prisma fake that applies the `where` of each write.
 */
type TierType = "free" | "basic" | "premium" | "business";

interface UpdateManyArgs {
  where: { type: TierType; maxSavedSearches: number };
  data: { maxSavedSearches: number };
}

interface FakePrisma {
  membershipTier: {
    findMany: jest.Mock;
    updateMany: jest.Mock;
  };
  $transaction: jest.Mock;
  $disconnect: jest.Mock;
}

let mockPrisma: FakePrisma;

jest.mock("@prisma/client", () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

const LAUNCH_DEFAULTS: Record<TierType, number> = {
  free: 5,
  basic: 5,
  premium: 5,
  business: 5,
};

/**
 * Runs the script once. `read` is what the script's read sees; `atWrite` is
 * the table when its transaction runs (an admin edit in between).
 */
async function runScript(opts: {
  argv?: string[];
  read: Record<TierType, number>;
  atWrite?: Record<TierType, number>;
  readFails?: boolean;
}) {
  const table = { ...(opts.atWrite ?? opts.read) };
  const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
  const error = jest
    .spyOn(console, "error")
    .mockImplementation(() => undefined);
  let finished!: () => void;
  const done = new Promise<void>((resolve) => (finished = resolve));

  mockPrisma = {
    membershipTier: {
      findMany: opts.readFails
        ? jest.fn().mockRejectedValue(new Error("connection refused"))
        : jest.fn().mockResolvedValue(
            (Object.keys(opts.read) as TierType[]).map((type) => ({
              type,
              maxSavedSearches: opts.read[type],
            })),
          ),
      // A deferred operation, as Prisma returns before `$transaction` runs it.
      updateMany: jest.fn((args: UpdateManyArgs) => args),
    },
    $transaction: jest.fn(async (ops: UpdateManyArgs[]) =>
      ops.map(({ where, data }) => {
        if (table[where.type] !== where.maxSavedSearches) return { count: 0 };
        table[where.type] = data.maxSavedSearches;
        return { count: 1 };
      }),
    ),
    $disconnect: jest.fn(async () => finished()),
  };

  const argv = process.argv;
  const exitCode = process.exitCode;
  process.argv = ["node", "set-saved-search-limits.js", ...(opts.argv ?? [])];
  try {
    jest.isolateModules(() => {
      require("../../../../maintenance/set-saved-search-limits");
    });
    await done;
    const lines = log.mock.calls.map((call) => String(call[0]));
    return {
      lines,
      output: lines.join("\n"),
      table,
      exitCode: process.exitCode,
      errors: error.mock.calls,
    };
  } finally {
    process.argv = argv;
    process.exitCode = exitCode;
    log.mockRestore();
    error.mockRestore();
  }
}

describe("maintenance/set-saved-search-limits", () => {
  it("is a dry run without --apply: it prints the plan and writes nothing", async () => {
    const { output, table } = await runScript({ read: LAUNCH_DEFAULTS });

    expect(output).toContain("Change basic: 5 -> 10");
    expect(output).toContain("Change premium: 5 -> 20");
    expect(output).toContain("Change business: 5 -> 50");
    expect(output).toContain("[DRY RUN] Nothing written");
    expect(mockPrisma.membershipTier.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(table).toEqual(LAUNCH_DEFAULTS);
  });

  it("with --apply, writes each planned tier only where it is still at 5", async () => {
    const { output, table } = await runScript({
      argv: ["--apply"],
      read: LAUNCH_DEFAULTS,
    });

    expect(mockPrisma.membershipTier.updateMany.mock.calls).toEqual([
      [
        {
          where: { type: "basic", maxSavedSearches: 5 },
          data: { maxSavedSearches: 10 },
        },
      ],
      [
        {
          where: { type: "premium", maxSavedSearches: 5 },
          data: { maxSavedSearches: 20 },
        },
      ],
      [
        {
          where: { type: "business", maxSavedSearches: 5 },
          data: { maxSavedSearches: 50 },
        },
      ],
    ]);
    // One transaction: all planned tiers or none.
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(table).toEqual({ free: 5, basic: 10, premium: 20, business: 50 });
    expect(output).toContain("Updated 3 of 3 planned tier(s).");
    expect(output).not.toContain("changed since the read");
  });

  it("keeps an admin edit made between the read and the write, and says so", async () => {
    const { output, table } = await runScript({
      argv: ["--apply"],
      read: LAUNCH_DEFAULTS,
      atWrite: { ...LAUNCH_DEFAULTS, premium: 25 },
    });

    expect(table).toEqual({ free: 5, basic: 10, premium: 25, business: 50 });
    expect(output).toContain("Updated 2 of 3 planned tier(s).");
    expect(output).toContain("changed since the read");
  });

  it("changes nothing on a re-run", async () => {
    const after = { free: 5, basic: 10, premium: 20, business: 50 };
    const { output, table } = await runScript({
      argv: ["--apply"],
      read: after,
    });

    expect(output).toContain("Nothing to change.");
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(table).toEqual(after);
  });

  it("fails with exit code 1 and disconnects when the read fails", async () => {
    const { exitCode, errors } = await runScript({
      argv: ["--apply"],
      read: LAUNCH_DEFAULTS,
      readFails: true,
    });

    expect(exitCode).toBe(1);
    expect(errors).toHaveLength(1);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.$disconnect).toHaveBeenCalledTimes(1);
  });
});
