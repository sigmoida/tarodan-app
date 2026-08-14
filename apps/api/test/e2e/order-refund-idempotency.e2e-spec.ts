import {
  Prisma,
  PaymentStatus,
  PaymentHoldStatus,
  OrderStatus,
} from "@prisma/client";
import { PrismaService } from "../../src/prisma";
import { PaymentRefundService } from "../../src/modules/payment/payment-refund.service";
import { PaymentRefundAttemptService } from "../../src/modules/payment/payment-refund-attempt.service";
import {
  truncateAll,
  getPrisma,
  seedBaseline,
  disconnectPrisma,
} from "../test-utils/db";

/**
 * #85 — order-refund yolu idempotent olmalı: PayTR createRefund idempotency anahtarı
 * taşımaz, persist hatası + reconciliation retry ÇİFT-İADE'ye yol açıyordu. Fix:
 * PayTR'den ÖNCE per-order refundInProgressOrders marker'ı yaz; marker varsa PayTR'yi
 * atla (persist-recovery); PayTR kesin başarısızsa marker'ı geri al. [P0]
 *
 * Hafif harness (ES/app bootstrap yok): gerçek DB + mock PayTR.
 */
describe("Order refund idempotency (#85) [P0]", () => {
  let prisma: PrismaService;
  let refund: PaymentRefundService;
  const createRefund = jest.fn();

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
    const noop: any = {};
    refund = new PaymentRefundService(
      prisma,
      configStub as any,
      { createRefund } as any, // paytrService
      { emitPaymentRefunded: async () => {} } as any, // eventService
      {
        createInAppNotification: async () => {},
        sendOrderCancelledEmails: async () => {},
      } as any, // notificationService
      {
        // processRefund iade tx'inde ledger'ı işaretler. Kod tabanına göre markRefunded
        // (tam) veya applyRefund (pro-rate, #88) çağrılabilir — ikisini de stub'la ki
        // bu test #88 ile birlikte merge edildiğinde de kırılmasın (ileri-uyumlu).
        markRefunded: async () => ({ updated: false }),
        applyRefund: async () => ({ updated: false, fullyRefunded: false }),
      } as any, // commissionLedger
      {
        handleOrderRefund: async () => {},
        issueCommissionInvoice: async () => {},
        issueServiceFeeInvoice: async () => {},
        issuePlatformSaleInvoice: async () => {},
      } as any, // elogoInvoicing
      { cancelSuratShipmentIfExists: async () => {} } as any, // paymentCommon
      {} as any, // providerEvents
      {} as any, // holdRelease
      new PaymentRefundAttemptService(prisma as any), // attempts
      {} as any, // tradeRefunds
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
  });

  async function setupPaidOrder(opts?: {
    inProgressMarker?: boolean;
  }): Promise<{ orderId: string; paymentId: string }> {
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
        metadata: opts?.inProgressMarker
          ? { refundInProgressOrders: { [order.id]: new Date().toISOString() } }
          : {},
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

  it("taze iade: PayTR bir kez çağrılır, marker yazılır, payment refunded olur", async () => {
    const { orderId, paymentId } = await setupPaidOrder();

    await refund.processRefund(orderId);

    expect(createRefund).toHaveBeenCalledTimes(1);
    const p = await prisma.payment.findUnique({ where: { id: paymentId } });
    expect(p!.status).toBe(PaymentStatus.refunded);
    expect((p!.metadata as any).refundInProgressOrders[orderId]).toBeTruthy();
  });

  it("retry (marker önceden set = PayTR yapılmış ama persist başarısız): PayTR TEKRAR çağrılmaz, recovery ile refunded olur", async () => {
    const { orderId, paymentId } = await setupPaidOrder({
      inProgressMarker: true,
    });

    await refund.processRefund(orderId);

    // Kritik #85: ikinci kez PayTR çağrılmamalı → çift-iade yok.
    expect(createRefund).not.toHaveBeenCalled();
    const p = await prisma.payment.findUnique({ where: { id: paymentId } });
    expect(p!.status).toBe(PaymentStatus.refunded);
  });

  it("PayTR kesin başarısız: marker geri alınır (retry PayTR yeniden çağırabilsin), payment completed kalır", async () => {
    const { orderId, paymentId } = await setupPaidOrder();
    createRefund.mockResolvedValueOnce({
      status: "failed",
      err_msg: "insufficient",
    });

    await expect(refund.processRefund(orderId)).rejects.toThrow();

    expect(createRefund).toHaveBeenCalledTimes(1);
    const p = await prisma.payment.findUnique({ where: { id: paymentId } });
    expect(p!.status).toBe(PaymentStatus.completed); // iade olmadı
    const inProg = (p!.metadata as any).refundInProgressOrders || {};
    expect(inProg[orderId]).toBeUndefined(); // marker temizlendi → retry mümkün
  });

  it("reconciliation-retry simülasyonu: iki ardışık processRefund çağrısı toplam TEK PayTR iadesi yapar", async () => {
    const { orderId } = await setupPaidOrder();

    await refund.processRefund(orderId); // 1. çağrı: PayTR + refunded
    // 2. çağrı: payment artık refunded → status=completed filtresi eşleşmez → NotFound.
    // (Marker + status guard birlikte çift-iadeyi engeller.)
    await expect(refund.processRefund(orderId)).rejects.toThrow();

    expect(createRefund).toHaveBeenCalledTimes(1);
  });
});
