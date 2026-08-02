import { PayoutSchedulerService } from "./payout-scheduler.service";

/**
 * HIGH: scheduler her hatayı yutup `{summary: "Hata: ..."}` döndürüyordu.
 * `runTrackedJob` yalnız fn THROW ederse Bull job'ını "failed" işaretler ve
 * Sentry Cron check-in'ini "error" yapar — yani PayTR transferlerinin tamamen
 * patladığı bir payout turu bile "başarılı" görünüyordu; retry hiç denenmiyor,
 * otomatik alarm yok.
 */
describe("PayoutSchedulerService — failures reach Bull", () => {
  function makeService(payoutService: unknown): PayoutSchedulerService {
    return new PayoutSchedulerService(payoutService as any, {} as any);
  }

  it("payout işleme hatası yükseltilir", async () => {
    const service = makeService({
      processRetryPayouts: jest.fn().mockResolvedValue(0),
      requeueRefundVoidedPayouts: jest.fn().mockResolvedValue(0),
      processPendingPayouts: jest
        .fn()
        .mockRejectedValue(new Error("paytr down")),
      detectStuckProcessingPayouts: jest.fn().mockResolvedValue(0),
    });

    await expect(service.runProcessPayouts()).rejects.toThrow("paytr down");
  });

  it("iade transfer kontrolü hatası yükseltilir", async () => {
    const service = makeService({
      checkReturnedTransfers: jest.fn().mockRejectedValue(new Error("boom")),
    });

    await expect(service.runCheckReturnedTransfers()).rejects.toThrow("boom");
  });

  it("başarılı tur özet döndürür (regresyon koruması)", async () => {
    const service = makeService({
      processRetryPayouts: jest.fn().mockResolvedValue(1),
      requeueRefundVoidedPayouts: jest.fn().mockResolvedValue(2),
      processPendingPayouts: jest
        .fn()
        .mockResolvedValue({ processed: 3, failed: 0 }),
      detectStuckProcessingPayouts: jest.fn().mockResolvedValue(0),
    });

    const result = await service.runProcessPayouts();

    expect(result.stats).toMatchObject({ processed: 3, failed: 0 });
  });
});
