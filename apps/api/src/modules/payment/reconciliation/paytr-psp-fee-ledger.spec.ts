import {
  LedgerAccount,
  LedgerDirection,
  LedgerEventType,
  PaytrMatchStatus,
  PaytrStatementLineType,
} from "@prisma/client";
import { PaytrReportMatchingService } from "./paytr-report-matching.service";

/**
 * Faz 5 — PayTR işlem kesintisi defterde: eşleşmiş her satış satırının
 * `kesinti_tutari`sı psp_fee_accrued olayı olarak yazılır.
 *
 *  - Dengeli grup: debit psp_fee / credit buyer_payment (tahsil edilen paranın
 *    kesinti kadarı bize hiç ulaşmaz — capture'daki buyer_payment kaynağından düşer).
 *  - İdempotens: satır `ledgerRecordedAt` ile damgalanır; damgalı satır sorguya girmez.
 *  - Ledger hatası damga YAZDIRMAZ (sonraki tur yeniden dener) ve turu kırmaz.
 */

function makeLine(overrides: Record<string, unknown> = {}) {
  return {
    id: "line-1",
    merchantOid: "ORD1",
    type: PaytrStatementLineType.sale,
    amount: 100,
    fee: 2.35,
    transactionDate: new Date("2026-07-31T00:00:00Z"),
    matchStatus: PaytrMatchStatus.matched,
    paymentId: "pay-1",
    ledgerRecordedAt: null,
    ...overrides,
  };
}

function makeHarness(opts: { lines?: any[]; ledgerThrows?: boolean }) {
  const prisma = {
    paytrStatementLine: {
      findMany: jest.fn().mockResolvedValue(opts.lines ?? []),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const ledger = {
    record: opts.ledgerThrows
      ? jest.fn().mockRejectedValue(new Error("ledger down"))
      : jest.fn().mockResolvedValue("group-1"),
  };
  const service = new PaytrReportMatchingService(prisma as any, ledger as any);
  return { service, prisma, ledger };
}

describe("PaytrReportMatchingService.accruePspFees", () => {
  it("records a balanced psp_fee_accrued group and stamps the line", async () => {
    const { service, prisma, ledger } = makeHarness({ lines: [makeLine()] });

    const r = await service.accruePspFees();

    expect(r.recorded).toBe(1);
    expect(ledger.record).toHaveBeenCalledTimes(1);
    const [, input] = ledger.record.mock.calls[0];
    expect(input.eventType).toBe(LedgerEventType.psp_fee_accrued);
    expect(input.entries).toEqual([
      {
        account: LedgerAccount.psp_fee,
        direction: LedgerDirection.debit,
        amount: 2.35,
      },
      {
        account: LedgerAccount.buyer_payment,
        direction: LedgerDirection.credit,
        amount: 2.35,
      },
    ]);
    expect(input.refs).toMatchObject({ paymentId: "pay-1" });
    // İdempotency: döküm satırı başına TEK tahakkuk. Damga (ledgerRecordedAt) yazılamadan
    // tur çökerse sonraki tur aynı satırı yeniden dener — ikinci kayıt DB'de düşer.
    expect(input.idempotencyKey).toBe("psp-fee:statement-line:line-1");
    expect(prisma.paytrStatementLine.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "line-1" },
        data: { ledgerRecordedAt: expect.any(Date) },
      }),
    );
  });

  it("queries only matched sale lines with a positive fee and no stamp", async () => {
    const { service, prisma } = makeHarness({ lines: [] });

    await service.accruePspFees();

    const where = prisma.paytrStatementLine.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      type: PaytrStatementLineType.sale,
      matchStatus: PaytrMatchStatus.matched,
      ledgerRecordedAt: null,
      fee: { gt: 0 },
    });
  });

  it("does not stamp the line when the ledger write fails (sonraki tur dener)", async () => {
    const { service, prisma } = makeHarness({
      lines: [makeLine(), makeLine({ id: "line-2", paymentId: "pay-2" })],
      ledgerThrows: true,
    });

    const r = await service.accruePspFees();

    expect(r.recorded).toBe(0);
    expect(r.failed).toBe(2); // hata turu kırmaz, diğer satırlar da denenir
    expect(prisma.paytrStatementLine.update).not.toHaveBeenCalled();
  });

  it("is a no-op without a ledger service", async () => {
    const prisma = {
      paytrStatementLine: {
        findMany: jest.fn().mockResolvedValue([makeLine()]),
        update: jest.fn(),
      },
    };
    const service = new PaytrReportMatchingService(prisma as any, undefined);

    const r = await service.accruePspFees();

    expect(r).toEqual({ recorded: 0, failed: 0 });
    expect(prisma.paytrStatementLine.findMany).not.toHaveBeenCalled();
  });
});
