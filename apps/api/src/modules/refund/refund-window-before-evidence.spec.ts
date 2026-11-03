import { BadRequestException } from "@nestjs/common";
import {
  OrderStatus,
  PaymentStatus,
  RefundReason,
  ShipmentStatus,
} from "@prisma/client";
import { RefundCreationService } from "./refund-creation.service";
import { CreateRefundRequestDto } from "./dto/create-refund-request.dto";

/**
 * Decision order of a buyer refund request: the order's phase (is a refund
 * possible at all?) is decided BEFORE the reason-specific evidence rule.
 *
 * Bug pinned here: a `damaged` request past the return window without a photo
 * was refused with "evidence required", so the buyer was asked for a photo
 * that could never open a refund. A refused phase now answers with its own
 * error whatever the evidence; an open phase keeps the evidence rule exactly.
 */
describe("RefundCreationService - window check runs before the evidence check", () => {
  const DAY_MS = 24 * 3600 * 1000;
  const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS);
  const daysAhead = (n: number) => new Date(Date.now() + n * DAY_MS);
  const PHOTO = ["https://cdn.example.com/evidence.jpg"];

  const pastWindowOrder = {
    status: OrderStatus.delivered,
    deliveredAt: daysAgo(20),
    returnWindowEndsAt: daysAgo(6),
    shipment: {
      status: ShipmentStatus.delivered,
      deliveredAt: null,
      shippedAt: daysAgo(22),
    },
  };
  const inWindowOrder = {
    status: OrderStatus.delivered,
    deliveredAt: daysAgo(3),
    returnWindowEndsAt: daysAhead(11),
    shipment: {
      status: ShipmentStatus.delivered,
      deliveredAt: null,
      shippedAt: daysAgo(5),
    },
  };
  const preparingOrder = {
    status: OrderStatus.preparing,
    deliveredAt: null,
    returnWindowEndsAt: null,
    shipment: null,
  };
  // `refund_requested` is no phase a new request may start from.
  const ineligibleStatusOrder = {
    status: OrderStatus.refund_requested,
    deliveredAt: null,
    returnWindowEndsAt: null,
    shipment: null,
  };

  const makeService = (overrides: Record<string, unknown>) => {
    const order = {
      id: "order-1",
      orderNumber: "ORD-1",
      buyerId: "buyer-1",
      sellerId: "seller-1",
      payment: { status: PaymentStatus.completed },
      checkoutGroup: null,
      refundRequests: [],
      quantity: 1,
      ...overrides,
    };
    const prisma = {
      order: { findUnique: jest.fn().mockResolvedValue(order) },
      // No settings row: the catalogue default return window applies.
      platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const service = new RefundCreationService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const paths = service as unknown as Record<
      "createInstantRefund" | "createCoolingOffRefund",
      () => Promise<unknown>
    >;
    // The creation paths are covered by their own specs; here they only
    // prove that the request got past every gate.
    const instant = jest
      .spyOn(paths, "createInstantRefund")
      .mockResolvedValue({ path: "instant" });
    const coolingOff = jest
      .spyOn(paths, "createCoolingOffRefund")
      .mockResolvedValue({ path: "cooling_off" });
    return { service, instant, coolingOff };
  };

  const refusalKey = async (
    service: RefundCreationService,
    dto: CreateRefundRequestDto,
  ) => {
    const error = await service
      .createRefundRequest("order-1", "buyer-1", dto)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    return ((error as BadRequestException).getResponse() as { i18nKey: string })
      .i18nKey;
  };

  describe("past the return window", () => {
    it("refuses a damaged request without a photo with the window error", async () => {
      const { service, instant, coolingOff } = makeService(pastWindowOrder);

      await expect(
        refusalKey(service, { reason: RefundReason.damaged }),
      ).resolves.toBe("server.refund.coolingOffExpired");
      expect(instant).not.toHaveBeenCalled();
      expect(coolingOff).not.toHaveBeenCalled();
    });

    it("refuses a damaged request with a photo with the window error", async () => {
      const { service, instant, coolingOff } = makeService(pastWindowOrder);

      await expect(
        refusalKey(service, {
          reason: RefundReason.damaged,
          evidencePhotoUrls: PHOTO,
        }),
      ).resolves.toBe("server.refund.coolingOffExpired");
      expect(instant).not.toHaveBeenCalled();
      expect(coolingOff).not.toHaveBeenCalled();
    });

    it("refuses an empty photo list with the window error", async () => {
      const { service } = makeService(pastWindowOrder);

      await expect(
        refusalKey(service, {
          reason: RefundReason.wrong_item,
          evidencePhotoUrls: [],
        }),
      ).resolves.toBe("server.refund.coolingOffExpired");
    });

    it("refuses a changed-mind request with the window error", async () => {
      const { service } = makeService(pastWindowOrder);

      await expect(
        refusalKey(service, { reason: RefundReason.changed_mind }),
      ).resolves.toBe("server.refund.coolingOffExpired");
    });
  });

  describe("inside the return window", () => {
    it("refuses a damaged request without a photo with the evidence error", async () => {
      const { service, instant, coolingOff } = makeService(inWindowOrder);

      await expect(
        refusalKey(service, { reason: RefundReason.damaged }),
      ).resolves.toBe("server.refund.evidenceRequired");
      expect(instant).not.toHaveBeenCalled();
      expect(coolingOff).not.toHaveBeenCalled();
    });

    it("opens a damaged request with a photo on the cooling-off path", async () => {
      const { service, coolingOff } = makeService(inWindowOrder);

      await expect(
        service.createRefundRequest("order-1", "buyer-1", {
          reason: RefundReason.damaged,
          evidencePhotoUrls: PHOTO,
        }),
      ).resolves.toEqual({ path: "cooling_off" });
      expect(coolingOff).toHaveBeenCalledWith(
        expect.objectContaining({ id: "order-1" }),
        "buyer-1",
        expect.objectContaining({ reason: RefundReason.damaged }),
        1,
        expect.objectContaining({
          policyCode: "seller_fault_return",
          requiresEvidence: true,
        }),
      );
    });

    it("opens a changed-mind request without a photo on the cooling-off path", async () => {
      const { service, coolingOff } = makeService(inWindowOrder);

      await expect(
        service.createRefundRequest("order-1", "buyer-1", {
          reason: RefundReason.changed_mind,
        }),
      ).resolves.toEqual({ path: "cooling_off" });
      expect(coolingOff).toHaveBeenCalledWith(
        expect.anything(),
        "buyer-1",
        expect.anything(),
        1,
        expect.objectContaining({
          policyCode: "buyer_remorse_return",
          requiresEvidence: false,
        }),
      );
    });
  });

  describe("before shipment", () => {
    // Pins the existing cancellation policy (`manual_review_cancellation`
    // requires evidence), which this fix leaves unchanged on purpose. Whether
    // a pre-shipment fault claim should need a photo is a separate product
    // decision.
    it("keeps the evidence rule for a non-remorse reason", async () => {
      const { service, instant } = makeService(preparingOrder);

      await expect(
        refusalKey(service, { reason: RefundReason.damaged }),
      ).resolves.toBe("server.refund.evidenceRequired");
      expect(instant).not.toHaveBeenCalled();
    });

    it("opens a changed-mind request without a photo on the instant path", async () => {
      const { service, instant } = makeService(preparingOrder);

      await expect(
        service.createRefundRequest("order-1", "buyer-1", {
          reason: RefundReason.changed_mind,
        }),
      ).resolves.toEqual({ path: "instant" });
      expect(instant).toHaveBeenCalledWith(
        expect.anything(),
        "buyer-1",
        expect.anything(),
        1,
        expect.objectContaining({ policyCode: "buyer_remorse_cancellation" }),
      );
    });
  });

  describe("an order status no refund can start from", () => {
    it("refuses with the status error before asking for a photo", async () => {
      const { service, instant, coolingOff } = makeService(
        ineligibleStatusOrder,
      );

      await expect(
        refusalKey(service, { reason: RefundReason.damaged }),
      ).resolves.toBe("server.refund.orderStatusNotEligible");
      expect(instant).not.toHaveBeenCalled();
      expect(coolingOff).not.toHaveBeenCalled();
    });
  });
});
