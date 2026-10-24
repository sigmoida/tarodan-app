import { Logger } from "@nestjs/common";
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
        order: { retried: 0, failed: 0, failures: [] },
        trade: { retried: 0, failed: 0, failures: [] },
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

  it("names the failed barcode-retry records and reasons in the alarm", async () => {
    const { service, tracking } = makeService();
    tracking.retryPendingBarcodes.mockResolvedValue({
      order: {
        retried: 0,
        failed: 1,
        failures: ["order shipment-9 (carrier returned no barcode)"],
      },
      trade: {
        retried: 0,
        failed: 1,
        failures: ["trade-return ts-4 (carrier timeout)"],
      },
    });

    const error = await service.runSyncSuratTracking().catch((e) => e);

    expect(error).toBeInstanceOf(CronStepFailuresError);
    expect(error.message).toContain(
      "order shipment-9 (carrier returned no barcode)",
    );
    expect(error.message).toContain("trade-return ts-4 (carrier timeout)");
  });

  it("kayıt bazlı başarısızlığı Bull retry için job hatasına çevirir", async () => {
    const { service, tracking } = makeService();
    tracking.retryPendingBarcodes.mockResolvedValue({
      order: { retried: 0, failed: 1, failures: ["order shipment-1 (x)"] },
      trade: { retried: 0, failed: 0, failures: [] },
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

  /**
   * One failure, one alarm: per-record failures are warn lines whose ids land
   * in the run summary (the alarm); a step that threw logged its own error, so
   * a summary made only of those is marked reported and the cron tracker
   * keeps it out of Sentry.
   */
  describe("which line is the alarm", () => {
    let error: jest.SpyInstance;
    beforeEach(() => {
      error = jest
        .spyOn(Logger.prototype, "error")
        .mockImplementation(() => undefined);
      jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
      jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    });
    afterEach(() => jest.restoreAllMocks());

    const failure = async (run: Promise<unknown>) => {
      try {
        await run;
      } catch (e) {
        return e as CronStepFailuresError;
      }
      throw new Error("expected the run to fail");
    };

    it("makes the summary the alarm for record failures and names them", async () => {
      const { service, tracking } = makeService();
      tracking.syncAllActiveShipments.mockResolvedValue({
        synced: 0,
        pending: 0,
        failed: 1,
        failures: ["PKG-WQMTZDB5TT (network: fetch failed)"],
      });
      tracking.syncAllActiveTradeShipments.mockResolvedValue({
        synced: 0,
        pending: 0,
        failed: 1,
        failures: ["trade-leg-1 (Sürat takip provider hatası: hatalı)"],
      });

      const e = await failure(service.runSyncSuratTracking());

      expect(e.alreadyReported).toBe(false);
      expect(e.message).toContain("PKG-WQMTZDB5TT");
      expect(e.message).toContain("trade-leg-1");
      expect(error).not.toHaveBeenCalled();
    });

    it("marks a summary of thrown steps as already reported", async () => {
      const { service, tracking } = makeService();
      tracking.syncAllActiveShipments.mockRejectedValue(new Error("db down"));

      const e = await failure(service.runSyncSuratTracking());

      expect(e.alreadyReported).toBe(true);
      expect(error).toHaveBeenCalledTimes(1);
      expect(error).toHaveBeenCalledWith(
        "Sürat tracking sync error: db down",
        expect.stringContaining("db down"),
      );
    });

    it("keeps the summary an alarm when thrown and record failures mix", async () => {
      const { service, tracking } = makeService();
      tracking.syncAllActiveShipments.mockRejectedValue(new Error("db down"));
      tracking.syncAllActiveRefundReturns.mockResolvedValue({
        synced: 0,
        pending: 0,
        failed: 1,
        failures: ["refund-1 (timeout)"],
      });

      const e = await failure(service.runSyncSuratTracking());

      expect(e.alreadyReported).toBe(false);
    });

    // The records were only warn lines: the summary is their one alarm, so it
    // must not be marked reported (that would send no alarm at all).
    it("makes the summary the one alarm for failed barcode records", async () => {
      const { service, tracking } = makeService();
      tracking.retryPendingBarcodes.mockResolvedValue({
        order: {
          retried: 1,
          failed: 4,
          failures: [
            "order shipment-1 (carrier returned no barcode)",
            "order shipment-2 (carrier timeout)",
            "order-orphan order-3 (ensure-shipment skipped)",
            "order shipment-4 (carrier timeout)",
          ],
        },
        trade: {
          retried: 0,
          failed: 1,
          failures: ["trade-inbound ts-5 (retry reported not completed)"],
        },
      });

      const e = await failure(service.runSyncSuratTracking());

      expect(e.alreadyReported).toBe(false);
      expect(e.failedSteps).toEqual(["barcode-retry-records"]);
      expect(e.details).toEqual([
        "barcode-retry-records: 5 records could not be completed: " +
          "order shipment-1 (carrier returned no barcode), " +
          "order shipment-2 (carrier timeout), " +
          "order-orphan order-3 (ensure-shipment skipped) (+2 more)",
      ]);
      expect(error).not.toHaveBeenCalled();
    });

    it("does not log the barcode retry again when it reported its own steps", async () => {
      const { service, tracking } = makeService();
      tracking.retryPendingBarcodes.mockRejectedValue(
        new CronStepFailuresError(["order-barcode-retry"], ["x"], true),
      );

      const e = await failure(service.runSyncSuratTracking());

      expect(e.alreadyReported).toBe(true);
      expect(error).not.toHaveBeenCalled();
    });

    it("leaves a post-delivery sweep failure to the cron tracker alone", async () => {
      const { service, tracking } = makeService();
      const boom = new Error("db down");
      tracking.syncPostDeliveryShipments.mockRejectedValue(boom);

      await expect(service.runSyncSuratPostDelivery()).rejects.toBe(boom);
      expect(error).not.toHaveBeenCalled();
    });
  });
});
