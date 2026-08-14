import { RefundRequestStatus, ShipmentStatus } from "@prisma/client";
import { RefundService } from "./refund.service";
import { RefundFinancialService } from "./refund-financial.service";
import { RefundShipmentService } from "./refund-shipment.service";
import { RefundCreationService } from "./refund-creation.service";
import { RefundDecisionService } from "./refund-decision.service";

describe("RefundService.openReturnShipment pre-advice", () => {
  it("opens the return with its reference while the real Sürat code is pending", async () => {
    const refund = {
      id: "refund-1",
      refundNumber: "RFD-1",
      requesterId: "buyer-1",
      orderId: "order-1",
      status: RefundRequestStatus.approved,
      returnTrackingNumber: null,
      returnBillableDesi: 2,
      order: {
        orderNumber: "ORD-1",
        shippingAddress: {
          fullName: "Buyer",
          address: "Buyer address",
          city: "İstanbul",
          district: "Kadıköy",
          phone: "05551112233",
        },
        buyer: { addresses: [] },
        seller: {
          displayName: "Seller",
          addresses: [
            {
              fullName: "Seller",
              address: "Seller address",
              city: "İstanbul",
              district: "Kadıköy",
              phone: "05554445566",
            },
          ],
        },
      },
    };
    const updated = {
      ...refund,
      status: RefundRequestStatus.return_shipment_open,
    };
    const prisma = {
      refundRequest: {
        findUnique: jest.fn().mockResolvedValue(refund),
        update: jest.fn().mockResolvedValue(updated),
      },
    };
    const cargo = {
      isEnabled: jest.fn().mockReturnValue(true),
      createShipment: jest.fn().mockResolvedValue({
        ok: true,
        trackingCode: null,
        labelData: null,
        providerMessage: "registered_pending_carrier_acceptance",
      }),
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
      cargo as any,
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
    jest
      .spyOn((service as any).notifications, "safeNotify")
      .mockResolvedValue(undefined);
    jest
      .spyOn((service as any).notifications, "sendRefundEmail")
      .mockResolvedValue(undefined);

    await expect(service.openReturnShipment("refund-1")).resolves.toBe(updated);

    expect(prisma.refundRequest.update).toHaveBeenCalledWith({
      where: { id: "refund-1" },
      data: {
        status: RefundRequestStatus.return_shipment_open,
        returnProvider: "surat",
        returnTrackingNumber: "RFD-1",
        returnProviderTrackingId: null,
        returnLabelZpl: null,
        returnStatus: ShipmentStatus.label_created,
        returnCreatedAt: expect.any(Date),
      },
    });
  });
});
