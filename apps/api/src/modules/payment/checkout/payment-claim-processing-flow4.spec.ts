import { PaymentFulfillmentService } from "../fulfillment/payment-fulfillment.service";
import { PaymentStatus } from "@prisma/client";

/**
 * #4 (hızlı-callback yarışı): claimPaymentCompleted CAS'ı artık `pending` VE
 * `processing` durumlarını kabul eder. Direct ödeme `pending→processing→(çekim)→
 * finally: processing→pending` yapar; PayTR success callback'i "processing"
 * penceresinde gelirse eski pending-only CAS onu kaçırıp fulfillment'ı atlıyordu.
 */
describe("PaymentFulfillmentService.claimPaymentCompleted — processing kabul (#4)", () => {
  const makeService = () => {
    const captured = { where: undefined as any };
    const tx = {
      payment: {
        updateMany: jest.fn().mockImplementation((arg: any) => {
          captured.where = arg.where;
          return Promise.resolve({ count: 1 });
        }),
      },
    };
    const service = new PaymentFulfillmentService(
      {} as any, // prisma
      {} as any, // cache
      {} as any, // configService
      {} as any, // eventService
      {} as any, // fulfillmentNotifier
      {} as any, // virtualOrder
      {} as any, // stock
      {} as any, // notificationService
      {} as any, // escrowHold
      {} as any, // paymentCommon
      {} as any, // paymentRefund
      {} as any, // fulfillmentFinalizer
    );
    return { service, tx, captured };
  };

  it("CAS where'i hem pending hem processing içerir", async () => {
    const { service, tx, captured } = makeService();
    const payment = {
      id: "pay-1",
      status: PaymentStatus.processing,
      metadata: {},
    };

    const ok = await (service as any).claimPaymentCompleted(tx, payment, {});

    expect(ok).toBe(true);
    expect(tx.payment.updateMany).toHaveBeenCalledTimes(1);
    expect(captured.where.id).toBe("pay-1");
    expect(captured.where.status.in).toEqual(
      expect.arrayContaining([PaymentStatus.pending, PaymentStatus.processing]),
    );
  });

  it("count=0 ise false döner (zaten completed — idempotent)", async () => {
    const { service, tx } = makeService();
    tx.payment.updateMany.mockResolvedValue({ count: 0 });
    const payment = {
      id: "pay-2",
      status: PaymentStatus.completed,
      metadata: {},
    };

    const ok = await (service as any).claimPaymentCompleted(tx, payment, {});

    expect(ok).toBe(false);
  });
});
