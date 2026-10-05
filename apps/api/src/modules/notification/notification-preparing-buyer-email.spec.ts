import { NotificationCommerceService } from "./notification-commerce.service";
import { NotificationType } from "./dto";

/**
 * Hazırlık süresi taramasının ALICI bildirimleri misafire de ulaşmalı.
 *
 * Misafir siparişlerinde `order.buyerId` ortak sistem hesabıdır
 * (`guest@tarodan.system`): zil/push kimseye gitmez, kullanıcı kaydına
 * gönderilen e-posta sistem adresine düşer. Misafirin tek kanalı teslimat
 * verisindeki gerçek adrese giden e-postadır.
 */
describe("hazırlık süresi alıcı bildirimleri (misafir dahil)", () => {
  const guestRow = {
    buyerId: "guest-system",
    orderNumber: "ORD-7",
    totalAmount: 250,
    buyer: { email: "guest@tarodan.system", displayName: "GUEST_SYSTEM" },
    shippingAddress: {
      isGuestOrder: true,
      guestEmail: "misafir@example.com",
      guestName: "Misafir Alıcı",
    },
  };
  const memberRow = {
    buyerId: "buyer-1",
    orderNumber: "ORD-8",
    totalAmount: 120,
    buyer: { email: "uye@example.com", displayName: "Üye" },
    shippingAddress: { fullName: "Üye" },
  };

  const makeService = (row: object | null) => {
    const dispatch = {
      send: jest.fn().mockResolvedValue({ success: true }),
      createInAppNotification: jest.fn().mockResolvedValue(true),
      sendTemplateEmailToUser: jest.fn().mockResolvedValue(undefined),
      sendTemplateEmailToAddress: jest
        .fn()
        .mockResolvedValue({ success: true }),
    };
    const prisma = {
      order: { findUnique: jest.fn().mockResolvedValue(row) },
      user: { findUnique: jest.fn() },
    };
    const service = new NotificationCommerceService(
      dispatch as never,
      prisma as never,
      {} as never,
    );
    return { service, dispatch };
  };

  const extension = {
    orderNumber: "ORD-7",
    productTitle: "Model araba",
    deadline: "10 Ekim 2026 12:00",
  };

  describe("notifyPreparingExtendedBuyer", () => {
    it("misafirde e-posta gerçek misafire, takip linki için misafir işaretiyle gider", async () => {
      const { service, dispatch } = makeService(guestRow);

      await service.notifyPreparingExtendedBuyer("o7", extension);

      expect(dispatch.sendTemplateEmailToAddress).toHaveBeenCalledWith(
        "misafir@example.com",
        "order-preparing-extended-buyer",
        expect.objectContaining({
          orderId: "o7",
          ...extension,
          name: "Misafir Alıcı",
          isGuestOrder: true,
          buyerEmail: "misafir@example.com",
        }),
      );
      expect(dispatch.sendTemplateEmailToUser).not.toHaveBeenCalled();
    });

    it("üyeye zil + push ve hesabındaki adrese e-posta gider", async () => {
      const { service, dispatch } = makeService(memberRow);

      await service.notifyPreparingExtendedBuyer("o8", extension);

      expect(dispatch.createInAppNotification).toHaveBeenCalledWith(
        "buyer-1",
        NotificationType.ORDER_PREPARING_EXTENDED,
        { orderId: "o8", ...extension, audience: "buyer" },
      );
      expect(dispatch.sendTemplateEmailToAddress).toHaveBeenCalledWith(
        "uye@example.com",
        "order-preparing-extended-buyer",
        expect.objectContaining({ name: "Üye", isGuestOrder: false }),
      );
    });

    it("zil yazılamasa bile e-posta gider", async () => {
      const { service, dispatch } = makeService(guestRow);
      dispatch.createInAppNotification.mockRejectedValueOnce(new Error("db"));

      await service.notifyPreparingExtendedBuyer("o7", extension);

      expect(dispatch.sendTemplateEmailToAddress).toHaveBeenCalledTimes(1);
    });

    it("adresi olmayan misafire sistem adresine e-posta göndermez", async () => {
      const { service, dispatch } = makeService({
        ...guestRow,
        shippingAddress: { isGuestOrder: true },
      });

      await service.notifyPreparingExtendedBuyer("o7", extension);

      expect(dispatch.sendTemplateEmailToAddress).not.toHaveBeenCalled();
    });

    it("sipariş yoksa sessizce çıkar", async () => {
      const { service, dispatch } = makeService(null);

      await service.notifyPreparingExtendedBuyer("missing", extension);

      expect(dispatch.createInAppNotification).not.toHaveBeenCalled();
      expect(dispatch.sendTemplateEmailToAddress).not.toHaveBeenCalled();
    });
  });

  describe("notifySellerDidNotShipRefunded (aynı tarama, iptal + iade)", () => {
    it("misafirde iade e-postası gerçek misafire gider, sistem adresine değil", async () => {
      const { service, dispatch } = makeService(guestRow);

      await service.notifySellerDidNotShipRefunded("guest-system", "o7");

      expect(dispatch.sendTemplateEmailToAddress).toHaveBeenCalledWith(
        "misafir@example.com",
        "seller-did-not-ship-refunded",
        expect.objectContaining({
          orderNumber: "ORD-7",
          orderId: "o7",
          refundAmount: 250,
          name: "Misafir Alıcı",
          isGuestOrder: true,
        }),
      );
      expect(dispatch.sendTemplateEmailToUser).not.toHaveBeenCalled();
    });

    it("üyede davranış aynı: hesabındaki adrese, adıyla", async () => {
      const { service, dispatch } = makeService(memberRow);

      await service.notifySellerDidNotShipRefunded("buyer-1", "o8");

      expect(dispatch.send).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "buyer-1",
          type: NotificationType.SELLER_DID_NOT_SHIP_REFUNDED,
        }),
      );
      expect(dispatch.sendTemplateEmailToAddress).toHaveBeenCalledWith(
        "uye@example.com",
        "seller-did-not-ship-refunded",
        expect.objectContaining({
          orderNumber: "ORD-8",
          refundAmount: 120,
          name: "Üye",
        }),
      );
    });
  });
});
