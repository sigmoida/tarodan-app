import { RefundAttemptStatus } from "@prisma/client";
import {
  RefundAttemptInFlightException,
  RefundPendingReconciliationException,
} from "../../payment-providers/refund-errors";
import { PaymentRefundAttemptService } from "./payment-refund-attempt.service";

/**
 * The attempt claim turns a call away, before anything goes to PayTR, while
 * another attempt (another key) is unresolved. That refusal is
 * `RefundAttemptInFlight`: a `RefundPendingReconciliation` for every caller
 * (same 503), but one a caller recording outcomes can tell from its own
 * uncertain attempt (the boost refund audit does).
 */
describe("PaymentRefundAttemptService: an attempt in flight", () => {
  const make = (rows: {
    byKey?: { status: RefundAttemptStatus } | null;
    unresolved?: { id: string } | null;
    started?: number;
  }) => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      payment: { findUnique: jest.fn().mockResolvedValue({ metadata: {} }) },
      refundAttempt: {
        findUnique: jest.fn().mockResolvedValue(
          rows.byKey
            ? {
                id: "attempt-1",
                paymentId: "pay-1",
                orderId: "order-1",
                amount: 59,
                ...rows.byKey,
              }
            : null,
        ),
        findFirst: jest.fn().mockResolvedValue(rows.unresolved ?? null),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
      refundAttempt: {
        updateMany: jest.fn().mockResolvedValue({ count: rows.started ?? 1 }),
      },
    };
    return { service: new PaymentRefundAttemptService(prisma as never), tx };
  };

  const claim = (service: PaymentRefundAttemptService) =>
    service.claimRefundAttempt(
      "pay-1",
      "order-1",
      59,
      59,
      false,
      "boost-refund:b1:1",
      "paytr",
      "oid-1",
    );

  it("refuses a new key while another attempt of the order is unresolved", async () => {
    const { service, tx } = make({ unresolved: { id: "attempt-0" } });

    const refusal = claim(service);
    await expect(refusal).rejects.toBeInstanceOf(
      RefundAttemptInFlightException,
    );
    await expect(refusal).rejects.toBeInstanceOf(
      RefundPendingReconciliationException,
    );
    expect(tx.refundAttempt.create).not.toHaveBeenCalled();
  });

  // The same key is this intent's own attempt: its money may be moving (a
  // concurrent identical call, or the stuck-refund recovery submitting it),
  // so the refusal is a plain pending reconciliation, never "elsewhere".
  it.each([RefundAttemptStatus.submitting, RefundAttemptStatus.manual_review])(
    "refuses the same key while its attempt is %s as pending, not in flight elsewhere",
    async (status) => {
      const { service } = make({ byKey: { status } });

      const refusal = claim(service);
      await expect(refusal).rejects.toBeInstanceOf(
        RefundPendingReconciliationException,
      );
      await expect(refusal).rejects.not.toBeInstanceOf(
        RefundAttemptInFlightException,
      );
    },
  );

  it("a submission another call (the recovery cron) already started is pending, not in flight elsewhere", async () => {
    const { service } = make({ started: 0 });

    const refusal = service.startRefundSubmission("attempt-1");
    await expect(refusal).rejects.toBeInstanceOf(
      RefundPendingReconciliationException,
    );
    await expect(refusal).rejects.not.toBeInstanceOf(
      RefundAttemptInFlightException,
    );
  });

  // The trade cash refund has one key per payment; a different attempt on
  // the same trade (an older key) is someone else's money question too.
  describe("trade cash refund claim", () => {
    const tradeAttempt = (status: RefundAttemptStatus) => ({
      id: "attempt-t",
      paymentId: "pay-1",
      tradeId: "trade-1",
      amount: 59,
      status,
    });
    const claimTrade = (service: PaymentRefundAttemptService) =>
      service.claimTradeRefundAttempt("pay-1", "trade-1", 59, "paytr", "oid-1");

    it("refuses while another attempt of the trade is unresolved as in flight elsewhere", async () => {
      const { service, tx } = make({ unresolved: { id: "attempt-0" } });

      const refusal = claimTrade(service);
      await expect(refusal).rejects.toBeInstanceOf(
        RefundAttemptInFlightException,
      );
      await expect(refusal).rejects.toBeInstanceOf(
        RefundPendingReconciliationException,
      );
      expect(tx.refundAttempt.create).not.toHaveBeenCalled();
    });

    it.each([
      RefundAttemptStatus.submitting,
      RefundAttemptStatus.manual_review,
    ])(
      "refuses its own key while %s as pending, not in flight elsewhere",
      async (status) => {
        const { service, tx } = make({});
        tx.refundAttempt.findUnique.mockResolvedValue(tradeAttempt(status));

        const refusal = claimTrade(service);
        await expect(refusal).rejects.toBeInstanceOf(
          RefundPendingReconciliationException,
        );
        await expect(refusal).rejects.not.toBeInstanceOf(
          RefundAttemptInFlightException,
        );
      },
    );
  });
});
