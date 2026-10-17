import { OfferStatus, OrderStatus } from "@prisma/client";
import { AdminOfferService } from "./admin-offer.service";

/**
 * Admin teklif iptali: yalnız SİPARİŞİ OLMAYAN teklif (pending ya da siparişi
 * kapanmış accepted / payment_expired). Canlı siparişi olan teklif sipariş
 * iptal ucuna yönlendirilir (409) — teklif siparişinin tek iptal yolu
 * AdminOrderCancelService'tir. Denetim fail-closed ve iptalle aynı işlemde;
 * bildirim hatası yutulur.
 */
describe("AdminOfferService.cancelOffer", () => {
  const baseOffer = {
    id: "of1",
    status: OfferStatus.accepted as OfferStatus,
    version: 3,
    buyerId: "b1",
    sellerId: "s1",
    productId: "p1",
    cancelReason: null,
    product: { id: "p1", title: "Ürün" },
    order: null as { id: string; status: OrderStatus } | null,
  };

  const makeService = (offer: typeof baseOffer | null) => {
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
    const notifications = {
      notifyOfferCancelledByAdmin: jest.fn().mockResolvedValue(undefined),
    };
    const query = {
      getOfferById: jest.fn().mockResolvedValue({ offer: { id: "of1" } }),
    };
    const service = new AdminOfferService(
      prisma,
      audit as any,
      notifications as any,
      query as any,
    );
    return { service, tx, audit, notifications, query };
  };

  it("pending teklif: gerekçeyle cancelled; denetim aynı işlemde; iki bildirim", async () => {
    const { service, tx, audit, notifications } = makeService({
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
    expect(audit.createRequiredAuditLog).toHaveBeenCalledWith(
      "admin-1",
      "offer_cancel",
      "Offer",
      "of1",
      expect.objectContaining({ status: OfferStatus.pending, orderId: null }),
      expect.objectContaining({
        status: OfferStatus.cancelled,
        reason: "spam",
      }),
      tx,
    );
    expect(notifications.notifyOfferCancelledByAdmin).toHaveBeenCalledTimes(2);
    expect(notifications.notifyOfferCancelledByAdmin).toHaveBeenCalledWith(
      "b1",
      expect.objectContaining({ offerId: "of1", reason: "spam" }),
    );
    expect(res).toEqual({ offer: { id: "of1" } });
  });

  it.each([OrderStatus.pending_payment, OrderStatus.paid, OrderStatus.shipped])(
    "canlı siparişi (%s) olan teklif sipariş iptaline yönlendirilir (409); hiçbir yazım yapılmaz",
    async (status) => {
      const { service, tx, audit, notifications } = makeService({
        ...baseOffer,
        order: { id: "o1", status },
      });

      await expect(
        service.cancelOffer("admin-1", "of1", { reason: "x" }),
      ).rejects.toMatchObject({
        status: 409,
        response: { i18nKey: "server.admin.offer.useOrderCancel" },
      });
      expect(tx.offer.update).not.toHaveBeenCalled();
      expect(audit.createRequiredAuditLog).not.toHaveBeenCalled();
      expect(notifications.notifyOfferCancelledByAdmin).not.toHaveBeenCalled();
    },
  );

  it("payment_expired teklif (siparişi iptal, alıcı canlandırabilir) iptal edilir", async () => {
    const { service, tx, audit } = makeService({
      ...baseOffer,
      status: OfferStatus.payment_expired,
      order: { id: "o1", status: OrderStatus.cancelled },
    });

    await service.cancelOffer("admin-1", "of1", { reason: "x" });

    expect(tx.offer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: OfferStatus.cancelled }),
      }),
    );
    expect(audit.createRequiredAuditLog).toHaveBeenCalledWith(
      "admin-1",
      "offer_cancel",
      "Offer",
      "of1",
      expect.objectContaining({
        status: OfferStatus.payment_expired,
        orderStatus: OrderStatus.cancelled,
      }),
      expect.anything(),
      tx,
    );
  });

  it("denetim yazılamazsa iptal de olmaz (fail-closed, aynı işlem); bildirim gitmez", async () => {
    const { service, audit, notifications } = makeService({
      ...baseOffer,
      status: OfferStatus.pending,
    });
    audit.createRequiredAuditLog.mockRejectedValue(new Error("audit down"));

    await expect(
      service.cancelOffer("admin-1", "of1", { reason: "x" }),
    ).rejects.toThrow("audit down");
    expect(notifications.notifyOfferCancelledByAdmin).not.toHaveBeenCalled();
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
