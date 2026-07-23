import { LedgerReconciliationService } from "./ledger-reconciliation.service";

describe("LedgerReconciliationService.reconcile", () => {
  const config = { get: jest.fn(() => undefined) } as any;

  function makePrisma(ledgerEntries: any[], payments: any[]) {
    return {
      ledgerEntry: { findMany: jest.fn().mockResolvedValue(ledgerEntries) },
      payment: { findMany: jest.fn().mockResolvedValue(payments) },
    } as any;
  }

  it("dengeli defter + normal iade → alarm yok", async () => {
    const prisma = makePrisma(
      [
        { entryGroupId: "g1", direction: "credit", amount: 100 },
        { entryGroupId: "g1", direction: "debit", amount: 90 },
        { entryGroupId: "g1", direction: "debit", amount: 10 },
      ],
      [{ id: "p1", amount: 100, metadata: { refundedOrders: { o1: 40 } } }],
    );
    const svc = new LedgerReconciliationService(prisma, config, {} as any);
    const r = await svc.reconcile();
    expect(r.unbalancedGroups).toBe(0);
    expect(r.overRefundedPayments).toBe(0);
    expect(r.driftAlarms).toHaveLength(0);
    expect(r.ledgerGroupsChecked).toBe(1);
  });

  it("dengesiz defter grubu → alarm", async () => {
    const prisma = makePrisma(
      [
        { entryGroupId: "g1", direction: "credit", amount: 100 },
        { entryGroupId: "g1", direction: "debit", amount: 80 }, // 20 açık
      ],
      [],
    );
    const svc = new LedgerReconciliationService(prisma, config, {} as any);
    const r = await svc.reconcile();
    expect(r.unbalancedGroups).toBe(1);
    expect(r.driftAlarms.some((a) => a.includes("LEDGER_UNBALANCED"))).toBe(
      true,
    );
  });

  it("fazla-iade (Σrefund > amount) → alarm", async () => {
    const prisma = makePrisma(
      [],
      [
        {
          id: "p1",
          amount: 100,
          metadata: { refundedOrders: { o1: 70, o2: 50 } }, // 120 > 100
        },
      ],
    );
    const svc = new LedgerReconciliationService(prisma, config, {} as any);
    const r = await svc.reconcile();
    expect(r.overRefundedPayments).toBe(1);
    expect(r.driftAlarms.some((a) => a.includes("OVER_REFUND"))).toBe(true);
  });
});
