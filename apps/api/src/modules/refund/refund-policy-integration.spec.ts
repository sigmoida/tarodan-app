import {
  OrderStatus,
  PaymentStatus,
  RefundReason,
  RefundRequestStatus,
  SellerType,
  ShippingPackageTierCode,
  ShipmentStatus,
} from "@prisma/client";
import { BadRequestException } from "@nestjs/common";
import { RefundService } from "./refund.service";
import { flatPackageTiers } from "../shipping/testing/tariff-fixture";
import { NotificationType } from "../notification/dto/notification.dto";
import { RefundNotificationService } from "./refund-notification.service";
import { RefundFinancialService } from "./refund-financial.service";
import { RefundShipmentService } from "./refund-shipment.service";

describe("RefundService policy integration", () => {
  const baseOrder = {
    id: "order-1",
    orderNumber: "B-1001",
    buyerId: "buyer-1",
    sellerId: "seller-1",
    status: OrderStatus.shipped,
    totalAmount: 1180,
    subtotal: 1000,
    taxAmount: 0,
    buyerServiceTaxAmount: 0,
    serviceVatRate: 0,
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
      id: "package-1",
      shippingTariffId: "tariff-1",
      shippingTariffVersion: 3,
      billableDesi: 2,
      fullShippingAmount: 130,
      buyerShippingAmount: 130,
      sellerShippingAmount: 0,
    },
    packageId: "package-1",
    product: {
      shippingDesi: 2,
      shippingPackageTier: ShippingPackageTierCode.small,
    },
    seller: { sellerType: SellerType.individual as SellerType },
    version: 1,
    updatedAt: new Date("2026-08-11T00:00:00.000Z"),
  };

  const makeService = (
    order = baseOrder,
    platformSaleInvoice: { lineItems: unknown } | null = null,
  ) => {
    const createdRows: any[] = [];
    const prisma: any = {
      order: {
        findUnique: jest.fn().mockResolvedValue(order),
        // Paket kargosu PAKET başına bir kez iade edilir: kardeş satır sayısı
        // 0 → bu iade paketi kapatır (tek satırlık sipariş davranışı).
        count: jest.fn().mockResolvedValue(0),
      },
      refundRequest: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }: any) => {
          const row = {
            id: "refund-1",
            createdAt: new Date("2026-08-11T00:00:00.000Z"),
            updatedAt: new Date("2026-08-11T00:00:00.000Z"),
            ...data,
          };
          createdRows.push(row);
          return Promise.resolve(row);
        }),
        findUnique: jest.fn().mockImplementation(({ where }: any) => {
          const row = createdRows.find((item) => item.id === where.id);
          return Promise.resolve(row ? { ...row, order } : null);
        }),
        update: jest.fn().mockImplementation(({ where, data }: any) => {
          const row = createdRows.find((item) => item.id === where.id);
          if (row) Object.assign(row, data);
          return Promise.resolve({ ...row, order, financialComponents: [] });
        }),
        updateMany: jest.fn().mockImplementation(({ where, data }: any) => {
          const row = createdRows.find((item) => item.id === where.id);
          if (!row || row.policyFinalizedAt)
            return Promise.resolve({ count: 0 });
          Object.assign(row, data);
          return Promise.resolve({ count: 1 });
        }),
      },
      refundFinancialComponent: {
        createMany: jest.fn().mockImplementation(({ data }: any) => {
          const row = createdRows.find(
            (item) => item.id === data[0]?.refundRequestId,
          );
          if (row) row.financialComponents = data;
          return Promise.resolve({ count: data.length });
        }),
      },
      packageShippingSettlement: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      elogoInvoice: {
        findUnique: jest.fn().mockResolvedValue(platformSaleInvoice),
      },
      paymentHold: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      adminUser: {
        findMany: jest.fn().mockResolvedValue([{ userId: "admin-1" }]),
      },
    };
    prisma.$transaction = jest.fn((callback: any) => callback(prisma));
    const shippingTariff = {
      getById: jest.fn().mockResolvedValue({
        id: "tariff-1",
        version: 3,
        provider: "surat",
        packageTiers: flatPackageTiers(180),
      }),
      getActiveOutboundTariff: jest.fn().mockResolvedValue({
        id: "return-tariff-1",
        version: 4,
        provider: "surat",
        packageTiers: flatPackageTiers(180),
      }),
    };
    const payment = { processRefund: jest.fn() };
    const notification = {
      createInAppNotification: jest.fn().mockResolvedValue(undefined),
      sendTemplateEmailToUser: jest.fn().mockResolvedValue(undefined),
    };
    const notifications = new RefundNotificationService(
      prisma as any,
      notification as any,
      {} as any,
    );
    // Gerçek finansal servis: bu spec iade matematiğini uçtan uca doğrular,
    // stub geçmek testin konusunu ortadan kaldırırdı.
    const financials = new RefundFinancialService(
      prisma as any,
      notification as any,
      shippingTariff as any,
    );
    const service = new RefundService(
      prisma as any,
      payment as any,
      {} as any,
      {} as any,
      {} as any,
      notification as any,
      {} as any,
      notifications as any,
      financials as any,
      new RefundShipmentService(
        prisma as any,
        payment as any,
        {} as any,
        {} as any,
        {} as any,
        notifications as any,
        financials as any,
      ) as any,
      shippingTariff as any,
    );
    return { service, prisma, payment, notification, createdRows };
  };

  it("routes seller-fault claims to admin review with immutable exact amounts", async () => {
    const { service, prisma, payment, notification, createdRows } =
      makeService();

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
    expect(notification.createInAppNotification).toHaveBeenCalledWith(
      "seller-1",
      NotificationType.REFUND_REQUEST_RECEIVED_SELLER,
      expect.objectContaining({ orderId: "order-1" }),
    );
    expect(notification.createInAppNotification).toHaveBeenCalledWith(
      "admin-1",
      NotificationType.REFUND_REVIEW_REQUIRED_ADMIN,
      expect.objectContaining({
        refundRequestId: "refund-1",
        adminLink: expect.stringContaining(
          "/operations/refund-requests/refund-1",
        ),
      }),
    );
  });

  it("auto-approves buyer remorse while deducting return shipping and retained buyer fees", async () => {
    const { service, prisma, payment, notification, createdRows } =
      makeService();

    await service.createRefundRequest("order-1", "buyer-1", {
      reason: RefundReason.changed_mind,
    });

    expect(createdRows[0]).toMatchObject({
      status: RefundRequestStatus.wait_for_delivery,
      policyVersion: 2,
      policyCode: "v2_buyer_return",
      amount: 820,
      returnShippingPayer: "buyer",
      returnShippingChargeToBuyer: 180,
      refundedOutboundShippingAmount: 0,
      refundedBuyerProtectionAmount: 0,
      refundedSellerFeeAmount: 100,
      requiresAdminReview: false,
    });
    expect(payment.processRefund).not.toHaveBeenCalled();
    expect(notification.createInAppNotification).toHaveBeenCalledWith(
      "seller-1",
      NotificationType.REFUND_REQUEST_RECEIVED_SELLER,
      expect.objectContaining({ orderId: "order-1" }),
    );
    expect(prisma.adminUser.findMany).not.toHaveBeenCalled();
  });

  it("rejects seller-fault claims without evidence", async () => {
    const { service } = makeService();

    await expect(
      service.createRefundRequest("order-1", "buyer-1", {
        reason: RefundReason.wrong_item,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("uses package-level shipping shares before consuming the one-shot settlement", async () => {
    const siblingOrderWithZeroLocalShipping = {
      ...baseOrder,
      buyerShippingAmount: 0,
      sellerShippingAmount: 0,
      shippingCost: 0,
      // The physical package remains the canonical 130 + 40 snapshot.
      package: {
        ...baseOrder.package,
        fullShippingAmount: 170,
        buyerShippingAmount: 130,
        sellerShippingAmount: 40,
      },
    };
    const { service, prisma } = makeService(siblingOrderWithZeroLocalShipping);

    await service.createRefundRequest("order-1", "buyer-1", {
      reason: RefundReason.damaged,
      evidencePhotoUrls: ["https://example.com/evidence.jpg"],
    });
    const preview = await service.previewRefundDecision(
      "refund-1",
      RefundReason.damaged,
      "seller",
    );

    expect(preview.financials.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          componentCode: "outbound_shipping",
          treatment: "buyer_refund",
          netAmount: 130,
        }),
        expect.objectContaining({
          componentCode: "outbound_shipping",
          treatment: "seller_charge",
          netAmount: 170,
        }),
      ]),
    );

    await service.adminApproveRefundRequest(
      "refund-1",
      "admin-1",
      "Paket paylaşımı doğrulandı",
      {
        resolvedReason: RefundReason.damaged,
        faultParty: "seller",
        calculationToken: preview.calculationToken,
      },
    );
    expect(prisma.packageShippingSettlement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        packageId: "package-1",
        leg: "outbound",
        netAmount: 170,
      }),
    });
  });

  it("derives platform-sale product VAT from the original invoice line", async () => {
    const platformOrder = {
      ...baseOrder,
      quantity: 2,
      seller: { sellerType: SellerType.platform },
    };
    const { service } = makeService(platformOrder, {
      lineItems: [
        {
          name: "Platform ürünü",
          quantity: 2,
          net: 909.09,
          unitPrice: 454.545,
          vatRate: 10,
        },
      ],
    });

    await service.createRefundRequest("order-1", "buyer-1", {
      reason: RefundReason.damaged,
      refundQuantity: 1,
      evidencePhotoUrls: ["https://example.com/evidence.jpg"],
    });
    const preview = await service.previewRefundDecision(
      "refund-1",
      RefundReason.damaged,
      "seller",
    );
    const product = preview.financials.components.find(
      (component) => component.componentCode === "product",
    );

    expect(product).toMatchObject({
      grossAmount: 500,
      taxAmount: 45.46,
      netAmount: 454.54,
    });
  });

  it("finalizes quarantined finances without regressing an in-transit return", async () => {
    const { service, createdRows } = makeService();
    jest
      .spyOn((service as any).notifications, "appendHistory")
      .mockResolvedValue(undefined);
    createdRows.push({
      id: "refund-1",
      refundNumber: "RFD-1",
      orderId: "order-1",
      requesterId: "buyer-1",
      reason: RefundReason.damaged,
      refundQuantity: 1,
      amount: 1180,
      status: RefundRequestStatus.return_in_transit,
      policyCode: "seller_fault_return",
      policyVersion: 2,
      policyFinalizedAt: null,
      financialReviewRequired: true,
      financialPolicySnapshot: { version: 1 },
      updatedAt: new Date("2026-08-11T00:00:00.000Z"),
    });

    const preview = await service.previewRefundDecision(
      "refund-1",
      RefundReason.damaged,
      "seller",
    );
    const result = await service.adminApproveRefundRequest(
      "refund-1",
      "admin-1",
      "PayTR ve satıcı hesabı mutabık",
      {
        resolvedReason: RefundReason.damaged,
        faultParty: "seller",
        calculationToken: preview.calculationToken,
      },
    );

    expect(result).toMatchObject({
      status: RefundRequestStatus.return_in_transit,
      policyVersion: 2,
      financialReviewRequired: false,
    });
  });
});
