import { PaymentRefundService } from "./payment-refund.service";

/**
 * MONEY-H2: refundTradeCashTracked — takas nakit iadesini failure-tracking ile yapar.
 * Başarısızlıkta trade.refundFailureReason marker'ı yazılır (admin retryTradeRefund +
 * retryFailedTradeRefunds cron'u toparlar); ASLA throw etmez. Başarıda marker temizlenir.
 */
describe("PaymentRefundService.refundTradeCashTracked — MONEY-H2 failure tracking", () => {
  const TRADE_ID = "trade-1";

  const makeService = () => {
    const prisma = {
      trade: { update: jest.fn().mockResolvedValue({}) },
      tradeCashPayment: {
        // Başarı yolunda iade edilen satırın sahibi findFirst ile çözülür;
        // hata yolunda tek-satırlı (v1) takasta sahibi findMany(take:2) bulur
        // (iki satırlı v2'de taraf belirsiz → null, yanlış tarafa bildirim yok).
        findFirst: jest.fn().mockResolvedValue({ payerId: "payer-1" }),
        findMany: jest.fn().mockResolvedValue([{ payerId: "payer-1" }]),
      },
    };
    const eventService = {
      emitTradeRefundCompleted: jest.fn().mockResolvedValue(undefined),
      emitTradeRefundFailed: jest.fn().mockResolvedValue(undefined),
    };
    const configService = { get: jest.fn().mockReturnValue(undefined) };
    const service = new PaymentRefundService(
      prisma as any,
      configService as any,
      {} as any, // paymentProviders
      eventService as any,
      {} as any, // notificationService
      {} as any, // commissionLedger
      {} as any, // elogoInvoicing
      {} as any, // paymentCommon
      { record: jest.fn() } as any, // providerEvents
      {} as any, // holdRelease
    );
    return { service, prisma, eventService };
  };

  it("iade PayTR'da patlarsa: throw ETMEZ, refundFailureReason marker'ı yazar, refund-failed yayınlar", async () => {
    const { service, prisma, eventService } = makeService();
    jest
      .spyOn(service, "refundTradeCashPaymentIfCompleted")
      .mockRejectedValue(new Error("PayTR down"));

    const r = await service.refundTradeCashTracked(TRADE_ID);

    expect(r.failed).toBe(true);
    expect(r.refunded).toBe(false);
    expect(prisma.trade.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: TRADE_ID },
        data: expect.objectContaining({
          refundFailureReason: expect.stringContaining("PayTR down"),
          refundFailureAt: expect.any(Date),
        }),
      }),
    );
    expect(eventService.emitTradeRefundFailed).toHaveBeenCalledWith(
      expect.objectContaining({ tradeId: TRADE_ID, cashPayerId: "payer-1" }),
    );
  });

  it("iade başarılıysa: marker'ı temizler, refund-completed yayınlar", async () => {
    const { service, prisma, eventService } = makeService();
    jest
      .spyOn(service, "refundTradeCashPaymentIfCompleted")
      .mockResolvedValue({ refunded: true, paymentId: "pay-1" });

    const r = await service.refundTradeCashTracked(TRADE_ID);

    expect(r.failed).toBe(false);
    expect(r.refunded).toBe(true);
    expect(prisma.trade.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: TRADE_ID },
        data: { refundFailureReason: null, refundFailureAt: null },
      }),
    );
    expect(eventService.emitTradeRefundCompleted).toHaveBeenCalled();
    expect(eventService.emitTradeRefundFailed).not.toHaveBeenCalled();
  });

  it("iade edilecek tamamlanmış ödeme yoksa (skip): marker temizlenir, refund-completed yayınlanmaz, failed değildir", async () => {
    const { service, prisma, eventService } = makeService();
    jest.spyOn(service, "refundTradeCashPaymentIfCompleted").mockResolvedValue({
      refunded: false,
      skippedReason: "already_refunded",
    });

    const r = await service.refundTradeCashTracked(TRADE_ID);

    expect(r.failed).toBe(false);
    expect(r.refunded).toBe(false);
    expect(r.skippedReason).toBe("already_refunded");
    // marker temizlenir (no-op da olsa güvenli), completed yayınlanmaz
    expect(prisma.trade.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { refundFailureReason: null, refundFailureAt: null },
      }),
    );
    expect(eventService.emitTradeRefundCompleted).not.toHaveBeenCalled();
  });
});
