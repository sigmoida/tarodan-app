import { PaymentHoldStatus } from "@prisma/client";
import { PaymentHoldReleaseService } from "./payment-hold-release.service";

/**
 * Satış escrow'unun serbest bırakma tarihi = iade penceresi sonu + payout
 * grace. Pencere sonu teslimde siparişe (`returnWindowEndsAt`) damgalanır ve
 * iade uygunluğu da onu okur. Para yolu: tarih formülü değişmedi
 * (teslim + pencere + grace), yalnız sayıların kaynağı ve damga.
 */
describe("PaymentHoldReleaseService.scheduleHoldReleaseOnDelivery — süre kaynağı ve damga", () => {
  const DELIVERED_AT = new Date("2026-10-01T10:00:00.000Z");

  /** Servisle aynı takvim aritmetiği (setDate) — yaz saati geçişinde de doğru. */
  const plusDays = (days: number, from: Date = DELIVERED_AT) => {
    const result = new Date(from);
    result.setDate(result.getDate() + days);
    return result;
  };

  const makeService = (
    rows: Record<string, string> = {},
    env: Record<string, string> = {},
    stampedWindowEnd: Date | null = null,
  ) => {
    const prisma = {
      order: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ returnWindowEndsAt: stampedWindowEnd }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      paymentHold: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      platformSetting: {
        findUnique: jest.fn(
          async ({ where }: { where: { settingKey: string } }) =>
            where.settingKey in rows
              ? { settingValue: rows[where.settingKey], updatedBy: "admin-1" }
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

  it("admin değeri ve env yokken bugünkü gibi teslim + 14 + 1 gün, pencere sonu damgalanır", async () => {
    const { service, prisma } = makeService();

    await service.scheduleHoldReleaseOnDelivery("o1", DELIVERED_AT);

    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: "o1", returnWindowEndsAt: null },
      data: { returnWindowEndsAt: plusDays(14) },
    });
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

  it("damgalı siparişte pencere sonradan UZATILSA da ödeme damgadan hesaplanır", async () => {
    const stamped = plusDays(14);
    const { service, prisma } = makeService(
      { return_window_days: "30" },
      {},
      stamped,
    );

    await service.scheduleHoldReleaseOnDelivery("o1", DELIVERED_AT);

    // Damga yeniden yazılmaz; release = damga + grace (1).
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
    expect(scheduledReleaseAt(prisma)).toEqual(plusDays(1, stamped));
  });

  it("damgalı siparişte pencere sonradan KISALTILSA da ödeme damgadan hesaplanır", async () => {
    const stamped = plusDays(30);
    const { service, prisma } = makeService(
      { return_window_days: "14" },
      {},
      stamped,
    );

    await service.scheduleHoldReleaseOnDelivery("o1", DELIVERED_AT);

    expect(prisma.order.updateMany).not.toHaveBeenCalled();
    expect(scheduledReleaseAt(prisma)).toEqual(plusDays(1, stamped));
  });
});
