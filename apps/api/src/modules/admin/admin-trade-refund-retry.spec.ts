import { PaymentStatus, TradeStatus } from "@prisma/client";
import { AdminRefundService } from "./admin-refund.service";

/**
 * TAKAS İADE RETRY KAPISI (v2) — "tamamlanmış ödeme var mı" sorusu TÜM
 * satırlara sorulmalı.
 *
 * Eski kapı `primaryCashPayment` (fark taşıyan satır) üzerindeydi: yalnız farkı
 * TAŞIMAYAN taraf ödemişken iade PayTR'da patlarsa, admin'in retry butonu
 * "tamamlanmış ödeme yok" diye 400'e takılıyordu — para tahsil edilmiş ama
 * iade edilememiş durumda kalıyordu (sweep cron'a mahkûm).
 */
describe("AdminRefundService.retryTradeRefund — v2 kapısı", () => {
  const makeService = (cashPayments: Array<Record<string, unknown>>) => {
    const prisma = {
      trade: {
        findUnique: jest.fn().mockResolvedValue({
          id: "trade-1",
          status: TradeStatus.cancelled,
          refundFailureReason: "PayTR timeout",
          refundFailureAt: new Date(),
          cashPayments,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const paymentService = {
      refundTradeCashPaymentIfCompleted: jest
        .fn()
        .mockResolvedValue({ refunded: true, paymentId: "pay-1" }),
    };
    const audit = { createRequiredAuditLog: jest.fn() };
    const eventService = {
      emitTradeRefundCompleted: jest.fn().mockResolvedValue(undefined),
      emitTradeRefundFailed: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AdminRefundService(
      prisma as never,
      audit as never,
      paymentService as never,
      {} as never,
      eventService as never,
      undefined as never,
    );
    return { service, paymentService, eventService };
  };

  it("yalnız fark taşımayan tarafın satırı tamamlandıysa da retry çalışır", async () => {
    // Fark taşıyan satır (initiator, amount>0) hâlâ pending; öbür taraf ödedi.
    const { service, paymentService, eventService } = makeService([
      {
        id: "tcp-1",
        payerId: "initiator",
        amount: 200,
        status: PaymentStatus.pending,
      },
      {
        id: "tcp-2",
        payerId: "receiver",
        amount: 0,
        status: PaymentStatus.completed,
      },
    ]);

    const result = await service.retryTradeRefund("admin-1", "trade-1");

    expect(result.refunded).toBe(true);
    expect(
      paymentService.refundTradeCashPaymentIfCompleted,
    ).toHaveBeenCalledWith("trade-1");
    // Bildirim, gerçekten tahsil edilmiş satırın sahibine gider.
    expect(eventService.emitTradeRefundCompleted).toHaveBeenCalledWith({
      tradeId: "trade-1",
      cashPayerId: "receiver",
    });
  });

  it("hiçbir satır tahsil edilmemişse 400 verir", async () => {
    const { service, paymentService } = makeService([
      {
        id: "tcp-1",
        payerId: "initiator",
        amount: 200,
        status: PaymentStatus.pending,
      },
      {
        id: "tcp-2",
        payerId: "receiver",
        amount: 0,
        status: PaymentStatus.pending,
      },
    ]);

    await expect(
      service.retryTradeRefund("admin-1", "trade-1"),
    ).rejects.toMatchObject({ status: 400 });
    expect(
      paymentService.refundTradeCashPaymentIfCompleted,
    ).not.toHaveBeenCalled();
  });
});
