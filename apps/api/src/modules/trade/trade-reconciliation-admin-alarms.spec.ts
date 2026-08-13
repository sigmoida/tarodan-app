import { TradeReconciliationService } from "./trade-reconciliation.service";
import { NotificationType } from "../notification/dto";
import { resolveWebNotificationLink } from "../notification/notification-link";

/**
 * Takas admin alarmlarının hedefi.
 *
 * Regresyon: TRADE_STUCK_AT_WAREHOUSE ve TRADE_OUTBOUND_DELIVERY_MISSING
 * yalnız admin'lere gider ama tüketici sitesinin `/profile/trades` listesine
 * link veriyordu — admin panelinde olmayan bir sayfa. Üretici artık admin
 * panelindeki takas dosyasını (`adminLink`) verir; harita bu tipleri serbest
 * link olarak çözer.
 */
describe("TradeReconciliationService — admin alarm linkleri", () => {
  const ORIGINAL_ADMIN_URL = process.env.ADMIN_URL;

  beforeAll(() => {
    process.env.ADMIN_URL = "https://admin.tarodan.com.tr";
  });

  afterAll(() => {
    if (ORIGINAL_ADMIN_URL === undefined) delete process.env.ADMIN_URL;
    else process.env.ADMIN_URL = ORIGINAL_ADMIN_URL;
  });

  const makeService = (
    candidates: Array<{ id: string; tradeNumber: string }> = [],
  ) => {
    const createInAppNotification = jest.fn().mockResolvedValue(true);
    const prisma = {
      adminUser: {
        findMany: jest.fn().mockResolvedValue([{ userId: "u-admin" }]),
      },
      trade: { findMany: jest.fn().mockResolvedValue(candidates) },
    };
    const cache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };
    const service = new TradeReconciliationService(
      prisma as never,
      cache as never,
      { createInAppNotification } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, createInAppNotification };
  };

  it("depoda takılı takas alarmı admin panelindeki takas dosyasına gider", async () => {
    const { service, createInAppNotification } = makeService();

    // Private yardımcı doğrudan çağrılır: cron'un tamamını (auto-cancel,
    // iade, kilitleme) ayağa kaldırmadan alarm payload'ı sabitlenir.
    await (service as any).notifyAdminsOfStuckTrades([
      {
        id: "trade-1",
        tradeNumber: "TKS-1",
        shippingDeadline: new Date("2026-01-01T00:00:00.000Z"),
        firstWarehouseArrivalAt: new Date("2026-01-02T00:00:00.000Z"),
      },
    ]);

    expect(createInAppNotification).toHaveBeenCalledTimes(1);
    const [userId, type, data] = createInAppNotification.mock.calls[0];
    expect(userId).toBe("u-admin");
    expect(type).toBe(NotificationType.TRADE_STUCK_AT_WAREHOUSE);
    expect(resolveWebNotificationLink(type, data)).toBe(
      "https://admin.tarodan.com.tr/operations/trades/trade-1",
    );
  });

  it("teslim raporu gelmeyen çıkış kolisi alarmı da admin paneline gider", async () => {
    const { service, createInAppNotification } = makeService([
      { id: "trade-2", tradeNumber: "TKS-2" },
    ]);

    const count = await (
      service as any
    ).notifyAdminsOfUndeliveredOutboundTrades(new Date());

    expect(count).toBe(1);
    const [userId, type, data] = createInAppNotification.mock.calls[0];
    expect(userId).toBe("u-admin");
    expect(type).toBe(NotificationType.TRADE_OUTBOUND_DELIVERY_MISSING);
    expect(resolveWebNotificationLink(type, data)).toBe(
      "https://admin.tarodan.com.tr/operations/trades/trade-2",
    );
  });
});
