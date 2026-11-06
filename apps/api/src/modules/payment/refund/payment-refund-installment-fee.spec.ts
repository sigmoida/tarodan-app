import {
  CancellationActor,
  PaymentHoldStatus,
  PaymentStatus,
  PaytrMerchant,
  Prisma,
  RefundAttemptStatus,
} from "@prisma/client";
import { ProviderRefundNotSentException } from "../../payment-providers/refund-errors";
import { PaymentRefundService } from "./payment-refund.service";
import { PaymentRefundAttemptService } from "./payment-refund-attempt.service";

/**
 * D7 through the refund flow (ADR 0019, plan 4.4 and 5.6): every order
 * refund path goes through `processRefund`, which keeps the goods scale for
 * caps, the hold, the commission and the ledger ratio, and sends PayTR the
 * goods part plus the fee share the claim priced. Plan 4.4, `k = 1/6`: one
 * order of 1,000.00 paid in 3 installments, F 66.38, C 1,066.38.
 */
const ORDER_ID = "order-1";
const d = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);

interface Attempt {
  id: string;
  paymentId: string;
  orderId: string;
  idempotencyKey: string;
  amount: Prisma.Decimal;
  installmentFeeAmount: Prisma.Decimal;
  status: RefundAttemptStatus;
  providerRefundId: string | null;
  providerResponse: Prisma.JsonValue | null;
}

