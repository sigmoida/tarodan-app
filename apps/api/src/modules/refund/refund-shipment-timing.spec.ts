import { RefundRequestStatus } from "@prisma/client";
import { RefundShipmentService } from "./refund-shipment.service";
import { warehouseAddressStub } from "../shipping/testing/warehouse-address-fixture";

/**
 * İade süpürmelerinin süreleri Süreler ve Kurallar'dan okunur (drop-off,
 * emniyet supabı, inceleme, teslim bekleme). Hiçbiri iadeye damgalanmaz: her
 * turda "şimdi − N" ile hesaplanır. Bu spec yalnız kesim anlarını sabitler —
 * iade/para mantığı değişmedi.
 */
describe("RefundShipmentService — süre kaynakları", () => {
  const NOW = new Date("2026-10-05T12:00:00.000Z");
  const DAY = 24 * 60 * 60 * 1000;
  const HOUR = 60 * 60 * 1000;
  const ENV_KEYS = [
    "REFUND_RETURN_DROPOFF_DAYS",
    "REFUND_RETURN_DROPOFF_HARD_DAYS",
    "REFUND_RETURN_INSPECTION_HOURS",
    "REFUND_WAIT_DELIVERY_MAX_DAYS",
  ];
  const original: Record<string, string | undefined> = {};

  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(NOW);
    for (const key of ENV_KEYS) original[key] = process.env[key];
  });
  beforeEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });
  afterAll(() => {
    jest.useRealTimers();
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });

  const makeService = (settings: Record<string, string> = {}) => {
    const prisma = {
      refundRequest: { findMany: jest.fn().mockResolvedValue([]) },
      platformSetting: {
        findUnique: jest.fn(
          async ({ where }: { where: { settingKey: string } }) =>
            where.settingKey in settings
              ? { settingValue: settings[where.settingKey] }
              : null,
        ),
      },
    };
    const service = new RefundShipmentService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      warehouseAddressStub() as any,
    );
    return { service, prisma };
  };

  const cutoffOf = (
    prisma: { refundRequest: { findMany: jest.Mock } },
    field: string,
  ): number =>
    NOW.getTime() -
    (prisma.refundRequest.findMany.mock.calls[0][0].where[field].lt as Date)
      .getTime();

  describe("drop-off penceresi", () => {
    it("admin değeri yokken bugünkü gibi 14 gün", async () => {
      const { service, prisma } = makeService();
      await service.expireStaleOpenReturns();
      expect(prisma.refundRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: RefundRequestStatus.return_shipment_open,
          }),
        }),
      );
      expect(cutoffOf(prisma, "returnCreatedAt")).toBe(14 * DAY);
    });

    it("env geri düşüşünü okur, admin değeri onu ezer", async () => {
      process.env.REFUND_RETURN_DROPOFF_DAYS = "10";
      const fromEnv = makeService();
      await fromEnv.service.expireStaleOpenReturns();
      expect(cutoffOf(fromEnv.prisma, "returnCreatedAt")).toBe(10 * DAY);

      const fromSetting = makeService({ refund_return_dropoff_days: "20" });
      await fromSetting.service.expireStaleOpenReturns();
      expect(cutoffOf(fromSetting.prisma, "returnCreatedAt")).toBe(20 * DAY);
    });
  });

  describe("inceleme penceresi", () => {
    it("admin değeri yokken 24 saat, admin değeriyle o değer", async () => {
      const base = makeService();
      await base.service.findReturnDeliveredPendingFinalize();
      expect(cutoffOf(base.prisma, "returnDeliveredAt")).toBe(24 * HOUR);

      const custom = makeService({ refund_return_inspection_hours: "48" });
      await custom.service.findReturnDeliveredPendingFinalize();
      expect(cutoffOf(custom.prisma, "returnDeliveredAt")).toBe(48 * HOUR);
    });
  });

  describe("teslim bekleme üst sınırı", () => {
    it("admin değeri yokken 30 gün, env ve admin değeri sırayla geçerli", async () => {
      const base = makeService();
      await base.service.expireStaleWaitForDelivery();
      expect(cutoffOf(base.prisma, "createdAt")).toBe(30 * DAY);

      process.env.REFUND_WAIT_DELIVERY_MAX_DAYS = "45";
      const fromEnv = makeService();
      await fromEnv.service.expireStaleWaitForDelivery();
      expect(cutoffOf(fromEnv.prisma, "createdAt")).toBe(45 * DAY);

      const fromSetting = makeService({ refund_wait_delivery_max_days: "60" });
      await fromSetting.service.expireStaleWaitForDelivery();
      expect(cutoffOf(fromSetting.prisma, "createdAt")).toBe(60 * DAY);
    });
  });
});
