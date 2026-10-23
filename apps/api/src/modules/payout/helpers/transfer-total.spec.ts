import { PayoutStatus, RefundAttemptStatus } from "@prisma/client";
import {
  decideTransferTotal,
  type OidTransferRow,
  type TransferTotalInput,
} from "./transfer-total";

/**
 * PayTR platform transfer `total_amount` is the slice of the payment
 * (merchant_oid) one transfer settles. Sentry TARODAN-API-31..36: the payout
 * sent `order.totalAmount` even after a refund lowered what PayTR still held
 * for the oid, so PayTR rejected it (err_no 010) on every attempt. These cases
 * pin the formula:
 *
 *   ownAllowed   = source total - cash refunded on that source
 *   oidRemaining = payment amount - all refunds on the payment
 *                  - totals consumed by OTHER transfers on the same oid
 *   allowedTotal = min(ownAllowed, oidRemaining), kurus-exact, floored at 0
 */

const refund = (
  amount: number | string,
  over: Partial<TransferTotalInput["refundAttempts"][number]> = {},
): TransferTotalInput["refundAttempts"][number] => ({
  orderId: "order-a",
  tradeId: null,
  amount,
  status: RefundAttemptStatus.finalized,
  ...over,
});

const sibling = (over: Partial<OidTransferRow>): OidTransferRow => ({
  id: "sibling",
  status: PayoutStatus.completed,
  failureReason: null,
  amount: 0,
  netAmount: 1,
  submittedTotalAmount: null,
  ...over,
});

function input(over: Partial<TransferTotalInput> = {}): TransferTotalInput {
  return {
    payoutId: "payout-a",
    net: 300,
    sourceKey: "order-a",
    sourceTotal: 349,
    paymentAmount: 349,
    refundedOrders: {},
    refundAttempts: [],
    oidTransfers: [],
    ...over,
  };
}

