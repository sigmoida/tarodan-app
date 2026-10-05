import { PaymentStatus } from "@prisma/client";
import {
  PaymentCommonService,
  liveOrderPaymentWhere,
} from "./payment-common.service";

/**
 * Ödenmemiş siparişi kapatan bir yol (admin iptali) canlı bir 3DS çekimi
 * sürerken siparişi kapatmamalı: callback geldiğinde parası çekilmiş iptal
 * sipariş (orphan capture) oluşur. Pencere 24s süpürmesiyle aynıdır ve süre
 * verilen işlem istemcisinden okunur (ikinci bağlantı beklenmez).
 */
describe("PaymentCommonService.hasLiveCharge", () => {
  const makeService = (metadata: unknown | null) => {
    const tx = {
      platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
      payment: {
        findFirst: jest
          .fn()
          .mockResolvedValue(metadata === null ? null : { metadata }),
      },
    };
    const prisma = {
      platformSetting: { findUnique: jest.fn() },
    };
    const service = new PaymentCommonService(prisma as any, {} as any);
    return { service, tx, prisma };
  };

  it("pencere içinde başlamış çekim canlıdır", async () => {
    const { service, tx, prisma } = makeService({
      lastChargeStartedAt: new Date(Date.now() - 60_000).toISOString(),
    });

    await expect(service.hasLiveCharge(tx as any, "order-1")).resolves.toBe(
      true,
    );
    expect(tx.payment.findFirst).toHaveBeenCalledWith({
      where: liveOrderPaymentWhere("order-1"),
      select: { metadata: true },
    });
    // Süre işlem istemcisinden okunur; havuzdan ikinci bağlantı istenmez.
    expect(tx.platformSetting.findUnique).toHaveBeenCalled();
    expect(prisma.platformSetting.findUnique).not.toHaveBeenCalled();
  });

  it("pencere dışındaki eski çekim ya da damgasız ödeme canlı değildir", async () => {
    const stale = makeService({
      lastChargeStartedAt: new Date(Date.now() - 24 * 3600_000).toISOString(),
    });
    await expect(
      stale.service.hasLiveCharge(stale.tx as any, "order-1"),
    ).resolves.toBe(false);

    const unstamped = makeService({});
    await expect(
      unstamped.service.hasLiveCharge(unstamped.tx as any, "order-1"),
    ).resolves.toBe(false);
  });

  it("bekleyen ödeme yoksa canlı değildir", async () => {
    const { service, tx } = makeService(null);
    await expect(service.hasLiveCharge(tx as any, "order-1")).resolves.toBe(
      false,
    );
  });

  it("siparişin kendi ödemesine ya da sepetin ödemesine, yalnız sonuçlanmamış olanlara bakar", () => {
    expect(liveOrderPaymentWhere("order-1")).toEqual({
      OR: [
        { orderId: "order-1" },
        { checkoutGroup: { orders: { some: { id: "order-1" } } } },
      ],
      status: { in: [PaymentStatus.pending, PaymentStatus.processing] },
    });
  });
});
