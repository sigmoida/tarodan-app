import { RefundReconciliationService } from "./refund-reconciliation.service";

/**
 * MONEY-M4: reconcileStuckRefundMarkers — PayTR iadesi yapılıp DB finalize'ı patlayan
 * (refundInProgressOrders marker'ı takılı, refundedOrders'ta YOK) siparişleri finalize eder.
 * Marker'daki tutarla processRefund çağrılır (PayTR marker sayesinde atlanır → tx finalize eder).
 */
describe("RefundReconciliationService.reconcileStuckRefundMarkers — MONEY-M4", () => {
  const makeService = (candidates: any[]) => {
    const prisma = {
      payment: { findMany: jest.fn().mockResolvedValue(candidates) },
    };
    const paymentRefund = {
      processRefund: jest.fn().mockResolvedValue({ success: true }),
    };
    const service = new RefundReconciliationService(
      prisma as any, // prisma
      paymentRefund as any, // paymentRefund
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

  it("Finding 1: marker VAR + refundedOrders'ta ÖNCEKİ kısmi iade var → yine de recover eder", async () => {
    // Çoklu kısmi iade: partial#1 (50) finalize oldu (refundedOrders={o1:50}, marker silindi),
    // partial#2 (200) PayTR yapıldı ama tx patladı → marker={o1:{200}} DURUYOR. Eski buggy
    // filtre `o1 in refundedOrders` yüzünden bunu ATLIYORDU (200 havada kalırdı). Artık marker
    // varlığı = takılı → recover eder (marker'daki 200 tutarıyla).
    const { service, paymentRefund } = makeService([
      {
        id: "pay-1",
        metadata: {
          refundInProgressOrders: { o1: { amount: 200, at: "x" } },
          refundedOrders: { o1: 50 },
        },
      },
    ]);

    const res = await service.reconcileStuckRefundMarkers();

    expect(paymentRefund.processRefund).toHaveBeenCalledWith("o1", 200);
    expect(res).toEqual({ checked: 1, recovered: 1 });
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
