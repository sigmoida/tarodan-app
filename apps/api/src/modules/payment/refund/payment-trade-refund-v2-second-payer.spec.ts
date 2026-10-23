import { PaymentTradeRefundService } from "./payment-trade-refund.service";
import { PaymentRefundAttemptService } from "./payment-refund-attempt.service";

/**
 * D1 QA review: v2 trade, both payers paid. The platform cancel queues one
 * scoped refund per payer (outbox OUTBOX_TRADE_CANCELLED_PAYMENT_REFUND).
 * Payer A's refund fails first and starts the failure episode (A is told).
 * Payer B's refund then fails too: the marker is already set, so the CAS
 * reports "not started". B must still be told: a scoped call is a one-shot
 * of a flow and always notifies its own party. Only an unscoped retry (the
 * sweep) stays quiet while the marker is set.
 */
describe("refundTradeCashTracked: v2 second payer's failure", () => {
  it("notifies payer B when B's scoped refund fails after A's started the episode", async () => {
    const prisma = {
      trade: {
        update: jest.fn().mockResolvedValue({}),
        // A's failure already set the marker.
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      tradeCashPayment: { findMany: jest.fn(), findFirst: jest.fn() },
    };
    const eventService = {
      emitTradeRefundCompleted: jest.fn(),
      emitTradeRefundFailed: jest.fn().mockResolvedValue(undefined),
    };
    const service = new PaymentTradeRefundService(
      prisma as never,
      { get: jest.fn() } as never,
      {} as never,
      eventService as never,
      { record: jest.fn() } as never,
      new PaymentRefundAttemptService(prisma as never),
    );
    jest
      .spyOn(service, "refundTradeCashPaymentIfCompleted")
      .mockRejectedValue(new Error("PayTR refused B"));

    const r = await service.refundTradeCashTracked("trade-1", { payerId: "B" });

    expect(r.failed).toBe(true);
    expect(eventService.emitTradeRefundFailed).toHaveBeenCalledWith(
      expect.objectContaining({ tradeId: "trade-1", cashPayerId: "B" }),
    );
  });
});
