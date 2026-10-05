import { PaymentStatus } from "@prisma/client";
import {
  chargeLikelyLive,
  liveOrderPaymentWhere,
  orderHasLiveCharge,
} from "./live-charge";

/**
 * Ödenmemiş siparişi kapatan bir yol (alıcı / yönetici iptali) canlı bir 3DS
 * çekimi sürerken siparişi kapatmamalı: callback geldiğinde parası çekilmiş
 * iptal sipariş oluşur, arada bırakılan stok başkasına satılabilir. Pencere
 * 24s süpürmesiyle aynıdır ve süre verilen işlem istemcisinden okunur (ikinci
 * bağlantı beklenmez).
 */
describe("orderHasLiveCharge", () => {
  const makeTx = (metadata: unknown | null) => ({
    platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
    payment: {
      findFirst: jest
        .fn()
        .mockResolvedValue(metadata === null ? null : { metadata }),
    },
  });

  it("pencere içinde başlamış çekim canlıdır; süre işlem istemcisinden okunur", async () => {
    const tx = makeTx({
      lastChargeStartedAt: new Date(Date.now() - 60_000).toISOString(),
    });

    await expect(orderHasLiveCharge(tx as any, "order-1")).resolves.toBe(true);
    expect(tx.payment.findFirst).toHaveBeenCalledWith({
      where: liveOrderPaymentWhere("order-1"),
      select: { metadata: true },
    });
    expect(tx.platformSetting.findUnique).toHaveBeenCalled();
  });

  it("pencere dışındaki eski çekim ya da damgasız ödeme canlı değildir", async () => {
    await expect(
      orderHasLiveCharge(
        makeTx({
          lastChargeStartedAt: new Date(
            Date.now() - 24 * 3600_000,
          ).toISOString(),
        }) as any,
        "order-1",
      ),
    ).resolves.toBe(false);
    await expect(
      orderHasLiveCharge(makeTx({}) as any, "order-1"),
    ).resolves.toBe(false);
  });

  it("bekleyen ödeme yoksa canlı değildir", async () => {
    await expect(
      orderHasLiveCharge(makeTx(null) as any, "order-1"),
    ).resolves.toBe(false);
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

describe("chargeLikelyLive", () => {
  it("geçersiz damga canlı sayılmaz", () => {
    expect(chargeLikelyLive({ lastChargeStartedAt: "bozuk" }, 35)).toBe(false);
    expect(chargeLikelyLive(null, 35)).toBe(false);
  });
});
