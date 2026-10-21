import { PaymentStatus } from "@prisma/client";
import { AdminPaymentService } from "./admin-payment.service";

/**
 * Decision D16 (tarodan-ops plan 2026-10-21-listing-boost): the generic
 * manual refund refuses a boost payment. Refunded there, the money went back
 * and the boost kept running; boost payments are refunded only by "refund and
 * stop" on the boost screen. The signal is the order's boost row.
 */
describe("AdminPaymentService.manualRefund refuses boost payments", () => {
  const make = (boost: { id: string } | null, productId = "boost-b1") => {
    const prisma = {
      payment: {
        findUnique: jest.fn().mockResolvedValue({
          id: "pay-1",
          status: PaymentStatus.completed,
          amount: 59,
          orderId: "order-bst",
          order: { id: "order-bst", productId },
          tradeCashPayment: null,
        }),
      },
      productBoost: { findUnique: jest.fn().mockResolvedValue(boost) },
    };
    const audit = { createRequiredAuditLog: jest.fn() };
    const payments = {
      processRefund: jest.fn().mockResolvedValue({ success: true }),
    };
    const service = new AdminPaymentService(
      prisma as never,
      audit as never,
      payments as never,
    );
    return { service, prisma, audit, payments };
  };

  it("answers 400 boostRefundUseBoostScreen and moves no money", async () => {
    const { service, prisma, audit, payments } = make({ id: "boost-1" });

    await expect(
      service.manualRefund("admin-1", "pay-1", 59, "reason", "key-1"),
    ).rejects.toMatchObject({
      status: 400,
      response: {
        i18nKey: "server.admin.payment.boostRefundUseBoostScreen",
      },
    });
    expect(prisma.productBoost.findUnique).toHaveBeenCalledWith({
      where: { orderId: "order-bst" },
      select: { id: true },
    });
    expect(payments.processRefund).not.toHaveBeenCalled();
    expect(audit.createRequiredAuditLog).not.toHaveBeenCalled();
  });

  it("still refunds an ordinary order payment, without a boost lookup", async () => {
    const { service, prisma, payments } = make(null, "listing-1");

    await service.manualRefund("admin-1", "pay-1", 59, "reason", "key-1");

    expect(payments.processRefund).toHaveBeenCalledTimes(1);
    expect(prisma.productBoost.findUnique).not.toHaveBeenCalled();
  });

  it("refunds a membership order payment, without a boost lookup", async () => {
    const { service, prisma, payments } = make(null, "membership-tier-1");

    await service.manualRefund("admin-1", "pay-1", 59, "reason", "key-1");

    expect(payments.processRefund).toHaveBeenCalledTimes(1);
    expect(prisma.productBoost.findUnique).not.toHaveBeenCalled();
  });

  it("refunds a paid boost order whose boost row is missing (nothing to stop, the boost screen cannot see it)", async () => {
    const { service, payments } = make(null);

    await service.manualRefund("admin-1", "pay-1", 59, "reason", "key-1");

    expect(payments.processRefund).toHaveBeenCalledWith(
      "order-bst",
      59,
      expect.objectContaining({ idempotencyKey: "key-1" }),
    );
  });
});
