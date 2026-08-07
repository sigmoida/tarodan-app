import { RefundService } from "./refund.service";
import { RefundRequestStatus } from "@prisma/client";

/**
 * MONEY-M1: finalizeRefundForReturnedShipment concurrency-safe. 3 eşzamanlı çağıran
 * (cron + Sürat sync + admin) atomik CLAIM (return_delivered→refunded) ile tekilleşir;
 * yalnız kazanan processRefund + finalize yan-etkilerini yapar. processRefund patlarsa
 * claim geri alınır (return_delivered) → cron retry edebilir.
 */
describe("RefundService.finalizeRefundForReturnedShipment — MONEY-M1 CAS claim", () => {
  const makeService = (claimCount: number, processImpl: () => any) => {
    const rr = {
      id: "rr-1",
      status: RefundRequestStatus.return_delivered,
      orderId: "o1",
      amount: 100,
      refundQuantity: 1,
      requesterId: "buyer-1",
      refundNumber: "RF1",
      returnDeliveredAt: null,
      order: { sellerId: "s1" },
    };
    const prisma = {
      refundRequest: {
        findUnique: jest.fn().mockResolvedValue(rr),
        updateMany: jest.fn().mockResolvedValue({ count: claimCount }),
        update: jest.fn().mockResolvedValue(rr),
      },
      order: { update: jest.fn().mockResolvedValue({}) },
    };
    const paymentService = {
      processRefund: jest.fn(processImpl),
    };
    const service = new RefundService(
      prisma as any,
      paymentService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return { service, prisma, paymentService };
  };

  it("claim kaybedilirse (count=0, başka çağıran aldı): processRefund ÇAĞRILMAZ", async () => {
    const { service, paymentService } = makeService(0, () => ({
      providerRefundId: "x",
    }));

    await service.finalizeRefundForReturnedShipment("rr-1");

    expect(paymentService.processRefund).not.toHaveBeenCalled();
  });

  it("claim kazanılır ama processRefund patlarsa: claim return_delivered'a GERİ ALINIR", async () => {
    const { service, prisma, paymentService } = makeService(1, () => {
      throw new Error("PayTR down");
    });

    await expect(
      service.finalizeRefundForReturnedShipment("rr-1"),
    ).rejects.toThrow("PayTR down");

    expect(paymentService.processRefund).toHaveBeenCalledTimes(1);
    // revert: updateMany return_delivered + refundedAt:null ile çağrılmalı
    const revertCall = prisma.refundRequest.updateMany.mock.calls.find(
      ([arg]: [any]) =>
        arg?.data?.status === RefundRequestStatus.return_delivered &&
        arg?.data?.refundedAt === null,
    );
    expect(revertCall).toBeDefined();
  });
});
