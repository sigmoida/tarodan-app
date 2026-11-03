import {
  CancellationActor,
  Prisma,
  PaymentStatus,
  PaymentHoldStatus,
  OrderStatus,
  RefundAttemptStatus,
} from "@prisma/client";
import { PrismaService } from "../../src/prisma";
import { PaymentRefundService } from "../../src/modules/payment/refund/payment-refund.service";
import { PaymentRefundAttemptService } from "../../src/modules/payment/refund/payment-refund-attempt.service";
import { PaymentProviderEventService } from "../../src/modules/payment/payment-provider-event.service";
import { ProviderRefundRejectedException } from "../../src/modules/payment-providers/refund-errors";
import { paymentProviderRegistryFor } from "../mocks/paytr.mock";
import {
  truncateAll,
  getPrisma,
  seedBaseline,
  disconnectPrisma,
} from "../test-utils/db";

/**
 * #85: the order refund path must be idempotent. PayTR's refund call carries
 * no idempotency key, so a persist failure followed by a reconciliation retry
 * used to refund twice.
 *
 * The first fix was a per-order `refundInProgressOrders` marker on the payment.
 * 14adf18e3 (fix(payment): add durable refund reconciliation) replaced it with
 * the refund_attempts ledger: the intent is written before PayTR is called, a
 * provider success is persisted as `succeeded` before any order/hold/ledger
 * change, and a retry of a `succeeded` attempt only finalizes it. These tests
 * pin that behaviour against a real database. [P0]
 *
 * Light harness (no ES/app boot): real DB, PayTR stubbed behind the real
 * provider registry.
 */
