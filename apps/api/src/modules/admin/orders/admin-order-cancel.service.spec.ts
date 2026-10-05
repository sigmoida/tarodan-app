import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { OrderStatus, ShipmentStatus } from "@prisma/client";
import type { AdminOrderCancelRequest } from "@tarodan/types";
import { AdminOrderCancelService } from "./admin-order-cancel.service";

/**
 * Admin "Siparişi iptal et" — ödenmemiş, kargo öncesi ödenmiş ve teklif
 * siparişi için TEK yol. Uygunluk panelle ORTAK kuraldır
 * (`adminOrderCancelEligibility`); para/stok/kupon mantığı türün mevcut
 * çekirdeğindedir (ödenmemiş: OrderService.cancelUnpaidOrderInTx; ödenmiş:
 * RefundService.createPlatformCancellationRefund) — bu servis parayı hiç
 * hesaplamaz. Burada sabitlenen: hangi sipariş hangi çekirdeğe gider, hangi
 * engel hangi hatayı verir, önizleme→onay arasında tür değişirse ne olur,
 * çift gönderim, zorunlu denetim (fail-closed) ve başarısız denemenin kaydı,
 * taraflara TEK duyuru ve iç notun taraflara hiç ulaşmaması.
 */
describe("AdminOrderCancelService", () => {
  const NOTE = "İÇ NOT — alıcı ile telefonda konuşuldu";

  const baseOrder = {
    id: "order-1",
    orderNumber: "ORD-1",
    status: OrderStatus.paid as OrderStatus,
    origin: "direct_sale",
    offerId: null as string | null,
    buyerId: "buyer-1",
    sellerId: "seller-1",
    productId: "product-1",
    quantity: 2,
    version: 4,
    checkoutGroupId: null as string | null,
    reservationReleasedAt: null as Date | null,
    cancellationType: null as string | null,
    cancelReason: null as string | null,
    totalAmount: 1180,
    shipment: null as { status: ShipmentStatus; shippedAt: Date | null } | null,
    refundRequests: [] as Array<{ id: string; refundNumber: string }>,
    payment: null as { id: string } | null,
  };
  type Order = typeof baseOrder;

  const refundRow = {
    id: "refund-1",
    refundNumber: "RFD-1",
    amount: 1180,
    status: "refunded",
  };

  const request = (
    overrides: Partial<AdminOrderCancelRequest> = {},
  ): AdminOrderCancelRequest => ({
    reasonCode: "stock_error",
    note: NOTE,
    expectedKind: "paid_pre_handover",
    ...overrides,
  });

  /**
   * `order`: ön okumanın gördüğü satır; `locked`: kilit altında taze okunan
   * satır (verilmezse aynısı) — yarışlar ikisi ayrıştırılarak kurulur.
   */
  const makeService = (
    order: Partial<Order> | null = {},
    locked?: Partial<Order> | null,
  ) => {
    const plain = order === null ? null : { ...baseOrder, ...order };
    const fresh =
      locked === undefined
        ? plain
        : locked === null
          ? null
          : { ...baseOrder, ...locked };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: "order-1" }]),
      order: { findUnique: jest.fn().mockResolvedValue(fresh) },
    };
    const prisma = {
      order: { findUnique: jest.fn().mockResolvedValue(plain) },
      $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
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
      cancelUnpaidOrderInTx: jest.fn().mockResolvedValue({}),
      invalidateProductCaches: jest.fn().mockResolvedValue(undefined),
    };
    const paymentService = {
      hasLiveCharge: jest.fn().mockResolvedValue(false),
    };
    const notificationService = {
      notifyOrderCancelledByPlatform: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AdminOrderCancelService(
      prisma as any,
      audit as any,
      refundService as any,
      orderService as any,
      paymentService as any,
      notificationService as any,
    );
    return {
      service,
      prisma,
      tx,
      audit,
      refundService,
      orderService,
      paymentService,
      notificationService,
    };
  };

  /** Bir çağrının argümanlarında iç not geçiyor mu (taraf-yüzlü yükler). */
  const carriesNote = (calls: unknown[][]) =>
    JSON.stringify(calls).includes(NOTE);

  describe("ödenmemiş sipariş (unpaid) — alıcı iptaliyle aynı çekirdek", () => {
    const unpaid = { status: OrderStatus.pending_payment };

    it("kilit altında yeniden okur, ortak çekirdeği platform aktörü ve katalog koduyla çalıştırır; para yoluna girmez", async () => {
      const { service, tx, orderService, refundService } = makeService(unpaid);

      const result = await service.cancelOrder(
        "admin-1",
        "order-1",
        request({ expectedKind: "unpaid" }),
      );

      expect(tx.$queryRaw).toHaveBeenCalled();
      expect(orderService.cancelUnpaidOrderInTx).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ id: "order-1", version: 4 }),
        {
          reason: "Yönetici tarafından iptal edildi: Stok hatası",
          ledgerReason: "admin_cancelled",
          adminReasonCode: "stock_error",
        },
      );
      expect(
        refundService.createPlatformCancellationRefund,
      ).not.toHaveBeenCalled();
      expect(result).toEqual({ orderId: "order-1", kind: "unpaid" });
    });

    it("zorunlu denetimi iptalle AYNI işlemde yazar (önce/sonra, neden, not, taraflar)", async () => {
      const { service, tx, audit } = makeService(unpaid);

      await service.cancelOrder(
        "admin-1",
        "order-1",
        request({ expectedKind: "unpaid" }),
      );

      expect(audit.createRequiredAuditLog).toHaveBeenCalledTimes(1);
      expect(audit.createRequiredAuditLog).toHaveBeenCalledWith(
        "admin-1",
        "order_cancel",
        "Order",
        "order-1",
        expect.objectContaining({
          status: OrderStatus.pending_payment,
          buyerId: "buyer-1",
          sellerId: "seller-1",
        }),
        expect.objectContaining({
          kind: "unpaid",
          status: "cancelled",
          cancelledBy: "platform",
          reasonCode: "stock_error",
          note: NOTE,
          buyerId: "buyer-1",
          sellerId: "seller-1",
        }),
        tx,
      );
      expect(audit.createAuditLog).not.toHaveBeenCalled();
    });

    it("taraflara TEK duyuru: 'ödeme yok' (refundAmount null), not olmadan", async () => {
      const { service, notificationService, orderService } =
        makeService(unpaid);

      await service.cancelOrder(
        "admin-1",
        "order-1",
        request({ expectedKind: "unpaid" }),
      );

      expect(
        notificationService.notifyOrderCancelledByPlatform,
      ).toHaveBeenCalledTimes(1);
      expect(
        notificationService.notifyOrderCancelledByPlatform,
      ).toHaveBeenCalledWith({
        orderId: "order-1",
        reasonCode: "stock_error",
        refundAmount: null,
      });
      expect(
        carriesNote(
          notificationService.notifyOrderCancelledByPlatform.mock.calls,
        ),
      ).toBe(false);
      expect(carriesNote(orderService.cancelUnpaidOrderInTx.mock.calls)).toBe(
        false,
      );
      expect(orderService.invalidateProductCaches).toHaveBeenCalledWith(
        "product-1",
      );
    });

    it("teklif siparişi aynı uçtan geçer; bağlı teklif yönetici gerekçesiyle kapanır", async () => {
      const { service, orderService } = makeService({
        ...unpaid,
        origin: "offer",
        offerId: "offer-1",
      });

      const result = await service.cancelOrder(
        "admin-1",
        "order-1",
        request({ expectedKind: "unpaid", reasonCode: "suspicious_activity" }),
      );

      expect(orderService.cancelUnpaidOrderInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ offerId: "offer-1" }),
        {
          reason: "Yönetici tarafından iptal edildi: Şüpheli işlem",
          ledgerReason: "admin_cancelled",
          adminReasonCode: "suspicious_activity",
          offerCancelReason: "Yönetici tarafından iptal edildi: Şüpheli işlem",
        },
      );
      expect(result.kind).toBe("unpaid");
    });

    it("canlı 3DS çekimi varsa 409 — kapatılmaz (orphan capture'a karşı)", async () => {
      const { service, paymentService, orderService, tx } = makeService(unpaid);
      paymentService.hasLiveCharge.mockResolvedValue(true);

      await expect(
        service.cancelOrder(
          "admin-1",
          "order-1",
          request({ expectedKind: "unpaid" }),
        ),
      ).rejects.toMatchObject({
        status: 409,
        response: { i18nKey: "server.admin.order.cancelPaymentInFlight" },
      });
      expect(paymentService.hasLiveCharge).toHaveBeenCalledWith(tx, "order-1");
      expect(orderService.cancelUnpaidOrderInTx).not.toHaveBeenCalled();
    });

    it("denetim yazılamazsa iptal de olmaz (fail-closed): hata yükselir, duyuru gitmez", async () => {
      const { service, audit, notificationService } = makeService(unpaid);
      audit.createRequiredAuditLog.mockRejectedValue(new Error("audit down"));

      await expect(
        service.cancelOrder(
          "admin-1",
          "order-1",
          request({ expectedKind: "unpaid" }),
        ),
      ).rejects.toThrow("audit down");
      // Denetim, çekirdeğin yazımlarıyla aynı işlemde: işlem geri alınır.
      expect(
        notificationService.notifyOrderCancelledByPlatform,
      ).not.toHaveBeenCalled();
      expect(audit.createAuditLog).toHaveBeenCalledWith(
        "admin-1",
        "order_cancel_failed",
        "Order",
        "order-1",
        expect.anything(),
        expect.objectContaining({ error: "audit down" }),
      );
    });
  });

  describe("kargo öncesi ödenmiş sipariş — alıcı iptaliyle aynı para çekirdeği", () => {
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
      "%s → platform iptali yalnız katalog KODUYLA çekirdeğe gider",
      async (_, order) => {
        const { service, refundService, orderService } = makeService(order);

        const result = await service.cancelOrder(
          "admin-1",
          "order-1",
          request(),
        );

        expect(
          refundService.createPlatformCancellationRefund,
        ).toHaveBeenCalledWith("order-1", "admin-1", "stock_error");
        expect(
          carriesNote(
            refundService.createPlatformCancellationRefund.mock.calls,
          ),
        ).toBe(false);
        expect(orderService.cancelUnpaidOrderInTx).not.toHaveBeenCalled();
        expect(result).toEqual({
          orderId: "order-1",
          kind: "paid_pre_handover",
          refundRequestId: "refund-1",
          refundNumber: "RFD-1",
          refundAmount: 1180,
        });
      },
    );

    it("teklif siparişi (ödenmiş) aynı çekirdekten geçer", async () => {
      const { service, refundService } = makeService({
        status: OrderStatus.preparing,
        origin: "offer",
        offerId: "offer-1",
      });

      await service.cancelOrder("admin-1", "order-1", request());

      expect(
        refundService.createPlatformCancellationRefund,
      ).toHaveBeenCalledWith("order-1", "admin-1", "stock_error");
    });

    it("zorunlu NİYET kaydı paradan ÖNCE, tamamlanma kaydı sonra (iade no + tutar)", async () => {
      const { service, audit, refundService } = makeService({
        checkoutGroupId: "group-1",
      });
      const order: string[] = [];
      audit.createRequiredAuditLog.mockImplementation(
        async (_admin: string, action: string) => {
          order.push(action);
        },
      );
      refundService.createPlatformCancellationRefund.mockImplementation(
        async () => {
          order.push("core");
          return refundRow;
        },
      );

      await service.cancelOrder("admin-1", "order-1", request());

      expect(order).toEqual(["order_cancel_requested", "core", "order_cancel"]);
      expect(audit.createRequiredAuditLog).toHaveBeenLastCalledWith(
        "admin-1",
        "order_cancel",
        "Order",
        "order-1",
        expect.objectContaining({
          status: OrderStatus.paid,
          checkoutGroupId: "group-1",
          totalAmount: 1180,
        }),
        expect.objectContaining({
          kind: "paid_pre_handover",
          status: "cancelled",
          cancelledBy: "platform",
          reasonCode: "stock_error",
          note: NOTE,
          refundRequestId: "refund-1",
          refundNumber: "RFD-1",
          refundAmount: 1180,
          buyerId: "buyer-1",
          sellerId: "seller-1",
        }),
      );
    });

    it("niyet kaydı yazılamazsa para yoluna HİÇ girilmez (fail-closed)", async () => {
      const { service, audit, refundService, notificationService } =
        makeService();
      audit.createRequiredAuditLog.mockRejectedValueOnce(
        new Error("audit down"),
      );

      await expect(
        service.cancelOrder("admin-1", "order-1", request()),
      ).rejects.toThrow("audit down");
      expect(
        refundService.createPlatformCancellationRefund,
      ).not.toHaveBeenCalled();
      expect(
        notificationService.notifyOrderCancelledByPlatform,
      ).not.toHaveBeenCalled();
    });

    it("para çıktıktan sonra tamamlanma kaydı yazılamazsa iptal başarılı döner (geri alınamaz) ve duyuru gider", async () => {
      const { service, audit, notificationService } = makeService();
      audit.createRequiredAuditLog
        .mockResolvedValueOnce(undefined) // niyet
        .mockRejectedValueOnce(new Error("audit down")); // tamamlanma

      await expect(
        service.cancelOrder("admin-1", "order-1", request()),
      ).resolves.toMatchObject({ kind: "paid_pre_handover" });
      expect(
        notificationService.notifyOrderCancelledByPlatform,
      ).toHaveBeenCalledWith({
        orderId: "order-1",
        reasonCode: "stock_error",
        refundAmount: 1180,
      });
      // Başarılı iptal "başarısız deneme" olarak kaydedilmez.
      expect(audit.createAuditLog).not.toHaveBeenCalled();
    });

    it("taraflara TEK duyuru: iade tutarıyla, not olmadan", async () => {
      const { service, notificationService } = makeService();

      await service.cancelOrder("admin-1", "order-1", request());

      expect(
        notificationService.notifyOrderCancelledByPlatform,
      ).toHaveBeenCalledTimes(1);
      expect(
        carriesNote(
          notificationService.notifyOrderCancelledByPlatform.mock.calls,
        ),
      ).toBe(false);
    });

    it("PSP hatası: başarısız deneme denetime düşer, duyuru gitmez, asıl hata yükselir", async () => {
      const { service, refundService, audit, notificationService } =
        makeService();
      const pspFailure = new BadRequestException({
        i18nKey: "server.payment.paytrRefundFailed",
      });
      refundService.createPlatformCancellationRefund.mockRejectedValueOnce(
        pspFailure,
      );

      await expect(
        service.cancelOrder("admin-1", "order-1", request()),
      ).rejects.toBe(pspFailure);
      expect(audit.createAuditLog).toHaveBeenCalledWith(
        "admin-1",
        "order_cancel_failed",
        "Order",
        "order-1",
        expect.objectContaining({ status: OrderStatus.paid }),
        expect.objectContaining({
          expectedKind: "paid_pre_handover",
          reasonCode: "stock_error",
          note: NOTE,
        }),
      );
      expect(
        notificationService.notifyOrderCancelledByPlatform,
      ).not.toHaveBeenCalled();
    });
  });

  describe("reddedilen siparişler — çekirdeğe hiç ulaşmaz, deneme kaydedilir", () => {
    it.each([
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
        "server.admin.order.cancelAfterDelivery",
      ],
      [
        "alıcı onayı bekleyen",
        { status: OrderStatus.awaiting_buyer_confirmation },
        BadRequestException,
        "server.admin.order.cancelAfterDelivery",
      ],
      [
        "tamamlanmış",
        { status: OrderStatus.completed },
        BadRequestException,
        "server.admin.order.cancelAfterCompletion",
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
      const {
        service,
        refundService,
        orderService,
        audit,
        notificationService,
      } = makeService(order);

      const attempt = service.cancelOrder("admin-1", "order-1", request());

      await expect(attempt).rejects.toBeInstanceOf(errorType);
      await expect(attempt).rejects.toMatchObject({
        response: { i18nKey: key },
      });
      expect(
        refundService.createPlatformCancellationRefund,
      ).not.toHaveBeenCalled();
      expect(orderService.cancelUnpaidOrderInTx).not.toHaveBeenCalled();
      expect(audit.createRequiredAuditLog).not.toHaveBeenCalled();
      expect(audit.createAuditLog).toHaveBeenCalledWith(
        "admin-1",
        "order_cancel_failed",
        "Order",
        "order-1",
        expect.anything(),
        expect.objectContaining({ reasonCode: "stock_error" }),
      );
      expect(
        notificationService.notifyOrderCancelledByPlatform,
      ).not.toHaveBeenCalled();
    });

    it("bulunamayan sipariş → 404", async () => {
      const { service, refundService } = makeService(null);

      await expect(
        service.cancelOrder("admin-1", "missing", request()),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(
        refundService.createPlatformCancellationRefund,
      ).not.toHaveBeenCalled();
    });
  });

  describe("istek doğrulaması (paylaşılan kural)", () => {
    it.each([
      [
        "katalog dışı neden",
        { reasonCode: "made_up" as never },
        "server.admin.order.cancelReasonRequired",
      ],
      [
        "'Diğer' + boş not",
        { reasonCode: "other" as const, note: "   " },
        "server.admin.order.cancelNoteRequired",
      ],
      [
        "üst sınırı aşan not",
        { note: "a".repeat(501) },
        "server.admin.order.cancelNoteTooLong",
      ],
    ])("%s → 400, siparişe bile bakılmaz", async (_, overrides, key) => {
      const { service, prisma } = makeService();

      await expect(
        service.cancelOrder("admin-1", "order-1", request(overrides)),
      ).rejects.toMatchObject({ status: 400, response: { i18nKey: key } });
      expect(prisma.order.findUnique).not.toHaveBeenCalled();
    });

    it("'Diğer' notla geçer; not kırpılıp yalnız denetime yazılır", async () => {
      const { service, audit, refundService } = makeService();

      await service.cancelOrder(
        "admin-1",
        "order-1",
        request({ reasonCode: "other", note: "  Ayrıntı  " }),
      );

      expect(
        refundService.createPlatformCancellationRefund,
      ).toHaveBeenCalledWith("order-1", "admin-1", "other");
      expect(audit.createRequiredAuditLog).toHaveBeenLastCalledWith(
        "admin-1",
        "order_cancel",
        "Order",
        "order-1",
        expect.anything(),
        expect.objectContaining({ reasonCode: "other", note: "Ayrıntı" }),
      );
    });
  });

  describe("önizleme ile onay arasında sipariş ödendi — sessiz geçiş yok", () => {
    it("ön okuma zaten ödenmiş görürse 'para yok' onayı 409 ile durur", async () => {
      const { service, refundService, orderService, audit } = makeService({
        status: OrderStatus.preparing,
      });

      await expect(
        service.cancelOrder(
          "admin-1",
          "order-1",
          request({ expectedKind: "unpaid" }),
        ),
      ).rejects.toMatchObject({
        status: 409,
        response: { i18nKey: "server.admin.order.cancelKindChanged" },
      });
      expect(
        refundService.createPlatformCancellationRefund,
      ).not.toHaveBeenCalled();
      expect(orderService.cancelUnpaidOrderInTx).not.toHaveBeenCalled();
      expect(audit.createAuditLog).toHaveBeenCalledWith(
        "admin-1",
        "order_cancel_failed",
        "Order",
        "order-1",
        expect.anything(),
        expect.objectContaining({ expectedKind: "unpaid" }),
      );
    });

    it("ödeme callback'i ön okuma ile kilit arasında tamamlandıysa kilit altındaki tekrar okuma 409 verir; çekirdek çalışmaz", async () => {
      const { service, orderService, refundService, notificationService } =
        makeService(
          { status: OrderStatus.pending_payment },
          { status: OrderStatus.preparing, version: 5 },
        );

      await expect(
        service.cancelOrder(
          "admin-1",
          "order-1",
          request({ expectedKind: "unpaid" }),
        ),
      ).rejects.toMatchObject({
        status: 409,
        response: { i18nKey: "server.admin.order.cancelKindChanged" },
      });
      expect(orderService.cancelUnpaidOrderInTx).not.toHaveBeenCalled();
      expect(
        refundService.createPlatformCancellationRefund,
      ).not.toHaveBeenCalled();
      expect(
        notificationService.notifyOrderCancelledByPlatform,
      ).not.toHaveBeenCalled();
    });

    it("ödenmiş önizlemesi, sipariş hâlâ ödenmişken olduğu gibi devam eder", async () => {
      const { service, refundService } = makeService({
        status: OrderStatus.paid,
      });

      await service.cancelOrder(
        "admin-1",
        "order-1",
        request({ expectedKind: "paid_pre_handover" }),
      );

      expect(
        refundService.createPlatformCancellationRefund,
      ).toHaveBeenCalledTimes(1);
    });
  });

  describe("çift gönderim / eşzamanlı aktörler", () => {
    it("ödenmemiş: ikinci gönderimde sipariş kilit altında kapanmış görünür → 409, çekirdek ve duyuru bir kez", async () => {
      const { service, tx, orderService, notificationService } = makeService({
        status: OrderStatus.pending_payment,
      });

      await service.cancelOrder(
        "admin-1",
        "order-1",
        request({ expectedKind: "unpaid" }),
      );
      // İlk işlem commit etti: ikinci isteğin kilit altındaki okuması iptal görür.
      tx.order.findUnique.mockResolvedValue({
        ...baseOrder,
        status: OrderStatus.cancelled,
      });

      await expect(
        service.cancelOrder(
          "admin-1",
          "order-1",
          request({ expectedKind: "unpaid" }),
        ),
      ).rejects.toMatchObject({
        status: 409,
        response: { i18nKey: "server.admin.order.cancelAlreadyClosed" },
      });
      expect(orderService.cancelUnpaidOrderInTx).toHaveBeenCalledTimes(1);
      expect(
        notificationService.notifyOrderCancelledByPlatform,
      ).toHaveBeenCalledTimes(1);
    });

    it("ödenmemiş: alıcı ya da 24s süpürmesi az önce kapattıysa kilit altında 'closed'", async () => {
      const { service, orderService } = makeService(
        { status: OrderStatus.pending_payment },
        { status: OrderStatus.cancelled },
      );

      await expect(
        service.cancelOrder(
          "admin-1",
          "order-1",
          request({ expectedKind: "unpaid" }),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(orderService.cancelUnpaidOrderInTx).not.toHaveBeenCalled();
    });

    it("ödenmiş: ikinci çağrı (sipariş artık iptal) ikinci iade üretmez", async () => {
      const { service, prisma, refundService, notificationService } =
        makeService();

      await service.cancelOrder("admin-1", "order-1", request());
      prisma.order.findUnique.mockResolvedValue({
        ...baseOrder,
        status: OrderStatus.cancelled,
        cancellationType: "iptal",
      });

      await expect(
        service.cancelOrder("admin-1", "order-1", request()),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(
        refundService.createPlatformCancellationRefund,
      ).toHaveBeenCalledTimes(1);
      expect(
        notificationService.notifyOrderCancelledByPlatform,
      ).toHaveBeenCalledTimes(1);
    });

    it("ödenmiş: eşzamanlı ikinci istek çekirdeğin aktif-talep korumasına takılır ve denetime düşer", async () => {
      const { service, refundService, audit } = makeService();
      const duplicate = new BadRequestException({
        i18nKey: "server.refund.alreadyActive",
      });
      refundService.createPlatformCancellationRefund.mockRejectedValueOnce(
        duplicate,
      );

      await expect(
        service.cancelOrder("admin-1", "order-1", request()),
      ).rejects.toBe(duplicate);
      expect(audit.createAuditLog).toHaveBeenCalledWith(
        "admin-1",
        "order_cancel_failed",
        "Order",
        "order-1",
        expect.objectContaining({ status: OrderStatus.paid }),
        expect.objectContaining({ reasonCode: "stock_error" }),
      );
    });

    it("ödenmiş: satıcı az önce kargoladıysa çekirdeğin kilit altı kontrolü reddeder; duyuru gitmez", async () => {
      const { service, refundService, notificationService } = makeService();
      refundService.createPlatformCancellationRefund.mockRejectedValueOnce(
        new BadRequestException({
          i18nKey: "server.refund.orderStatusChanged",
        }),
      );

      await expect(
        service.cancelOrder("admin-1", "order-1", request()),
      ).rejects.toMatchObject({
        response: { i18nKey: "server.refund.orderStatusChanged" },
      });
      expect(
        notificationService.notifyOrderCancelledByPlatform,
      ).not.toHaveBeenCalled();
    });

    it("PSP hatasıyla yarıda kalan iptalin tekrarı, talebi İade Talepleri'ne yönlendirir", async () => {
      const { service, prisma, refundService } = makeService();
      refundService.createPlatformCancellationRefund.mockRejectedValueOnce(
        new BadRequestException({
          i18nKey: "server.payment.paytrRefundFailed",
        }),
      );
      await expect(
        service.cancelOrder("admin-1", "order-1", request()),
      ).rejects.toBeDefined();
      // Çekirdek talebi incelemeye aldı: sipariş hâlâ paid, talep açık.
      prisma.order.findUnique.mockResolvedValue({
        ...baseOrder,
        refundRequests: [{ id: "refund-1", refundNumber: "RFD-1" }],
      });

      await expect(
        service.cancelOrder("admin-1", "order-1", request()),
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
  });

  describe("bildirim hatası iptali bozmaz", () => {
    it("duyuru hata verse de iptal sonucu döner", async () => {
      const { service, notificationService } = makeService();
      notificationService.notifyOrderCancelledByPlatform.mockRejectedValue(
        new Error("mail down"),
      );

      await expect(
        service.cancelOrder("admin-1", "order-1", request()),
      ).resolves.toMatchObject({ kind: "paid_pre_handover" });
    });
  });

  describe("previewCancel", () => {
    it("ödenmemiş: para yok, rezervasyon tutuluyorsa serbest kalacak adet", async () => {
      const { service, refundService } = makeService({
        status: OrderStatus.pending_payment,
      });

      await expect(service.previewCancel("order-1")).resolves.toEqual({
        kind: "unpaid",
        quantity: 2,
        reservation: "held",
      });
      expect(
        refundService.previewPlatformCancellationRefund,
      ).not.toHaveBeenCalled();
    });

    it("ödenmemiş, rezervasyonu süpürme zaten bırakmış", async () => {
      const { service } = makeService({
        status: OrderStatus.pending_payment,
        reservationReleasedAt: new Date("2026-10-01T10:00:00.000Z"),
      });

      await expect(service.previewCancel("order-1")).resolves.toMatchObject({
        kind: "unpaid",
        reservation: "already_released",
      });
    });

    it("ödemesi hiç başlatılmamış teklif siparişi: ayrılmış stok yok (serbest kalacak denmez)", async () => {
      const { service } = makeService({
        status: OrderStatus.pending_payment,
        origin: "offer",
        offerId: "offer-1",
        payment: null,
      });

      await expect(service.previewCancel("order-1")).resolves.toMatchObject({
        kind: "unpaid",
        reservation: "not_reserved",
      });
    });

    it("ilk ödeme denemesinden sonraki teklif siparişi rezervini tutar", async () => {
      const { service } = makeService({
        status: OrderStatus.pending_payment,
        origin: "offer",
        offerId: "offer-1",
        payment: { id: "pay-1" },
      });

      await expect(service.previewCancel("order-1")).resolves.toMatchObject({
        kind: "unpaid",
        reservation: "held",
      });
    });

    it("ödenmiş: iptalle aynı çekirdeğin tutarı + geri eklenecek adet", async () => {
      const { service, refundService } = makeService();

      await expect(service.previewCancel("order-1")).resolves.toEqual({
        kind: "paid_pre_handover",
        quantity: 2,
        refundAmount: 1180,
        shippingRefunded: true,
      });
      expect(
        refundService.previewPlatformCancellationRefund,
      ).toHaveBeenCalledWith("order-1");
    });

    it("iptal edilemeyen siparişte iptalle aynı hatayı verir", async () => {
      const { service, refundService } = makeService({
        status: OrderStatus.delivered,
      });

      await expect(service.previewCancel("order-1")).rejects.toMatchObject({
        response: { i18nKey: "server.admin.order.cancelAfterDelivery" },
      });
      expect(
        refundService.previewPlatformCancellationRefund,
      ).not.toHaveBeenCalled();
    });
  });
});
