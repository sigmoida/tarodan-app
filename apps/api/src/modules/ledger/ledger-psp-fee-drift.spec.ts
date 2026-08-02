import { LedgerReconciliationService } from "./ledger-reconciliation.service";

/**
 * Faz 6.5 kapanışı — "ledger vs PSP raporu" sert kontrolleri:
 *
 *  4) PSP kesinti bütünlüğü: damgalı (ledgerRecordedAt dolu) döküm satırlarının
 *     fee toplamı, penceredeki ledger psp_fee DEBIT toplamına eşit olmalı.
 *     Sapma = defter satırı kaybolmuş/çift yazılmış ya da damga yazılmış ama
 *     defter yazılamamış → alarm.
 *  5) Birikme: eşleşmiş, fee'li ama 2+ gündür damgalanmamış satır varsa kesinti
 *     tahakkuku geri kalıyor (ör. ledger her gece hata veriyor) → alarm.
 */

function makePrisma(opts: {
  ledgerEntries?: any[];
  stampedLines?: any[];
  lagCount?: number;
}) {
  return {
    ledgerEntry: {
      findMany: jest.fn().mockResolvedValue(opts.ledgerEntries ?? []),
    },
    payment: { findMany: jest.fn().mockResolvedValue([]) },
    paytrStatementLine: {
      findMany: jest.fn().mockResolvedValue(opts.stampedLines ?? []),
      count: jest.fn().mockResolvedValue(opts.lagCount ?? 0),
    },
  };
}

const config = { get: jest.fn().mockReturnValue(undefined) } as any;

/** Dengeli psp_fee grubu: debit psp_fee + credit buyer_payment (invaryant-1 sessiz kalsın). */
function feeGroup(gid: string, amount: number) {
  return [
    {
      entryGroupId: gid,
      direction: "debit",
      amount,
      account: "psp_fee",
      orderId: null,
    },
    {
      entryGroupId: gid,
      direction: "credit",
      amount,
      account: "buyer_payment",
      orderId: null,
    },
  ];
}

describe("LedgerReconciliationService — PSP kesinti driftleri", () => {
  it("stays quiet when stamped statement fees equal the ledger psp_fee total", async () => {
    const prisma = makePrisma({
      ledgerEntries: [...feeGroup("g1", 2.35), ...feeGroup("g2", 1)],
      stampedLines: [{ fee: 2.35 }, { fee: 1 }],
    });
    const svc = new LedgerReconciliationService(
      prisma as any,
      config,
      {} as any,
    );

    const report = await svc.reconcile();

    expect(report.pspFeeStampedTotal).toBeCloseTo(3.35);
    expect(report.pspFeeLedgerTotal).toBeCloseTo(3.35);
    expect(report.pspFeeAccrualLag).toBe(0);
    expect(
      report.driftAlarms.filter((a) => a.includes("PSP_FEE")),
    ).toHaveLength(0);
  });

  it("alarms when the ledger psp_fee total drifts from stamped statement fees", async () => {
    const prisma = makePrisma({
      // Damga 3.35 diyor ama defterde yalnız 2.35 var (satır kaybı / kısmi yazım).
      ledgerEntries: [...feeGroup("g1", 2.35)],
      stampedLines: [{ fee: 2.35 }, { fee: 1 }],
    });
    const svc = new LedgerReconciliationService(
      prisma as any,
      config,
      {} as any,
    );

    const report = await svc.reconcile();

    expect(
      report.driftAlarms.some((a) => a.includes("PSP_FEE_LEDGER_DRIFT")),
    ).toBe(true);
  });

  it("alarms when matched fee lines stay unstamped for too long (accrual lag)", async () => {
    const prisma = makePrisma({ lagCount: 3 });
    const svc = new LedgerReconciliationService(
      prisma as any,
      config,
      {} as any,
    );

    const report = await svc.reconcile();

    expect(report.pspFeeAccrualLag).toBe(3);
    expect(
      report.driftAlarms.some((a) => a.includes("PSP_FEE_ACCRUAL_LAG")),
    ).toBe(true);
    // Gecikme sorgusu yalnız eski, eşleşmiş, fee'li ve damgasız satırları saymalı.
    const where = prisma.paytrStatementLine.count.mock.calls[0][0].where;
    expect(where).toMatchObject({
      type: "sale",
      matchStatus: "matched",
      ledgerRecordedAt: null,
      fee: { gt: 0 },
    });
    expect(where.transactionDate.lt).toBeInstanceOf(Date);
  });

  it("reports zeros when there is no PSP data at all", async () => {
    const prisma = makePrisma({});
    const svc = new LedgerReconciliationService(
      prisma as any,
      config,
      {} as any,
    );

    const report = await svc.reconcile();

    expect(report.pspFeeStampedTotal).toBe(0);
    expect(report.pspFeeLedgerTotal).toBe(0);
    expect(report.pspFeeAccrualLag).toBe(0);
    expect(report.driftAlarms).toHaveLength(0);
  });
});
