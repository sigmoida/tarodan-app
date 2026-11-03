import { OrderStatus, PaymentStatus } from "@prisma/client";
import { PspReconciliationService } from "./psp-reconciliation.service";

/**
 * A payment whose callback was lost is completed by the pending sweep from
 * a status inquiry. Regression: that path passed no payment-method data to
 * fulfillment, so `Payment.installmentCount` kept its default and the
 * metadata missed `paymentMethod`, unlike a callback-completed payment.
 * The inquiry's `taksit` (https://dev.paytr.com/durum-sorgu) now reaches
 * fulfillment the same way the callback's `installment_count` does.
 */
describe("PspReconciliationService.reconcilePendingPaytrPayments: provider data", () => {
  const build = (inquiry: Record<string, unknown>) => {
    const row = {
      id: "pay-1",
      amount: 100,
      provider: "paytr",
      paytrMerchant: "marketplace",
      providerConversationId: "oid1",
      metadata: {},
    };
    const full = {
      ...row,
      status: PaymentStatus.pending,
      orderId: "o1",
      order: {
        status: OrderStatus.pending_payment,
        buyer: {},
        seller: {},
        product: {},
      },
      checkoutGroup: null,
    };
    const prisma = {
      payment: {
        findMany: jest.fn().mockResolvedValue([row]),
        findUnique: jest.fn().mockResolvedValue(full),
      },
    };
    const config = {
      get: jest.fn((key: string) =>
        key === "PAYTR_RECONCILE_AMOUNT_TOLERANCE_TL" ? "0.05" : undefined,
      ),
    };
    const queryPaymentStatus = jest.fn().mockResolvedValue(inquiry);
    const processSuccessfulPayment = jest.fn().mockResolvedValue(true);
    const service = new PspReconciliationService(
      prisma as never,
      {} as never,
      config as never,
      { resolve: () => ({ queryPaymentStatus }) } as never,
      { collectPaymentOids: () => ["oid1"] } as never,
      { processSuccessfulPayment } as never,
    );
    return { service, processSuccessfulPayment, full };
  };

  it("completes a single payment with installmentCount 0 from the inquiry", async () => {
    const { service, processSuccessfulPayment, full } = build({
      ok: true,
      paymentTotalTl: 100,
      paymentAmountTl: 100,
      paymentDate: "2026-11-03 10:00:00",
      currency: "TL",
      paymentType: "card",
      installmentCount: 0,
    });

    const res = await service.reconcilePendingPaytrPayments();

    expect(res).toEqual({ checked: 1, completed: 1 });
    expect(processSuccessfulPayment).toHaveBeenCalledWith(
      full,
      "paytr:oid1:2026-11-03 10:00:00",
      "oid1",
      { paymentType: "card", installmentCount: 0, currency: "TL" },
    );
  });

  it("passes an installment count the inquiry reports", async () => {
    const { service, processSuccessfulPayment } = build({
      ok: true,
      paymentTotalTl: 100,
      paymentAmountTl: 100,
      currency: "TL",
      installmentCount: 3,
    });

    await service.reconcilePendingPaytrPayments();

    expect(processSuccessfulPayment.mock.calls[0][3]).toEqual({
      paymentType: undefined,
      installmentCount: 3,
      currency: "TL",
    });
  });

  it("does not complete when the inquiry amount differs (unchanged guard)", async () => {
    const { service, processSuccessfulPayment } = build({
      ok: true,
      paymentTotalTl: 106.5,
      paymentAmountTl: 100,
      currency: "TL",
      installmentCount: 3,
    });

    const res = await service.reconcilePendingPaytrPayments();

    expect(res).toEqual({ checked: 1, completed: 0 });
    expect(processSuccessfulPayment).not.toHaveBeenCalled();
  });
});
