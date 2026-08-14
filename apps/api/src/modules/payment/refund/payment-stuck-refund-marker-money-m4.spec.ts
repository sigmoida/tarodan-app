import { RefundAttemptStatus, RefundRequestStatus } from "@prisma/client";
import { RefundReconciliationService } from "./refund-reconciliation.service";

describe("RefundReconciliationService durable attempt recovery", () => {
  const orderAttempt = (overrides: Record<string, unknown> = {}) => ({
    id: "attempt-1",
    paymentId: "pay-1",
    orderId: "order-1",
    tradeId: null,
    amount: 50,
    idempotencyKey: "manual-refund-1",
    status: RefundAttemptStatus.prepared,
    ...overrides,
  });

  const tradeAttempt = (overrides: Record<string, unknown> = {}) => ({
    id: "attempt-trade-1",
    paymentId: "pay-trade-1",
    orderId: null,
    tradeId: "trade-1",
    amount: 75,
    idempotencyKey: "trade-cash-refund:pay-trade-1",
    status: RefundAttemptStatus.succeeded,
    ...overrides,
  });

  const makeService = (opts?: {
    orderAttempts?: Array<Record<string, unknown>>;
    tradeAttempts?: Array<Record<string, unknown>>;
    staleCount?: number;
    manualReviewCount?: number;
  }) => {
    const prisma = {
      refundAttempt: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce(opts?.orderAttempts ?? [])
          .mockResolvedValueOnce(opts?.tradeAttempts ?? []),
        updateMany: jest
          .fn()
          .mockResolvedValue({ count: opts?.staleCount ?? 0 }),
        count: jest.fn().mockResolvedValue(opts?.manualReviewCount ?? 0),
      },
      refundRequest: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const paymentRefund = {
      processRefund: jest.fn().mockResolvedValue({
        success: true,
        providerRefundId: "provider-refund-1",
      }),
      refundTradeCashPaymentIfCompleted: jest
        .fn()
        .mockResolvedValue({ refunded: true, paymentId: "pay-trade-1" }),
    };
    const service = new RefundReconciliationService(
      prisma as any,
      paymentRefund as any,
      { resolve: () => ({}) } as any, // paymentProviders (bu testte kullanılmaz)
      { get: jest.fn().mockReturnValue(undefined) } as any, // configService
    );
    return { service, prisma, paymentRefund };
  };

  it("recovers a prepared order attempt with its original idempotency key", async () => {
    const attempt = orderAttempt();
    const { service, paymentRefund } = makeService({
      orderAttempts: [attempt],
    });

    const result = await service.reconcileStuckRefundMarkers();

    expect(paymentRefund.processRefund).toHaveBeenCalledWith("order-1", 50, {
      idempotencyKey: "manual-refund-1",
    });
    expect(result).toEqual({
      checked: 1,
      recovered: 1,
      manualReview: 0,
    });
  });

  it("finalizes the linked refund request after attempt recovery", async () => {
    const attempt = orderAttempt({
      status: RefundAttemptStatus.succeeded,
      idempotencyKey: "refund-request:refund-request-1",
    });
    const { service, prisma } = makeService({ orderAttempts: [attempt] });

    await service.reconcileStuckRefundMarkers();

    expect(prisma.refundRequest.updateMany).toHaveBeenCalledWith({
      where: {
        id: "refund-request-1",
        status: { not: RefundRequestStatus.refunded },
      },
      data: {
        status: RefundRequestStatus.refunded,
        refundedAt: expect.any(Date),
        providerRefundId: "provider-refund-1",
      },
    });
  });

  it("recovers trade refund attempts through the trade refund path", async () => {
    const { service, paymentRefund } = makeService({
      tradeAttempts: [tradeAttempt()],
    });

    const result = await service.reconcileStuckRefundMarkers();

    expect(
      paymentRefund.refundTradeCashPaymentIfCompleted,
    ).toHaveBeenCalledWith("trade-1");
    expect(result).toEqual({
      checked: 1,
      recovered: 1,
      manualReview: 0,
    });
  });

  it("quarantines stale submissions and reports unresolved attempts", async () => {
    const { service, prisma } = makeService({
      staleCount: 2,
      manualReviewCount: 3,
    });

    const result = await service.reconcileStuckRefundMarkers();

    expect(prisma.refundAttempt.updateMany).toHaveBeenCalledWith({
      where: {
        status: RefundAttemptStatus.submitting,
        requestStartedAt: { lt: expect.any(Date) },
      },
      data: {
        status: RefundAttemptStatus.manual_review,
        failureReason:
          "Refund submission ended without a durable provider response",
      },
    });
    expect(result).toEqual({
      checked: 0,
      recovered: 0,
      manualReview: 3,
    });
  });
});