function world(opts: { fee?: string; isTest?: boolean } = {}) {
  const fee = d(opts.fee ?? "66.38");
  const state = {
    metadata: {} as Record<string, unknown>,
    attempts: [] as Attempt[],
    hold: {
      id: "hold-1",
      amount: d("880.00"),
      refundedAmount: d("0"),
      status: PaymentHoldStatus.held as PaymentHoldStatus,
    },
  };
  const where = (w: Record<string, unknown>) =>
    state.attempts.filter(
      (a) =>
        (w.paymentId == null || a.paymentId === w.paymentId) &&
        (w.orderId == null ||
          typeof w.orderId === "object" ||
          a.orderId === w.orderId) &&
        (w.status == null ||
          (typeof w.status === "object" && w.status !== null
            ? "in" in w.status
              ? (w.status.in as RefundAttemptStatus[]).includes(a.status)
              : "not" in w.status
                ? a.status !== w.status.not
                : true
            : a.status === w.status)) &&
        (w.id == null ||
          (typeof w.id === "object" && w.id !== null && "not" in w.id
            ? a.id !== w.id.not
            : a.id === w.id)),
    );
  const refundAttempt = {
    findUnique: jest.fn(({ where: w }: { where: Record<string, unknown> }) =>
      Promise.resolve(
        state.attempts.find((a) =>
          w.id ? a.id === w.id : a.idempotencyKey === w.idempotencyKey,
        ) ?? null,
      ),
    ),
    findFirst: jest.fn(({ where: w }: { where: Record<string, unknown> }) =>
      Promise.resolve(where(w)[0] ?? null),
    ),
    findMany: jest.fn(({ where: w }: { where: Record<string, unknown> }) =>
      Promise.resolve(where(w)),
    ),
    create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
      const row: Attempt = {
        id: `attempt-${state.attempts.length + 1}`,
        paymentId: data.paymentId as string,
        orderId: data.orderId as string,
        idempotencyKey: data.idempotencyKey as string,
        amount: d(data.amount as Prisma.Decimal.Value),
        installmentFeeAmount: d(data.installmentFeeAmount as Prisma.Decimal),
        status: RefundAttemptStatus.prepared,
        providerRefundId: null,
        providerResponse: null,
      };
      state.attempts.push(row);
      return Promise.resolve({ ...row });
    }),
    update: jest.fn(
      ({
        where: w,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const row = state.attempts.find((a) => a.id === w.id) as Attempt;
        Object.assign(row, data);
        if (data.amount != null) row.amount = d(data.amount as Prisma.Decimal);
        return Promise.resolve({ ...row });
      },
    ),
    updateMany: jest.fn(
      ({
        where: w,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        const rows = where(w);
        rows.forEach((row) => Object.assign(row, data));
        return Promise.resolve({ count: rows.length });
      },
    ),
  };
  const order = {
    id: ORDER_ID,
    orderNumber: "ORD1",
    totalAmount: d("1000.00"),
    installmentFeeAmount: fee,
    checkoutGroupId: null,
    packageId: null,
    status: "delivered",
    productId: "prod-1",
    sellerId: "s1",
    buyerId: "b1",
    quantity: 1,
    stockRestoredAt: null,
    offerId: null,
    cancelledBy: null,
    deliveredAt: new Date("2026-10-01T09:00:00Z"),
    commissionAmount: d("100.00"),
    withholdingTaxAmount: d("20.00"),
    origin: "direct_sale",
    cancellationType: "iade",
    buyer: { id: "b1", email: "b@x", displayName: "B" },
    seller: { id: "s1", email: "s@x", displayName: "S" },
  };
  const payment = {
    id: "pay-1",
    orderId: ORDER_ID,
    checkoutGroupId: null,
    amount: d("1000.00"),
    installmentFeeAmount: fee,
    chargedAmount: d("1000.00").plus(fee),
    provider: "paytr",
    paytrMerchant: PaytrMerchant.marketplace,
    status: PaymentStatus.completed as PaymentStatus,
    providerConversationId: "OID1",
    isTest: opts.isTest ?? false,
    order: { orderNumber: "ORD1" },
  };
  const db: Record<string, unknown> = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    refundAttempt,
    payment: {
      findFirst: jest.fn(() =>
        Promise.resolve({ ...payment, metadata: state.metadata }),
      ),
      findUnique: jest.fn(() =>
        Promise.resolve({
          metadata: state.metadata,
          amount: payment.amount,
          installmentFeeAmount: payment.installmentFeeAmount,
        }),
      ),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        if (data.metadata) {
          state.metadata = data.metadata as Record<string, unknown>;
        }
        if (data.status) payment.status = data.status as PaymentStatus;
        return Promise.resolve({});
      }),
    },
    order: {
      findUnique: jest.fn(() => Promise.resolve({ ...order })),
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
    paymentHold: {
      findFirst: jest.fn(() =>
        Promise.resolve(
          state.hold.status === PaymentHoldStatus.cancelled
            ? null
            : { ...state.hold },
        ),
      ),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        if (data.status) state.hold.status = data.status as PaymentHoldStatus;
        if (data.refundedAmount != null) {
          state.hold.refundedAmount = d(
            data.refundedAmount as Prisma.Decimal.Value,
          );
        }
        return Promise.resolve({});
      }),
    },
    payoutTransfer: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    refundRequest: { findMany: jest.fn().mockResolvedValue([]) },
    product: {
      findUnique: jest.fn().mockResolvedValue({
        quantity: 0,
        status: "sold",
        inactiveReason: null,
      }),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    productRemovalEvent: { createMany: jest.fn().mockResolvedValue({}) },
    sellerAccountAdjustment: { upsert: jest.fn() },
    offer: { updateMany: jest.fn() },
  };
  db.$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(db));
  const paytr = {
    createRefund: jest.fn(
      (oid: string, _amount: number, _referenceNo: string) =>
        Promise.resolve({ status: "success", merchant_oid: oid }),
    ),
  };
  const ledger = { recordRefund: jest.fn().mockResolvedValue("group-1") };
  const events = {
    emitPaymentRefunded: jest.fn().mockResolvedValue(undefined),
  };
  const providerEvents = { record: jest.fn().mockResolvedValue(undefined) };
  const commissionLedger = {
    applyRefund: jest.fn().mockResolvedValue(undefined),
    applyRefundAmounts: jest.fn().mockResolvedValue(undefined),
  };
  const service = new PaymentRefundService(
    db as never,
    { get: jest.fn().mockReturnValue(undefined) } as never,
    { resolve: () => paytr } as never,
    events as never,
    {
      notifyOrderCancelledParties: jest.fn().mockResolvedValue(undefined),
    } as never,
    commissionLedger as never,
    { handleOrderRefund: jest.fn().mockResolvedValue(undefined) } as never,
    { cancelSuratShipmentIfExists: jest.fn() } as never,
    providerEvents as never,
    {} as never,
    new PaymentRefundAttemptService(db as never),
    {} as never,
    {} as never,
    undefined,
    ledger as never,
  );
  const refund = (goods: number, key: string) =>
    service.processRefund(ORDER_ID, goods, {
      idempotencyKey: key,
      cancelledBy: CancellationActor.buyer,
    });
  return {
    state,
    payment,
    paytr,
    ledger,
    events,
    providerEvents,
    commissionLedger,
    refund,
  };
}

