import { OrderSchedulerService } from "./order-scheduler.service";
import { NotificationType } from "../../notification/dto";
import { resolveWebNotificationLink } from "../../notification/helpers/notification-link";

/**
 * Takılı kargo alarmlarının hedefleri.
 *
 * Regresyon 1: ORDER_STUCK_IN_TRANSIT yalnız admin'lere gider ama tüketici
 * sitesinin `/profile/orders/:id` ekranına link veriyordu — admin panelinde
 * olmayan bir sayfa. Artık üretici admin panelindeki sipariş dosyasını
 * (`adminLink`) verir.
 *
 * Regresyon 2: ORDER_SHIPMENT_DELAYED hem alıcıya hem satıcıya gider ama sabit
 * alıcı deseni satıcıyı da alıcının ekranına götürüyordu. Üretici artık her
 * alıcı için `audience` bildirir.
 */
describe("OrderSchedulerService — takılı kargo alarmları", () => {
  const ORIGINAL_ADMIN_URL = process.env.ADMIN_URL;

  beforeAll(() => {
    // adminLink https zorunluluğunu sağlayan gerçekçi taban adres.
    process.env.ADMIN_URL = "https://admin.tarodan.com.tr";
  });

  afterAll(() => {
    if (ORIGINAL_ADMIN_URL === undefined) delete process.env.ADMIN_URL;
    else process.env.ADMIN_URL = ORIGINAL_ADMIN_URL;
  });

  const stuckOrder = {
    id: "order-1",
    orderNumber: "ORD-1",
    buyerId: "u-buyer",
    sellerId: "u-seller",
    shipment: {
      shippedAt: new Date("2026-01-01T00:00:00.000Z"),
      trackingNumber: "TRK1",
    },
  };

  const makeService = (opts: { alreadyAlerted?: boolean } = {}) => {
    const createInAppNotification = jest.fn().mockResolvedValue(true);
    const prisma = {
      order: {
        findMany: jest.fn().mockResolvedValue([stuckOrder]),
        count: jest.fn().mockResolvedValue(0),
      },
      adminUser: {
        findMany: jest.fn().mockResolvedValue([{ userId: "u-admin" }]),
      },
    };
    const cache = {
      get: jest.fn().mockResolvedValue(opts.alreadyAlerted ? true : null),
      set: jest.fn().mockResolvedValue(undefined),
    };
    const sellerInvoice = {
      remindMissing: jest.fn().mockResolvedValue({ missing: 0, reminded: 0 }),
    };
    const service = new OrderSchedulerService(
      prisma as never,
      {} as never,
      { get: () => undefined } as never,
      {} as never,
      sellerInvoice as never,
      { createInAppNotification } as never,
      cache as never,
      {} as never,
    );
    return { service, createInAppNotification, cache };
  };

  const callsOf = (mock: jest.Mock, type: NotificationType) =>
    mock.mock.calls.filter((call) => call[1] === type);

  it("admin alarmı admin panelindeki sipariş dosyasına gider", async () => {
    const { service, createInAppNotification } = makeService();

    const result = await service.reportInvoiceStaleness();
    expect(result.stuckShipped).toBe(1);

    const adminCalls = callsOf(
      createInAppNotification,
      NotificationType.ORDER_STUCK_IN_TRANSIT,
    );
    expect(adminCalls).toHaveLength(1);
    const [userId, type, data] = adminCalls[0];
    expect(userId).toBe("u-admin");
    // Payload uçtan uca GERÇEK bir hedefe çözülmeli — tüketici ekranı değil.
    expect(resolveWebNotificationLink(type, data)).toBe(
      "https://admin.tarodan.com.tr/operations/orders/order-1",
    );
  });

  it("gecikme bildirimi alıcı ve satıcıyı AYRI ekranlara götürür", async () => {
    const { service, createInAppNotification } = makeService();

    await service.reportInvoiceStaleness();

    const delayedCalls = callsOf(
      createInAppNotification,
      NotificationType.ORDER_SHIPMENT_DELAYED,
    );
    expect(delayedCalls.map((c) => c[0]).sort()).toEqual([
      "u-buyer",
      "u-seller",
    ]);
    const byUser = new Map(delayedCalls.map((c) => [c[0], c[2]]));
    expect(
      resolveWebNotificationLink(
        NotificationType.ORDER_SHIPMENT_DELAYED,
        byUser.get("u-buyer"),
      ),
    ).toBe("/profile/orders/order-1");
    expect(
      resolveWebNotificationLink(
        NotificationType.ORDER_SHIPMENT_DELAYED,
        byUser.get("u-seller"),
      ),
    ).toBe("/seller/orders/order-1");
  });

  it("24 saatlik dedupe penceresinde aynı sipariş tekrar bildirilmez", async () => {
    const { service, createInAppNotification } = makeService({
      alreadyAlerted: true,
    });

    await service.reportInvoiceStaleness();

    expect(createInAppNotification).not.toHaveBeenCalled();
  });
});
