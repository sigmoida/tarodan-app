import { CronStepFailuresError } from "../../../monitoring/cron-step-runner";
import { ShippingSchedulerService } from "./shipping-scheduler.service";

describe("ShippingSchedulerService", () => {
  const makeService = (settings: Record<string, string> = {}) => {
    const prisma = {
      platformSetting: {
        findUnique: jest.fn(
          async ({ where }: { where: { settingKey: string } }) =>
            where.settingKey in settings
              ? { settingValue: settings[where.settingKey] }
              : null,
        ),
      },
    };
    const tracking = {
      retryPendingBarcodes: jest.fn().mockResolvedValue({
        order: { retried: 0, failed: 0 },
        trade: { retried: 0, failed: 0 },
      }),
      syncAllActiveShipments: jest
        .fn()
        .mockResolvedValue({ synced: 0, pending: 0, failed: 0 }),
      syncAllActiveTradeShipments: jest
        .fn()
        .mockResolvedValue({ synced: 0, pending: 0, failed: 0 }),
      syncAllActiveRefundReturns: jest
        .fn()
        .mockResolvedValue({ synced: 0, pending: 0, failed: 0 }),
      alertStaleCargo: jest.fn().mockResolvedValue(undefined),
      syncPostDeliveryShipments: jest
        .fn()
        .mockResolvedValue({ synced: 0, pending: 0, failed: 0 }),
    };
    return {
      tracking,
      service: new ShippingSchedulerService(
        tracking as any,
        {} as any,
        prisma as any,
      ),
    };
  };

  describe("teslim sonrası kuyruk taraması — dış sınır iade penceresi", () => {
    const ORIGINAL = process.env.RETURN_WINDOW_DAYS;
    beforeEach(() => {
      delete process.env.RETURN_WINDOW_DAYS;
    });
    afterAll(() => {
      if (ORIGINAL === undefined) delete process.env.RETURN_WINDOW_DAYS;
      else process.env.RETURN_WINDOW_DAYS = ORIGINAL;
    });

    it("admin değeri yokken bugünkü gibi 14 gün (336 saat) geriye bakar", async () => {
      const { service, tracking } = makeService();

      await service.runSyncSuratPostDeliveryTail();

      expect(tracking.syncPostDeliveryShipments).toHaveBeenCalledWith(336, 48);
    });

    it("env geri düşüşünü okur", async () => {
      process.env.RETURN_WINDOW_DAYS = "20";
      const { service, tracking } = makeService();

      await service.runSyncSuratPostDeliveryTail();

      expect(tracking.syncPostDeliveryShipments).toHaveBeenCalledWith(480, 48);
    });

    it("admin değeri geçerlidir", async () => {
      const { service, tracking } = makeService({ return_window_days: "30" });

      await service.runSyncSuratPostDeliveryTail();

      expect(tracking.syncPostDeliveryShipments).toHaveBeenCalledWith(720, 48);
    });
  });

  it("bütün kargo adımları temizse başarılı stats döndürür", async () => {
    const { service } = makeService();

    await expect(service.runSyncSuratTracking()).resolves.toEqual(
      expect.objectContaining({
        stats: expect.objectContaining({ failed: 0, barcodeRetryFailed: 0 }),
      }),
    );
  });

  it("şube kabulü bekleyen kayıtları hata saymadan raporlar", async () => {
    const { service, tracking } = makeService();
    tracking.syncAllActiveShipments.mockResolvedValue({
      synced: 0,
      pending: 4,
      failed: 0,
    });
    tracking.syncAllActiveTradeShipments.mockResolvedValue({
      synced: 0,
      pending: 2,
      failed: 0,
    });

    await expect(service.runSyncSuratTracking()).resolves.toEqual(
      expect.objectContaining({
        summary: expect.stringContaining("6 kabul bekliyor"),
        stats: expect.objectContaining({
          shipmentPending: 4,
          tradePending: 2,
          failed: 0,
        }),
      }),
    );
  });

  it("kayıt bazlı başarısızlığı Bull retry için job hatasına çevirir", async () => {
    const { service, tracking } = makeService();
    tracking.retryPendingBarcodes.mockResolvedValue({
      order: { retried: 0, failed: 1 },
      trade: { retried: 0, failed: 0 },
    });
    tracking.syncAllActiveShipments.mockResolvedValue({
      synced: 2,
      pending: 0,
      failed: 1,
    });

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
