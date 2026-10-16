import { EventService } from "./event.service";

/**
 * Kuyruk yolu push'ları: B5 (satıcıya giden "Yeni Sipariş" hedef kitlesi),
 * B6 (teklif kabulü tek push), B14 (metin katalog anahtarıyla, alıcının
 * dilinde render edilmek üzere).
 */
describe("EventService — kuyruk yolu push yükü", () => {
  const makeService = () => {
    const emailQueue = { add: jest.fn().mockResolvedValue(undefined) };
    const pushQueue = { add: jest.fn().mockResolvedValue(undefined) };
    const service = new EventService(
      emailQueue as never,
      pushQueue as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, pushQueue };
  };

  const paid = {
    orderId: "o1",
    orderNumber: "ORD-1",
    buyerId: "b1",
    sellerId: "s1",
    productId: "p1",
    productTitle: "Model Araba",
    totalAmount: 100,
    commissionAmount: 10,
    buyerEmail: "b@example.com",
    buyerName: "B",
    sellerEmail: "s@example.com",
    sellerName: "S",
    paymentMethod: "card",
    transactionId: "tx",
    shippingAddress: {
      fullName: "B",
      phone: "1",
      address: "a",
      city: "c",
      district: "d",
      zipCode: "z",
    },
  };

  it("satıcı 'Yeni Sipariş' push'u audience=seller + katalog kopyası taşır", async () => {
    const { service, pushQueue } = makeService();

    await service.emitOrderPaid(paid);

    const seller = pushQueue.add.mock.calls
      .map(([, job]) => job)
      .find((job) => job.userId === "s1");
    expect(seller.data).toMatchObject({
      type: "payment_received",
      audience: "seller",
      orderId: "o1",
    });
    expect(seller.copy).toEqual({
      titleKey: "server.notificationEvent.orderPaidSeller.title",
      messageKey: "server.notificationEvent.orderPaidSeller.message",
      values: { productTitle: "Model Araba" },
    });
    // Eski worker / kuyrukta kalan iş için varsayılan dilde yedek metin.
    expect(seller.title).toBe("Yeni Sipariş");
    expect(seller.body).toBe(
      "Model Araba ürününüz satıldı! Kargoya hazırlayın.",
    );
  });

  it("teklif kabulü kuyruğa push YAZMAZ (tek push: notifyOfferAccepted)", async () => {
    const { service, pushQueue } = makeService();

    await service.emitOfferAccepted({
      offerId: "of1",
      orderId: "o1",
      orderNumber: "ORD-1",
      productId: "p1",
      productTitle: "Ürün",
      offerAmount: 50,
      buyerId: "b1",
      buyerEmail: "b@example.com",
      buyerName: "B",
      sellerId: "s1",
      sellerName: "S",
    });

    expect(pushQueue.add).not.toHaveBeenCalled();
  });
});
