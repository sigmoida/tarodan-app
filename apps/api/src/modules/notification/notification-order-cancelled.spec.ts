import { NotificationCommerceService } from "./notification-commerce.service";
import { NotificationType } from "./dto";

/**
 * Kargo öncesi İPTAL duyurusu TEK tanımdır: processRefund'ın "iptal" dalı ve
 * admin (platform) iptali aynı metodu kullanır. Kullanıcıya "iade" değil
 * "iptal" denir; alıcı tutarı görür, satıcı kendi iptal bildirimini alır, iki
 * tarafa da iptal e-postası gider. Alıcı e-postası siparişin alıcısına
 * çözülür (`orderBuyerContact`): misafir siparişinde gerçek misafire.
 */
describe("NotificationCommerceService.notifyOrderCancelledParties", () => {
  const order = {
    id: "order-1",
    orderNumber: "ORD-1001",
    buyerId: "buyer-1",
    sellerId: "seller-1",
  };

  const makeService = (
    buyerRow: {
      buyer: { email: string; displayName: string };
      shippingAddress: unknown;
    } = {
      buyer: { email: "alici@example.com", displayName: "Alıcı" },
      shippingAddress: { fullName: "Alıcı" },
    },
  ) => {
    const dispatch = {
      createInAppNotification: jest.fn().mockResolvedValue(true),
      sendTemplateEmailToUser: jest.fn().mockResolvedValue(undefined),
      sendTemplateEmailToAddress: jest
        .fn()
        .mockResolvedValue({ success: true }),
    };
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          ...order,
          cancelReason: "Satıcı stoğu bitti",
          product: { title: "Model araba" },
          seller: { displayName: "Satıcı" },
          ...buyerRow,
        }),
      },
    };
    const service = new NotificationCommerceService(
      dispatch as any,
      prisma as any,
      {} as any,
    );
    return { service, dispatch };
  };

  it("alıcıya tutarlı ORDER_CANCELLED, satıcıya ORDER_CANCELLED_SELLER gönderir", async () => {
    const { service, dispatch } = makeService();

    await service.notifyOrderCancelledParties(order, 1180);

    expect(dispatch.createInAppNotification).toHaveBeenCalledWith(
      "buyer-1",
      NotificationType.ORDER_CANCELLED,
      { orderId: "order-1", orderNumber: "ORD-1001", amount: 1180 },
    );
    expect(dispatch.createInAppNotification).toHaveBeenCalledWith(
      "seller-1",
      NotificationType.ORDER_CANCELLED_SELLER,
      { orderId: "order-1", orderNumber: "ORD-1001" },
    );
  });

  it("alıcı iptalinde yalnız satıcıya (in-app + e-posta) gider", async () => {
    const { service, dispatch } = makeService();

    await service.notifyOrderCancelledParties(order, 1130, ["seller"]);

    expect(dispatch.createInAppNotification).toHaveBeenCalledTimes(1);
    expect(dispatch.createInAppNotification).toHaveBeenCalledWith(
      "seller-1",
      NotificationType.ORDER_CANCELLED_SELLER,
      { orderId: "order-1", orderNumber: "ORD-1001" },
    );
    expect(dispatch.sendTemplateEmailToUser).toHaveBeenCalledTimes(1);
    expect(dispatch.sendTemplateEmailToUser).toHaveBeenCalledWith(
      "seller-1",
      "order-cancelled-seller",
      expect.anything(),
    );
    expect(dispatch.sendTemplateEmailToAddress).not.toHaveBeenCalled();
  });

  it("taraf verilmezse (processRefund'ın iptal dalı) ikisine gider", async () => {
    const { service, dispatch } = makeService();

    await service.notifyOrderCancelledParties(order, 1180);

    expect(dispatch.createInAppNotification).toHaveBeenCalledTimes(2);
    // Satıcıya hesabına, alıcıya çözülmüş adresine.
    expect(dispatch.sendTemplateEmailToUser).toHaveBeenCalledTimes(1);
    expect(dispatch.sendTemplateEmailToAddress).toHaveBeenCalledTimes(1);
  });

  it("iki tarafa da gerekçeli iptal e-postası gönderir", async () => {
    const { service, dispatch } = makeService();

    await service.notifyOrderCancelledParties(order, 1180);

    expect(dispatch.sendTemplateEmailToAddress).toHaveBeenCalledWith(
      "alici@example.com",
      "order-cancelled-buyer",
      expect.objectContaining({
        reason: "Satıcı stoğu bitti",
        buyerName: "Alıcı",
        isGuestOrder: false,
      }),
    );
    expect(dispatch.sendTemplateEmailToUser).toHaveBeenCalledWith(
      "seller-1",
      "order-cancelled-seller",
      expect.objectContaining({ reason: "Satıcı stoğu bitti" }),
    );
  });

  /**
   * Regresyon: misafir siparişinde alıcı ortak sistem hesabıdır; iptal
   * e-postası `guest@tarodan.system`'a gidiyor, misafire hiç ulaşmıyordu.
   */
  it("misafir siparişinde iptal e-postası teslimat verisindeki gerçek adrese gider", async () => {
    const { service, dispatch } = makeService({
      buyer: { email: "guest@tarodan.system", displayName: "GUEST_SYSTEM" },
      shippingAddress: {
        isGuestOrder: true,
        guestEmail: "misafir@example.com",
        guestName: "Misafir Alıcı",
      },
    });

    await service.notifyOrderCancelledParties(order, 1180);

    expect(dispatch.sendTemplateEmailToAddress).toHaveBeenCalledWith(
      "misafir@example.com",
      "order-cancelled-buyer",
      expect.objectContaining({
        buyerName: "Misafir Alıcı",
        isGuestOrder: true,
        buyerEmail: "misafir@example.com",
      }),
    );
    expect(dispatch.sendTemplateEmailToUser).not.toHaveBeenCalledWith(
      "buyer-1",
      expect.anything(),
      expect.anything(),
    );
  });
});