describe("Order refund idempotency (#85) [P0]", () => {
  let prisma: PrismaService;
  let refund: PaymentRefundService;
  const createRefund = jest.fn();
  // Makes the refund's finalize transaction fail once, after PayTR has
  // already refunded: the "provider done, persist failed" crash window.
  let failNextLedgerWrite = false;
  const ledgerWrite = async () => {
    if (failNextLedgerWrite) {
      failNextLedgerWrite = false;
      throw new Error("simulated persist failure after the provider refund");
    }
    return { updated: false, fullyRefunded: false };
  };

  const configStub = {
    get: (k: string) =>
      (
        ({
          RETURN_WINDOW_DAYS: "14",
          PAYOUT_GRACE_DAYS: "1",
          PAYMENT_HOLD_DAYS: "7",
          PAYMENT_BYPASS: "false",
        }) as Record<string, string>
      )[k],
  };

  beforeAll(() => {
    prisma = getPrisma() as unknown as PrismaService;
    refund = new PaymentRefundService(
      prisma,
      configStub as any,
      paymentProviderRegistryFor({ createRefund }), // paymentProviders
      { emitPaymentRefunded: async () => {} } as any, // eventService
      {
        createInAppNotification: async () => {},
        sendOrderCancelledEmails: async () => {},
      } as any, // notificationService
      {
        // The refund transaction marks the ledger: markRefunded (full) or
        // applyRefund (pro-rata, #88). Both are stubbed.
        markRefunded: ledgerWrite,
        applyRefund: ledgerWrite,
      } as any, // commissionLedger
      {
        handleOrderRefund: async () => {},
        issueCommissionInvoice: async () => {},
        issueServiceFeeInvoice: async () => {},
        issuePlatformSaleInvoice: async () => {},
      } as any, // invoicing
      { cancelSuratShipmentIfExists: async () => {} } as any, // paymentCommon
      new PaymentProviderEventService(prisma), // providerEvents
      {} as any, // holdRelease
      new PaymentRefundAttemptService(prisma), // attempts
      {} as any, // tradeRefunds
      {} as any, // boostTimeline (not a boost order)
    );
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  beforeEach(async () => {
    await truncateAll();
    await seedBaseline();
    createRefund.mockReset();
    createRefund.mockResolvedValue({ status: "success", err_msg: null });
    failNextLedgerWrite = false;
  });

  async function attemptsOf(paymentId: string, orderId: string) {
    return prisma.refundAttempt.findMany({ where: { paymentId, orderId } });
  }

  async function setupPaidOrder(): Promise<{
    orderId: string;
    paymentId: string;
  }> {
    const uniq = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const buyer = await prisma.user.create({
      data: { email: `b-${uniq}@t.local`, passwordHash: "x", displayName: "B" },
    });
    const seller = await prisma.user.create({
      data: {
        email: `s-${uniq}@t.local`,
        passwordHash: "x",
        displayName: "S",
        isSeller: true,
      },
    });
    const category = await prisma.category.findFirst();
    const product = await prisma.product.create({
      data: {
        sellerId: seller.id,
        categoryId: category!.id,
        title: `P-${uniq}`,
        description: "x",
        price: new Prisma.Decimal(100),
        condition: "new" as any,
        status: "active" as any,
        quantity: 1,
        reservedQuantity: 0,
      },
    });
    const order = await prisma.order.create({
      data: {
        orderNumber: `O-${uniq}`,
        buyerId: buyer.id,
        sellerId: seller.id,
        productId: product.id,
        totalAmount: new Prisma.Decimal(100),
        subtotal: new Prisma.Decimal(100),
        commissionAmount: new Prisma.Decimal(10),
        buyerFeeAmount: new Prisma.Decimal(5),
        paymentExpiresAt: new Date(Date.now() + 3_600_000),
        status: OrderStatus.paid,
        quantity: 1,
      },
    });
    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        provider: "paytr",
        providerConversationId: `oid-${uniq}`,
        amount: order.totalAmount,
        status: PaymentStatus.completed,
        metadata: {},
      },
    });
    await prisma.paymentHold.create({
      data: {
        paymentId: payment.id,
        orderId: order.id,
        sellerId: seller.id,
        amount: new Prisma.Decimal(85),
        status: PaymentHoldStatus.held,
        releaseAt: null,
      },
    });
    return { orderId: order.id, paymentId: payment.id };
  }

  it("taze iade: PayTR bir kez çağrılır, deneme kesinleşir, payment refunded olur", async () => {
    const { orderId, paymentId } = await setupPaidOrder();

    await refund.processRefund(orderId, undefined, {
      cancelledBy: CancellationActor.platform,
    });

    expect(createRefund).toHaveBeenCalledTimes(1);
    expect(createRefund.mock.calls[0][1]).toBe(100); // full amount, TL
    const p = await prisma.payment.findUnique({ where: { id: paymentId } });
    expect(p!.status).toBe(PaymentStatus.refunded);
    const attempts = await attemptsOf(paymentId, orderId);
    expect(attempts).toHaveLength(1);
    expect(attempts[0].status).toBe(RefundAttemptStatus.finalized);
    expect(Number(attempts[0].amount)).toBe(100);
    expect(attempts[0].providerSucceededAt).toBeTruthy();
    // The provider reference is the attempt id (echoed by the status inquiry).
    expect(createRefund.mock.calls[0][2]).toBe(attempts[0].id);
  });

  it("retry (PayTR iade etti ama persist başarısız): PayTR TEKRAR çağrılmaz, retry kesinleştirir", async () => {
    const { orderId, paymentId } = await setupPaidOrder();

    // 1st call: PayTR refunds, then the finalize transaction fails.
    failNextLedgerWrite = true;
    await expect(
      refund.processRefund(orderId, undefined, {
        cancelledBy: CancellationActor.platform,
      }),
    ).rejects.toThrow();
    expect(createRefund).toHaveBeenCalledTimes(1);
    const [stuck] = await attemptsOf(paymentId, orderId);
    // The provider success survived the failure: retry knows money moved.
    expect(stuck.status).toBe(RefundAttemptStatus.succeeded);
    const mid = await prisma.payment.findUnique({ where: { id: paymentId } });
    expect(mid!.status).toBe(PaymentStatus.completed);

    // 2nd call (reconciliation retry): finalizes without calling PayTR.
    await refund.processRefund(orderId, undefined, {
      cancelledBy: CancellationActor.platform,
    });

    // Kritik #85: PayTR ikinci kez çağrılmaz → çift iade yok.
    expect(createRefund).toHaveBeenCalledTimes(1);
    const p = await prisma.payment.findUnique({ where: { id: paymentId } });
    expect(p!.status).toBe(PaymentStatus.refunded);
    const attempts = await attemptsOf(paymentId, orderId);
    expect(attempts).toHaveLength(1);
    expect(attempts[0].status).toBe(RefundAttemptStatus.finalized);
  });

  it("PayTR kesin reddederse: deneme yeniden denenebilir kalır, payment completed kalır, retry PayTR'yi yeniden çağırır", async () => {
    const { orderId, paymentId } = await setupPaidOrder();
    // The real PayTRService throws ProviderRefundRejectedException when PayTR
    // answers non-success (9d29eb51e); it never returns a failed status.
    createRefund.mockRejectedValueOnce(
      new ProviderRefundRejectedException("insufficient"),
    );

    await expect(
      refund.processRefund(orderId, undefined, {
        cancelledBy: CancellationActor.platform,
      }),
    ).rejects.toBeInstanceOf(ProviderRefundRejectedException);

    expect(createRefund).toHaveBeenCalledTimes(1);
    const p = await prisma.payment.findUnique({ where: { id: paymentId } });
    expect(p!.status).toBe(PaymentStatus.completed); // iade olmadı
    const [failed] = await attemptsOf(paymentId, orderId);
    // No money moved: a retryable `failed`, not a manual review.
    expect(failed.status).toBe(RefundAttemptStatus.failed);

    // Retry is allowed and reaches PayTR again.
    await refund.processRefund(orderId, undefined, {
      cancelledBy: CancellationActor.platform,
    });
    expect(createRefund).toHaveBeenCalledTimes(2);
    const after = await prisma.payment.findUnique({ where: { id: paymentId } });
    expect(after!.status).toBe(PaymentStatus.refunded);
    const attempts = await attemptsOf(paymentId, orderId);
    expect(attempts).toHaveLength(1);
    expect(attempts[0].status).toBe(RefundAttemptStatus.finalized);
  });

  it("reconciliation-retry simülasyonu: iki ardışık processRefund çağrısı toplam TEK PayTR iadesi yapar", async () => {
    const { orderId, paymentId } = await setupPaidOrder();

    await refund.processRefund(orderId, undefined, {
      cancelledBy: CancellationActor.platform,
    }); // 1. çağrı: PayTR + refunded
    // 2. call: the finalized attempt answers idempotently, with no new charge
    // back. (Before 14adf18e3 the second call failed with NotFound; the
    // refund_attempts ledger made it an idempotent success.)
    const second = await refund.processRefund(orderId, undefined, {
      cancelledBy: CancellationActor.platform,
    });

    expect(second).toEqual(
      expect.objectContaining({ success: true, idempotent: true }),
    );
    expect(createRefund).toHaveBeenCalledTimes(1);
    const p = await prisma.payment.findUnique({ where: { id: paymentId } });
    expect(p!.status).toBe(PaymentStatus.refunded);
  });
});
