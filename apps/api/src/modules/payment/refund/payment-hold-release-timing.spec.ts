import { PaymentHoldStatus } from "@prisma/client";
import { PaymentHoldReleaseService } from "./payment-hold-release.service";

/**
 * Satış escrow'unun serbest bırakma tarihi = teslim + iade penceresi + payout
 * grace. İki süre Süreler ve Kurallar'dan TESLİM ANINDA okunur ve releaseAt'e
 * damgalanır. Para yolu: tarih formülü değişmedi, yalnız sayıların kaynağı.
 */
describe("PaymentHoldReleaseService.scheduleHoldReleaseOnDelivery — süre kaynağı", () => {
  const DELIVERED_AT = new Date("2026-10-01T10:00:00.000Z");

  /** Servisle aynı takvim aritmetiği (setDate) — yaz saati geçişinde de doğru. */
  const plusDays = (days: number) => {
    const result = new Date(DELIVERED_AT);
    result.setDate(result.getDate() + days);
    return result;
  };

  const makeService = (
    rows: Record<string, string> = {},
    env: Record<string, string> = {},
  ) => {
    const prisma = {
      paymentHold: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      platformSetting: {
        findUnique: jest.fn(
          async ({ where }: { where: { settingKey: string } }) =>
            where.settingKey in rows
              ? { settingValue: rows[where.settingKey] }
              : null,
        ),
      },
    };
    const configService = { get: jest.fn((key: string) => env[key]) };
    const service = new PaymentHoldReleaseService(
      prisma as any,
      configService as any,
      {} as any, // eventService
      {} as any, // notificationService
    );
    return { service, prisma };
  };

  const scheduledReleaseAt = (prisma: {
    paymentHold: { updateMany: jest.Mock };
  }): Date => prisma.paymentHold.updateMany.mock.calls[0][0].data.releaseAt;

  it("admin değeri ve env yokken bugünkü gibi teslim + 14 + 1 gün", async () => {
    const { service, prisma } = makeService();

    await service.scheduleHoldReleaseOnDelivery("o1", DELIVERED_AT);

    expect(prisma.paymentHold.updateMany).toHaveBeenCalledWith({
      where: { orderId: "o1", status: PaymentHoldStatus.held },
      data: { releaseAt: plusDays(15) },
    });
  });

  it("env geri düşüşü (RETURN_WINDOW_DAYS / PAYOUT_GRACE_DAYS) bugünkü gibi geçerli", async () => {
    const { service, prisma } = makeService(
      {},
      { RETURN_WINDOW_DAYS: "20", PAYOUT_GRACE_DAYS: "2" },
    );

    await service.scheduleHoldReleaseOnDelivery("o1", DELIVERED_AT);

    expect(scheduledReleaseAt(prisma)).toEqual(plusDays(22));
  });

  it("admin ayarı env'i ezer", async () => {
    const { service, prisma } = makeService(
      { return_window_days: "21", payout_grace_days: "3" },
      { RETURN_WINDOW_DAYS: "20", PAYOUT_GRACE_DAYS: "2" },
    );

    await service.scheduleHoldReleaseOnDelivery("o1", DELIVERED_AT);

    expect(scheduledReleaseAt(prisma)).toEqual(plusDays(24));
  });
});
