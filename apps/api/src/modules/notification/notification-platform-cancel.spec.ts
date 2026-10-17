import { NotificationCommerceService } from "./notification-commerce.service";
import { NotificationDispatchService } from "./notification-dispatch.service";
import { I18nService } from "../i18n/i18n.service";
import { NotificationType } from "./dto";

/**
 * Yönetici (platform) iptalinin duyurusu — iptalin her türü için TEK tanım.
 * Her taraf TAM BİR zil (+push) ve TAM BİR e-posta alır; misafir alıcı yalnız
 * gerçek adresine e-posta alır (ortak sistem hesabının zili kimseye
 * ulaşmaz). Metin "Tarodan iptal etti" der, nedenin KATALOG etiketini taşır;
 * ödenmiş siparişte iade tutarı + "bankanızın olağan iade süresi". Yöneticinin
 * iç notu bu yola hiç girmez.
 */
describe("NotificationCommerceService.notifyOrderCancelledByPlatform", () => {
  const memberRow = {
    buyer: { email: "alici@example.com", displayName: "Alıcı" },
    shippingAddress: { fullName: "Alıcı" },
  };
  const guestRow = {
    buyer: { email: "guest@tarodan.system", displayName: "GUEST_SYSTEM" },
    shippingAddress: {
      isGuestOrder: true,
      guestEmail: "misafir@example.com",
      guestName: "Misafir Alıcı",
    },
  };

  const makeService = (buyerRow: Record<string, unknown> = memberRow) => {
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
          id: "order-1",
          orderNumber: "ORD-1001",
          buyerId: "buyer-1",
          sellerId: "seller-1",
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
    return { service, dispatch, prisma };
  };

  const allCalls = (dispatch: Record<string, jest.Mock>) =>
    JSON.stringify(Object.values(dispatch).map((mock) => mock.mock.calls));

  it("ödenmiş: üye alıcı ve satıcı birer zil + birer e-posta alır (iade tutarıyla)", async () => {
    const { service, dispatch } = makeService();

    await service.notifyOrderCancelledByPlatform({
      orderId: "order-1",
      reasonCode: "stock_error",
      refundAmount: 1180,
    });

    expect(dispatch.createInAppNotification).toHaveBeenCalledTimes(2);
    expect(dispatch.createInAppNotification).toHaveBeenCalledWith(
      "buyer-1",
      NotificationType.ORDER_CANCELLED_BY_PLATFORM,
      {
        orderId: "order-1",
        orderNumber: "ORD-1001",
        productTitle: "Model araba",
        reasonCode: "stock_error",
        reasonKey: "adminCancel.reasons.stock_error",
        paid: "yes",
        amount: 1180,
      },
    );
    expect(dispatch.createInAppNotification).toHaveBeenCalledWith(
      "seller-1",
      NotificationType.ORDER_CANCELLED_BY_PLATFORM_SELLER,
      expect.objectContaining({
        orderId: "order-1",
        reasonKey: "adminCancel.reasons.stock_error",
        paid: "yes",
        audience: "seller",
      }),
    );

    expect(dispatch.sendTemplateEmailToAddress).toHaveBeenCalledTimes(1);
    expect(dispatch.sendTemplateEmailToAddress).toHaveBeenCalledWith(
      "alici@example.com",
      "order-cancelled-by-platform-buyer",
      expect.objectContaining({
        orderNumber: "ORD-1001",
        reason: "Stok hatası",
        paid: true,
        refundAmount: 1180,
        isGuestOrder: false,
      }),
    );
    expect(dispatch.sendTemplateEmailToUser).toHaveBeenCalledTimes(1);
    expect(dispatch.sendTemplateEmailToUser).toHaveBeenCalledWith(
      "seller-1",
      "order-cancelled-by-platform-seller",
      expect.objectContaining({
        sellerName: "Satıcı",
        reason: "Stok hatası",
        paid: true,
      }),
    );
  });

  it("ödenmemiş: 'ödeme alınmadı' — tutar taşımaz", async () => {
    const { service, dispatch } = makeService();

    await service.notifyOrderCancelledByPlatform({
      orderId: "order-1",
      reasonCode: "duplicate_transaction",
      refundAmount: null,
    });

    expect(dispatch.createInAppNotification).toHaveBeenCalledWith(
      "buyer-1",
      NotificationType.ORDER_CANCELLED_BY_PLATFORM,
      expect.objectContaining({ paid: "no", amount: 0 }),
    );
    const buyerEmail = dispatch.sendTemplateEmailToAddress.mock.calls[0][2];
    expect(buyerEmail).toMatchObject({
      paid: false,
      reason: "Mükerrer işlem",
    });
    expect(buyerEmail).not.toHaveProperty("refundAmount");
  });

  it("misafir alıcı: zil yok (ortak sistem hesabı), e-posta GERÇEK misafire; satıcı yine zil + e-posta", async () => {
    const { service, dispatch } = makeService(guestRow);

    await service.notifyOrderCancelledByPlatform({
      orderId: "order-1",
      reasonCode: "user_request",
      refundAmount: 500,
    });

    expect(dispatch.createInAppNotification).toHaveBeenCalledTimes(1);
    expect(dispatch.createInAppNotification).toHaveBeenCalledWith(
      "seller-1",
      NotificationType.ORDER_CANCELLED_BY_PLATFORM_SELLER,
      expect.anything(),
    );
    expect(dispatch.sendTemplateEmailToAddress).toHaveBeenCalledTimes(1);
    expect(dispatch.sendTemplateEmailToAddress).toHaveBeenCalledWith(
      "misafir@example.com",
      "order-cancelled-by-platform-buyer",
      expect.objectContaining({
        buyerName: "Misafir Alıcı",
        isGuestOrder: true,
      }),
    );
    expect(allCalls(dispatch)).not.toContain("guest@tarodan.system");
    expect(dispatch.sendTemplateEmailToUser).toHaveBeenCalledTimes(1);
  });

  it("zil hatası e-postaları engellemez", async () => {
    const { service, dispatch } = makeService();
    dispatch.createInAppNotification.mockRejectedValue(new Error("db down"));

    await expect(
      service.notifyOrderCancelledByPlatform({
        orderId: "order-1",
        reasonCode: "stock_error",
        refundAmount: 1180,
      }),
    ).resolves.toBeUndefined();
    expect(dispatch.sendTemplateEmailToAddress).toHaveBeenCalledTimes(1);
    expect(dispatch.sendTemplateEmailToUser).toHaveBeenCalledTimes(1);
  });

  it("sipariş okunamazsa hiçbir şey göndermez ve throw etmez", async () => {
    const { service, dispatch, prisma } = makeService();
    prisma.order.findUnique.mockResolvedValue(null);

    await service.notifyOrderCancelledByPlatform({
      orderId: "missing",
      reasonCode: "stock_error",
      refundAmount: null,
    });

    expect(dispatch.createInAppNotification).not.toHaveBeenCalled();
    expect(dispatch.sendTemplateEmailToAddress).not.toHaveBeenCalled();
    expect(dispatch.sendTemplateEmailToUser).not.toHaveBeenCalled();
  });

  it("taraf-yüzlü hiçbir yük not alanı taşımaz (yalnız kod + etiket)", async () => {
    const { service, dispatch } = makeService();

    await service.notifyOrderCancelledByPlatform({
      orderId: "order-1",
      reasonCode: "other",
      refundAmount: 100,
    });

    expect(allCalls(dispatch)).not.toContain('"note"');
    expect(dispatch.sendTemplateEmailToAddress.mock.calls[0][2]).toMatchObject({
      reason: "Diğer",
    });
  });
});

