import { ForbiddenException } from "@nestjs/common";
import { RefundService } from "./refund.service";
import { RefundFinancialService } from "./refund-financial.service";
import { RefundShipmentService } from "./refund-shipment.service";
import { RefundCreationService } from "./refund-creation.service";
import { RefundDecisionService } from "./refund-decision.service";
import { warehouseAddressStub } from "../shipping/testing/warehouse-address-fixture";

/**
 * Platform service orders (membership `MEM-`, boost `BST-`; recognised by
 * their virtual product, `virtualOrderKind`) never enter the order refund
 * flow: a membership has its own cancel flow and a boost is refunded on the
 * boost screen. The guard runs before the buyer and payment checks.
 */
describe("RefundService.createRefundRequest — platform service order guard", () => {
  const makeService = (order: any) => {
    const prisma = {
      order: { findUnique: jest.fn().mockResolvedValue(order) },
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
    return new RefundService(
      prisma as any,
      notifications as any,
      financials as any,
      shipments as any,
      creation as any,
      decisions as any,
    );
  };

  it.each([
    [
      "membership",
      "MEM-1781257318265-BENIPST9F",
      "membership-tier-1",
      "server.refund.membershipOrderNotEligible",
    ],
    // A boost order is refunded only on the boost screen (D16); the buyer
    // gets the generic refusal, not the membership advice.
    [
      "boost",
      "BST-1781257318265-BENIPST9F",
      "boost-b1",
      "server.refund.orderStatusNotEligible",
    ],
  ])(
    "refuses a refund request on a %s order",
    async (_kind, orderNumber, productId, i18nKey) => {
      const service = makeService({
        id: "o1",
        orderNumber,
        productId,
        buyerId: "buyer1",
        status: "completed",
        payment: { status: "completed" },
      });
      await expect(
        service.createRefundRequest("o1", "buyer1", {
          reason: "damaged",
        } as any),
      ).rejects.toMatchObject({ status: 400, response: { i18nKey } });
    },
  );

  it("normal siparişte guard tetiklenmez → alıcı doğrulamasına ilerler", async () => {
    const service = makeService({
      id: "o1",
      orderNumber: "TRD-1001",
      productId: "product-1",
      buyerId: "buyer1",
      status: "completed",
      payment: { status: "completed" },
    });
    // Farklı kullanıcı → membership değil; buyer kontrolü Forbidden atmalı
    await expect(
      service.createRefundRequest("o1", "someoneElse", {
        reason: "damaged",
      } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
