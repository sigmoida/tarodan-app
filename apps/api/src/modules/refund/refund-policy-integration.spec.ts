import {
  OrderStatus,
  PaymentStatus,
  RefundReason,
  RefundRequestStatus,
  ShipmentStatus,
} from "@prisma/client";
import { BadRequestException } from "@nestjs/common";
import { RefundService } from "./refund.service";
import { flatPackageTiers } from "../shipping/testing/tariff-fixture";

describe("RefundService policy integration", () => {
  const baseOrder = {
    id: "order-1",
    orderNumber: "B-1001",
    buyerId: "buyer-1",
    sellerId: "seller-1",
    status: OrderStatus.shipped,
    totalAmount: 1180,
    quantity: 1,
    shippingCost: 130,
    buyerShippingAmount: 130,
    buyerFeeAmount: 50,
    buyerServiceFeeAmount: 50,
    sellerFeeAmount: 100,
    sellerCommissionAmount: 40,
    sellerPlatformFeeAmount: 60,
    payment: { status: PaymentStatus.completed },
    checkoutGroup: null,
    shipment: {
      status: ShipmentStatus.in_transit,
      deliveredAt: null,
    },
    refundRequests: [],
    package: {
      shippingTariffId: "tariff-1",
      shippingTariffVersion: 3,
    },
    product: { shippingDesi: 2 },
  };

  const makeService = (order = baseOrder) => {
    const createdRows: any[] = [];
    const prisma = {
      order: { findUnique: jest.fn().mockResolvedValue(order) },
      refundRequest: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockImplementation(({ data }: any) => {
          const row = { id: "refund-1", ...data };
          createdRows.push(row);
          return Promise.resolve(row);
        }),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      paymentHold: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const shippingTariff = {
      getById: jest.fn().mockResolvedValue({
        id: "tariff-1",
        version: 3,
        provider: "surat",
        packageTiers: flatPackageTiers(180),
      }),
    };
    const payment = { processRefund: jest.fn() };
    const service = new RefundService(
      prisma as any,
      payment as any,
      {} as any,
      {} as any,
      {} as any,
      {
        createInAppNotification: jest.fn().mockResolvedValue(undefined),
        sendTemplateEmailToUser: jest.fn().mockResolvedValue(undefined),
      } as any,
      {} as any,
      shippingTariff as any,
    );
    return { service, prisma, payment, createdRows };
  };

  it("routes seller-fault claims to admin review with immutable exact amounts", async () => {
    const { service, prisma, payment, createdRows } = makeService();

    await service.createRefundRequest("order-1", "buyer-1", {
      reason: RefundReason.damaged,
      evidencePhotoUrls: ["https://example.com/evidence.jpg"],
    });

    expect(createdRows[0]).toMatchObject({
      status: RefundRequestStatus.pending_review,
      policyCode: "seller_fault_return",
      amount: 1180,
      returnBillableDesi: 2,
      returnShippingAmount: 180,
      returnShippingPayer: "seller",
      returnShippingChargeToSeller: 180,
      refundedSellerFeeAmount: 40,
      retainedSellerPlatformFeeAmount: 60,
      requiresAdminReview: true,
    });
    expect(prisma.paymentHold.updateMany).toHaveBeenCalled();
    expect(payment.processRefund).not.toHaveBeenCalled();
  });

  it("auto-approves buyer remorse while deducting return shipping and retained buyer fees", async () => {
    const { service, payment, createdRows } = makeService();

    await service.createRefundRequest("order-1", "buyer-1", {
      reason: RefundReason.changed_mind,
    });

    expect(createdRows[0]).toMatchObject({
      status: RefundRequestStatus.wait_for_delivery,
      policyCode: "buyer_remorse_return",
      amount: 820,
      returnShippingPayer: "buyer",
      returnShippingChargeToBuyer: 180,
      refundedOutboundShippingAmount: 0,
      refundedBuyerProtectionAmount: 0,
      refundedSellerFeeAmount: 100,
      requiresAdminReview: false,
    });
    expect(payment.processRefund).not.toHaveBeenCalled();
  });

  it("rejects seller-fault claims without evidence", async () => {
    const { service } = makeService();

    await expect(
      service.createRefundRequest("order-1", "buyer-1", {
        reason: RefundReason.wrong_item,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