/**
 * Şablonun `localizedValues` parametresi: veriye dile bağlı metin değil
 * katalog anahtarı yazılır, her alıcı nedeni KENDİ dilinde okur.
 */
describe("platform cancel notice renders the reason label in the recipient's locale", () => {
  const makeDispatch = (locale: "tr" | "en") => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          notificationSettings: null,
          preferredLanguage: locale,
        }),
      },
      platformSetting: { findMany: jest.fn().mockResolvedValue([]) },
      notificationLog: {
        create: jest.fn().mockResolvedValue({ id: "log-1" }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new NotificationDispatchService(
      prisma as any,
      { sendToUser: jest.fn().mockResolvedValue([]) } as any,
      {} as any,
      {} as any,
      { emitNotification: jest.fn() } as any,
      new I18nService(),
    );
    (service as any).sendPushReal = jest.fn().mockResolvedValue(true);
    return { service, prisma };
  };

  const stored = (prisma: { notificationLog: { create: jest.Mock } }) =>
    prisma.notificationLog.create.mock.calls[0][0].data as {
      title: string;
      body: string;
    };

  const data = {
    orderId: "order-1",
    orderNumber: "ORD-1001",
    productTitle: "Model araba",
    reasonCode: "listing_violation",
    reasonKey: "adminCancel.reasons.listing_violation",
    paid: "yes",
    amount: 250,
  };

  it("tr: Tarodan iptali + Türkçe etiket + banka süresi (rakamsız)", async () => {
    const { service, prisma } = makeDispatch("tr");

    await service.createInAppNotification(
      "buyer-1",
      NotificationType.ORDER_CANCELLED_BY_PLATFORM,
      data,
    );

    const { title, body } = stored(prisma);
    expect(title).toBe("Siparişiniz Tarodan tarafından iptal edildi");
    expect(body).toContain("ORD-1001");
    expect(body).toContain("İlan kurallarına aykırılık");
    expect(body).toContain("250 TL");
    expect(body).toContain("bankanızın olağan iade süresi");
    expect(body).not.toContain("adminCancel.reasons");
  });

  it("en: the same data renders the English label", async () => {
    const { service, prisma } = makeDispatch("en");

    await service.createInAppNotification(
      "buyer-1",
      NotificationType.ORDER_CANCELLED_BY_PLATFORM,
      data,
    );

    const { body } = stored(prisma);
    expect(body).toContain("Listing rule violation");
    expect(body).not.toContain("İlan kurallarına aykırılık");
  });

  it("ödenmemiş satıcı metni 'ödeme alınmamıştı' der", async () => {
    const { service, prisma } = makeDispatch("tr");

    await service.createInAppNotification(
      "seller-1",
      NotificationType.ORDER_CANCELLED_BY_PLATFORM_SELLER,
      { ...data, paid: "no", amount: 0, audience: "seller" },
    );

    expect(stored(prisma).body).toContain("Ödeme alınmamıştı");
  });
});
