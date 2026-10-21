import { RefundRequestStatus } from "@prisma/client";
import { AdminRefundService } from "./admin-refund.service";

/**
 * Decision D16: an order that carries a boost is refunded only on the boost
 * screen, which stops the boost with the money. Buyers can no longer open a
 * refund request on one, but a request opened before that fix can still sit
 * in the queue; approving or force-finalizing it here would pay it out past
 * the boost screen's rules. Both refuse before any money moves or audit row
 * is written.
 */
describe("AdminRefundService refuses refund requests on boost orders", () => {
  const make = (
    boost: { id: string } | null,
    status: RefundRequestStatus,
    productId = "boost-b1",
  ) => {
    const prisma = {
      refundRequest: {
        findUnique: jest.fn().mockResolvedValue({
          id: "rr-1",
          status,
          policyCode: "cooling_off",
          policyVersion: 1,
          policyFinalizedAt: null,
          financialReviewRequired: false,
          refundedAt: null,
          order: { id: "order-bst", productId },
        }),
      },
      productBoost: { findUnique: jest.fn().mockResolvedValue(boost) },
    };
    const audit = { createRequiredAuditLog: jest.fn() };
    const refundService = {
      adminApproveRefundRequest: jest
        .fn()
        .mockResolvedValue({ status: RefundRequestStatus.refunded }),
      finalizeRefundForReturnedShipment: jest.fn().mockResolvedValue({
        status: RefundRequestStatus.refunded,
        providerRefundId: "p-1",
      }),
    };
    const service = new AdminRefundService(
      prisma as never,
      audit as never,
      {} as never,
      refundService as never,
      {} as never,
      undefined as never,
    );
    return { service, prisma, audit, refundService };
  };
  const useBoostScreen = {
    status: 400,
    response: { i18nKey: "server.admin.payment.boostRefundUseBoostScreen" },
  };

  it("approve: 400 boostRefundUseBoostScreen, nothing paid", async () => {
    const { service, prisma, audit, refundService } = make(
      { id: "b1" },
      RefundRequestStatus.pending_review,
    );

    await expect(
      service.approveRefundRequest("admin-1", "rr-1", {}),
    ).rejects.toMatchObject(useBoostScreen);
    expect(prisma.productBoost.findUnique).toHaveBeenCalledWith({
      where: { orderId: "order-bst" },
      select: { id: true },
    });
    expect(refundService.adminApproveRefundRequest).not.toHaveBeenCalled();
    expect(audit.createRequiredAuditLog).not.toHaveBeenCalled();
  });

  it("force-finalize: 400 boostRefundUseBoostScreen, nothing paid", async () => {
    const { service, audit, refundService } = make(
      { id: "b1" },
      RefundRequestStatus.return_delivered,
    );

    await expect(
      service.forceFinalizeRefund("admin-1", "rr-1"),
    ).rejects.toMatchObject(useBoostScreen);
    expect(
      refundService.finalizeRefundForReturnedShipment,
    ).not.toHaveBeenCalled();
    expect(audit.createRequiredAuditLog).not.toHaveBeenCalled();
  });

  it("an ordinary order's request still goes through both, without a boost lookup", async () => {
    const pending = make(null, RefundRequestStatus.pending_review, "listing-1");
    await pending.service.approveRefundRequest("admin-1", "rr-1", {});
    expect(
      pending.refundService.adminApproveRefundRequest,
    ).toHaveBeenCalledTimes(1);
    expect(pending.prisma.productBoost.findUnique).not.toHaveBeenCalled();

    const delivered = make(
      null,
      RefundRequestStatus.return_delivered,
      "listing-1",
    );
    await delivered.service.forceFinalizeRefund("admin-1", "rr-1");
    expect(
      delivered.refundService.finalizeRefundForReturnedShipment,
    ).toHaveBeenCalledTimes(1);
  });

  it("a boost order that lost its boost row is still settled here", async () => {
    const pending = make(null, RefundRequestStatus.pending_review);
    await pending.service.approveRefundRequest("admin-1", "rr-1", {});
    expect(
      pending.refundService.adminApproveRefundRequest,
    ).toHaveBeenCalledTimes(1);
  });
});
