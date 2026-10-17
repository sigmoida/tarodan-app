import { ConflictException, NotFoundException } from "@nestjs/common";
import {
  LedgerAccount,
  LedgerDirection,
  LedgerEventType,
  OrderStatus,
  PaymentHoldStatus,
  Prisma,
  RefundRequestStatus,
} from "@prisma/client";
import {
  PaymentHoldResidualService,
  holdResidualSettleKey,
} from "./payment-hold-residual.service";
import { HOLD_RELEASE_ORDER_SELECT } from "../../payout/helpers/hold-release-eligibility";

/**
 * Satıcı kusurlu KALINTI platforma kapatılır — PSP'ye gidilmez. Alıcı
 * ödediğinin tamamını (T) zaten geri almıştır; kalan tutar (satıcının kargo
 * payı tazmini) platformun parasıdır.
 *
 * Örnek: ürün 1000, alıcı kargo 60, satıcı kargo 40, alıcı ücretleri 80,
 * satıcı ücretleri 100 → T = 1140, hold = 860. Satıcı kusurlu kargo öncesi
 * iptalde alıcıya 1140 döndü, hold 820 tüketildi, 40 kaldı.
 */
const finalized = (
  faultParty: string | null,
  policyCode = "v2_x_cancellation",
) => ({
  status: RefundRequestStatus.refunded,
  faultParty,
  policyCode,
});

const heldHold = (overrides: Record<string, unknown> = {}) => ({
  id: "hold-1",
  paymentId: "pay-1",
  orderId: "order-1",
  sellerId: "seller-1",
  amount: new Prisma.Decimal(860),
  refundedAmount: new Prisma.Decimal(820),
  status: PaymentHoldStatus.held,
  frozenByRefundId: null,
  releaseAt: null,
  releasedAt: null,
  createdAt: new Date("2026-10-01T09:00:00.000Z"),
  updatedAt: new Date("2026-10-01T09:00:00.000Z"),
  ...overrides,
});

const sellerFaultOrder = {
  status: OrderStatus.cancelled,
  refundRequests: [finalized("seller")],
};

const makeService = (
  opts: {
    holds?: Record<string, ReturnType<typeof heldHold>>;
    orders?: Record<string, unknown>;
    candidatePages?: Array<Array<{ id: string; createdAt: Date }>>;
  } = {},
) => {
  const holds = opts.holds ?? { "hold-1": heldHold() };
  const orders = opts.orders ?? { "order-1": sellerFaultOrder };
  const pages = [...(opts.candidatePages ?? [])];
  const prisma = {
    paymentHold: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(holds[where.id] ?? null),
      ),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    order: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(orders[where.id] ?? null),
      ),
    },
    $queryRaw: jest.fn((_query: Prisma.Sql) =>
      Promise.resolve(pages.shift() ?? []),
    ),
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
  );
  const ledger = { record: jest.fn().mockResolvedValue("group-1") };
  const service = new PaymentHoldResidualService(
    prisma as never,
    ledger as never,
  );
  return { service, prisma, ledger };
};

