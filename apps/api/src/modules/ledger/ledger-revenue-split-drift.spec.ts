import { LedgerReconciliationService } from "./ledger-reconciliation.service";

/**
 * 7. invariant — ciro bölünmesi (Finans Özeti S1 ile aynı hesap). Tahsilat,
 * snapshot kolonlarından türeyen bileşenlere tam bölünmeli; fark ≠ 0 ⇒ alarm.
 */
function makePrisma() {
  return {
    ledgerEntry: { findMany: jest.fn().mockResolvedValue([]) },
    payment: { findMany: jest.fn().mockResolvedValue([]) },
    paytrStatementLine: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  };
}
const config = { get: jest.fn().mockReturnValue(undefined) } as any;
const split = (difference: number) => ({
  compute: jest.fn().mockResolvedValue({
    section: { total: { amount: 2597.2 }, difference },
    diagnostics: {
      ordersWithoutHold: difference ? 1 : 0,
      paymentsWithoutOrders: 0,
    },
  }),
});

describe("LedgerReconciliationService — ciro bölünmesi", () => {
  it("stays quiet and reports 0 when collected money splits exactly", async () => {
    const svc = new LedgerReconciliationService(
      makePrisma() as any,
      config,
      {} as any,
      split(0) as any,
    );

    const report = await svc.reconcile();

    expect(report.revenueSplitDifference).toBe(0);
    expect(report.driftAlarms.some((a) => a.includes("REVENUE_SPLIT"))).toBe(
      false,
    );
  });

  it("alarms REVENUE_SPLIT_DRIFT with the diagnostics when the identity breaks", async () => {
    const svc = new LedgerReconciliationService(
      makePrisma() as any,
      config,
      {} as any,
      split(834) as any,
    );

    const report = await svc.reconcile();

    expect(report.revenueSplitDifference).toBe(834);
    const alarm = report.driftAlarms.find((a) =>
      a.includes("REVENUE_SPLIT_DRIFT"),
    );
    expect(alarm).toContain("diff=834.00");
    expect(alarm).toContain("ordersWithoutHold=1");
  });

  it("skips the check when the revenue split service is not wired (unit contexts)", async () => {
    const svc = new LedgerReconciliationService(
      makePrisma() as any,
      config,
      {} as any,
    );

    const report = await svc.reconcile();

    expect(report.revenueSplitDifference).toBe(0);
  });
});
