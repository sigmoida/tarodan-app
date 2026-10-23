import {
  CancellationActor,
  RefundAttemptStatus,
  RefundRequestStatus,
} from "@prisma/client";
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
    /** Submitting attempts past the stale window (D1: quarantined one by one). */
    staleAttempts?: Array<Record<string, unknown>>;
    /** Attempts in manual review after the run (D1: alarmed once a day each). */
    reviewAttempts?: Array<Record<string, unknown>>;
    manualReviewCount?: number;
    /** Anahtarın gösterdiği iade talebinin metadata'sı. */
    requestMetadata?: unknown;
    /** Staging guard (D1): rows up to this instant are production copies. */
    copiedBefore?: Date | null;
  }) => {
    // A quarantined submission is no longer `submitting` on the next run.
    let staleAttempts = opts?.staleAttempts ?? [];
    const prisma = {
      refundAttempt: {
        findMany: jest.fn(async ({ where }: { where: any }) => {
          if (where.status === RefundAttemptStatus.submitting) {
            const stale = staleAttempts;
            staleAttempts = [];
            return stale;
          }
          if (where.status === RefundAttemptStatus.manual_review) {
            return opts?.reviewAttempts ?? [];
          }
          if (where.tradeId) return opts?.tradeAttempts ?? [];
          return opts?.orderAttempts ?? [];
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(opts?.manualReviewCount ?? 0),
      },
      refundRequest: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest
          .fn()
          .mockResolvedValue({ metadata: opts?.requestMetadata ?? null }),
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
    // Alarm claims behave like Redis `SET NX EX` against the test clock.
    const claims = new Map<string, number>();
    const clock = { now: Date.now() };
    const cache = {
      claimKey: jest.fn(
        async (
          key: string,
          ttlSeconds: number,
        ): Promise<"claimed" | "held" | "unavailable"> => {
          const expiresAt = claims.get(key);
          if (expiresAt !== undefined && expiresAt > clock.now) {
            return "held" as const;
          }
          claims.set(key, clock.now + ttlSeconds * 1000);
          return "claimed" as const;
        },
      ),
    };
    const productionCopy = {
      copiedBefore: jest.fn().mockResolvedValue(opts?.copiedBefore ?? null),
    };
    const service = new RefundReconciliationService(
      prisma as any,
      paymentRefund as any,
      { resolve: () => ({}) } as any, // paymentProviders (bu testte kullanılmaz)
      { get: jest.fn().mockReturnValue(undefined) } as any, // configService
      cache as any,
      productionCopy as any,
    );
    const error = jest
      .spyOn((service as any).logger, "error")
      .mockImplementation(() => undefined);
    /** Runs the recovery at `now` (the alarm claims expire against it). */
    const runAt = (now: Date) => {
      clock.now = now.getTime();
      return service.reconcileStuckRefundMarkers(now);
    };
    return { service, prisma, paymentRefund, error, runAt, cache };
  };

  it("recovers a prepared order attempt with its original idempotency key", async () => {
    const attempt = orderAttempt();
    const { service, paymentRefund } = makeService({
      orderAttempts: [attempt],
    });

    const result = await service.reconcileStuckRefundMarkers();

    // Serbest (yönetici) anahtarından aktör çıkarılamaz → sistem.
    expect(paymentRefund.processRefund).toHaveBeenCalledWith("order-1", 50, {
      idempotencyKey: "manual-refund-1",
      cancelledBy: CancellationActor.system,
      adminCancelReasonCode: null,
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

  it("recovers a refund-request attempt on behalf of the buyer who opened it", async () => {
    const attempt = orderAttempt({
      idempotencyKey: "refund-request:refund-request-1",
    });
    const { service, paymentRefund } = makeService({
      orderAttempts: [attempt],
    });

    await service.reconcileStuckRefundMarkers();

    expect(paymentRefund.processRefund).toHaveBeenCalledWith("order-1", 50, {
      idempotencyKey: "refund-request:refund-request-1",
      cancelledBy: CancellationActor.buyer,
      adminCancelReasonCode: null,
    });
  });

  it("recovers an admin (platform) cancellation attempt on behalf of the platform", async () => {
    const attempt = orderAttempt({
      idempotencyKey: "refund-request:refund-request-1",
    });
    const { service, paymentRefund, prisma } = makeService({
      orderAttempts: [attempt],
      requestMetadata: { cancellationActor: CancellationActor.platform },
    });

    await service.reconcileStuckRefundMarkers();

    expect(prisma.refundRequest.findUnique).toHaveBeenCalledWith({
      where: { id: "refund-request-1" },
      select: { metadata: true },
    });
    expect(paymentRefund.processRefund).toHaveBeenCalledWith("order-1", 50, {
      idempotencyKey: "refund-request:refund-request-1",
      cancelledBy: CancellationActor.platform,
      adminCancelReasonCode: null,
    });
  });

  it("completes an admin cancellation that fell to review: the request's reason code goes to processRefund (stamped on the order + platform notice there)", async () => {
    const attempt = orderAttempt({
      status: RefundAttemptStatus.succeeded,
      idempotencyKey: "refund-request:refund-request-1",
    });
    const { service, paymentRefund } = makeService({
      orderAttempts: [attempt],
      requestMetadata: {
        cancellationActor: CancellationActor.platform,
        adminCancelReasonCode: "suspicious_activity",
      },
    });

    await service.reconcileStuckRefundMarkers();

    expect(paymentRefund.processRefund).toHaveBeenCalledWith("order-1", 50, {
      idempotencyKey: "refund-request:refund-request-1",
      cancelledBy: CancellationActor.platform,
      adminCancelReasonCode: "suspicious_activity",
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

  it("quarantines stale submissions one by one and reports unresolved attempts", async () => {
    const { service, prisma } = makeService({
      staleAttempts: [
        { id: "stale-1", orderId: "order-1", tradeId: null },
        { id: "stale-2", orderId: null, tradeId: "trade-1" },
      ],
      manualReviewCount: 3,
    });

    const result = await service.reconcileStuckRefundMarkers();

    for (const id of ["stale-1", "stale-2"]) {
      // CAS per attempt: one that finished meanwhile is left alone.
      expect(prisma.refundAttempt.updateMany).toHaveBeenCalledWith({
        where: {
          id,
          status: RefundAttemptStatus.submitting,
          requestStartedAt: { lt: expect.any(Date) },
        },
        data: {
          status: RefundAttemptStatus.manual_review,
          failureReason:
            "Refund submission ended without a durable provider response",
        },
      });
    }
    expect(result).toEqual({
      checked: 0,
      recovered: 0,
      manualReview: 3,
    });
  });

  /**
   * D1: the manual-review alarm used to be one error line with counts on every
   * 5-minute run. The Sentry repeat throttle (D0) keys a report by its message
   * shape and entity ids, so a counts-only line would hide a new attempt for
   * up to 20 h. Now: one error line per newly quarantined attempt, and one
   * line per attempt still in review, at most once a day each.
   */
  describe("manual review alarm (D1)", () => {
    const NOW = new Date("2026-10-23T12:00:00.000Z");
    const HOUR = 60 * 60_000;
    const later = (ms: number) => new Date(NOW.getTime() + ms);
    const review = (id: string, failureReason: string) => ({
      id,
      orderId: `order-of-${id}`,
      tradeId: null,
      failureReason,
    });

    it("each newly quarantined attempt gets its own error line with its ids", async () => {
      const { runAt, error } = makeService({
        staleAttempts: [
          { id: "stale-1", orderId: "order-1", tradeId: null },
          { id: "stale-2", orderId: null, tradeId: "trade-1" },
        ],
      });

      await runAt(NOW);

      const lines = error.mock.calls.map((call) => String(call[0]));
      expect(lines).toHaveLength(2);
      expect(lines[0]).toContain("stale-1");
      expect(lines[0]).toContain("order-1");
      expect(lines[0]).not.toContain("stale-2");
      expect(lines[1]).toContain("stale-2");
      expect(lines[1]).toContain("trade-1");
      for (const line of lines) expect(line).toContain("REFUND_MANUAL_REVIEW");
    });

    it("an attempt in review alarms once a day, one line per attempt", async () => {
      const reviewAttempts = [
        review("attempt-a", "provider_nothing_left: kalan tutardan (0 TL)"),
        review("attempt-b", "payout_completed"),
      ];
      const { runAt, error } = makeService({
        reviewAttempts,
        manualReviewCount: 2,
      });

      await runAt(NOW);
      const first = error.mock.calls.map((call) => String(call[0]));
      expect(first).toHaveLength(2);
      expect(first[0]).toContain("attempt-a");
      expect(first[0]).toContain("order-of-attempt-a");
      expect(first[0]).toContain("provider_nothing_left");
      expect(first[1]).toContain("attempt-b");

      error.mockClear();
      await runAt(later(HOUR));
      expect(error).not.toHaveBeenCalled();

      await runAt(later(24 * HOUR));
      expect(error).toHaveBeenCalledTimes(2);
    });

    it("a newly quarantined attempt is not alarmed twice in the same run", async () => {
      const { runAt, error } = makeService({
        staleAttempts: [{ id: "stale-1", orderId: "order-1", tradeId: null }],
        reviewAttempts: [review("stale-1", "Refund submission ended")],
        manualReviewCount: 1,
      });

      await runAt(NOW);
      expect(error).toHaveBeenCalledTimes(1);

      error.mockClear();
      await runAt(later(HOUR));
      expect(error).not.toHaveBeenCalled();
    });

    it("a submission that finished while being quarantined is not alarmed as quarantined", async () => {
      const { runAt, error, prisma } = makeService({
        staleAttempts: [{ id: "stale-1", orderId: "order-1", tradeId: null }],
      });
      // The CAS on `submitting` lost: the submission got its answer meanwhile.
      prisma.refundAttempt.updateMany.mockResolvedValueOnce({ count: 0 });

      await runAt(NOW);

      expect(error).not.toHaveBeenCalled();
    });

    it("reads the attempts in review newest first, so a newly parked one always alarms", async () => {
      const { runAt, prisma } = makeService();

      await runAt(NOW);

      const reviewQuery = (
        prisma.refundAttempt.findMany.mock.calls as unknown as [
          { where: { status?: unknown }; orderBy: unknown; take: number },
        ][]
      )
        .map(([args]) => args)
        .find(
          (args) => args.where.status === RefundAttemptStatus.manual_review,
        );
      expect(reviewQuery?.orderBy).toEqual({ updatedAt: "desc" });
      expect(reviewQuery?.take).toBe(500);
    });

    it("more attempts in review than one run lists: one count line a day", async () => {
      const { runAt, error } = makeService({ manualReviewCount: 650 });

      await runAt(NOW);
      expect(error).toHaveBeenCalledTimes(1);
      expect(String(error.mock.calls[0][0])).toContain("650");

      error.mockClear();
      await runAt(later(HOUR));
      expect(error).not.toHaveBeenCalled();
    });

    it("without the cache every run alarms (fail loud)", async () => {
      const { runAt, error, cache } = makeService({
        reviewAttempts: [review("attempt-a", "payout_completed")],
      });
      cache.claimKey.mockResolvedValue("unavailable");

      await runAt(NOW);
      await runAt(later(HOUR));

      expect(error).toHaveBeenCalledTimes(2);
    });

    it("staging: production copies are left out of recovery, quarantine and the alarm", async () => {
      const cutoff = new Date("2026-10-20T03:00:00.000Z");
      const sweepable = {
        OR: [{ isTest: true }, { createdAt: { gt: cutoff } }],
      };
      const { runAt, prisma } = makeService({ copiedBefore: cutoff });

      await runAt(NOW);

      const wheres = prisma.refundAttempt.findMany.mock.calls.map(
        ([args]: [{ where: any }]) => args.where,
      );
      expect(wheres).toHaveLength(4);
      for (const where of wheres) expect(where.payment).toEqual(sweepable);
      expect(prisma.refundAttempt.count).toHaveBeenCalledWith({
        where: {
          status: RefundAttemptStatus.manual_review,
          payment: sweepable,
        },
      });
    });

    it("live production: no payment filter at all", async () => {
      const { runAt, prisma } = makeService({ copiedBefore: null });

      await runAt(NOW);

      for (const [args] of prisma.refundAttempt.findMany.mock.calls as [
        { where: any },
      ][]) {
        expect(args.where.payment).toBeUndefined();
      }
    });
  });
});
