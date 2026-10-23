import {
  CancellationActor,
  OrderOrigin,
  OrderStatus,
  PaymentStatus,
  PaytrMerchant,
  RefundAttemptStatus,
} from "@prisma/client";
import { PaymentRefundService } from "./payment-refund.service";
import { PaymentRefundAttemptService } from "./payment-refund-attempt.service";
import { ProviderRefundRejectedException } from "../../payment-providers/refund-errors";

/**
 * Behaviour pin of `processRefund` on a boost order (`BST-`, a
 * `platform_service` order of the platform seller for a virtual
 * `boost-<id>` product), the money path of the admin "refund and stop" tool:
 *
 * - PayTR refunds on the store the boost was paid on (the payment's
 *   `paytrMerchant`), the amount the admin entered, once per attempt key.
 * - No ledger reversal: fulfilment never wrote a capture group for a virtual
 *   order, so a `refund_issued` group would credit the platform seller's
 *   escrow with money that never entered it. No hold, no seller debt, no
 *   stock on the virtual product (its quantity is null).
 * - The boost stops in the same finalize transaction, with the amount, the
 *   staff user and the reason; a failed PayTR call stops nothing.
 * - The e-Arşiv reversal goes through the outbox (ratio of the payment).
 */
describe("PaymentRefundService.processRefund on a boost order", () => {
  const ORDER_ID = "order-bst";
  const PAID = 59;

  const make = (
    over: {
      origin?: OrderOrigin;
      refundedBefore?: number;
      paytrRejects?: boolean;
      /** What the timeline finds for the order: null for a membership order. */
      boostStop?: { stopped: boolean } | null;
    } = {},
  ) => {
    let metadata: Record<string, unknown> = over.refundedBefore
      ? { refundedOrders: { [ORDER_ID]: over.refundedBefore } }
      : {};
    const attempt = {
      id: "attempt-1",
      paymentId: "pay-1",
      orderId: ORDER_ID,
      idempotencyKey: "boost-refund:boost-1:0",
      amount: 0,
      status: RefundAttemptStatus.prepared,
      providerRefundId: null,
      providerResponse: null,
    };
    const order = {
      id: ORDER_ID,
      orderNumber: "BST-1",
      status: OrderStatus.completed,
      origin: over.origin ?? OrderOrigin.platform_service,
      productId: "boost-boost-1",
      sellerId: "platform-seller",
      buyerId: "seller-1",
      quantity: 1,
      stockRestoredAt: null,
      offerId: null,
      cancelledBy: null,
      deliveredAt: null,
      cancellationType: "iptal",
      buyer: { id: "seller-1", email: "seller@test.local", displayName: "S" },
      seller: {
        id: "platform-seller",
        email: "p@test.local",
        displayName: "P",
      },
      commissionAmount: 0,
      withholdingTaxAmount: 0,
      totalAmount: PAID,
      checkoutGroupId: null,
      packageId: null,
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      refundAttempt: {
        // By id (finalize, after PayTR): the succeeded attempt; by key (the
        // claim): none yet, a fresh refund.
        findUnique: jest.fn(
          ({
            where,
          }: {
            where: { id?: string };
          }): Promise<Record<string, unknown> | null> =>
            Promise.resolve(
              where.id
                ? { ...attempt, status: RefundAttemptStatus.succeeded }
                : null,
            ),
        ),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ ...attempt, ...data }),
        ),
        update: jest.fn().mockResolvedValue({}),
      },
      payment: {
        findUnique: jest.fn(() => Promise.resolve({ metadata })),
        update: jest.fn(({ data }: { data: { metadata: typeof metadata } }) => {
          metadata = data.metadata;
          return Promise.resolve({});
        }),
      },
      paymentHold: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
      payoutTransfer: { findFirst: jest.fn().mockResolvedValue(null) },
      order: {
        findUnique: jest.fn().mockResolvedValue(order),
        update: jest.fn().mockResolvedValue({}),
      },
      product: { findUnique: jest.fn(), update: jest.fn() },
      sellerAccountAdjustment: { upsert: jest.fn() },
      offer: { updateMany: jest.fn() },
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
          providerConversationId: "BSTOID1",
          metadata,
          isTest: false,
          order,
        }),
      },
      refundAttempt: {
        findUnique: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      order: { findUnique: jest.fn().mockResolvedValue(order) },
      payoutTransfer: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const paytr = {
      createRefund: over.paytrRejects
        ? jest
            .fn()
            .mockRejectedValue(
              new ProviderRefundRejectedException("refund rejected"),
            )
        : jest.fn().mockResolvedValue({ status: "success" }),
    };
    const registry = { resolve: jest.fn(() => paytr) };
    const ledger = { recordRefund: jest.fn().mockResolvedValue(null) };
    const outbox = { enqueue: jest.fn().mockResolvedValue(undefined) };
    const boostTimeline = {
      stopForRefund: jest
        .fn()
        .mockResolvedValue(
          over.boostStop === undefined ? { stopped: true } : over.boostStop,
        ),
    };
    const events = { emitPaymentRefunded: jest.fn() };
    const notifications = { notifyOrderCancelledParties: jest.fn() };
    const common = { cancelSuratShipmentIfExists: jest.fn() };
    const service = new PaymentRefundService(
      prisma as never,
      { get: jest.fn().mockReturnValue(undefined) } as never,
      registry as never,
      events as never,
      notifications as never,
      {
        applyRefund: jest.fn().mockResolvedValue({ updated: false }),
      } as never,
      { handleOrderRefund: jest.fn().mockResolvedValue(undefined) } as never,
      common as never,
      { record: jest.fn().mockResolvedValue(undefined) } as never,
      {} as never, // holdRelease
      new PaymentRefundAttemptService(prisma as never),
      {} as never, // tradeRefunds
      boostTimeline as never,
      outbox as never,
      ledger as never,
      undefined, // discounts
      undefined, // staff mail
    );
    // Spied, not run: the staff mail itself is the mail module's business.
    const staffNotice = jest
      .spyOn(
        service as unknown as {
          notifyStaffOrderCancelled: () => Promise<void>;
        },
        "notifyStaffOrderCancelled",
      )
      .mockResolvedValue(undefined);
    return {
      service,
      tx,
      prisma,
      paytr,
      registry,
      ledger,
      outbox,
      boostTimeline,
      events,
      notifications,
      common,
      staffNotice,
    };
  };

  const opts = {
    idempotencyKey: "boost-refund:boost-1:0",
    cancelledBy: CancellationActor.platform,
    skipRefundEvent: true,
    boostStop: { actorId: "admin-user", reason: "Seller asked for a refund" },
  } as const;

  it("refunds the full amount on the store it was paid on, once", async () => {
    const { service, paytr, registry } = make();

    await expect(
      service.processRefund(ORDER_ID, PAID, opts),
    ).resolves.toMatchObject({ success: true, refundAmount: PAID });

    expect(registry.resolve).toHaveBeenCalledWith("paytr", "marketplace");
    expect(paytr.createRefund).toHaveBeenCalledTimes(1);
    expect(paytr.createRefund).toHaveBeenCalledWith(
      "BSTOID1",
      PAID,
      "attempt-1",
    );
  });

  it("stops the boost in the finalize transaction with the amount, the admin and the reason", async () => {
    const { service, tx, boostTimeline } = make();

    await service.processRefund(ORDER_ID, PAID, opts);

    expect(boostTimeline.stopForRefund).toHaveBeenCalledWith(tx, ORDER_ID, {
      actorId: "admin-user",
      reason: "Seller asked for a refund",
      refundedAmount: PAID,
    });
    // Before the attempt is finalized: one transaction, both or neither.
    expect(
      boostTimeline.stopForRefund.mock.invocationCallOrder[0],
    ).toBeLessThan(tx.refundAttempt.update.mock.invocationCallOrder[0]);
  });

  it("writes no ledger reversal, hold, seller debt or stock for the platform seller", async () => {
    const { service, tx, ledger } = make();

    await service.processRefund(ORDER_ID, PAID, opts);

    expect(ledger.recordRefund).not.toHaveBeenCalled();
    expect(tx.paymentHold.update).not.toHaveBeenCalled();
    expect(tx.sellerAccountAdjustment.upsert).not.toHaveBeenCalled();
    expect(tx.product.update).not.toHaveBeenCalled();
  });

  it("closes the order as a platform cancellation on a full refund", async () => {
    const { service, tx } = make();

    await service.processRefund(ORDER_ID, PAID, opts);

    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ORDER_ID },
        data: expect.objectContaining({
          status: OrderStatus.cancelled,
          cancelledBy: CancellationActor.platform,
        }),
      }),
    );
    expect(tx.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: PaymentStatus.refunded }),
      }),
    );
  });

  it("reverses the boost invoice through the outbox, in the refund's ratio", async () => {
    const { service, outbox } = make();

    await service.processRefund(ORDER_ID, 20, opts);

    expect(outbox.enqueue).toHaveBeenCalledWith(expect.anything(), {
      type: "invoice.refund_reverse",
      payload: expect.objectContaining({
        orderId: ORDER_ID,
        refundAttemptId: "attempt-1",
        refundRatio: 20 / PAID,
        fullyRefunded: false,
      }),
      dedupeKey: "invoice.refund_reverse:attempt-1",
    });
  });

  it("a partial refund keeps the order and the payment open and stops the boost with its amount", async () => {
    const { service, tx, boostTimeline } = make();

    await service.processRefund(ORDER_ID, 20, opts);

    expect(tx.order.update).not.toHaveBeenCalled();
    expect(tx.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: PaymentStatus.completed }),
      }),
    );
    expect(boostTimeline.stopForRefund).toHaveBeenCalledWith(
      tx,
      ORDER_ID,
      expect.objectContaining({ refundedAmount: 20 }),
    );
  });

  it("refuses more than the payment has left before PayTR", async () => {
    const { service, paytr, boostTimeline } = make({ refundedBefore: 50 });

    await expect(
      service.processRefund(ORDER_ID, 10, opts),
    ).rejects.toMatchObject({
      response: { i18nKey: "server.payment.refundAmountExceedsLimit" },
    });
    expect(paytr.createRefund).not.toHaveBeenCalled();
    expect(boostTimeline.stopForRefund).not.toHaveBeenCalled();
  });

  it("a rejected PayTR refund stops nothing", async () => {
    const { service, boostTimeline, prisma } = make({ paytrRejects: true });

    await expect(service.processRefund(ORDER_ID, PAID, opts)).rejects.toThrow(
      "refund rejected",
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1); // the attempt claim only
    expect(boostTimeline.stopForRefund).not.toHaveBeenCalled();
  });

  it.each([OrderOrigin.direct_sale, OrderOrigin.offer])(
    "an ordinary %s order keeps its ledger reversal and stops no boost",
    async (origin) => {
      const { service, ledger, boostTimeline } = make({ origin });

      await service.processRefund(ORDER_ID, PAID, opts);

      expect(ledger.recordRefund).toHaveBeenCalledTimes(1);
      expect(ledger.recordRefund).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ orderId: ORDER_ID, refundAmount: PAID }),
      );
      expect(boostTimeline.stopForRefund).not.toHaveBeenCalled();
    },
  );

  // D16 refuses a boost order on the admin refund screens only. The system
  // paths (the late-payment auto refund, the stuck-refund recovery) call
  // processRefund directly and must still settle a boost order that has its
  // boost row, stopping the boost with the money.
  it("a system refund of a boost order that has its boost row still refunds and stops the boost", async () => {
    const { service, prisma, paytr, boostTimeline } = make();
    const productBoost = {
      findUnique: jest.fn().mockResolvedValue({ id: "boost-1" }),
    };
    Object.assign(prisma, { productBoost });

    await expect(
      service.processRefund(ORDER_ID, undefined, {
        cancelledBy: CancellationActor.system,
      }),
    ).resolves.toMatchObject({ success: true, refundAmount: PAID });
    expect(paytr.createRefund).toHaveBeenCalledTimes(1);
    expect(boostTimeline.stopForRefund).toHaveBeenCalledWith(
      expect.anything(),
      ORDER_ID,
      expect.objectContaining({ refundedAmount: PAID }),
    );
  });

  describe("the seller hears it from the boost notice only", () => {
    // No skipRefundEvent: the recovery cron and the auto-refund sweep never
    // pass it, so processRefund decides from the boost order itself.
    const recovery = {
      idempotencyKey: "boost-refund:boost-1:0",
      cancelledBy: CancellationActor.platform,
    };

    it("sends no order refund or cancel notice, no staff mail and no shipment cancel", async () => {
      const { service, events, notifications, staffNotice, common, outbox } =
        make();

      await service.processRefund(ORDER_ID, PAID, recovery);

      expect(events.emitPaymentRefunded).not.toHaveBeenCalled();
      expect(notifications.notifyOrderCancelledParties).not.toHaveBeenCalled();
      expect(staffNotice).not.toHaveBeenCalled();
      expect(common.cancelSuratShipmentIfExists).not.toHaveBeenCalled();
      expect(outbox.enqueue).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ type: "shipment.cancel" }),
      );
    });

    it("a membership order (no boost) keeps its order notices and staff mail, with no shipment cancel", async () => {
      const { service, notifications, staffNotice, common } = make({
        boostStop: null,
      });

      await service.processRefund(ORDER_ID, PAID, recovery);

      expect(notifications.notifyOrderCancelledParties).toHaveBeenCalledTimes(
        1,
      );
      expect(staffNotice).toHaveBeenCalledWith(ORDER_ID, PAID);
      expect(common.cancelSuratShipmentIfExists).not.toHaveBeenCalled();
    });
  });

  describe("the claim guard", () => {
    it("runs under the payment lock before a new attempt is written", async () => {
      const { service, tx } = make();
      const guard = jest.fn().mockResolvedValue(undefined);

      await service.processRefund(ORDER_ID, PAID, {
        ...opts,
        claimGuard: guard,
      });

      expect(guard).toHaveBeenCalledWith(tx);
      expect(guard.mock.invocationCallOrder[0]).toBeGreaterThan(
        tx.$queryRaw.mock.invocationCallOrder[0],
      );
      expect(guard.mock.invocationCallOrder[0]).toBeLessThan(
        tx.refundAttempt.create.mock.invocationCallOrder[0],
      );
    });

    it("a refusing guard writes no attempt and calls no PayTR", async () => {
      const { service, tx, paytr, boostTimeline } = make();
      const refusal = new Error("boost already stopped");

      await expect(
        service.processRefund(ORDER_ID, PAID, {
          ...opts,
          claimGuard: jest.fn().mockRejectedValue(refusal),
        }),
      ).rejects.toBe(refusal);
      expect(tx.refundAttempt.create).not.toHaveBeenCalled();
      expect(paytr.createRefund).not.toHaveBeenCalled();
      expect(boostTimeline.stopForRefund).not.toHaveBeenCalled();
    });

    /**
     * The claim finds this key's earlier try, which PayTR refused, and
     * prepares it again; the finalize then reads it as succeeded.
     */
    const withFailedTry = (tx: ReturnType<typeof make>["tx"]) => {
      const tried = (status: RefundAttemptStatus) => ({
        id: "attempt-1",
        paymentId: "pay-1",
        orderId: ORDER_ID,
        idempotencyKey: opts.idempotencyKey,
        amount: PAID,
        status,
        providerRefundId: null,
        providerResponse: null,
      });
      tx.refundAttempt.findUnique.mockImplementation(({ where }) =>
        Promise.resolve(
          tried(
            where.id
              ? RefundAttemptStatus.succeeded
              : RefundAttemptStatus.failed,
          ),
        ),
      );
      tx.refundAttempt.update.mockResolvedValueOnce(
        tried(RefundAttemptStatus.prepared),
      );
    };

    it("also runs before a refused try of the same key is sent again", async () => {
      const { service, tx, paytr } = make();
      withFailedTry(tx);
      const guard = jest.fn().mockResolvedValue(undefined);

      await service.processRefund(ORDER_ID, PAID, {
        ...opts,
        claimGuard: guard,
      });

      expect(guard).toHaveBeenCalledTimes(1);
      expect(guard.mock.invocationCallOrder[0]).toBeLessThan(
        tx.refundAttempt.update.mock.invocationCallOrder[0],
      );
      expect(paytr.createRefund).toHaveBeenCalledTimes(1);
    });

    it("a refusing guard leaves a refused try refused and calls no PayTR", async () => {
      const { service, tx, paytr, boostTimeline } = make();
      withFailedTry(tx);
      const refusal = new Error("boost already stopped");

      await expect(
        service.processRefund(ORDER_ID, PAID, {
          ...opts,
          claimGuard: jest.fn().mockRejectedValue(refusal),
        }),
      ).rejects.toBe(refusal);
      expect(tx.refundAttempt.update).not.toHaveBeenCalled();
      expect(paytr.createRefund).not.toHaveBeenCalled();
      expect(boostTimeline.stopForRefund).not.toHaveBeenCalled();
    });
  });
});
