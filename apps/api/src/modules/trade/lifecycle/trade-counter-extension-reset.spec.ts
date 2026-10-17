import { TradeStatus } from "@prisma/client";
import { TradeLifecycleService } from "./trade-lifecycle.service";

/**
 * Karşı teklif yanıt aşamasını BAŞTAN başlatır (yeni `responseDeadline`).
 * extend_once hakkı aşama başına bir kezdir; bu yüzden karşı teklifle birlikte
 * `responseExtendedAt` de sıfırlanır — aksi halde önceki turda uzatılmış bir
 * takasın yeni yanıt süresi hiç uzatılamazdı (ve "bir kez" tek aşama değil tek
 * takas olurdu).
 */
describe("TradeLifecycleService.counterTrade — extend_once hakkı", () => {
  const HOUR = 60 * 60 * 1000;

  it("karşı teklif yeni yanıt süresiyle birlikte responseExtendedAt'i sıfırlar", async () => {
    const now = Date.now();
    const trade = {
      id: "t1",
      version: 3,
      status: TradeStatus.pending,
      initiatorId: "u1",
      receiverId: "u2",
      cashAmount: null,
      cashPayerId: null,
      // Önceki turda uzatılmış, süresi dolmamış.
      responseDeadline: new Date(now + HOUR),
      responseExtendedAt: new Date(now - HOUR),
      items: [
        { productId: "a", side: "initiator", quantity: 1 },
        { productId: "b", side: "receiver", quantity: 1 },
      ],
    };
    const txTradeUpdate = jest.fn().mockResolvedValue({});
    const tx = {
      tradeItem: {
        deleteMany: jest.fn().mockResolvedValue({}),
        createMany: jest.fn().mockResolvedValue({}),
      },
      trade: { update: txTradeUpdate },
    };
    const prisma = {
      trade: { findUnique: jest.fn().mockResolvedValue(trade) },
      // Süre Süreler ve Kurallar'dan: satır yok → varsayılan 72 saat.
      platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
      product: {
        findMany: jest
          .fn()
          // Karşı teklifçinin (u2) ürünü, sonra asıl teklifçinin (u1) ürünü.
          .mockResolvedValueOnce([{ id: "c", price: 10, quantity: null }])
          .mockResolvedValueOnce([{ id: "d", price: 10, quantity: null }]),
      },
      tradeItem: {
        findMany: jest.fn().mockResolvedValue([{ productId: "a" }]),
      },
      $transaction: jest.fn((fn: (client: unknown) => unknown) => fn(tx)),
      user: { findUnique: jest.fn().mockResolvedValue({ id: "u2" }) },
    };
    const service = Object.create(TradeLifecycleService.prototype);
    Object.assign(service, {
      prisma,
      logger: { warn: jest.fn(), log: jest.fn(), error: jest.fn() },
      assertNotBlocked: jest.fn().mockResolvedValue(undefined),
      membershipService: {
        canCreateTrade: jest.fn().mockResolvedValue({ allowed: true }),
      },
      tradeShipment: {
        resolveTradeShippingAddressId: jest.fn().mockResolvedValue(null),
      },
      tradeCommon: { invalidateProductCaches: jest.fn() },
      notificationService: {
        createInAppNotification: jest.fn().mockResolvedValue(true),
      },
      tradeQuery: { getTradeById: jest.fn().mockResolvedValue({}) },
    });

    await (service as TradeLifecycleService).counterTrade("t1", "u2", {
      initiatorItems: [{ productId: "c", quantity: 1 }],
      receiverItems: [{ productId: "d", quantity: 1 }],
    } as never);

    const { data } = txTradeUpdate.mock.calls[0][0];
    expect(data.responseExtendedAt).toBeNull();
    // Yeni yanıt süresi şimdi + 72 saat (uzatılmış eski süre değil).
    expect(data.responseDeadline.getTime()).toBeGreaterThan(now + 71 * HOUR);
  });
});
