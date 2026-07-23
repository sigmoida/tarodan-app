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

  it("Faz 6.3: defter-native fazla-iade (Σrefund debit > Σcapture credit) → alarm", async () => {
    // o1: capture 100 (buyer credit) ama iade 130 (refund debit) → 30 fazla-iade.
    // Not: gruplar dengeli tutuldu ki 1. invaryant (grup dengesi) alarma girmesin.
    const prisma = makePrisma(
      [
        // capture grubu (dengeli)
        {
          entryGroupId: "cap",
          account: "buyer_payment",
          direction: "credit",
          amount: 100,
          orderId: "o1",
        },
        {
          entryGroupId: "cap",
          account: "seller_escrow",
          direction: "debit",
          amount: 100,
          orderId: "o1",
        },
        // iade grubu (dengeli ama capture'ı aşıyor)
        {
          entryGroupId: "ref",
          account: "refund",
          direction: "debit",
          amount: 130,
          orderId: "o1",
        },
        {
          entryGroupId: "ref",
          account: "seller_escrow",
          direction: "credit",
          amount: 130,
          orderId: "o1",
        },
      ],
      [],
    );
    const svc = new LedgerReconciliationService(prisma, config, {} as any);
    const r = await svc.reconcile();
    expect(r.unbalancedGroups).toBe(0);
    expect(r.overRefundedOrders).toBe(1);
    expect(r.driftAlarms.some((a) => a.includes("LEDGER_OVER_REFUND"))).toBe(
      true,
    );
  });
});
