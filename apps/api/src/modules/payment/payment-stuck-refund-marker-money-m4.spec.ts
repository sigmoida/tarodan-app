import { PaymentReconciliationService } from "./payment-reconciliation.service";

/**
 * MONEY-M4: reconcileStuckRefundMarkers — PayTR iadesi yapılıp DB finalize'ı patlayan
 * (refundInProgressOrders marker'ı takılı, refundedOrders'ta YOK) siparişleri finalize eder.
 * Marker'daki tutarla processRefund çağrılır (PayTR marker sayesinde atlanır → tx finalize eder).
 */
describe("PaymentReconciliationService.reconcileStuckRefundMarkers — MONEY-M4", () => {
  const makeService = (candidates: any[]) => {
    const prisma = {
      payment: { findMany: jest.fn().mockResolvedValue(candidates) },
    };
    const paymentRefund = {
      processRefund: jest.fn().mockResolvedValue({ success: true }),
    };
    const service = new PaymentReconciliationService(
      prisma as any,
      {} as any, // cache
      {} as any, // configService
      {} as any, // paymentProviders
      {} as any, // invoiceService
      {} as any, // notificationService
      {} as any, // commissionLedger
      paymentRefund as any, // paymentRefund
      {} as any, // eventService
      {} as any, // paymentCommon
      {} as any, // paymentFulfillment
    );
    return { service, paymentRefund };
  };

  it("takılı marker (refundedOrders'ta yok): tutarla processRefund çağırır", async () => {
    const { service, paymentRefund } = makeService([
      {
        id: "pay-1",
        metadata: {
          refundInProgressOrders: { o1: { amount: 50, at: "2026-01-01" } },
          refundedOrders: {},
        },
      },
    ]);

    const res = await service.reconcileStuckRefundMarkers();

    expect(paymentRefund.processRefund).toHaveBeenCalledWith("o1", 50);
    expect(res).toEqual({ checked: 1, recovered: 1 });
  });

  it("zaten finalize edilmiş (refundedOrders'ta var): atlanır", async () => {
    const { service, paymentRefund } = makeService([
      {
        id: "pay-1",
        metadata: {
          refundInProgressOrders: { o1: { amount: 50 } },
          refundedOrders: { o1: 50 },
        },
      },
    ]);

    const res = await service.reconcileStuckRefundMarkers();

    expect(paymentRefund.processRefund).not.toHaveBeenCalled();
    expect(res).toEqual({ checked: 0, recovered: 0 });
  });

  it("eski (timestamp) marker formatı: tutar undefined ile (tam iade) çağırır", async () => {
    const { service, paymentRefund } = makeService([
      {
        id: "pay-1",
        metadata: {
          refundInProgressOrders: { o1: "2026-01-01T00:00:00Z" },
          refundedOrders: {},
        },
      },
    ]);

    await service.reconcileStuckRefundMarkers();

    expect(paymentRefund.processRefund).toHaveBeenCalledWith("o1", undefined);
  });
});
