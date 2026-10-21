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

/**
 * Behaviour pin of `processRefund` on a boost order (`BST-`, a
 * `platform_service` order of the platform seller for a virtual
 * `boost-<id>` product):
 *
 * - PayTR refunds on the store the boost was paid on (the payment's
 *   `paytrMerchant`), the amount asked for, once per attempt key.
 * - No ledger reversal: fulfilment never wrote a capture group for a virtual
 *   order, so a `refund_issued` group would credit the platform seller's
 *   escrow with money that never entered it. No hold, no seller debt, no
 *   stock on the virtual product (its quantity is null).
 * - The e-Arşiv reversal goes through the outbox (ratio of the payment).
 */
describe("PaymentRefundService.processRefund on a boost order", () => {
  const ORDER_ID = "order-bst";
  const PAID = 59;

  const make = (
    over: {
      origin?: OrderOrigin;
      refundedBefore?: number;
    } = {},
  ) => {
    let metadata: Record<string, unknown> = over.refundedBefore
      ? { refundedOrders: { [ORDER_ID]: over.refundedBefore } }
      : {};
    const attempt = {
      id: "attempt-1",
      paymentId: "pay-1",
      orderId: ORDER_ID,
      idempotencyKey: "refund-key-1",
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
        findUnique: jest.fn(({ where }: { where: { id?: string } }) =>
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
      createRefund: jest.fn().mockResolvedValue({ status: "success" }),
    };
    const registry = { resolve: jest.fn(() => paytr) };
    const ledger = { recordRefund: jest.fn().mockResolvedValue(null) };
    const outbox = { enqueue: jest.fn().mockResolvedValue(undefined) };
    const service = new PaymentRefundService(
      prisma as never,
      { get: jest.fn().mockReturnValue(undefined) } as never,
      registry as never,
      { emitPaymentRefunded: jest.fn() } as never,
      { notifyOrderCancelledParties: jest.fn() } as never,
      {
        applyRefund: jest.fn().mockResolvedValue({ updated: false }),
      } as never,
      { handleOrderRefund: jest.fn().mockResolvedValue(undefined) } as never,
      { cancelSuratShipmentIfExists: jest.fn() } as never,
      { record: jest.fn().mockResolvedValue(undefined) } as never,
      {} as never, // holdRelease
      new PaymentRefundAttemptService(prisma as never),
      {} as never, // tradeRefunds
      outbox as never,
      ledger as never,
    );
    return { service, tx, prisma, paytr, registry, ledger, outbox };
  };

  const opts = {
    idempotencyKey: "refund-key-1",
    cancelledBy: CancellationActor.platform,
    skipRefundEvent: true,
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

  it("refuses more than the payment has left before PayTR", async () => {
    const { service, paytr } = make({ refundedBefore: 50 });

    await expect(
      service.processRefund(ORDER_ID, 10, opts),
    ).rejects.toMatchObject({
      response: { i18nKey: "server.payment.refundAmountExceedsLimit" },
    });
    expect(paytr.createRefund).not.toHaveBeenCalled();
  });

  it("an ordinary order keeps its ledger reversal", async () => {
    const { service, ledger } = make({ origin: OrderOrigin.direct_sale });

    await service.processRefund(ORDER_ID, PAID, opts);

    expect(ledger.recordRefund).toHaveBeenCalledTimes(1);
  });
});
