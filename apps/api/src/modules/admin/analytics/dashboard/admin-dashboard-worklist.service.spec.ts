import { DASHBOARD_QUEUE_KEYS, DASHBOARD_QUEUE_PARTS } from "@tarodan/types";
import { AdminDashboardWorklistService } from "./admin-dashboard-worklist.service";
import { QUEUE_PART_DEFINITIONS } from "./dashboard-queue.definitions";
import { ALERT_DEFINITIONS } from "./dashboard-alert.definitions";

const ALERT_COUNT = Object.keys(ALERT_DEFINITIONS).length;
const PART_COUNT = DASHBOARD_QUEUE_KEYS.flatMap(
  (queue) => DASHBOARD_QUEUE_PARTS[queue],
).length;

describe("AdminDashboardWorklistService", () => {
  const OLD = new Date("2026-03-01T00:00:00.000Z");
  const RECENT = new Date("2026-09-01T00:00:00.000Z");

  let prisma: any;
  let cache: any;
  let revenueSplit: any;
  let service: AdminDashboardWorklistService;
  /** Per-part reading the stubbed aggregate should answer with. */
  let partReadings: Record<string, { count: number; oldestAt: Date | null }>;
  /** Per-alert count the stubbed query should answer with. */
  let alertCounts: Record<string, number>;

  beforeEach(() => {
    partReadings = {};
    alertCounts = {};

    // Every definition is stubbed at its own `read`, so the service's assembly
    // (totals, subsets, oldest, ordering, hiding zeros) is what is under test.
    const queueParts = QUEUE_PART_DEFINITIONS as Record<string, any>;
    for (const key of Object.keys(queueParts)) {
      jest.spyOn(queueParts[key], "query").mockReturnValue(key);
      jest
        .spyOn(queueParts[key], "read")
        .mockImplementation(
          () => partReadings[key] ?? { count: 0, oldestAt: null },
        );
    }
    const alerts = ALERT_DEFINITIONS as Record<string, any>;
    for (const key of Object.keys(alerts)) {
      jest.spyOn(alerts[key], "query").mockReturnValue(key);
      jest
        .spyOn(alerts[key], "read")
        .mockImplementation(() => ({ count: alertCounts[key] ?? 0 }));
    }

    prisma = {
      $transaction: jest.fn(async (ops: unknown[]) => ops),
    };
    cache = {
      getOrSet: jest.fn(async (_key: string, factory: () => Promise<unknown>) =>
        factory(),
      ),
      del: jest.fn(),
    };
    revenueSplit = {
      compute: jest.fn(async () => ({
        diagnostics: {
          paymentsWithoutOrders: 0,
          ordersWithoutHold: 0,
          productTaxTotal: 0,
          commissionLedgerDrift: 0,
        },
      })),
    };

    service = new AdminDashboardWorklistService(
      prisma,
      cache,
      { get: () => undefined } as any,
      revenueSplit,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it("batches every queue line and every alert into two transactions", async () => {
    await service.getWorklist();

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    const sizes = prisma.$transaction.mock.calls.map(
      (call: any[]) => call[0].length,
    );
    expect(sizes.sort((a: number, b: number) => a - b)).toEqual(
      [PART_COUNT, ALERT_COUNT].sort((a, b) => a - b),
    );
  });

  it("returns a tile per catalogued queue, each with its deep link", async () => {
    const { queues } = await service.getWorklist();

    expect(queues.map((tile) => tile.key)).toEqual([...DASHBOARD_QUEUE_KEYS]);
    for (const tile of queues) {
      expect(tile.href).toMatch(/^\//);
      for (const part of tile.parts) expect(part.href).toMatch(/^\//);
    }
  });

  it("totals a tile's lines but never double-counts a highlighted subset", async () => {
    partReadings.ticketsOpen = { count: 7, oldestAt: RECENT };
    partReadings.ticketsUrgent = { count: 3, oldestAt: RECENT };
    partReadings.reportsPending = { count: 2, oldestAt: RECENT };

    const { queues } = await service.getWorklist();
    const support = queues.find((tile) => tile.key === "supportAndReports");

    // 7 open (3 of them urgent) + 2 reports — not 12.
    expect(support?.total).toBe(9);
  });

  it("ages a tile by its OLDEST waiting item, ignoring empty lines", async () => {
    partReadings.refundsPendingReview = { count: 1, oldestAt: RECENT };
    // An empty line still carries the stamp of nothing — it must not win.
    partReadings.refundsDisputed = { count: 0, oldestAt: OLD };

    const { queues } = await service.getWorklist();
    const refunds = queues.find((tile) => tile.key === "refundRequests");

    expect(refunds?.oldestAt).toBe(RECENT.toISOString());
  });

  it("hides alerts that are at zero and keeps catalogue order for the rest", async () => {
    alertCounts.outboxDead = 2;
    alertCounts.staleCouponReservations = 5;

    const { alerts } = await service.getWorklist();

    expect(alerts.map((alert) => alert.key)).toEqual([
      "outboxDead",
      "staleCouponReservations",
    ]);
    expect(alerts[0]).toMatchObject({ count: 2, severity: "critical" });
  });

  it("raises the reconciliation diagnostics as alerts of their own", async () => {
    revenueSplit.compute.mockResolvedValue({
      diagnostics: {
        paymentsWithoutOrders: 2,
        ordersWithoutHold: 1,
        productTaxTotal: 0,
        commissionLedgerDrift: -12.5,
      },
    });

    const { alerts } = await service.getWorklist();
    const keys = alerts.map((alert) => alert.key);

    expect(keys).toContain("commissionLedgerDrift");
    expect(keys).toContain("paymentsWithoutOrders");
    expect(keys).toContain("ordersWithoutHold");
    expect(
      alerts.find((alert) => alert.key === "commissionLedgerDrift")?.amount,
    ).toBe(-12.5);
  });

  it("still renders the strip when the diagnostics query fails", async () => {
    revenueSplit.compute.mockRejectedValue(new Error("reconciliation down"));
    alertCounts.outboxDead = 1;

    const { alerts } = await service.getWorklist();

    expect(alerts.map((alert) => alert.key)).toEqual(["outboxDead"]);
  });

  it("caches the whole strip under one shared key — no per-admin data in it", async () => {
    await service.getWorklist();

    expect(cache.getOrSet).toHaveBeenCalledWith(
      AdminDashboardWorklistService.CACHE_KEY,
      expect.any(Function),
      { ttl: AdminDashboardWorklistService.CACHE_TTL_SECONDS },
    );
    expect(AdminDashboardWorklistService.CACHE_TTL_SECONDS).toBeLessThanOrEqual(
      60,
    );
  });
});
