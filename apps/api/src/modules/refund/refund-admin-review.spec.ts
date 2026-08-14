import { RefundRequestStatus } from "@prisma/client";
import { RefundService } from "./refund.service";
import { RefundFinancialService } from "./refund-financial.service";
import { RefundShipmentService } from "./refund-shipment.service";
import { RefundCreationService } from "./refund-creation.service";
import { RefundDecisionService } from "./refund-decision.service";

describe("RefundService admin review", () => {
  const makeService = () => {
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
    };
    const notifications = {
      appendHistory: jest.fn(),
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
      {} as any,
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
    return { service, prisma };
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
