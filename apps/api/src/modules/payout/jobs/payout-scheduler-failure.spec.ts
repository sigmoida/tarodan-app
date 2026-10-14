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

  it("iade kontrolünden SONRA silinmiş hesapların banka hesaplarını temizler", async () => {
    const payoutService = {
      checkReturnedTransfers: jest
        .fn()
        .mockResolvedValue({ returned: 0, unmatched: 0 }),
      purgeDeletedSellerBankAccounts: jest.fn().mockResolvedValue(2),
    };
    const service = makeService(payoutService);

    const result = await service.runCheckReturnedTransfers();

    expect(result.stats).toMatchObject({ purgedBankAccounts: 2 });
    expect(
      payoutService.checkReturnedTransfers.mock.invocationCallOrder[0],
    ).toBeLessThan(
      payoutService.purgeDeletedSellerBankAccounts.mock.invocationCallOrder[0],
    );
  });

  it("banka hesabı temizliği hatası da yükseltilir", async () => {
    const service = makeService({
      checkReturnedTransfers: jest
        .fn()
        .mockResolvedValue({ returned: 0, unmatched: 0 }),
      purgeDeletedSellerBankAccounts: jest
        .fn()
        .mockRejectedValue(new Error("db down")),
    });

    await expect(service.runCheckReturnedTransfers()).rejects.toThrow(
      "db down",
    );
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
