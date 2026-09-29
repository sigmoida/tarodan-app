import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { OrderStatus, ShipmentStatus } from "@prisma/client";
import { AdminOrderCancelService } from "./admin-order-cancel.service";

/**
 * Admin "Siparişi iptal et": uygunluk ön kontrolü panelle ORTAK kuraldır
 * (`preShipmentCancelBlocker`), para yolu alıcı iptaliyle ortak çekirdektir
 * (RefundService.createPlatformCancellationRefund) — bu servis parayı hiç
 * hesaplamaz. Burada sabitlenen: hangi siparişler çekirdeğe ulaşır, hangi
 * hata döner, denetim izi, ve ikinci çağrının ikinci iade üretmemesi.
 */
describe("AdminOrderCancelService", () => {
  const baseOrder = {
    id: "order-1",
    status: OrderStatus.paid as OrderStatus,
    productId: "product-1",
    cancellationType: null as string | null,
    cancelReason: null as string | null,
    checkoutGroupId: null as string | null,
    totalAmount: 1180,
    shipment: null as { status: ShipmentStatus; shippedAt: Date | null } | null,
    refundRequests: [] as Array<{ id: string; refundNumber: string }>,
  };

  const refundRow = {
    id: "refund-1",
    refundNumber: "RFD-1",
    amount: 1180,
    status: "refunded",
  };

  const makeService = (order: Partial<typeof baseOrder> | null = {}) => {
    const prisma = {
      order: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            order === null ? null : { ...baseOrder, ...order },
          ),
      },
    };
    const audit = {
      createRequiredAuditLog: jest.fn().mockResolvedValue(undefined),
      createAuditLog: jest.fn().mockResolvedValue(undefined),
    };
    const refundService = {
      createPlatformCancellationRefund: jest.fn().mockResolvedValue(refundRow),
      previewPlatformCancellationRefund: jest
        .fn()
        .mockResolvedValue({ refundAmount: 1180, shippingRefunded: true }),
    };
    const orderService = {
      invalidateProductCaches: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AdminOrderCancelService(
      prisma as any,
      audit as any,
      refundService as any,
      orderService as any,
    );
    return { service, prisma, audit, refundService, orderService };
  };

  describe("uygun siparişler", () => {
    it.each([
      ["paid, kargo kaydı yok", { status: OrderStatus.paid, shipment: null }],
      [
        "preparing, yalnız etiket oluşturulmuş",
        {
          status: OrderStatus.preparing,
          shipment: { status: ShipmentStatus.label_created, shippedAt: null },
        },
      ],
      [
        "paid, kargo kaydı pending",
        {
          status: OrderStatus.paid,
          shipment: { status: ShipmentStatus.pending, shippedAt: null },
        },
      ],
    ])(
      "%s → ortak çekirdeğe platform iptali olarak gider",
      async (_, order) => {
        const { service, refundService } = makeService(order);

        const result = await service.cancelOrder("admin-1", "order-1", {
          reason: "  Satıcı stoğu bitti  ",
        });

        expect(
          refundService.createPlatformCancellationRefund,
        ).toHaveBeenCalledWith("order-1", "admin-1", "Satıcı stoğu bitti");
        expect(result).toEqual({
          orderId: "order-1",
          refundRequestId: "refund-1",
          refundNumber: "RFD-1",
          refundAmount: 1180,
        });
      },
    );

    it("sepet (grup ödemesi) kalemini de yalnız o sipariş için iptal eder", async () => {
      const { service, refundService } = makeService({
        checkoutGroupId: "group-1",
      });

      await service.cancelOrder("admin-1", "order-1", { reason: "Hata" });

      expect(
        refundService.createPlatformCancellationRefund,
      ).toHaveBeenCalledTimes(1);
      expect(
        refundService.createPlatformCancellationRefund,
      ).toHaveBeenCalledWith("order-1", "admin-1", "Hata");
    });

    it("zorunlu denetim kaydını önce/sonra + gerekçeyle yazar", async () => {
      const { service, audit } = makeService({
        status: OrderStatus.preparing,
        checkoutGroupId: "group-1",
        shipment: { status: ShipmentStatus.label_created, shippedAt: null },
      });

      await service.cancelOrder("admin-1", "order-1", {
        reason: "Sahte sipariş",
      });

      expect(audit.createRequiredAuditLog).toHaveBeenCalledWith(
        "admin-1",
        "order_cancel",
        "Order",
        "order-1",
        {
          status: OrderStatus.preparing,
          cancellationType: null,
          cancelReason: null,
          shipmentStatus: ShipmentStatus.label_created,
          checkoutGroupId: "group-1",
          totalAmount: 1180,
        },
        expect.objectContaining({
          status: "cancelled",
          cancellationType: "iptal",
          reason: "Sahte sipariş",
          refundRequestId: "refund-1",
          refundNumber: "RFD-1",
          refundAmount: 1180,
        }),
      );
      expect(audit.createAuditLog).not.toHaveBeenCalled();
    });

    it("stok geri geldiği için ürün önbelleğini tazeler", async () => {
      const { service, orderService } = makeService();

      await service.cancelOrder("admin-1", "order-1", { reason: "Hata" });

      expect(orderService.invalidateProductCaches).toHaveBeenCalledWith(
        "product-1",
      );
    });
  });

  describe("reddedilen siparişler — çekirdeğe (paraya) hiç ulaşmaz", () => {
    it.each([
      [
        "ödeme bekleyen",
        { status: OrderStatus.pending_payment },
        BadRequestException,
        "server.admin.order.cancelNotPaid",
      ],
      [
        "zaten iptal",
        { status: OrderStatus.cancelled },
        ConflictException,
        "server.admin.order.cancelAlreadyClosed",
      ],
      [
        "iade edilmiş",
        { status: OrderStatus.refunded },
        ConflictException,
        "server.admin.order.cancelAlreadyClosed",
      ],
      [
        "kargoda",
        { status: OrderStatus.shipped },
        BadRequestException,
        "server.admin.order.cancelAfterHandover",
      ],
      [
        "teslim edilmiş",
        { status: OrderStatus.delivered },
        BadRequestException,
        "server.admin.order.cancelAfterHandover",
      ],
      [
        "tamamlanmış",
        { status: OrderStatus.completed },
        BadRequestException,
        "server.admin.order.cancelAfterHandover",
      ],
      [
        "preparing ama koli taşıyıcıda (picked_up)",
        {
          status: OrderStatus.preparing,
          shipment: { status: ShipmentStatus.picked_up, shippedAt: null },
        },
        BadRequestException,
        "server.admin.order.cancelAfterHandover",
      ],
      [
        "preparing, statü değişmemiş ama shippedAt mühürlü",
        {
          status: OrderStatus.preparing,
          shipment: {
            status: ShipmentStatus.label_created,
            shippedAt: new Date("2026-09-20T10:00:00.000Z"),
          },
        },
        BadRequestException,
        "server.admin.order.cancelAfterHandover",
      ],
      [
        "yarıda kalmış iptal talebi var (kargo öncesi açık talep)",
        { refundRequests: [{ id: "refund-open", refundNumber: "RFD-OPEN" }] },
        ConflictException,
        "server.admin.order.cancelPendingManualCompletion",
      ],
      [
        "iade sürecinde (refund_requested)",
        { status: OrderStatus.refund_requested },
        ConflictException,
        "server.admin.order.cancelActiveRefund",
      ],
    ])("%s", async (_, order, errorType, key) => {
      const { service, refundService, audit } = makeService(order);

      const attempt = service.cancelOrder("admin-1", "order-1", {
        reason: "Gerekçe",
      });

      await expect(attempt).rejects.toBeInstanceOf(errorType);
      await expect(attempt).rejects.toMatchObject({
        response: { i18nKey: key },
      });
      expect(
        refundService.createPlatformCancellationRefund,
      ).not.toHaveBeenCalled();
      expect(audit.createRequiredAuditLog).not.toHaveBeenCalled();
    });

    it("bulunamayan sipariş → 404", async () => {
      const { service, refundService } = makeService(null);

      await expect(
        service.cancelOrder("admin-1", "missing", { reason: "Gerekçe" }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(
        refundService.createPlatformCancellationRefund,
      ).not.toHaveBeenCalled();
    });

    it("yalnız boşluktan oluşan gerekçeyi reddeder", async () => {
      const { service, refundService } = makeService();

      await expect(
        service.cancelOrder("admin-1", "order-1", { reason: "   " }),
      ).rejects.toMatchObject({
        response: { i18nKey: "server.admin.order.cancelReasonRequired" },
      });
      expect(
        refundService.createPlatformCancellationRefund,
      ).not.toHaveBeenCalled();
    });
  });

  describe("idempotency", () => {
    it("PSP hatasıyla yarıda kalan iptalin tekrarı, talebi İade Talepleri'ne yönlendirir", async () => {
      const { service, prisma, refundService } = makeService();
      const pspFailure = new BadRequestException({
        i18nKey: "server.payment.paytrRefundFailed",
      });
      refundService.createPlatformCancellationRefund.mockRejectedValueOnce(
        pspFailure,
      );

      await expect(
        service.cancelOrder("admin-1", "order-1", { reason: "Hata" }),
      ).rejects.toBe(pspFailure);
      // Çekirdek talebi incelemeye aldı: sipariş hâlâ paid, talep açık.
      prisma.order.findUnique.mockResolvedValue({
        ...baseOrder,
        refundRequests: [{ id: "refund-1", refundNumber: "RFD-1" }],
      });

      await expect(
        service.cancelOrder("admin-1", "order-1", { reason: "Hata" }),
      ).rejects.toMatchObject({
        status: 409,
        response: {
          i18nKey: "server.admin.order.cancelPendingManualCompletion",
          i18nParams: { refundNumber: "RFD-1" },
        },
      });
      expect(
        refundService.createPlatformCancellationRefund,
      ).toHaveBeenCalledTimes(1);
    });

    it("ikinci çağrı (sipariş artık iptal) ikinci iade üretmez", async () => {
      const { service, prisma, refundService } = makeService();

      await service.cancelOrder("admin-1", "order-1", { reason: "Hata" });
      // İlk çağrı processRefund ile siparişi cancelled yazdı.
      prisma.order.findUnique.mockResolvedValue({
        ...baseOrder,
        status: OrderStatus.cancelled,
        cancellationType: "iptal",
      });

      await expect(
        service.cancelOrder("admin-1", "order-1", { reason: "Hata" }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(
        refundService.createPlatformCancellationRefund,
      ).toHaveBeenCalledTimes(1);
    });

    it("eşzamanlı ikinci istek çekirdeğin aktif-talep korumasına takılır ve denetime düşer", async () => {
      const { service, refundService, audit } = makeService();
      // Ön kontrol ikisinde de geçer; çekirdek (satır kilidi + kısmi tekil
      // indeks) ikinci talebi alreadyActive ile reddeder.
      const duplicate = new BadRequestException({
        i18nKey: "server.refund.alreadyActive",
      });
      refundService.createPlatformCancellationRefund.mockRejectedValueOnce(
        duplicate,
      );

      await expect(
        service.cancelOrder("admin-1", "order-1", { reason: "Hata" }),
      ).rejects.toBe(duplicate);
      expect(audit.createRequiredAuditLog).not.toHaveBeenCalled();
      expect(audit.createAuditLog).toHaveBeenCalledWith(
        "admin-1",
        "order_cancel_failed",
        "Order",
        "order-1",
        expect.objectContaining({ status: OrderStatus.paid }),
        expect.objectContaining({ reason: "Hata" }),
      );
    });
  });

  describe("previewCancel", () => {
    it("uygun siparişte iptalle aynı çekirdeğin önizlemesini döner", async () => {
      const { service, refundService } = makeService();

      await expect(service.previewCancel("order-1")).resolves.toEqual({
        refundAmount: 1180,
        shippingRefunded: true,
      });
      expect(
        refundService.previewPlatformCancellationRefund,
      ).toHaveBeenCalledWith("order-1");
    });

    it("iptal edilemeyen siparişte iptalle aynı hatayı verir", async () => {
      const { service, refundService } = makeService({
        status: OrderStatus.shipped,
      });

      await expect(service.previewCancel("order-1")).rejects.toMatchObject({
        response: { i18nKey: "server.admin.order.cancelAfterHandover" },
      });
      expect(
        refundService.previewPlatformCancellationRefund,
      ).not.toHaveBeenCalled();
    });
  });
});
