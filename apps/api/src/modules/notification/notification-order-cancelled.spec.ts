import { NotificationCommerceService } from "./notification-commerce.service";
import { NotificationType } from "./dto";

/**
 * Kargo öncesi İPTAL duyurusu TEK tanımdır: processRefund'ın "iptal" dalı ve
 * admin (platform) iptali aynı metodu kullanır. Kullanıcıya "iade" değil
 * "iptal" denir; alıcı tutarı görür, satıcı kendi iptal bildirimini alır, iki
 * tarafa da iptal e-postası gider.
 */
describe("NotificationCommerceService.notifyOrderCancelledParties", () => {
  const order = {
    id: "order-1",
    orderNumber: "ORD-1001",
    buyerId: "buyer-1",
    sellerId: "seller-1",
  };

  const makeService = () => {
    const dispatch = {
      createInAppNotification: jest.fn().mockResolvedValue(true),
      sendTemplateEmailToUser: jest.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          ...order,
          cancelReason: "Satıcı stoğu bitti",
          product: { title: "Model araba" },
          buyer: { displayName: "Alıcı" },
          seller: { displayName: "Satıcı" },
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
  });

  it("taraf verilmezse (processRefund'ın iptal dalı) ikisine gider", async () => {
    const { service, dispatch } = makeService();

    await service.notifyOrderCancelledParties(order, 1180);

    expect(dispatch.createInAppNotification).toHaveBeenCalledTimes(2);
    expect(dispatch.sendTemplateEmailToUser).toHaveBeenCalledTimes(2);
  });

  it("iki tarafa da gerekçeli iptal e-postası gönderir", async () => {
    const { service, dispatch } = makeService();

    await service.notifyOrderCancelledParties(order, 1180);

    expect(dispatch.sendTemplateEmailToUser).toHaveBeenCalledWith(
      "buyer-1",
      "order-cancelled-buyer",
      expect.objectContaining({ reason: "Satıcı stoğu bitti" }),
    );
    expect(dispatch.sendTemplateEmailToUser).toHaveBeenCalledWith(
      "seller-1",
      "order-cancelled-seller",
      expect.objectContaining({ reason: "Satıcı stoğu bitti" }),
    );
  });
});
