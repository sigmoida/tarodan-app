import {
  CancellationActor,
  OrderStatus,
  PaymentStatus,
  PaytrMerchant,
  RefundAttemptStatus,
} from "@prisma/client";
import { PaymentRefundService } from "./payment-refund.service";
import { PaymentRefundAttemptService } from "./payment-refund-attempt.service";
import {
  ProviderRefundNotSentException,
  ProviderRefundOutcomeUnknownException,
  ProviderRefundRejectedException,
  RefundPendingReconciliationException,
} from "../../payment-providers/refund-errors";
import { i18nMessage } from "../../i18n";
import {
  REFUND_FAILURE_PROVIDER_NOTHING_LEFT,
  REFUND_FAILURE_PROVIDER_NOT_SENT,
} from "../helpers/refund-provider-failure";

/**
 * D1 (refund sweep loop): what `processRefund` leaves behind when the PayTR
 * refund call fails, per outcome. The attempt intent is written before the
 * call; the failure decides whether the same refund may be resent (attempt
 * `failed`, the seller's voided payout restored) or a person must look first
 * (attempt `manual_review`, the payout stays voided).
 *
 * - connect-phase failure: never reached PayTR -> `failed`, retryable;
 * - "nothing left to refund" (`kalan tutardan (0 TL)`): resending the same
 *   amount can never succeed and PayTR's money for the order is gone (refunded
 *   in the panel, or by an earlier attempt we did not hear back from) ->
 *   `manual_review` with the marker, payout stays voided;
 * - any other rejection -> `failed` (pin);
 * - unknown outcome -> `manual_review` (pin).
 */
