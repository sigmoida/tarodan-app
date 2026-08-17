import { RefundRequestStatus, ShipmentStatus } from "@prisma/client";
import { NotificationType } from "../notification/dto/notification.dto";
import { RefundService } from "./refund.service";
import { RefundFinancialService } from "./refund-financial.service";
import { RefundShipmentService } from "./refund-shipment.service";
import { RefundCreationService } from "./refund-creation.service";
import { RefundDecisionService } from "./refund-decision.service";
import { warehouseAddressStub } from "../shipping/testing/warehouse-address-fixture";

describe("RefundService.applyReturnTrackingUpdate notifications", () => {
  const makeService = (currentStatus: ShipmentStatus | null) => {
    const updated = {
      id: "refund-1",
      refundNumber: "RFD-1",
      orderId: "order-1",
      requesterId: "buyer-1",
      returnTrackingNumber: "PKG-RETURN-1",
      order: { sellerId: "seller-1" },
    };
    const prisma = {
      refundRequest: {
        findUnique: jest.fn().mockResolvedValue({
          returnStatus: currentStatus,
          returnShippedAt: currentStatus ? new Date() : null,
        }),
        update: jest.fn().mockResolvedValue(updated),
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
    const safeNotify = jest
      .spyOn((service as any).notifications, "safeNotify")
      .mockResolvedValue(undefined);
    const sendRefundEmail = jest
      .spyOn((service as any).notifications, "sendRefundEmail")
      .mockResolvedValue(undefined);
    return { service, prisma, safeNotify, sendRefundEmail };
  };

  it("notifies both parties when a return enters Sürat return flow", async () => {
    const { service, prisma, safeNotify, sendRefundEmail } = makeService(null);

    await service.applyReturnTrackingUpdate("refund-1", {
      status: ShipmentStatus.return_in_progress,
      shippedAt: new Date("2026-08-07T10:00:00.000Z"),
    });

    expect(prisma.refundRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: RefundRequestStatus.return_in_transit,
          returnStatus: ShipmentStatus.return_in_progress,
        }),
      }),
    );
    expect(safeNotify).toHaveBeenCalledWith(
      "buyer-1",
      NotificationType.REFUND_RETURN_IN_TRANSIT,
      expect.any(Object),
    );
    expect(safeNotify).toHaveBeenCalledWith(
      "seller-1",
      NotificationType.REFUND_RETURN_SHIPPED_SELLER,
      expect.any(Object),
    );
    expect(sendRefundEmail).toHaveBeenCalledTimes(1);
  });

  it("does not resend notifications when the provider status is unchanged", async () => {
    const { service, safeNotify, sendRefundEmail } = makeService(
      ShipmentStatus.return_in_progress,
    );

    await service.applyReturnTrackingUpdate("refund-1", {
      status: ShipmentStatus.return_in_progress,
    });

    expect(safeNotify).not.toHaveBeenCalled();
    expect(sendRefundEmail).not.toHaveBeenCalled();
  });
});