describe("processRefund of an installment payment (the vade farkı share, D7)", () => {
  it("a full refund sends C to PayTR and records the fee share on the attempt", async () => {
    const w = world();
    const result = await w.refund(1000, "full-1");

    expect(w.paytr.createRefund).toHaveBeenCalledWith(
      "OID1",
      1066.38,
      "attempt-1",
    );
    expect(w.state.attempts[0]).toMatchObject({
      status: RefundAttemptStatus.finalized,
    });
    expect(w.state.attempts[0].amount.toFixed(2)).toBe("1066.38");
    expect(w.state.attempts[0].installmentFeeAmount.toFixed(2)).toBe("66.38");
    expect(result).toMatchObject({
      refundAmount: 1000,
      installmentFeeRefunded: 66.38,
      cashRefunded: 1066.38,
    });
    // The goods scale: "fully refunded" and the cumulative refund.
    expect(w.payment.status).toBe(PaymentStatus.refunded);
    expect(w.state.metadata.refundedOrders).toEqual({ [ORDER_ID]: 1000 });
  });

  it("400.00 then 600.00: PayTR gets 426.55 then 639.83, the fee shares sum to F", async () => {
    const w = world();
    await w.refund(400, "part-1");
    expect(w.payment.status).toBe(PaymentStatus.completed);
    await w.refund(600, "part-2");

    expect(w.paytr.createRefund.mock.calls.map((c) => c[1])).toEqual([
      426.55, 639.83,
    ]);
    const fees = w.state.attempts.map((a) => a.installmentFeeAmount.toFixed(2));
    expect(fees).toEqual(["26.55", "39.83"]);
    expect(w.payment.status).toBe(PaymentStatus.refunded);
    expect(w.state.metadata.refundedOrders).toEqual({ [ORDER_ID]: 1000 });
  });

  it("books the goods part pro rata and the fee share as an installment_fee reversal", async () => {
    const w = world();
    await w.refund(400, "part-1");
    expect(w.ledger.recordRefund).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orderId: ORDER_ID,
        refundAttemptId: "attempt-1",
        orderTotal: 1000,
        commission: 100,
        withholdingTax: 20,
        refundAmount: 400,
        installmentFeeRefund: 26.55,
      }),
    );
    // Commission reversal and hold consumption stay on the goods ratio 0.4.
    expect(w.commissionLedger.applyRefund).toHaveBeenCalledWith(
      ORDER_ID,
      0.4,
      expect.anything(),
    );
    expect(w.state.hold.refundedAmount.toFixed(2)).toBe("352.00");
  });

  it("a buyer-remorse return keeping 60.00 of shipping sends 1,002.40 (3.98 of F stays)", async () => {
    const w = world();
    await w.refund(940, "remorse-1");
    expect(w.paytr.createRefund).toHaveBeenCalledWith(
      "OID1",
      1002.4,
      "attempt-1",
    );
    expect(w.state.attempts[0].installmentFeeAmount.toFixed(2)).toBe("62.40");
  });

  it("tells the buyer the cash back against the charged total, the seller the goods amount", async () => {
    const w = world();
    await w.refund(1000, "full-1");
    expect(w.events.emitPaymentRefunded).toHaveBeenCalledWith(
      expect.objectContaining({
        // The seller's figures stay on the goods scale.
        refundAmount: 1000,
        totalAmount: 1000,
        buyerRefundAmount: 1066.38,
        buyerTotalAmount: 1066.38,
      }),
    );
    expect(w.providerEvents.record).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 1066.38, totalAmount: 1066.38 }),
    );
  });

  it("a replay with the same key and goods amount is idempotent (no second PayTR call)", async () => {
    const w = world();
    await w.refund(400, "part-1");
    const again = await w.refund(400, "part-1");
    expect(again).toMatchObject({
      idempotent: true,
      refundAmount: 400,
      cashRefunded: 426.55,
    });
    expect(w.paytr.createRefund).toHaveBeenCalledTimes(1);
  });

  it("re-prices a refused attempt's fee share when it is sent again", async () => {
    const w = world();
    // First try refused by PayTR (no money moved).
    w.paytr.createRefund.mockRejectedValueOnce(
      new ProviderRefundNotSentException("not sent", "ECONNREFUSED"),
    );
    await expect(w.refund(400, "part-1")).rejects.toThrow();
    expect(w.state.attempts[0].status).toBe(RefundAttemptStatus.failed);
    // The rest of the order is refunded under another key meanwhile.
    await w.refund(600, "part-2");
    expect(w.state.attempts[1].installmentFeeAmount.toFixed(2)).toBe("39.83");
    // The refused try goes out again: it now completes the payment and
    // takes the rest of F, so the fee shares still sum to F.
    await w.refund(400, "part-1");
    expect(w.state.attempts[0].installmentFeeAmount.toFixed(2)).toBe("26.55");
    expect(w.state.attempts[0].amount.toFixed(2)).toBe("426.55");
    expect(w.paytr.createRefund.mock.calls.map((c) => c[1])).toEqual([
      426.55, 639.83, 426.55,
    ]);
  });

  it("a single payment is unchanged: PayTR gets the goods amount, no fee share", async () => {
    const w = world({ fee: "0" });
    const result = await w.refund(400, "part-1");
    expect(w.paytr.createRefund).toHaveBeenCalledWith("OID1", 400, "attempt-1");
    expect(w.state.attempts[0].installmentFeeAmount.toFixed(2)).toBe("0.00");
    expect(result).toMatchObject({
      refundAmount: 400,
      installmentFeeRefunded: 0,
      cashRefunded: 400,
    });
    expect(w.ledger.recordRefund).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ refundAmount: 400, installmentFeeRefund: 0 }),
    );
  });

  it("a test-lane installment refund skips PayTR but books the same amounts", async () => {
    const w = world({ isTest: true });
    await w.refund(1000, "full-1");
    expect(w.paytr.createRefund).not.toHaveBeenCalled();
    expect(w.state.attempts[0].amount.toFixed(2)).toBe("1066.38");
    expect(w.ledger.recordRefund).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ installmentFeeRefund: 66.38 }),
    );
  });
});
