import { PaymentInitiationService } from "./payment-initiation.service";

/**
 * #6 (OVERSELL): Ödeme başlatılırken 30-dk cron rezervasyonu bıraktıysa, stok
 * YENİDEN alınırken order.quantity kadar alınmalı — eski kod her yerde sabit `1`
 * rezerve ediyordu. Çok-adetli bir sipariş için (quantity=3) release sonrası yalnız
 * 1 birim geri alınırsa 2 birim "boşta" görünür → oversell.
 */
describe("PaymentInitiationService — reserve uses order.quantity (#6)", () => {
  const STOP = new Error("__stop_after_reserve__");

  const makeService = (orders: any[]) => {
    const reserveCalls: Array<{ productId: string; qty: number }> = [];
    const tx = {
      order: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      $transaction: jest.fn((fn: any) => fn(tx)),
      // reserve döngüsünden HEMEN sonraki ilk çağrı — sentinel ile durdur.
      payment: { findUnique: jest.fn().mockRejectedValue(STOP) },
    } as any;
    const productLockService = {
      checkAndReserve: jest
        .fn()
        .mockImplementation((_tx: any, productId: string, qty: number) => {
          reserveCalls.push({ productId, qty });
          return Promise.resolve();
        }),
    } as any;
    const config = { get: jest.fn().mockReturnValue(undefined) } as any;
    const service = new PaymentInitiationService(
      prisma,
      config,
      {} as any, // paymentProviders
      productLockService,
      {} as any, // paymentCommon
      {} as any, // paymentFulfillment
      {} as any, // paymentLifecycle
      {} as any, // providerEvents
    );
    return { service, reserveCalls };
  };

  it("release sonrası re-reserve order.quantity kadar (grup, quantity=3)", async () => {
    const group = {
      id: "grp-1",
      totalAmount: 300,
      orders: [
        {
          id: "o1",
          productId: "p1",
          quantity: 3,
          reservationReleasedAt: new Date("2026-01-01T00:00:00Z"),
        },
      ],
    };
    const { service, reserveCalls } = makeService(group.orders);

    await expect(
      (service as any).processGroupPaymentInitiation(group, {}),
    ).rejects.toBe(STOP);

    expect(reserveCalls).toEqual([{ productId: "p1", qty: 3 }]);
  });

  it("quantity yoksa 1'e düşer (geriye dönük güvenli varsayılan)", async () => {
    const group = {
      id: "grp-2",
      totalAmount: 100,
      orders: [
        {
          id: "o2",
          productId: "p2",
          quantity: undefined,
          reservationReleasedAt: new Date("2026-01-01T00:00:00Z"),
        },
      ],
    };
    const { service, reserveCalls } = makeService(group.orders);

    await expect(
      (service as any).processGroupPaymentInitiation(group, {}),
    ).rejects.toBe(STOP);

    expect(reserveCalls).toEqual([{ productId: "p2", qty: 1 }]);
  });
});
