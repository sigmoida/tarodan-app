import { CargoAlertingService } from "./cargo-alerting.service";

/**
 * Bayat kargo alarm eşikleri Süreler ve Kurallar'dan (operasyon alarmları):
 * `cargoPickupNoDataDays` ve `cargoStaleMovementDays`. Env değişkenleri
 * (CARGO_PICKUP_NO_DATA_DAYS / CARGO_STALE_MOVEMENT_DAYS) yalnız geri düşüş.
 */
describe("CargoAlertingService.alertStaleCargo — eşik kaynakları", () => {
  const NOW = new Date("2026-10-05T12:00:00.000Z");
  const DAY = 24 * 3600 * 1000;
  const ENV_KEYS = ["CARGO_PICKUP_NO_DATA_DAYS", "CARGO_STALE_MOVEMENT_DAYS"];
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
      shipment: { findMany: jest.fn().mockResolvedValue([]) },
      tradeShipment: { findMany: jest.fn().mockResolvedValue([]) },
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
    const service = new CargoAlertingService(
      prisma as any,
      {} as any,
      { get: jest.fn(), set: jest.fn() } as any,
    );
    return { service, prisma };
  };

  const ageOf = (date: Date) => (NOW.getTime() - date.getTime()) / DAY;

  it("admin değeri ve env yokken bugünkü gibi 3 / 14 gün", async () => {
    const { service, prisma } = makeService();
    await service.alertStaleCargo();
    expect(
      ageOf(prisma.shipment.findMany.mock.calls[0][0].where.updatedAt.lt),
    ).toBe(3);
    expect(
      ageOf(prisma.refundRequest.findMany.mock.calls[0][0].where.returnCreatedAt.lt),
    ).toBe(14);
  });

  it("env geri düşüşünü okur, admin değeri onu ezer", async () => {
    process.env.CARGO_PICKUP_NO_DATA_DAYS = "2";
    process.env.CARGO_STALE_MOVEMENT_DAYS = "5";
    const fromEnv = makeService();
    await fromEnv.service.alertStaleCargo();
    expect(
      ageOf(fromEnv.prisma.shipment.findMany.mock.calls[0][0].where.updatedAt.lt),
    ).toBe(2);
    expect(
      ageOf(
        fromEnv.prisma.tradeShipment.findMany.mock.calls[0][0].where.createdAt
          .lt,
      ),
    ).toBe(5);

    const fromSetting = makeService({
      cargo_pickup_no_data_days: "4",
      cargo_stale_movement_days: "9",
    });
    await fromSetting.service.alertStaleCargo();
    expect(
      ageOf(
        fromSetting.prisma.shipment.findMany.mock.calls[0][0].where.updatedAt
          .lt,
      ),
    ).toBe(4);
    expect(
      ageOf(
        fromSetting.prisma.tradeShipment.findMany.mock.calls[0][0].where
          .createdAt.lt,
      ),
    ).toBe(9);
  });
});
