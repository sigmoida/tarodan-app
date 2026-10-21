import { PaymentStatus } from "@prisma/client";
import { AdminPaymentService } from "./admin-payment.service";

/**
 * Decision D16 (tarodan-ops plan 2026-10-21-listing-boost): the generic
 * manual refund refuses a boost payment. Refunded there, the money went back
 * and the boost kept running; boost payments are refunded only by "refund and
 * stop" on the boost screen.
 */
describe("AdminPaymentService.manualRefund refuses boost payments", () => {
  const make = (boost: { id: string } | null) => {
    const prisma = {
      payment: {
        findUnique: jest.fn().mockResolvedValue({
          id: "pay-1",
          status: PaymentStatus.completed,
          amount: 59,
          orderId: "order-bst",
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

  it("still refunds an ordinary order payment", async () => {
    const { service, payments } = make(null);

    await service.manualRefund("admin-1", "pay-1", 59, "reason", "key-1");

    expect(payments.processRefund).toHaveBeenCalledTimes(1);
  });
});