describe("decideTransferTotal", () => {
  it("sends the order total when nothing was refunded (pins today's single-order value)", () => {
    const decision = decideTransferTotal(input());

    expect(decision.kind).toBe("send");
    expect(decision.snapshot).toMatchObject({
      allowedTotal: 349,
      ownAllowed: 349,
      oidRemaining: 349,
      net: 300,
    });
  });

  it("lowers the total by the cash refunded on the order (349 - 46 = 303), net unchanged", () => {
    const decision = decideTransferTotal(
      input({
        refundAttempts: [refund(46)],
        refundedOrders: { "order-a": 46 },
      }),
    );

    expect(decision).toMatchObject({
      kind: "send",
      snapshot: {
        allowedTotal: 303,
        ownAllowed: 303,
        oidRemaining: 303,
        net: 300,
        sourceRefunded: 46,
        paymentRefunded: 46,
      },
    });
  });

  it("caps a group sibling at what the oid has left after refunds and other transfers", () => {
    // Group payment 300 = A 100 + B 120 + C 80. B had 50 refunded.
    // A already went out with an explicit total; C is a legacy row in flight
    // (no submittedTotalAmount -> it sent `amount`).
    const decision = decideTransferTotal(
      input({
        payoutId: "payout-b",
        sourceKey: "order-b",
        sourceTotal: 120,
        paymentAmount: 300,
        net: 60,
        refundAttempts: [refund(50, { orderId: "order-b" })],
        refundedOrders: { "order-b": 50 },
        oidTransfers: [
          sibling({ id: "payout-a", amount: 100, submittedTotalAmount: 100 }),
          sibling({
            id: "payout-c",
            status: PayoutStatus.processing,
            amount: 80,
            netAmount: 70,
          }),
        ],
      }),
    );

    expect(decision).toMatchObject({
      kind: "send",
      snapshot: {
        ownAllowed: 70,
        oidRemaining: 70,
        allowedTotal: 70,
        otherTransfersTotal: 180,
      },
    });
  });

  it("counts only transfers that took (or may have taken) money from the oid", () => {
    const counted = [
      sibling({ id: "completed", amount: 10 }),
      sibling({
        id: "processing",
        status: PayoutStatus.processing,
        amount: 20,
      }),
      sibling({ id: "returned", status: PayoutStatus.returned, amount: 30 }),
      sibling({
        id: "unknown",
        status: PayoutStatus.failed,
        failureReason: "transfer_outcome_unknown",
        amount: 999,
        submittedTotalAmount: 40,
      }),
    ];
    const ignored = [
      sibling({ id: "pending", status: PayoutStatus.pending, amount: 500 }),
      sibling({ id: "retry", status: PayoutStatus.retry_pending, amount: 500 }),
      sibling({
        id: "rejected",
        status: PayoutStatus.failed,
        failureReason: "provider_rejected",
        amount: 500,
      }),
      sibling({
        id: "legacy-failed",
        status: PayoutStatus.failed,
        failureReason: "Bad Request Exception",
        amount: 500,
      }),
      // An adjustment fully consumed the net: completed without a PayTR call.
      sibling({ id: "consumed", amount: 500, netAmount: 0 }),
      // The payout being decided never counts against itself.
      sibling({
        id: "payout-a",
        status: PayoutStatus.processing,
        amount: 500,
        submittedTotalAmount: 500,
      }),
    ];

    const decision = decideTransferTotal(
      input({
        paymentAmount: 1000,
        sourceTotal: 1000,
        oidTransfers: [...counted, ...ignored],
      }),
    );

    expect(decision.snapshot.otherTransfersTotal).toBe(100);
    expect(decision.snapshot.oidRemaining).toBe(900);
  });

  it("goes to a manual decision without sending when the oid has nothing left (full refund, residual 40)", () => {
    const decision = decideTransferTotal(
      input({
        sourceTotal: 322,
        paymentAmount: 322,
        net: 40,
        refundAttempts: [refund(322)],
        refundedOrders: { "order-a": 322 },
      }),
    );

    expect(decision).toEqual({
      kind: "manual_decision",
      snapshot: expect.objectContaining({
        allowedTotal: 0,
        ownAllowed: 0,
        oidRemaining: 0,
        net: 40,
      }),
    });
  });

  it("goes to a manual decision when the net is above a positive allowed total", () => {
    const decision = decideTransferTotal(
      input({
        sourceTotal: 349,
        paymentAmount: 349,
        net: 40,
        refundAttempts: [refund(334)],
      }),
    );

    expect(decision).toMatchObject({
      kind: "manual_decision",
      snapshot: { allowedTotal: 15, net: 40 },
    });
  });

  it("sends when the net equals the allowed total (boundary)", () => {
    const decision = decideTransferTotal(
      input({ net: 303, refundAttempts: [refund(46)] }),
    );
    expect(decision).toMatchObject({
      kind: "send",
      snapshot: { allowedTotal: 303 },
    });
  });

  it("computes in kurus so float residue never moves the total", () => {
    // 349.99 - 0.33 = 349.66 exactly; 0.1 + 0.2 style residue must not leak.
    const decision = decideTransferTotal(
      input({
        sourceTotal: "349.99",
        paymentAmount: "349.99",
        net: 300.1,
        refundAttempts: [refund("0.1"), refund("0.23")],
      }),
    );
    expect(decision.snapshot.allowedTotal).toBe(349.66);
    expect(decision.snapshot.sourceRefunded).toBe(0.33);
  });

  it("uses the same rule for a trade cash payout (source = trade)", () => {
    const decision = decideTransferTotal(
      input({
        sourceKey: "trade-1",
        sourceTotal: 250,
        paymentAmount: 250,
        net: 200,
        refundAttempts: [refund(25, { orderId: null, tradeId: "trade-1" })],
      }),
    );
    expect(decision).toMatchObject({
      kind: "send",
      snapshot: { allowedTotal: 225, sourceRefunded: 25 },
    });
  });

  describe("cash refunded", () => {
    it("counts a legacy refund recorded only in Payment.metadata.refundedOrders", () => {
      const decision = decideTransferTotal(
        input({ refundedOrders: { "order-a": 46 } }),
      );
      expect(decision.snapshot.allowedTotal).toBe(303);
    });

    it("does not double count a refund present in both the attempt and the metadata", () => {
      const decision = decideTransferTotal(
        input({
          refundAttempts: [refund(46)],
          refundedOrders: { "order-a": 46 },
        }),
      );
      expect(decision.snapshot.paymentRefunded).toBe(46);
    });

    it("reserves room for a sibling refund still in flight and ignores failed attempts", () => {
      const decision = decideTransferTotal(
        input({
          paymentAmount: 500,
          refundAttempts: [
            refund(100, {
              orderId: "order-b",
              status: RefundAttemptStatus.submitting,
            }),
            refund(70, {
              orderId: "order-b",
              status: RefundAttemptStatus.manual_review,
            }),
            refund(999, {
              orderId: "order-b",
              status: RefundAttemptStatus.failed,
            }),
          ],
        }),
      );
      expect(decision.snapshot.paymentRefunded).toBe(170);
      expect(decision.snapshot.oidRemaining).toBe(330);
      expect(decision.snapshot.allowedTotal).toBe(330);
    });

    it("never lets a refund larger than the order (closing package shipping) push the total below 0", () => {
      const decision = decideTransferTotal(
        input({
          sourceTotal: 100,
          paymentAmount: 300,
          net: 10,
          refundAttempts: [refund(130)],
        }),
      );
      expect(decision.snapshot.ownAllowed).toBe(0);
      expect(decision.kind).toBe("manual_decision");
    });
  });

  it("fails closed when an amount is missing (no total can be trusted)", () => {
    const decision = decideTransferTotal(
      input({ paymentAmount: undefined as unknown as number }),
    );
    expect(decision.kind).toBe("manual_decision");
    expect(decision.snapshot.allowedTotal).toBe(0);
  });
});
