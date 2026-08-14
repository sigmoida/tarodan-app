import { RefundService } from "./refund.service";
import { RefundRequestStatus } from "@prisma/client";
import { RefundNotificationService } from "./refund-notification.service";

/**
 * MONEY-H6: donuk hold terminal kaçışı.
 *  - adminCloseRefundRequest: takılı iadeyi para iade ETMEDEN kapatır + hold kilidini kaldırır.
 *  - expireStaleWaitForDelivery: sipariş hiç teslim edilmediğinden wait_for_delivery'de takılan
 *    iadeleri süre dolunca iptal eder + hold kilidini kaldırır.
 */
describe("RefundService — MONEY-H6 frozen-hold terminal escape", () => {
  const makeService = (rr: any) => {
    const prisma = {
      refundRequest: {
        findUnique: jest.fn().mockResolvedValue(rr),
        update: jest.fn().mockImplementation(({ data }: any) => ({
          ...rr,
          ...data,
        })),
        findMany: jest.fn().mockResolvedValue(rr ? [rr] : []),
      },
      paymentHold: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const notificationService = {
      createInAppNotification: jest.fn().mockResolvedValue(undefined),
    };
    const service = new RefundService(
      prisma as any, // prisma
      {} as any, // paymentService
      {} as any, // cargoProvider
      {} as any, // carrierCancellationService
      {} as any, // suratTrackingService
      notificationService as any, // notificationService
      {} as any, // storageService
      new RefundNotificationService(
        prisma as any,
        notificationService as any,
        {} as any,
      ) as any, // notifications
    );
    return { service, prisma };
  };

  const rrBase = (status: RefundRequestStatus) => ({
    id: "rr-1",
    status,
    requesterId: "buyer-1",
    refundNumber: "RF1",
    order: { id: "o1", sellerId: "s1" },
    metadata: {},
  });

  describe("adminCloseRefundRequest", () => {
    it("takılı iadeyi (return_in_transit) kapatır + hold kilidini kaldırır", async () => {
      const { service, prisma } = makeService(
        rrBase(RefundRequestStatus.return_in_transit),
      );

      const res = await service.adminCloseRefundRequest(
        "rr-1",
        "admin-1",
        "no return",
      );

      expect(res.status).toBe(RefundRequestStatus.cancelled);
      // hold unfreeze: paymentHold.updateMany frozenByRefundId:null ile
      expect(prisma.paymentHold.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { frozenByRefundId: null },
        }),
      );
    });

    it("zaten refunded ise reddeder (hold'a dokunmaz)", async () => {
      const { service, prisma } = makeService(
        rrBase(RefundRequestStatus.refunded),
      );

      await expect(
        service.adminCloseRefundRequest("rr-1", "admin-1"),
      ).rejects.toThrow();
      expect(prisma.paymentHold.updateMany).not.toHaveBeenCalled();
    });

    it("zaten cancelled ise idempotent no-op (update yok)", async () => {
      const { service, prisma } = makeService(
        rrBase(RefundRequestStatus.cancelled),
      );

      const res = await service.adminCloseRefundRequest("rr-1", "admin-1");

      expect(res.status).toBe(RefundRequestStatus.cancelled);
      expect(prisma.refundRequest.update).not.toHaveBeenCalled();
      expect(prisma.paymentHold.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("expireStaleWaitForDelivery", () => {
    it("takılı wait_for_delivery iadesini iptal eder + hold kilidini kaldırır", async () => {
      const { service, prisma } = makeService(
        rrBase(RefundRequestStatus.wait_for_delivery),
      );

      const count = await service.expireStaleWaitForDelivery();

      expect(count).toBe(1);
      expect(prisma.refundRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: RefundRequestStatus.cancelled,
            decidedBy: "system",
          }),
        }),
      );
      expect(prisma.paymentHold.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { frozenByRefundId: null } }),
      );
    });

    it("takılı iade yoksa 0 döner", async () => {
      const { service } = makeService(null);
      const count = await service.expireStaleWaitForDelivery();
      expect(count).toBe(0);
    });
  });
});
