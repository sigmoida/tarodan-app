import { AdminPaymentService } from "./admin-payment.service";
import { PaymentStatus } from "@prisma/client";

/**
 * MONEY-L1: manualRefund artık orderId NULL olan grup/trade ödemelerini doğru yönlendirir
 * (eskiden processRefund(null) çağırıp karışık davranıyordu). Trade → refundTradeCashTracked;
 * grup → net hata (sipariş bazında iade). Tekil → processRefund.
 */
describe("AdminPaymentService.manualRefund — MONEY-L1 group/trade routing", () => {
  const makeService = (payment: any) => {
    const prisma = {
      payment: { findUnique: jest.fn().mockResolvedValue(payment) },
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
    const { service, paymentService } = makeService({
      id: "pay-1",
      status: PaymentStatus.completed,
      amount: 100,
      orderId: null,
      tradeCashPayment: { tradeId: "trade-1" },
    });

    await service.manualRefund(
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
