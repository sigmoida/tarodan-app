import { PaymentStatus } from "@prisma/client";
import { PaymentLifecycleService } from "./payment-lifecycle.service";
import { PaymentExpiryReconciliationService } from "../reconciliation/payment-expiry-reconciliation.service";
import { ReservationReconciliationService } from "../reconciliation/reservation-reconciliation.service";

/**
 * Ödeme pencereleri Süreler ve Kurallar'dan okunur:
 *  - `paymentFailTimeoutMinutes` (env PAYMENT_FAIL_TIMEOUT_MINUTES, vars. 35) —
 *    canlı 3DS koruması ve bekleyen ödemeyi `failed` yapma kesimi,
 *  - `paymentReservationMinutes` (env PAYMENT_TIMEOUT_MINUTES, vars. 5) —
 *    stok rezervasyonunu bırakma kesimi.
 * Sıra: ayar → env (ConfigService) → kayıt varsayılanı.
 */
describe("ödeme pencereleri — süre kaynağı", () => {
  const NOW = new Date("2026-10-05T12:00:00.000Z");
  const MINUTE = 60 * 1000;

  beforeAll(() => jest.useFakeTimers().setSystemTime(NOW));
  afterAll(() => jest.useRealTimers());

  const settingsReader = (settings: Record<string, string>) => ({
    findUnique: jest.fn(async ({ where }: { where: { settingKey: string } }) =>
      where.settingKey in settings
        ? { settingValue: settings[where.settingKey] }
        : null,
    ),
  });
  const configOf = (env: Record<string, string>) => ({
    get: jest.fn((key: string) => env[key]),
  });

  describe("confirmFailedFromClient — canlı çekim penceresi", () => {
    const run = async (
      settings: Record<string, string>,
      env: Record<string, string>,
    ) => {
      const prisma = {
        payment: {
          findUnique: jest.fn().mockResolvedValue({
            id: "pay-1",
            status: PaymentStatus.pending,
            metadata: { lastChargeStartedAt: NOW.toISOString() },
            order: { id: "o1" },
          }),
        },
        platformSetting: settingsReader(settings),
      };
      // Canlı say → erken dönsün; yalnız pencere argümanı ölçülür.
      const paymentCommon = {
        isChargeLikelyLive: jest.fn().mockReturnValue(true),
      };
      const service = new PaymentLifecycleService(
        prisma as any,
        configOf(env) as any,
        {} as any,
        {} as any,
        paymentCommon as any,
        {} as any,
      );
      await service.confirmFailedFromClient("pay-1", { internal: true });
      return paymentCommon.isChargeLikelyLive.mock.calls[0][1] as number;
    };

    it("admin değeri ve env yokken bugünkü gibi 35 dk", async () => {
      await expect(run({}, {})).resolves.toBe(35);
    });

    it("env geri düşüşünü okur", async () => {
      await expect(
        run({}, { PAYMENT_FAIL_TIMEOUT_MINUTES: "40" }),
      ).resolves.toBe(40);
    });

    it("admin değeri env'i ezer", async () => {
      await expect(
        run(
          { payment_fail_timeout_minutes: "45" },
          { PAYMENT_FAIL_TIMEOUT_MINUTES: "40" },
        ),
      ).resolves.toBe(45);
    });
  });

  describe("cancelExpiredPayments — fail kesimi", () => {
    const run = async (settings: Record<string, string>) => {
      const prisma = {
        payment: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          findMany: jest.fn().mockResolvedValue([]),
        },
        platformSetting: settingsReader(settings),
      };
      const service = new PaymentExpiryReconciliationService(
        prisma as any,
        {} as any,
        configOf({}) as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        { isChargeLikelyLive: jest.fn() } as any,
        {} as any,
      );
      await service.cancelExpiredPayments();
      const cutoff = prisma.payment.findMany.mock.calls[0][0].where.createdAt
        .lt as Date;
      return (NOW.getTime() - cutoff.getTime()) / MINUTE;
    };

    it("admin değeri yokken 35 dk, admin değeriyle o değer", async () => {
      await expect(run({})).resolves.toBe(35);
      await expect(run({ payment_fail_timeout_minutes: "60" })).resolves.toBe(
        60,
      );
    });
  });

  describe("releaseExpiredOrderReservations — rezervasyon kesimi", () => {
    const run = async (
      settings: Record<string, string>,
      env: Record<string, string> = {},
    ) => {
      const prisma = {
        order: { findMany: jest.fn().mockResolvedValue([]) },
        platformSetting: settingsReader(settings),
      };
      const service = new ReservationReconciliationService(
        prisma as any,
        {} as any,
        configOf(env) as any,
        {} as any,
      );
      await service.releaseExpiredOrderReservations();
      const cutoff = prisma.order.findMany.mock.calls[0][0].where.createdAt
        .lt as Date;
      return (NOW.getTime() - cutoff.getTime()) / MINUTE;
    };

    it("admin değeri ve env yokken bugünkü gibi 5 dk", async () => {
      await expect(run({})).resolves.toBe(5);
    });

    it("env (PAYMENT_TIMEOUT_MINUTES) ve admin değeri sırayla geçerli", async () => {
      await expect(run({}, { PAYMENT_TIMEOUT_MINUTES: "8" })).resolves.toBe(8);
      await expect(
        run(
          { payment_reservation_minutes: "12" },
          { PAYMENT_TIMEOUT_MINUTES: "8" },
        ),
      ).resolves.toBe(12);
    });
  });
});
