import { CronStepFailuresError } from "../../monitoring/cron-step-runner";
import { ShippingSchedulerService } from "./shipping-scheduler.service";

describe("ShippingSchedulerService", () => {
  const makeService = () => {
    const tracking = {
      retryPendingBarcodes: jest.fn().mockResolvedValue({
        order: { retried: 0, failed: 0 },
        trade: { retried: 0, failed: 0 },
      }),
      syncAllActiveShipments: jest
        .fn()
        .mockResolvedValue({ synced: 0, failed: 0 }),
      syncAllActiveTradeShipments: jest
        .fn()
        .mockResolvedValue({ synced: 0, failed: 0 }),
      syncAllActiveRefundReturns: jest
        .fn()
        .mockResolvedValue({ synced: 0, failed: 0 }),
      alertStaleCargo: jest.fn().mockResolvedValue(undefined),
    };
    return {
      tracking,
      service: new ShippingSchedulerService(tracking as any, {} as any),
    };
  };

  it("bütün kargo adımları temizse başarılı stats döndürür", async () => {
    const { service } = makeService();

    await expect(service.runSyncSuratTracking()).resolves.toEqual(
      expect.objectContaining({
        stats: expect.objectContaining({ failed: 0, barcodeRetryFailed: 0 }),
      }),
    );
  });

  it("kayıt bazlı başarısızlığı Bull retry için job hatasına çevirir", async () => {
    const { service, tracking } = makeService();
    tracking.retryPendingBarcodes.mockResolvedValue({
      order: { retried: 0, failed: 1 },
      trade: { retried: 0, failed: 0 },
    });
    tracking.syncAllActiveShipments.mockResolvedValue({ synced: 2, failed: 1 });

    await expect(service.runSyncSuratTracking()).rejects.toBeInstanceOf(
      CronStepFailuresError,
    );
    expect(tracking.syncAllActiveTradeShipments).toHaveBeenCalledTimes(1);
    expect(tracking.syncAllActiveRefundReturns).toHaveBeenCalledTimes(1);
    expect(tracking.alertStaleCargo).toHaveBeenCalledTimes(1);
  });

  it("bir adım exception atsa da diğer bağımsız adımları çalıştırıp sonunda fail eder", async () => {
    const { service, tracking } = makeService();
    tracking.syncAllActiveShipments.mockRejectedValue(new Error("db down"));

    await expect(service.runSyncSuratTracking()).rejects.toBeInstanceOf(
      CronStepFailuresError,
    );
    expect(tracking.syncAllActiveTradeShipments).toHaveBeenCalledTimes(1);
    expect(tracking.syncAllActiveRefundReturns).toHaveBeenCalledTimes(1);
  });
});