describe("PaymentHoldResidualService.settleResidual", () => {
  const actor = { actor: "admin-1", reason: "satıcı kusurlu iptal kalıntısı" };

  it("closes the seller-fault residual: hold consumed in full, no PSP call", async () => {
    const { service, prisma } = makeService();

    const settled = await service.settleResidual("hold-1", actor);

    expect(settled).toEqual({
      holdId: "hold-1",
      orderId: "order-1",
      sellerId: "seller-1",
      settledAmount: 40,
      faultBasis: "seller",
    });
    // CAS on what was read: a refund that froze or consumed the hold in
    // between makes the write miss instead of overwriting it
    expect(prisma.paymentHold.updateMany).toHaveBeenCalledWith({
      where: {
        id: "hold-1",
        status: PaymentHoldStatus.held,
        frozenByRefundId: null,
        refundedAmount: new Prisma.Decimal(820),
      },
      data: {
        status: PaymentHoldStatus.cancelled,
        refundedAmount: new Prisma.Decimal(860),
      },
    });
    expect(prisma.order.findUnique).toHaveBeenCalledWith({
      where: { id: "order-1" },
      select: HOLD_RELEASE_ORDER_SELECT,
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("books a balanced, idempotent ledger group: seller escrow → platform", async () => {
    const { service, prisma, ledger } = makeService();

    await service.settleResidual("hold-1", actor);

    expect(ledger.record).toHaveBeenCalledTimes(1);
    const [tx, input] = ledger.record.mock.calls[0];
    expect(tx).toBe(prisma);
    expect(input).toMatchObject({
      eventType: LedgerEventType.adjustment,
      idempotencyKey: holdResidualSettleKey("hold-1"),
      entries: [
        {
          account: LedgerAccount.seller_escrow,
          direction: LedgerDirection.credit,
          amount: 40,
          sellerId: "seller-1",
        },
        {
          account: LedgerAccount.platform_commission,
          direction: LedgerDirection.debit,
          amount: 40,
        },
      ],
      refs: {
        holdId: "hold-1",
        orderId: "order-1",
        paymentId: "pay-1",
        sellerId: "seller-1",
      },
      metadata: expect.objectContaining({
        kind: "hold_residual_settle",
        actor: "admin-1",
        reason: actor.reason,
      }),
    });
    expect(holdResidualSettleKey("hold-1")).toBe("hold-residual-settle:hold-1");
    for (const entry of input.entries) {
      expect(entry.memo).toContain("hold-1");
      expect(entry.memo).toContain("order-1");
    }
  });

  it("settles a hold the refund never touched (retained share ≥ hold)", async () => {
    const { service, prisma } = makeService({
      holds: {
        "hold-1": heldHold({
          amount: new Prisma.Decimal(30),
          refundedAmount: new Prisma.Decimal(0),
        }),
      },
    });

    const settled = await service.settleResidual("hold-1", actor);

    expect(settled.settledAmount).toBe(30);
    expect(prisma.paymentHold.updateMany.mock.calls[0][0].data).toEqual({
      status: PaymentHoldStatus.cancelled,
      refundedAmount: new Prisma.Decimal(30),
    });
  });

  it("reports an unknown fault basis when no finalized refund names it", async () => {
    const { service } = makeService({
      orders: {
        "order-1": { status: OrderStatus.cancelled, refundRequests: [] },
      },
    });

    expect((await service.settleResidual("hold-1", actor)).faultBasis).toBe(
      "unknown",
    );
  });

  it("runs the caller's audit in the same transaction, after the money write", async () => {
    const { service, prisma, ledger } = makeService();
    const afterWrite = jest.fn().mockResolvedValue(undefined);

    const settled = await service.settleResidual("hold-1", {
      ...actor,
      afterWrite,
    });

    expect(afterWrite).toHaveBeenCalledWith(prisma, settled);
    expect(afterWrite.mock.invocationCallOrder[0]).toBeGreaterThan(
      ledger.record.mock.invocationCallOrder[0],
    );
  });

  it("a failing audit fails the whole settlement (fail-closed)", async () => {
    const { service } = makeService();

    await expect(
      service.settleResidual("hold-1", {
        ...actor,
        afterWrite: jest.fn().mockRejectedValue(new Error("audit down")),
      }),
    ).rejects.toThrow("audit down");
  });

  it("404 when the hold does not exist", async () => {
    const { service, prisma, ledger } = makeService({ holds: {} });

    await expect(
      service.settleResidual("missing", actor),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.paymentHold.updateMany).not.toHaveBeenCalled();
    expect(ledger.record).not.toHaveBeenCalled();
  });

  it.each<[string, Record<string, unknown>, unknown]>([
    [
      "seller not at fault (the release pays it out)",
      {},
      { status: OrderStatus.cancelled, refundRequests: [finalized("buyer")] },
    ],
    [
      "hold frozen by an open refund",
      { frozenByRefundId: "rr-1" },
      sellerFaultOrder,
    ],
    [
      "already settled (second run)",
      {
        status: PaymentHoldStatus.cancelled,
        refundedAmount: new Prisma.Decimal(860),
      },
      sellerFaultOrder,
    ],
    [
      "nothing left",
      { refundedAmount: new Prisma.Decimal(860) },
      sellerFaultOrder,
    ],
    [
      "order still open",
      {},
      { status: OrderStatus.delivered, refundRequests: [] },
    ],
    ["order missing", {}, null],
  ])(
    "409 and no write when not settleable: %s",
    async (_name, holdOverrides, order) => {
      const { service, prisma, ledger } = makeService({
        holds: { "hold-1": heldHold(holdOverrides) },
        orders: { "order-1": order },
      });

      const error = await service
        .settleResidual("hold-1", actor)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(
        JSON.stringify((error as ConflictException).getResponse()),
      ).toContain("server.payment.holdResidualNotSettleable");
      expect(prisma.paymentHold.updateMany).not.toHaveBeenCalled();
      expect(ledger.record).not.toHaveBeenCalled();
    },
  );

  it("409 and no ledger entry when the hold changed under it (CAS lost)", async () => {
    const { service, prisma, ledger } = makeService();
    prisma.paymentHold.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.settleResidual("hold-1", actor),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(ledger.record).not.toHaveBeenCalled();
  });
});

describe("PaymentHoldResidualService.settleSellerFaultResiduals", () => {
  const run = { actor: "maintenance", reason: "seller-fault residual backlog" };
  const candidate = (id: string) => ({
    id,
    createdAt: new Date("2026-10-01T09:00:00.000Z"),
  });
  const backlog = () => ({
    holds: {
      "hold-seller": heldHold({ id: "hold-seller", orderId: "o-seller" }),
      "hold-buyer": heldHold({ id: "hold-buyer", orderId: "o-buyer" }),
      "hold-zero": heldHold({
        id: "hold-zero",
        orderId: "o-zero",
        amount: new Prisma.Decimal(25),
        refundedAmount: new Prisma.Decimal(0),
      }),
      "hold-unknown": heldHold({ id: "hold-unknown", orderId: "o-unknown" }),
    },
    orders: {
      "o-seller": sellerFaultOrder,
      "o-buyer": {
        status: OrderStatus.cancelled,
        refundRequests: [finalized("buyer")],
      },
      "o-zero": {
        status: OrderStatus.refunded,
        refundRequests: [finalized(null, "seller_fault_cancellation")],
      },
      // Closed order, no finalized refund: the fault is unknown.
      "o-unknown": { status: OrderStatus.cancelled, refundRequests: [] },
    },
    candidatePages: [
      [candidate("hold-seller"), candidate("hold-buyer")],
      [candidate("hold-zero"), candidate("hold-unknown")],
    ],
  });

  it("dry run reports what would be settled and writes nothing", async () => {
    const { service, prisma, ledger } = makeService(backlog());

    const report = await service.settleSellerFaultResiduals({
      ...run,
      dryRun: true,
    });

    expect(report).toEqual({
      dryRun: true,
      scanned: 4,
      totalAmount: 65,
      manualDecisionAmount: 40,
      rows: [
        {
          holdId: "hold-seller",
          orderId: "o-seller",
          sellerId: "seller-1",
          residualAmount: 40,
          faultBasis: "seller",
          outcome: "would_settle",
        },
        {
          holdId: "hold-zero",
          orderId: "o-zero",
          sellerId: "seller-1",
          residualAmount: 25,
          faultBasis: "seller",
          outcome: "would_settle",
        },
        {
          holdId: "hold-unknown",
          orderId: "o-unknown",
          sellerId: "seller-1",
          residualAmount: 40,
          faultBasis: "unknown",
          outcome: "manual_decision",
        },
      ],
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.paymentHold.updateMany).not.toHaveBeenCalled();
    expect(ledger.record).not.toHaveBeenCalled();
  });

  it("apply settles each seller-fault residual in its own transaction; buyer-fault ones are left to the release", async () => {
    const { service, prisma, ledger } = makeService(backlog());

    const report = await service.settleSellerFaultResiduals({
      ...run,
      dryRun: false,
    });

    expect(report.rows.map((row) => [row.holdId, row.outcome])).toEqual([
      ["hold-seller", "settled"],
      ["hold-zero", "settled"],
      ["hold-unknown", "manual_decision"],
    ]);
    expect(report.totalAmount).toBe(65);
    expect(report.manualDecisionAmount).toBe(40);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(
      ledger.record.mock.calls.map(([, input]) => input.idempotencyKey),
    ).toEqual([
      "hold-residual-settle:hold-seller",
      "hold-residual-settle:hold-zero",
    ]);
  });

  it("apply never settles an unknown-fault residual: no transaction, no ledger entry for it (D20)", async () => {
    const { service, prisma, ledger } = makeService(backlog());

    await service.settleSellerFaultResiduals({ ...run, dryRun: false });

    expect(
      ledger.record.mock.calls.map(([, input]) => input.idempotencyKey),
    ).not.toContain("hold-residual-settle:hold-unknown");
    expect(
      prisma.paymentHold.updateMany.mock.calls.map(([arg]) => arg.where.id),
    ).not.toContain("hold-unknown");
  });

  it("a legacy 'in doubt' fault is unknown too: listed for a person, never settled (D20)", async () => {
    const { service, ledger } = makeService({
      holds: {
        "hold-legacy": heldHold({ id: "hold-legacy", orderId: "o-legacy" }),
      },
      orders: {
        "o-legacy": {
          status: OrderStatus.refunded,
          refundRequests: [finalized(null, "legacy")],
        },
      },
      candidatePages: [[candidate("hold-legacy")]],
    });

    const report = await service.settleSellerFaultResiduals({
      ...run,
      dryRun: false,
    });

    expect(report.rows).toEqual([
      expect.objectContaining({
        holdId: "hold-legacy",
        faultBasis: "unknown",
        outcome: "manual_decision",
      }),
    ]);
    expect(report.totalAmount).toBe(0);
    expect(ledger.record).not.toHaveBeenCalled();
  });

  it("dry run lists a legacy 'in doubt' residual for a person and writes nothing (D20)", async () => {
    const { service, prisma, ledger } = makeService({
      holds: {
        "hold-legacy": heldHold({ id: "hold-legacy", orderId: "o-legacy" }),
      },
      orders: {
        "o-legacy": {
          status: OrderStatus.refunded,
          refundRequests: [finalized(null, "legacy")],
        },
      },
      candidatePages: [[candidate("hold-legacy")]],
    });

    const report = await service.settleSellerFaultResiduals({
      ...run,
      dryRun: true,
    });

    expect(report).toEqual({
      dryRun: true,
      scanned: 1,
      totalAmount: 0,
      manualDecisionAmount: 40,
      rows: [
        {
          holdId: "hold-legacy",
          orderId: "o-legacy",
          sellerId: "seller-1",
          residualAmount: 40,
          faultBasis: "unknown",
          outcome: "manual_decision",
        },
      ],
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.paymentHold.updateMany).not.toHaveBeenCalled();
    expect(ledger.record).not.toHaveBeenCalled();
  });

  it("apply on a legacy row writes no hold and counts it as manual, not settled (D20)", async () => {
    const { service, prisma } = makeService({
      holds: {
        "hold-legacy": heldHold({ id: "hold-legacy", orderId: "o-legacy" }),
      },
      orders: {
        "o-legacy": {
          status: OrderStatus.refunded,
          refundRequests: [finalized(null, "legacy")],
        },
      },
      candidatePages: [[candidate("hold-legacy")]],
    });

    const report = await service.settleSellerFaultResiduals({
      ...run,
      dryRun: false,
    });

    expect(report.manualDecisionAmount).toBe(40);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.paymentHold.updateMany).not.toHaveBeenCalled();
  });

  it("a legacy refund next to a NAMED seller fault is a seller row and is settled", async () => {
    const { service, prisma, ledger } = makeService({
      holds: {
        "hold-mixed": heldHold({ id: "hold-mixed", orderId: "o-mixed" }),
      },
      orders: {
        "o-mixed": {
          status: OrderStatus.cancelled,
          refundRequests: [finalized(null, "legacy"), finalized("seller")],
        },
      },
      candidatePages: [[candidate("hold-mixed")]],
    });

    const report = await service.settleSellerFaultResiduals({
      ...run,
      dryRun: false,
    });

    expect(report.rows).toEqual([
      expect.objectContaining({
        holdId: "hold-mixed",
        residualAmount: 40,
        faultBasis: "seller",
        outcome: "settled",
      }),
    ]);
    expect(report.totalAmount).toBe(40);
    expect(report.manualDecisionAmount).toBe(0);
    expect(prisma.paymentHold.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "hold-mixed" }),
        data: {
          status: PaymentHoldStatus.cancelled,
          refundedAmount: new Prisma.Decimal(860),
        },
      }),
    );
    expect(
      ledger.record.mock.calls.map(([, input]) => input.idempotencyKey),
    ).toEqual(["hold-residual-settle:hold-mixed"]);
  });

  it("a re-run after apply lists the unknown row again and still settles nothing for it", async () => {
    // First run: the seller row is settled and leaves the candidate set; the
    // unknown row stays held, so the second run reads it again.
    const { service, prisma, ledger } = makeService({
      ...backlog(),
      candidatePages: [
        [candidate("hold-seller"), candidate("hold-unknown")],
        [],
        [candidate("hold-unknown")],
      ],
    });

    await service.settleSellerFaultResiduals({ ...run, dryRun: false });
    const again = await service.settleSellerFaultResiduals({
      ...run,
      dryRun: false,
    });

    expect(again).toEqual({
      dryRun: false,
      scanned: 1,
      totalAmount: 0,
      manualDecisionAmount: 40,
      rows: [
        expect.objectContaining({
          holdId: "hold-unknown",
          faultBasis: "unknown",
          outcome: "manual_decision",
        }),
      ],
    });
    // Across both runs: one settlement, for the seller row only.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(
      ledger.record.mock.calls.map(([, input]) => input.idempotencyKey),
    ).toEqual(["hold-residual-settle:hold-seller"]);
  });

  it("pages the candidates with a keyset cursor until the set is exhausted", async () => {
    const { service, prisma } = makeService(backlog());

    await service.settleSellerFaultResiduals({ ...run, dryRun: true });

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(3);
    const second = prisma.$queryRaw.mock.calls[1][0];
    expect(second.sql).toContain("(h.created_at, h.id) >");
    expect(second.values).toEqual(expect.arrayContaining(["hold-buyer"]));
  });

  it("a second run settles nothing — settled holds left the candidate set", async () => {
    const { service, prisma, ledger } = makeService({ candidatePages: [] });

    const report = await service.settleSellerFaultResiduals({
      ...run,
      dryRun: false,
    });

    expect(report).toEqual({
      dryRun: false,
      scanned: 0,
      rows: [],
      totalAmount: 0,
      manualDecisionAmount: 0,
    });
    expect(prisma.paymentHold.updateMany).not.toHaveBeenCalled();
    expect(ledger.record).not.toHaveBeenCalled();
  });

  it("one failing hold is reported and does not stop the others", async () => {
    const { service, ledger } = makeService(backlog());
    ledger.record.mockRejectedValueOnce(new Error("ledger down"));

    const report = await service.settleSellerFaultResiduals({
      ...run,
      dryRun: false,
    });

    expect(report.rows).toEqual([
      expect.objectContaining({
        holdId: "hold-seller",
        outcome: "failed",
        error: "ledger down",
      }),
      expect.objectContaining({ holdId: "hold-zero", outcome: "settled" }),
      expect.objectContaining({
        holdId: "hold-unknown",
        outcome: "manual_decision",
      }),
    ]);
    // a failed row is not counted as settled money
    expect(report.totalAmount).toBe(25);
  });
});
