import { CancellationActor, RefundRequestStatus } from "@prisma/client";
import { RefundService } from "./refund.service";
import { RefundFinancialService } from "./refund-financial.service";
import { RefundShipmentService } from "./refund-shipment.service";
import { RefundCreationService } from "./refund-creation.service";
import { RefundDecisionService } from "./refund-decision.service";
import { warehouseAddressStub } from "../shipping/testing/warehouse-address-fixture";

describe("RefundService admin review", () => {
  const makeService = (
    rowOverrides: Record<string, unknown> = {},
    paymentService: Record<string, unknown> = {},
  ) => {
    const row = {
      id: "refund-1",
      refundNumber: "RFD-1",
      orderId: "order-1",
      requesterId: "buyer-1",
      policyCode: "seller_fault_return",
      status: RefundRequestStatus.pending_review,
      amount: 1180,
      refundQuantity: 1,
      refundedSellerFeeAmount: 40,
      refundedBuyerProtectionAmount: 50,
      order: {
        id: "order-1",
        sellerId: "seller-1",
        status: "shipped",
        quantity: 1,
      },
      ...rowOverrides,
    };
    const prisma = {
      refundRequest: {
        findUnique: jest.fn().mockResolvedValue(row),
        update: jest
          .fn()
          .mockImplementation(({ data }: any) =>
            Promise.resolve({ ...row, ...data }),
          ),
      },
      paymentHold: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      order: { update: jest.fn().mockResolvedValue({}) },
    };
    const notifications = {
      appendHistory: jest.fn(),
      notifyPlatformCancellation: jest.fn().mockResolvedValue(undefined),
      safeNotify: jest.fn(),
      notifyRefundRequestOpened: jest.fn(),
      sendRefundEmail: jest.fn(),
      toProductImageUrls: jest.fn().mockReturnValue([]),
    } as any;
    const financials = new RefundFinancialService(prisma as any, {} as any);
    // Kargo bacağı gerçek servisle kurulur ve AYNI notifications/financials
    // nesnelerini paylaşır — testlerin casusları bu nesnelere bakıyor.
    const shipments = new RefundShipmentService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      notifications as any,
      financials as any,
      warehouseAddressStub() as any,
    );
    const creation = new RefundCreationService(
      prisma as any,
      {} as any,
      notifications as any,
      financials as any,
      shipments as any,
    );
    const decisions = new RefundDecisionService(
      prisma as any,
      paymentService as any,
      notifications as any,
      financials as any,
      shipments as any,
    );
    const service = new RefundService(
      prisma as any,
      notifications as any,
      financials as any,
      shipments as any,
      creation as any,
      decisions as any,
    );
    jest
      .spyOn((service as any).notifications, "appendHistory")
      .mockResolvedValue(undefined);
    return { service, prisma, notifications };
  };

  it("approves a reviewed return into the delivery/return-shipment flow", async () => {
    const { service, prisma } = makeService();

    await service.adminApproveRefundRequest(
      "refund-1",
      "admin-1",
      "Kanıt doğrulandı",
    );

    expect(prisma.refundRequest.update).toHaveBeenCalledWith({
      where: { id: "refund-1" },
      data: expect.objectContaining({
        status: RefundRequestStatus.wait_for_delivery,
        decidedBy: "admin-1",
      }),
    });
  });

  it("approving a buyer's pre-shipment cancellation refunds it as the BUYER's cancellation", async () => {
    // Talebi alıcı açtı; yönetici yalnız onayladı — iptalin aktörü alıcıdır.
    const processRefund = jest.fn().mockRejectedValue(new Error("stop here"));
    const { service } = makeService(
      {
        policyCode: "buyer_remorse_cancellation",
        order: {
          id: "order-1",
          sellerId: "seller-1",
          status: "preparing",
          quantity: 1,
        },
      },
      { processRefund },
    );

    await expect(
      service.adminApproveRefundRequest("refund-1", "admin-1"),
    ).rejects.toThrow("stop here");

    expect(processRefund).toHaveBeenCalledWith(
      "order-1",
      1180,
      expect.objectContaining({
        idempotencyKey: "refund-request:refund-1",
        cancelledBy: CancellationActor.buyer,
      }),
    );
  });

  it("approving a stuck admin (platform) cancellation keeps the PLATFORM as the actor", async () => {
    // PSP hatasıyla incelemeye düşmüş admin iptali: onaylayan admin, ama
    // iptalin aktörü talebin işaretinden gelir — alıcıya yazılmaz.
    const processRefund = jest.fn().mockRejectedValue(new Error("stop here"));
    const { service } = makeService(
      {
        policyCode: "platform_cancellation",
        metadata: { cancellationActor: CancellationActor.platform },
        order: {
          id: "order-1",
          sellerId: "seller-1",
          status: "paid",
          quantity: 1,
        },
      },
      { processRefund },
    );

    await expect(
      service.adminApproveRefundRequest("refund-1", "admin-1"),
    ).rejects.toThrow("stop here");

    expect(processRefund).toHaveBeenCalledWith(
      "order-1",
      1180,
      expect.objectContaining({
        idempotencyKey: "refund-request:refund-1",
        cancelledBy: CancellationActor.platform,
      }),
    );
  });

  describe("incelemeye düşmüş yönetici iptalinin onayla tamamlanması", () => {
    const platformRow = {
      policyCode: "platform_cancellation",
      metadata: {
        cancellationActor: CancellationActor.platform,
        adminCancelReasonCode: "user_request",
      },
      order: {
        id: "order-1",
        sellerId: "seller-1",
        status: "paid",
        quantity: 1,
      },
    };

    it("talepteki neden kodunu processRefund'a verir (sipariş kapanırken yazılır) ve TEK platform duyurusu gönderir", async () => {
      const processRefund = jest.fn().mockResolvedValue({
        providerRefundId: "paytr-9",
        closedWithAdminReason: "user_request",
      });
      const { service, notifications } = makeService(platformRow, {
        processRefund,
      });

      await service.adminApproveRefundRequest("refund-1", "admin-1");

      expect(processRefund).toHaveBeenCalledWith(
        "order-1",
        1180,
        expect.objectContaining({
          skipRefundEvent: true,
          cancelledBy: CancellationActor.platform,
          adminCancelReasonCode: "user_request",
        }),
      );
      expect(notifications.notifyPlatformCancellation).toHaveBeenCalledTimes(1);
      expect(notifications.notifyPlatformCancellation).toHaveBeenCalledWith(
        "order-1",
        "user_request",
        1180,
      );
    });

    it.each([
      ["null (sonlandırma işlemi no-op)", null],
      [
        "idempotent sonuç",
        {
          providerRefundId: "paytr-9",
          idempotent: true,
          closedWithAdminReason: null,
        },
      ],
    ])(
      "eşzamanlı kurtarma iadeyi önce kesinleştirdiyse (%s) duyuruyu o göndermiştir — ikinci yok",
      async (_, result) => {
        const processRefund = jest.fn().mockResolvedValue(result);
        const { service, notifications } = makeService(platformRow, {
          processRefund,
        });

        await service.adminApproveRefundRequest("refund-1", "admin-1");

        expect(notifications.notifyPlatformCancellation).not.toHaveBeenCalled();
      },
    );

    it("sipariş arada başka yoldan iptal edildiyse (ör. kargolamama süpürmesi) iade onu platform iptali yapmaz: 'Tarodan iptal etti' duyurusu GİTMEZ", async () => {
      // processRefund siparişi zaten iptal buldu: aktörü korudu, kodu yazmadı.
      const processRefund = jest.fn().mockResolvedValue({
        providerRefundId: "paytr-9",
        closedWithAdminReason: null,
      });
      const { service, notifications } = makeService(platformRow, {
        processRefund,
      });

      await service.adminApproveRefundRequest("refund-1", "admin-1");

      // İade yine yönetici kodu ile istendi (kapatırsa yazılsın diye) …
      expect(processRefund).toHaveBeenCalledWith(
        "order-1",
        1180,
        expect.objectContaining({ adminCancelReasonCode: "user_request" }),
      );
      // … ama kayıtla çelişen duyuru gönderilmedi.
      expect(notifications.notifyPlatformCancellation).not.toHaveBeenCalled();
    });

    it("alıcının iptal talebinde kod yoktur, platform duyurusu gitmez", async () => {
      const processRefund = jest.fn().mockResolvedValue({
        providerRefundId: "paytr-9",
        closedWithAdminReason: null,
      });
      const { service, notifications } = makeService(
        {
          ...platformRow,
          policyCode: "buyer_remorse_cancellation",
          metadata: {},
        },
        { processRefund },
      );

      await service.adminApproveRefundRequest("refund-1", "admin-1");

      expect(processRefund).toHaveBeenCalledWith(
        "order-1",
        1180,
        expect.objectContaining({
          cancelledBy: CancellationActor.buyer,
          adminCancelReasonCode: null,
        }),
      );
      expect(notifications.notifyPlatformCancellation).not.toHaveBeenCalled();
    });
  });

  it("rejects a reviewed return and releases the frozen seller hold", async () => {
    const { service, prisma } = makeService();

    await service.adminRejectRefundRequest(
      "refund-1",
      "admin-1",
      "Kanıt talebi doğrulamıyor",
    );

    expect(prisma.refundRequest.update).toHaveBeenCalledWith({
      where: { id: "refund-1" },
      data: expect.objectContaining({
        status: RefundRequestStatus.rejected,
        decidedBy: "admin-1",
      }),
    });
    expect(prisma.paymentHold.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { frozenByRefundId: null },
      }),
    );
  });
});
