import {
  LedgerAccount,
  LedgerDirection,
  LedgerEventType,
  PaytrMatchStatus,
  PaytrStatementLineType,
  Prisma,
} from "@prisma/client";
import { PaytrReportMatchingService } from "./paytr-report-matching.service";

/**
 * Phase 5: PayTR's deduction in the ledger. Each matched sale line's
 * `kesinti_tutari` is booked as a psp_fee_accrued event.
 *
 *  - Balanced group: credit buyer_payment D (that much of the collected
 *    money never reaches us); debit psp_fee, and for an oid whose charge
 *    attempt expected a platform installment cost P (a segment rule share),
 *    debit installment_platform_cost min(D, P) with psp_fee the rest (ADR
 *    0019, plan 4.6.4).
 *  - Idempotent: the line is stamped with `ledgerRecordedAt`; a stamped line
 *    is not selected again.
 *  - A ledger failure writes NO stamp (the next run retries) and does not
 *    break the run.
 */

interface Line {
  id: string;
  merchantOid: string;
  type: PaytrStatementLineType;
  amount: number;
  fee: number;
  currency: string;
  transactionDate: Date;
  matchStatus: PaytrMatchStatus;
  paymentId: string | null;
  membershipPaymentId: string | null;
  ledgerRecordedAt: Date | null;
}

function makeLine(overrides: Partial<Line> = {}): Line {
  return {
    id: "line-1",
    merchantOid: "ORD1",
    type: PaytrStatementLineType.sale,
    amount: 100,
    fee: 2.35,
    currency: "TL",
    transactionDate: new Date("2026-07-31T00:00:00Z"),
    matchStatus: PaytrMatchStatus.matched,
    paymentId: "pay-1",
    membershipPaymentId: null,
    ledgerRecordedAt: null,
    ...overrides,
  };
}

function makeHarness(opts: {
  lines?: Line[];
  ledgerThrows?: boolean;
  attempts?: Array<{
    merchantOid: string;
    paymentId: string;
    platformCostAmount: Prisma.Decimal;
  }>;
}) {
  const prisma = {
    paytrStatementLine: {
      findMany: jest.fn().mockResolvedValue(opts.lines ?? []),
      update: jest.fn().mockResolvedValue({}),
    },
    paymentChargeAttempt: {
      findMany: jest.fn().mockResolvedValue(opts.attempts ?? []),
    },
  };
  const ledger = {
    record: opts.ledgerThrows
      ? jest.fn().mockRejectedValue(new Error("ledger down"))
      : jest.fn().mockResolvedValue("group-1"),
  };
  const service = new PaytrReportMatchingService(
    prisma as never,
    ledger as never,
  );
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
    // Idempotency: ONE accrual per statement line. If the run dies before the
    // stamp (ledgerRecordedAt) is written, the next run retries the same line
    // and the second write falls on the database key.
    expect(input.idempotencyKey).toBe("psp-fee:statement-line:line-1");
    expect(prisma.paytrStatementLine.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "line-1" },
        data: { ledgerRecordedAt: expect.any(Date) },
      }),
    );
  });

  it("splits the deduction of a segment-rule installment sale into psp_fee and installment_platform_cost", async () => {
    // Plan 4.4: premium buyer, 3 installments at a 100 % share, C = T =
    // 1,000.00, PayTR deducts 80.00; the attempt expected P = 50.00.
    const { service, prisma, ledger } = makeHarness({
      lines: [makeLine({ amount: 1000, fee: 80, merchantOid: "ORDI1" })],
      attempts: [
        {
          merchantOid: "ORDI1",
          paymentId: "pay-1",
          platformCostAmount: new Prisma.Decimal("50.00"),
        },
      ],
    });

    await service.accruePspFees();

    expect(prisma.paymentChargeAttempt.findMany).toHaveBeenCalledWith({
      where: { merchantOid: { in: ["ORDI1"] } },
      select: { merchantOid: true, paymentId: true, platformCostAmount: true },
    });
    const [, input] = ledger.record.mock.calls[0];
    expect(input.entries).toEqual([
      {
        account: LedgerAccount.psp_fee,
        direction: LedgerDirection.debit,
        amount: 30,
      },
      {
        account: LedgerAccount.installment_platform_cost,
        direction: LedgerDirection.debit,
        amount: 50,
      },
      {
        account: LedgerAccount.buyer_payment,
        direction: LedgerDirection.credit,
        amount: 80,
      },
    ]);
    expect(input.metadata).toMatchObject({ installmentPlatformCost: "50.00" });
  });

  it("books no psp_fee line when the whole deduction is platform cost", async () => {
    const { service, ledger } = makeHarness({
      lines: [makeLine({ fee: 40, merchantOid: "ORDI1" })],
      attempts: [
        {
          merchantOid: "ORDI1",
          paymentId: "pay-1",
          platformCostAmount: new Prisma.Decimal("50.00"),
        },
      ],
    });

    await service.accruePspFees();

    const [, input] = ledger.record.mock.calls[0];
    expect(input.entries).toEqual([
      {
        account: LedgerAccount.installment_platform_cost,
        direction: LedgerDirection.debit,
        amount: 40,
      },
      {
        account: LedgerAccount.buyer_payment,
        direction: LedgerDirection.credit,
        amount: 40,
      },
    ]);
  });

  it("never reads another payment's attempt for the same oid, and skips membership lines", async () => {
    const { service, prisma, ledger } = makeHarness({
      lines: [
        makeLine({ merchantOid: "ORDI1" }),
        makeLine({
          id: "line-m",
          merchantOid: "MEM1",
          paymentId: null,
          membershipPaymentId: "mp-1",
        }),
      ],
      attempts: [
        {
          merchantOid: "ORDI1",
          paymentId: "pay-other",
          platformCostAmount: new Prisma.Decimal("50.00"),
        },
      ],
    });

    await service.accruePspFees();

    expect(prisma.paymentChargeAttempt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { merchantOid: { in: ["ORDI1"] } } }),
    );
    for (const [, input] of ledger.record.mock.calls) {
      expect(
        input.entries.map((e: { account: LedgerAccount }) => e.account),
      ).toEqual([LedgerAccount.psp_fee, LedgerAccount.buyer_payment]);
    }
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
    expect(prisma.paymentChargeAttempt.findMany).not.toHaveBeenCalled();
  });

  it("does not stamp the line when the ledger write fails (the next run retries)", async () => {
    const { service, prisma } = makeHarness({
      lines: [makeLine(), makeLine({ id: "line-2", paymentId: "pay-2" })],
      ledgerThrows: true,
    });

    const r = await service.accruePspFees();

    expect(r.recorded).toBe(0);
    // A failure does not break the run: the other lines are tried too.
    expect(r.failed).toBe(2);
    expect(prisma.paytrStatementLine.update).not.toHaveBeenCalled();
  });

  it("is a no-op without a ledger service", async () => {
    const prisma = {
      paytrStatementLine: {
        findMany: jest.fn().mockResolvedValue([makeLine()]),
        update: jest.fn(),
      },
    };
    const service = new PaytrReportMatchingService(prisma as never, undefined);

    const r = await service.accruePspFees();

    expect(r).toEqual({ recorded: 0, failed: 0 });
    expect(prisma.paytrStatementLine.findMany).not.toHaveBeenCalled();
  });
});
