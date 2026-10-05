import { ConflictException } from "@nestjs/common";
import { OrderStatus } from "@prisma/client";
import { OrderLifecycleService } from "./order-lifecycle.service";

/**
 * Alıcının (ve misafirin) ödenmemiş sipariş iptali, yönetici iptaliyle aynı
 * dışlamaya tabidir: sipariş satırı kilitlenir, kilit altında canlı bir 3DS
 * çekimi görülürse iptal 409 "ödeme sürüyor" ile reddedilir. Eskiden 3DS
 * sürerken başka sekmeden iptal eden alıcının kartı yine çekiliyor, arada
 * bırakılan stok başkasına satılabiliyordu.
 */
describe("OrderLifecycleService.cancel — ödenmemiş siparişte canlı çekim", () => {
  const order = {
    id: "order-1",
    buyerId: "buyer-1",
    status: OrderStatus.pending_payment,
    version: 3,
    quantity: 1,
    productId: "product-1",
    offerId: null,
    checkoutGroupId: null,
    reservationReleasedAt: null,
    shipment: null,
    product: { id: "product-1" },
  };

  const makeService = (lastChargeStartedAt: string | null) => {
    const calls: string[] = [];
    const tx: any = {
      $queryRaw: jest.fn().mockImplementation((sql: TemplateStringsArray) => {
        calls.push(`lock:${sql.join("?").replace(/\s+/g, " ").trim()}`);
        return Promise.resolve([]);
      }),
      order: {
        findUnique: jest.fn().mockImplementation(() => {
          calls.push("read");
          return Promise.resolve(order);
        }),
        update: jest.fn().mockResolvedValue({ ...order }),
      },
      payment: {
        findFirst: jest
          .fn()
          .mockResolvedValue(
            lastChargeStartedAt ? { metadata: { lastChargeStartedAt } } : null,
          ),
      },
      platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const prisma: any = {
      // Ön okuma: ödenmemiş → tx dalı.
      order: { findUnique: jest.fn().mockResolvedValue(order) },
      $transaction: jest.fn((fn: (client: unknown) => unknown) => fn(tx)),
    };
    const orderQuery = {
      resolveGuestOrderAccess: jest
        .fn()
        .mockResolvedValue({ id: "order-1", buyerId: "buyer-1" }),
    };
    const service = new OrderLifecycleService(
      prisma,
      {} as any, // cache
      {} as any, // notificationService
      {} as any, // productLockService
      {} as any, // commissionLedger
      {} as any, // orderCommon
      orderQuery as any,
      {} as any, // elogoInvoicing
    );
    return { service, tx, calls };
  };

  const live = () => new Date(Date.now() - 60_000).toISOString();

  it("üye alıcı: sipariş kilitlenir, kilit altında canlı çekim görülür → 409, iptal yazılmaz", async () => {
    const { service, tx, calls } = makeService(live());

    const attempt = service.cancel("order-1", "buyer-1", {});

    await expect(attempt).rejects.toBeInstanceOf(ConflictException);
    await expect(attempt).rejects.toMatchObject({
      response: { i18nKey: "server.order.cancelPaymentInFlight" },
    });
    expect(calls.slice(0, 2)).toEqual([
      "lock:SELECT id FROM orders WHERE id = ? FOR UPDATE",
      "read",
    ]);
    expect(tx.order.update).not.toHaveBeenCalled();
  });

  it("misafir iptali aynı komuta düşer ve aynı şekilde reddedilir", async () => {
    const { service, tx } = makeService(live());

    await expect(
      service.cancelAsGuest({
        orderNumber: "ORD-1",
        email: "misafir@example.com",
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: { i18nKey: "server.order.cancelPaymentInFlight" },
    });
    expect(tx.order.update).not.toHaveBeenCalled();
  });
});
