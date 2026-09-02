import { OfferStatus, OrderStatus } from "@prisma/client";
import { AdminOfferService } from "./admin-offer.service";

/**
 * Admin teklif iptali: yalnız pending / ödenmemiş accepted; bağlı ödeme
 * bekleyen sipariş aynı tx'te alıcı-iptali yardımcısıyla kapanır; ödenmiş
 * sipariş 400; audit fail-closed; bildirim hatası yutulur.
 */
describe("AdminOfferService.cancelOffer", () => {
  const baseOffer = {
    id: "of1",
    status: OfferStatus.accepted,
    version: 3,
    buyerId: "b1",
    sellerId: "s1",
    productId: "p1",
    cancelReason: null,
    product: { id: "p1", title: "Ürün" },
    order: null as any,
  };
  const pendingOrder = {
    id: "o1",
    status: OrderStatus.pending_payment,
    version: 1,
    quantity: 1,
    productId: "p1",
    offerId: "of1",
    checkoutGroupId: null,
    reservationReleasedAt: null,
  };

  const makeService = (offer: any) => {
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue(offer ? [{ id: offer.id }] : []),
      offer: {
        findUnique: jest.fn().mockResolvedValue(offer),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma: any = { $transaction: jest.fn((fn: any) => fn(tx)) };
    const audit = {
      createRequiredAuditLog: jest.fn().mockResolvedValue(undefined),
    };
    const orderService = {
      cancelUnpaidOrderInTx: jest.fn().mockResolvedValue({}),
      invalidateProductCaches: jest.fn().mockResolvedValue(undefined),
    };
    const notifications = {
      notifyOfferCancelledByAdmin: jest.fn().mockResolvedValue(undefined),
    };
    const query = {
      getOfferById: jest.fn().mockResolvedValue({ offer: { id: "of1" } }),
    };
    const service = new AdminOfferService(
      prisma,
      audit as any,
      orderService as any,
      notifications as any,
      query as any,
    );
    return { service, tx, audit, orderService, notifications, query };
  };

  it("pending teklif: gerekçeyle cancelled; sipariş yok → sipariş iptali çağrılmaz; audit + iki bildirim", async () => {
    const { service, tx, audit, orderService, notifications } = makeService({
      ...baseOffer,
      status: OfferStatus.pending,
    });

    const res = await service.cancelOffer("admin-1", "of1", { reason: "spam" });

    expect(tx.offer.update).toHaveBeenCalledWith({
      where: { id: "of1", version: 3 },
      data: {
        status: OfferStatus.cancelled,
        cancelReason: "Yönetici tarafından iptal edildi: spam",
        version: { increment: 1 },
      },
    });
    expect(orderService.cancelUnpaidOrderInTx).not.toHaveBeenCalled();
    expect(orderService.invalidateProductCaches).not.toHaveBeenCalled();
    expect(audit.createRequiredAuditLog).toHaveBeenCalledWith(
      "admin-1",
      "offer_cancel",
      "Offer",
      "of1",
      expect.objectContaining({ status: OfferStatus.pending, orderId: null }),
      expect.objectContaining({
        status: OfferStatus.cancelled,
        reason: "spam",
        cancelledOrderId: null,
      }),
    );
    expect(notifications.notifyOfferCancelledByAdmin).toHaveBeenCalledTimes(2);
    expect(notifications.notifyOfferCancelledByAdmin).toHaveBeenCalledWith(
      "b1",
      expect.objectContaining({ offerId: "of1", reason: "spam" }),
    );
    expect(res).toEqual({ offer: { id: "of1" } });
  });

  it("accepted + ödeme bekleyen sipariş: sipariş aynı tx'te kapanır (teklif yazımı atlanır), önbellek düşer", async () => {
    const { service, tx, orderService } = makeService({
      ...baseOffer,
      order: pendingOrder,
    });

    await service.cancelOffer("admin-1", "of1", { reason: "hatalı ilan" });

    expect(orderService.cancelUnpaidOrderInTx).toHaveBeenCalledWith(
      tx,
      pendingOrder,
      {
        reason: "Yönetici tarafından iptal edildi: hatalı ilan",
        ledgerReason: "admin_cancelled",
        skipOfferUpdate: true,
      },
    );
    expect(orderService.invalidateProductCaches).toHaveBeenCalledWith("p1");
  });

  it("bağlı sipariş ödendiyse 400 orderAlreadyPaid; hiçbir yazım yapılmaz", async () => {
    const { service, tx, audit } = makeService({
      ...baseOffer,
      order: { ...pendingOrder, status: OrderStatus.paid },
    });

    await expect(
      service.cancelOffer("admin-1", "of1", { reason: "x" }),
    ).rejects.toMatchObject({
      response: { i18nKey: "server.admin.offer.orderAlreadyPaid" },
    });
    expect(tx.offer.update).not.toHaveBeenCalled();
    expect(audit.createRequiredAuditLog).not.toHaveBeenCalled();
  });

  it("payment_expired teklif (siparişi iptal, alıcı canlandırabilir) iptal edilir; sipariş yeniden iptal edilmez", async () => {
    const { service, tx, audit, orderService } = makeService({
      ...baseOffer,
      status: OfferStatus.payment_expired,
      order: { ...pendingOrder, status: OrderStatus.cancelled },
    });
    await service.cancelOffer("admin-1", "of1", { reason: "x" });
    expect(tx.offer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: OfferStatus.cancelled }),
      }),
    );
    expect(orderService.cancelUnpaidOrderInTx).not.toHaveBeenCalled();
    expect(audit.createRequiredAuditLog).toHaveBeenCalledWith(
      "admin-1",
      "offer_cancel",
      "Offer",
      "of1",
      expect.objectContaining({
        status: OfferStatus.payment_expired,
        orderStatus: OrderStatus.cancelled,
      }),
      expect.objectContaining({ cancelledOrderId: null }),
    );
  });

  it.each([OfferStatus.rejected, OfferStatus.cancelled, OfferStatus.expired])(
    "%s durumundaki teklif iptal edilemez (400)",
    async (status) => {
      const { service } = makeService({ ...baseOffer, status });
      await expect(
        service.cancelOffer("admin-1", "of1", { reason: "x" }),
      ).rejects.toMatchObject({
        response: { i18nKey: "server.admin.offer.notCancellableStatus" },
      });
    },
  );

  it("olmayan teklif 404", async () => {
    const { service } = makeService(null);
    await expect(
      service.cancelOffer("admin-1", "nope", { reason: "x" }),
    ).rejects.toMatchObject({
      response: { i18nKey: "server.offer.offerNotFound" },
    });
  });

  it("bildirim hatası işlemi bozmaz", async () => {
    const { service, notifications } = makeService({
      ...baseOffer,
      status: OfferStatus.pending,
    });
    notifications.notifyOfferCancelledByAdmin.mockRejectedValue(
      new Error("push down"),
    );
    await expect(
      service.cancelOffer("admin-1", "of1", { reason: "x" }),
    ).resolves.toBeDefined();
  });
});
