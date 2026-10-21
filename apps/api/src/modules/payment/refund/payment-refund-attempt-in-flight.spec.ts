import { RefundAttemptStatus } from "@prisma/client";
import {
  RefundAttemptInFlightException,
  RefundPendingReconciliationException,
} from "../../payment-providers/refund-errors";
import { PaymentRefundAttemptService } from "./payment-refund-attempt.service";

/**
 * The attempt claim turns a call away, before anything goes to PayTR, while
 * another attempt is unresolved. That refusal is `RefundAttemptInFlight`: a
 * `RefundPendingReconciliation` for every caller (same 503), but one a caller
 * recording outcomes can tell from its own uncertain attempt (the boost
 * refund audit does).
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

  it.each([RefundAttemptStatus.submitting, RefundAttemptStatus.manual_review])(
    "refuses the same key while its attempt is %s",
    async (status) => {
      const { service } = make({ byKey: { status } });

      await expect(claim(service)).rejects.toBeInstanceOf(
        RefundAttemptInFlightException,
      );
    },
  );

  it("refuses to start a submission another call already started", async () => {
    const { service } = make({ started: 0 });

    await expect(
      service.startRefundSubmission("attempt-1"),
    ).rejects.toBeInstanceOf(RefundAttemptInFlightException);
  });
});