describe("PaymentRefundService.processRefund when the PayTR refund fails", () => {
  const ORDER_ID = "order-1";
  const PAID = 1556;
  const ATTEMPT_ID = "attempt-1";
  const NOTHING_LEFT =
    "Talep edilen iade tutari (1556 TL), kalan tutardan (0 TL) fazla olamaz.";

  const make = (providerError: unknown) => {
    const order = {
      id: ORDER_ID,
      orderNumber: "ORD-1",
      status: OrderStatus.cancelled,
      totalAmount: PAID,
      checkoutGroupId: null,
      packageId: null,
    };
    const attempt = {
      id: ATTEMPT_ID,
      paymentId: "pay-1",
      orderId: ORDER_ID,
      idempotencyKey: `full-refund:pay-1:${ORDER_ID}`,
      amount: PAID,
      status: RefundAttemptStatus.prepared,
      providerRefundId: null,
      providerResponse: null,
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      payment: { findUnique: jest.fn().mockResolvedValue({ metadata: {} }) },
      refundAttempt: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(attempt),
      },
    };
    const prisma = {
      payment: {
        findFirst: jest.fn().mockResolvedValue({
          id: "pay-1",
          orderId: ORDER_ID,
          checkoutGroupId: null,
          amount: PAID,
          provider: "paytr",
          paytrMerchant: PaytrMerchant.marketplace,
          status: PaymentStatus.completed,
          providerConversationId: "ORD1T123456",
          metadata: {},
          isTest: false,
          order,
        }),
      },
      order: { findUnique: jest.fn().mockResolvedValue(order) },
      refundAttempt: {
        findUnique: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      payoutTransfer: {
        // The seller's pending payout is voided before PayTR is called.
        findMany: jest.fn().mockResolvedValue([{ id: "payout-1" }]),
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const paytr = { createRefund: jest.fn().mockRejectedValue(providerError) };
    const service = new PaymentRefundService(
      prisma as never,
      { get: jest.fn().mockReturnValue(undefined) } as never,
      { resolve: jest.fn(() => paytr) } as never,
      {} as never, // events
      {} as never, // notifications
      {} as never, // commission ledger
      {} as never, // invoicing
      {} as never, // payment common
      { record: jest.fn() } as never, // provider events
      {} as never, // hold release
      new PaymentRefundAttemptService(prisma as never),
      {} as never, // trade refunds
      {} as never, // boost timeline
    );
    const logger = (
      service as unknown as {
        logger: {
          error: (message: string) => void;
          warn: (message: string) => void;
        };
      }
    ).logger;
    const errorLog = jest
      .spyOn(logger, "error")
      .mockImplementation(() => undefined);
    const warnLog = jest
      .spyOn(logger, "warn")
      .mockImplementation(() => undefined);

    const attemptWrites = () =>
      prisma.refundAttempt.updateMany.mock.calls
        .map(([args]) => args)
        .filter((args) => args.where.status === RefundAttemptStatus.submitting);
    const payoutRestored = () =>
      prisma.payoutTransfer.updateMany.mock.calls.some(
        ([args]) =>
          args.where.failureReason === "order_refunded" &&
          args.data.status === "pending",
      );
    const failureLines = () => ({
      error: errorLog.mock.calls.map(([line]) => String(line)),
      warn: warnLog.mock.calls.map(([line]) => String(line)),
    });
    return {
      service,
      prisma,
      paytr,
      attemptWrites,
      payoutRestored,
      failureLines,
    };
  };

  const run = (service: PaymentRefundService) =>
    service.processRefund(ORDER_ID, undefined, {
      cancelledBy: CancellationActor.system,
    });

  it("connect-phase failure: attempt failed (retryable), payout restored, not manual review", async () => {
    const { service, attemptWrites, payoutRestored } = make(
      new ProviderRefundNotSentException(
        i18nMessage("server.payment.refundInitiationFailed"),
        "fetch failed (UND_ERR_CONNECT_TIMEOUT)",
      ),
    );

    await expect(run(service)).rejects.toBeInstanceOf(
      ProviderRefundNotSentException,
    );

    expect(attemptWrites()).toEqual([
      {
        where: { id: ATTEMPT_ID, status: RefundAttemptStatus.submitting },
        data: {
          status: RefundAttemptStatus.failed,
          failureReason: `${REFUND_FAILURE_PROVIDER_NOT_SENT}: fetch failed (UND_ERR_CONNECT_TIMEOUT)`,
          failureCount: { increment: 1 },
        },
      },
    ]);
    expect(payoutRestored()).toBe(true);
  });

  it("'nothing left to refund': manual review with the marker, payout stays voided, no resend", async () => {
    const { service, paytr, attemptWrites, payoutRestored } = make(
      new ProviderRefundRejectedException(NOTHING_LEFT, true),
    );

    await expect(run(service)).rejects.toBeInstanceOf(
      RefundPendingReconciliationException,
    );

    expect(paytr.createRefund).toHaveBeenCalledTimes(1);
    expect(attemptWrites()).toEqual([
      {
        where: { id: ATTEMPT_ID, status: RefundAttemptStatus.submitting },
        data: {
          status: RefundAttemptStatus.manual_review,
          failureReason: `${REFUND_FAILURE_PROVIDER_NOTHING_LEFT}: ${NOTHING_LEFT}`,
        },
      },
    ]);
    // PayTR holds nothing for this order any more: paying the seller before a
    // person checks could pay out money the buyer already got back.
    expect(payoutRestored()).toBe(false);
  });

  it("any other rejection: attempt failed with PayTR's text, payout restored (pin)", async () => {
    const { service, attemptWrites, payoutRestored } = make(
      new ProviderRefundRejectedException("iade limiti asildi"),
    );

    await expect(run(service)).rejects.toBeInstanceOf(
      ProviderRefundRejectedException,
    );

    expect(attemptWrites()).toEqual([
      {
        where: { id: ATTEMPT_ID, status: RefundAttemptStatus.submitting },
        data: {
          status: RefundAttemptStatus.failed,
          failureReason: "iade limiti asildi",
          failureCount: { increment: 1 },
        },
      },
    ]);
    expect(payoutRestored()).toBe(true);
  });

  it("unknown outcome: manual review, payout stays voided (pin)", async () => {
    const { service, attemptWrites, payoutRestored } = make(
      new ProviderRefundOutcomeUnknownException(
        i18nMessage("server.payment.refundError"),
      ),
    );

    await expect(run(service)).rejects.toBeInstanceOf(
      RefundPendingReconciliationException,
    );

    expect(attemptWrites()).toEqual([
      {
        where: { id: ATTEMPT_ID, status: RefundAttemptStatus.submitting },
        data: {
          status: RefundAttemptStatus.manual_review,
          failureReason: expect.stringContaining("server.payment.refundError"),
        },
      },
    ]);
    expect(payoutRestored()).toBe(false);
  });

  /**
   * D1 review: with the retry sweep as caller, "Refund error for payment" was
   * an error on every backed-off retry next to the sweep's own once-a-day
   * alarm. A caller that alarms itself (`callerAlarms`) gets it at warn when
   * no money moved; where money may have moved it stays an error for all.
   */
  describe("failure log level", () => {
    const refundErrorLine = (lines: string[]) =>
      lines.filter((line) => line.startsWith("Refund error for payment"));

    it("a caller that alarms itself: a definite failure is a warn", async () => {
      const { service, failureLines } = make(
        new ProviderRefundRejectedException("iade limiti asildi"),
      );

      await expect(
        service.processRefund(ORDER_ID, undefined, {
          cancelledBy: CancellationActor.system,
          callerAlarms: true,
        }),
      ).rejects.toBeInstanceOf(ProviderRefundRejectedException);

      expect(refundErrorLine(failureLines().error)).toEqual([]);
      expect(refundErrorLine(failureLines().warn)).toHaveLength(1);
    });

    it("a caller that alarms itself: money that may have moved is still an error", async () => {
      const { service, failureLines } = make(
        new ProviderRefundOutcomeUnknownException(
          i18nMessage("server.payment.refundError"),
        ),
      );

      await expect(
        service.processRefund(ORDER_ID, undefined, {
          cancelledBy: CancellationActor.system,
          callerAlarms: true,
        }),
      ).rejects.toBeInstanceOf(RefundPendingReconciliationException);

      expect(refundErrorLine(failureLines().error)).toHaveLength(1);
    });

    it("a caller that alarms itself: PayTR refunded, then the commit failed, is still an error", async () => {
      const { service, prisma, paytr, failureLines, payoutRestored } =
        make(undefined);
      paytr.createRefund.mockResolvedValue({
        status: "success",
        return_amount: PAID,
      });
      // The claim runs in the first transaction; the money commit (order,
      // payment, hold, ledger) is the second and fails after PayTR refunded.
      const runInTx = prisma.$transaction.getMockImplementation()!;
      prisma.$transaction
        .mockImplementationOnce(runInTx)
        .mockImplementationOnce(() =>
          Promise.reject(new Error("database connection lost")),
        );

      await expect(
        service.processRefund(ORDER_ID, undefined, {
          cancelledBy: CancellationActor.system,
          callerAlarms: true,
        }),
      ).rejects.toBeInstanceOf(RefundPendingReconciliationException);

      expect(paytr.createRefund).toHaveBeenCalledTimes(1);
      // The buyer's money went back: a loud alarm whoever the caller is, and
      // the seller's voided payout stays voided.
      expect(refundErrorLine(failureLines().error)).toHaveLength(1);
      expect(refundErrorLine(failureLines().warn)).toEqual([]);
      expect(payoutRestored()).toBe(false);
    });

    it("any other caller keeps the error line (pin)", async () => {
      const { service, failureLines } = make(
        new ProviderRefundRejectedException("iade limiti asildi"),
      );

      await expect(run(service)).rejects.toBeInstanceOf(
        ProviderRefundRejectedException,
      );

      expect(refundErrorLine(failureLines().error)).toHaveLength(1);
    });
  });
});
