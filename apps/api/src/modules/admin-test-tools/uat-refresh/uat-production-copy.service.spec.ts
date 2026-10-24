import { UAT_REFRESH_TIMEOUT_MINUTES } from "@tarodan/types";
import { UatProductionCopyService } from "./uat-production-copy.service";
import {
  productionCopyCutoff,
  type ProductionCopyRun,
} from "../helpers/uat-refresh.helper";

/**
 * D1 staging guard: the staging database is a masked copy of production (UAT
 * refresh), with production's cancelled-but-unrefunded orders in it. Staging
 * talks to the PayTR TEST store, which refuses their refunds forever, so the
 * refund sweeps must not touch rows that came from production. A refresh run
 * records when production was dumped (`sourceSnapshotAt`); every row created
 * up to that instant is a copy.
 *
 * Fail safe both ways: on live production the guard is off without a query
 * (refunds there must never be skipped), and on staging an unfinished refresh
 * counts everything up to now (or its hard timeout) as copied.
 */
const MINUTE = 60_000;
const NOW = new Date("2026-10-23T12:00:00.000Z");
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs);

const run = (over: Partial<ProductionCopyRun> = {}): ProductionCopyRun => ({
  state: "succeeded",
  dryRun: false,
  requestedAt: at(-60 * MINUTE),
  startedAt: at(-55 * MINUTE),
  finishedAt: at(-10 * MINUTE),
  sourceSnapshotAt: at(-50 * MINUTE),
  ...over,
});

describe("productionCopyCutoff", () => {
  it("no refresh, no copy", () => {
    expect(productionCopyCutoff([], NOW)).toBeNull();
  });

  it("a finished refresh: rows up to the production dump are copies", () => {
    expect(productionCopyCutoff([run()], NOW)).toEqual(at(-50 * MINUTE));
  });

  it("the latest copy wins over older refreshes", () => {
    const older = run({ sourceSnapshotAt: at(-3 * 24 * 60 * MINUTE) });
    expect(productionCopyCutoff([older, run()], NOW)).toEqual(at(-50 * MINUTE));
  });

  it("dry runs and runs that failed before the dump copied nothing", () => {
    expect(
      productionCopyCutoff(
        [
          run({ dryRun: true }),
          run({ state: "failed", sourceSnapshotAt: null, finishedAt: NOW }),
        ],
        NOW,
      ),
    ).toBeNull();
  });

  it("a failed run that got as far as the dump may have swapped: counted (fail safe)", () => {
    expect(productionCopyCutoff([run({ state: "failed" })], NOW)).toEqual(
      at(-50 * MINUTE),
    );
  });

  it("a running refresh (snapshot not reported yet): everything up to now", () => {
    expect(
      productionCopyCutoff(
        [run({ state: "running", sourceSnapshotAt: null, finishedAt: null })],
        NOW,
      ),
    ).toEqual(NOW);
  });

  it("a run that never reported back: capped at its hard timeout", () => {
    const startedAt = at(-(UAT_REFRESH_TIMEOUT_MINUTES + 30) * MINUTE);
    expect(
      productionCopyCutoff(
        [
          run({
            state: "running",
            startedAt,
            sourceSnapshotAt: null,
            finishedAt: null,
          }),
        ],
        NOW,
      ),
    ).toEqual(
      new Date(startedAt.getTime() + UAT_REFRESH_TIMEOUT_MINUTES * MINUTE),
    );
  });

  it("a queued run whose 'running' report was lost is treated like a running one", () => {
    expect(
      productionCopyCutoff(
        [
          run({
            state: "queued",
            startedAt: null,
            sourceSnapshotAt: null,
            finishedAt: null,
          }),
        ],
        NOW,
      ),
    ).toEqual(NOW);
  });

  it("a succeeded run without a snapshot falls back to its finish time", () => {
    expect(
      productionCopyCutoff([run({ sourceSnapshotAt: null })], NOW),
    ).toEqual(at(-10 * MINUTE));
  });
});

describe("UatProductionCopyService.copiedBefore", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  const make = (rows: ProductionCopyRun[]) => {
    const prisma = {
      uatRefreshRun: { findMany: jest.fn().mockResolvedValue(rows) },
    };
    return {
      service: new UatProductionCopyService(prisma as never),
      prisma,
    };
  };

  it("live production: no cutoff and no query, whatever the table holds", async () => {
    process.env.NODE_ENV = "production";
    process.env.APP_ENV = "production";
    const { service, prisma } = make([run()]);

    await expect(service.copiedBefore(NOW)).resolves.toBeNull();
    expect(prisma.uatRefreshRun.findMany).not.toHaveBeenCalled();
  });

  it("an optimized build without APP_ENV counts as live (fail closed)", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.APP_ENV;
    const { service, prisma } = make([run()]);

    await expect(service.copiedBefore(NOW)).resolves.toBeNull();
    expect(prisma.uatRefreshRun.findMany).not.toHaveBeenCalled();
  });

  it("staging: the cutoff of the recorded refresh runs", async () => {
    process.env.NODE_ENV = "production";
    process.env.APP_ENV = "staging";
    const { service, prisma } = make([run()]);

    await expect(service.copiedBefore(NOW)).resolves.toEqual(at(-50 * MINUTE));
    expect(prisma.uatRefreshRun.findMany).toHaveBeenCalledWith({
      where: { dryRun: false },
      select: {
        state: true,
        dryRun: true,
        requestedAt: true,
        startedAt: true,
        finishedAt: true,
        sourceSnapshotAt: true,
      },
    });
  });
});
