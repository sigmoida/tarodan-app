import { LedgerReconciliationService } from "./ledger-reconciliation.service";

describe("LedgerReconciliationService.reconcile", () => {
  const config = { get: jest.fn(() => undefined) } as any;

  /**
   * `orderEntries`: escrow kalıntı kontrolü sipariş bazında TÜM zamanları sorgular
   * (capture pencere dışında kalmış olabilir) — pencere sorgusundan ayrı beslenir.
   */
  function makePrisma(
    ledgerEntries: any[],
    payments: any[],
    orderEntries?: any[],
  ) {
    return {
      ledgerEntry: {
        findMany: jest
          .fn()
          .mockImplementation(({ where }: any) =>
            Promise.resolve(
              where?.orderId ? (orderEntries ?? ledgerEntries) : ledgerEntries,
            ),
          ),
      },
      payment: { findMany: jest.fn().mockResolvedValue(payments) },
      // PSP kesinti driftleri (4-5) bu testlerin konusu değil — boş/sıfır döner.
      paytrStatementLine: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
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

  /**
   * ESCROW KALINTISI — payout'u TAMAMLANMIŞ bir siparişte escrow net'i 0 olmalı:
   * capture'daki seller_escrow debit'i, settle/kesinti/iade kredileriyle kapanır.
   * Kapanmıyorsa bir kayıt DÜŞMÜŞTÜR (klasik vaka: kesinti/adjustment yazımı
   * sessizce başarısız olmuş) ve escrow sonsuza dek açık kalır. Mevcut dört
   * invaryantın hiçbiri bunu görmüyordu: gruplar tek tek dengeliydi, fazla-iade
   * yoktu, PSP tarafı ilgisizdi.
   */
  describe("escrow kalıntısı (payout tamamlanmış siparişler)", () => {
    const capture = (orderId: string, amount: number) => [
      {
        entryGroupId: `cap-${orderId}`,
        eventType: "payment_captured",
        account: "buyer_payment",
        direction: "credit",
        amount,
        orderId,
      },
      {
        entryGroupId: `cap-${orderId}`,
        eventType: "payment_captured",
        account: "seller_escrow",
        direction: "debit",
        amount,
        orderId,
      },
    ];
    const settle = (orderId: string, amount: number) => [
      {
        entryGroupId: `pay-${orderId}`,
        eventType: "payout_completed",
        account: "seller_escrow",
        direction: "credit",
        amount,
        orderId,
      },
      {
        entryGroupId: `pay-${orderId}`,
        eventType: "payout_completed",
        account: "payout",
        direction: "debit",
        amount,
        orderId,
      },
    ];

    it("escrow tam kapanmışsa sessiz kalır", async () => {
      const rows = [...capture("o1", 90), ...settle("o1", 90)];
      const prisma = makePrisma(rows, [], rows);
      const svc = new LedgerReconciliationService(prisma, config, {} as any);

      const r = await svc.reconcile();

      expect(r.escrowResidueOrders).toBe(0);
      expect(r.driftAlarms).toHaveLength(0);
    });

    it("settle var ama escrow'da kalıntı kaldıysa alarm (kesinti kaydı düşmüş)", async () => {
      // capture 90 borç, transfer 70 kapatır; 20 TL kesinti kaydı YAZILMAMIŞ.
      const rows = [...capture("o1", 90), ...settle("o1", 70)];
      const prisma = makePrisma(rows, [], rows);
      const svc = new LedgerReconciliationService(prisma, config, {} as any);

      const r = await svc.reconcile();

      expect(r.escrowResidueOrders).toBe(1);
      expect(
        r.driftAlarms.some(
          (a) => a.includes("LEDGER_ESCROW_RESIDUE") && a.includes("o1"),
        ),
      ).toBe(true);
    });

    it("capture penceredışı kalsa da kalıntıyı doğru hesaplar (tüm zamanları sorgular)", async () => {
      // Pencerede YALNIZ settle var; capture günler önce yazılmış. Kontrol pencereye
      // bakarsa escrow'u −70 görüp yanlış alarm basardı.
      const prisma = makePrisma(
        settle("o1", 70),
        [],
        [...capture("o1", 70), ...settle("o1", 70)],
      );
      const svc = new LedgerReconciliationService(prisma, config, {} as any);

      const r = await svc.reconcile();

      expect(r.escrowResidueOrders).toBe(0);
    });

    it("payout'u tamamlanmamış sipariş (açık escrow) alarm ÜRETMEZ", async () => {
      const rows = capture("o1", 90);
      const prisma = makePrisma(rows, [], rows);
      const svc = new LedgerReconciliationService(prisma, config, {} as any);

      const r = await svc.reconcile();

      expect(r.escrowResidueOrders).toBe(0);
      expect(r.driftAlarms).toHaveLength(0);
    });
  });
});
