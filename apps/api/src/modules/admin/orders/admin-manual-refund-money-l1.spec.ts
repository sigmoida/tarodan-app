import { AdminPaymentService } from "../finance/admin-payment.service";
import { PaymentStatus } from "@prisma/client";

/**
 * MONEY-L1: manualRefund artık orderId NULL olan grup/trade ödemelerini doğru yönlendirir
 * (eskiden processRefund(null) çağırıp karışık davranıyordu). Trade → refundTradeCashTracked;
 * grup → net hata (sipariş bazında iade). Tekil → processRefund.
 *
 * O7b: trade iadesinde admin'in girdiği tutar POLİTİKA tutarına (refundableTotal)
 * karşı doğrulanır — payment.amount'a değil. Kargoya verildiyse kargo hariç tutar
 * geçerlidir ve yanıt gerçek iade tutarını döndürür.
 */
describe("AdminPaymentService.manualRefund — MONEY-L1 group/trade routing", () => {
  const tradeCashRow = (over: Record<string, unknown> = {}) => ({
    payment: { status: PaymentStatus.completed, provider: "paytr" },
    releasedAt: null,
    refundedAt: null,
    totalAmount: 100,
    shippingAmount: 20,
    ...over,
  });

  const makeService = (
    payment: any,
    tradeFixture?: {
      cashPayments?: any[];
      firstWarehouseArrivalAt?: Date | null;
      shippedCount?: number;
    },
  ) => {
    const prisma = {
      payment: { findUnique: jest.fn().mockResolvedValue(payment) },
      tradeCashPayment: {
        findMany: jest.fn().mockResolvedValue(tradeFixture?.cashPayments ?? []),
      },
      trade: {
        findUnique: jest.fn().mockResolvedValue({
          firstWarehouseArrivalAt:
            tradeFixture?.firstWarehouseArrivalAt ?? null,
        }),
      },
      tradeShipment: {
        count: jest.fn().mockResolvedValue(tradeFixture?.shippedCount ?? 0),
      },
    };
    const audit = {
      createRequiredAuditLog: jest.fn().mockResolvedValue(undefined),
    };
    const paymentService = {
      processRefund: jest
        .fn()
        .mockResolvedValue({ success: true, providerRefundId: "x" }),
      refundTradeCashTracked: jest
        .fn()
        .mockResolvedValue({ refunded: true, failed: false }),
    };
    const service = new AdminPaymentService(
      prisma as any,
      audit as any,
      paymentService as any,
    );
    return { service, paymentService };
  };

  it("tekil ödeme (orderId var): processRefund çağırır", async () => {
    const { service, paymentService } = makeService({
      id: "pay-1",
      status: PaymentStatus.completed,
      amount: 100,
      orderId: "o1",
      tradeCashPayment: null,
    });

    await service.manualRefund(
      "admin-1",
      "pay-1",
      50,
      undefined,
      "admin-refund-1",
    );

    expect(paymentService.processRefund).toHaveBeenCalledWith("o1", 50, {
      idempotencyKey: "admin-refund-1",
    });
    expect(paymentService.refundTradeCashTracked).not.toHaveBeenCalled();
  });

  it("trade ödemesi (orderId null, tradeCashPayment var): refundTradeCashTracked çağırır", async () => {
    const { service, paymentService } = makeService(
      {
        id: "pay-1",
        status: PaymentStatus.completed,
        amount: 100,
        orderId: null,
        tradeCashPayment: { tradeId: "trade-1" },
      },
      { cashPayments: [tradeCashRow()] },
    );

    const result = await service.manualRefund(
      "admin-1",
      "pay-1",
      undefined,
      undefined,
      "admin-refund-2",
    );

    expect(paymentService.refundTradeCashTracked).toHaveBeenCalledWith(
      "trade-1",
    );
    expect(paymentService.processRefund).not.toHaveBeenCalled();
    // Kargoya verilmemiş: tam tutar iade edilir ve yanıtta görünür.
    expect(result).toMatchObject({
      refundedAmount: 100,
      shippingExcluded: false,
    });
  });

  it("politika tutarından farklı tutarı reddeder ve sağlayıcıya gitmez", async () => {
    const { service, paymentService } = makeService(
      {
        id: "pay-1",
        status: PaymentStatus.completed,
        amount: 100,
        orderId: null,
        tradeCashPayment: { tradeId: "trade-1" },
      },
      { cashPayments: [tradeCashRow()] },
    );

    await expect(
      service.manualRefund(
        "admin-1",
        "pay-1",
        50,
        undefined,
        "admin-refund-partial-trade",
      ),
    ).rejects.toThrow("Takas iadesi politika tutarıyla yapılır");
    expect(paymentService.refundTradeCashTracked).not.toHaveBeenCalled();
    expect(paymentService.processRefund).not.toHaveBeenCalled();
  });

  it("kargoya verilmiş takasta kargo hariç tutar geçerlidir; tam tahsilat tutarı reddedilir", async () => {
    const fixture = {
      cashPayments: [tradeCashRow()],
      shippedCount: 1, // handedToCargo → refundable = 100 - 20 = 80
    };
    const payment = {
      id: "pay-1",
      status: PaymentStatus.completed,
      amount: 100,
      orderId: null,
      tradeCashPayment: { tradeId: "trade-1" },
    };

    // Eski davranış "tam tutar" (100) isterdi — artık politika 80 der.
    const rejecting = makeService(payment, fixture);
    await expect(
      rejecting.service.manualRefund(
        "admin-1",
        "pay-1",
        100,
        undefined,
        "admin-refund-handed-full",
      ),
    ).rejects.toThrow("Takas iadesi politika tutarıyla yapılır");
    expect(
      rejecting.paymentService.refundTradeCashTracked,
    ).not.toHaveBeenCalled();

    const accepting = makeService(payment, fixture);
    const result = await accepting.service.manualRefund(
      "admin-1",
      "pay-1",
      80,
      undefined,
      "admin-refund-handed-policy",
    );
    expect(
      accepting.paymentService.refundTradeCashTracked,
    ).toHaveBeenCalledWith("trade-1");
    expect(result).toMatchObject({
      refundedAmount: 80,
      shippingExcluded: true,
    });
  });

  it("grup ödemesi (orderId null, trade yok): net hata, processRefund(null) YOK", async () => {
    const { service, paymentService } = makeService({
      id: "pay-1",
      status: PaymentStatus.completed,
      amount: 100,
      orderId: null,
      checkoutGroupId: "grp-1",
      tradeCashPayment: null,
    });

    await expect(
      service.manualRefund(
        "admin-1",
        "pay-1",
        undefined,
        undefined,
        "admin-refund-3",
      ),
    ).rejects.toThrow();
    expect(paymentService.processRefund).not.toHaveBeenCalled();
  });

  it("idempotency anahtarı olmadan sağlayıcıya gitmez", async () => {
    const { service, paymentService } = makeService({
      id: "pay-1",
      status: PaymentStatus.completed,
      amount: 100,
      orderId: "o1",
      tradeCashPayment: null,
    });

    await expect(service.manualRefund("admin-1", "pay-1", 50)).rejects.toThrow(
      "Idempotency key is required",
    );
    expect(paymentService.processRefund).not.toHaveBeenCalled();
    expect(paymentService.refundTradeCashTracked).not.toHaveBeenCalled();
  });
});
