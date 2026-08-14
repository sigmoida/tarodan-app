import { RefundReconciliationService } from "../refund/refund-reconciliation.service";

/**
 * MONEY-H5: processRefundedOrders artık GRUP (sepet) siparişlerini de süpürür.
 * Grup ödemesinde Order.payment NULL'dur (ödeme CheckoutGroup'ta) → eski sorgu
 * (`payment.is.status=completed`) sepet siparişlerini hiç görmez ve iptal edilen
 * sepet siparişi hiç iade edilmezdi. Zaten iade edilmişler (metadata.refundedOrders)
 * elenir → çift-iade denemesi + gürültülü REFUND_MANUAL_REVIEW olmaz.
 * SEAM-B3: outbound paket göndericiye iade dönmüş (shipment=returned) ama
 * refund_requested'da takılı siparişler de returned-arm ile retry edilir.
 */
describe("RefundReconciliationService.processRefundedOrders — MONEY-H5 group + SEAM-B3 returned", () => {
  const makeService = () => {
    const prisma = {
      order: { findMany: jest.fn() },
    };
    const paymentRefund = {
      processRefund: jest.fn().mockResolvedValue({ success: true }),
    };
    const service = new RefundReconciliationService(
      prisma as any, // prisma
      paymentRefund as any, // paymentRefund
      { resolve: () => ({}) } as any, // paymentProviders (bu testte kullanılmaz)
      { get: jest.fn().mockReturnValue(undefined) } as any, // configService
    );
    return { service, prisma, paymentRefund };
  };

  it("tekil + grup siparişlerini iade eder; zaten iade edilmiş grup siparişini atlar", async () => {
    const { service, prisma, paymentRefund } = makeService();
    prisma.order.findMany
      // 1) tekil ödeme sorgusu
      .mockResolvedValueOnce([{ id: "single-1" }])
      // 2) grup sipariş sorgusu
      .mockResolvedValueOnce([
        {
          id: "group-1",
          checkoutGroup: { payment: { metadata: {} } },
        },
        {
          id: "group-2",
          checkoutGroup: {
            payment: { metadata: { refundedOrders: { "group-2": 250 } } },
          },
        },
      ])
      // 3) SEAM-B3 returned-arm sorgusu
      .mockResolvedValueOnce([]);

    const res = await service.processRefundedOrders();

    expect(paymentRefund.processRefund).toHaveBeenCalledWith("single-1");
    expect(paymentRefund.processRefund).toHaveBeenCalledWith("group-1");
    // group-2 zaten iade edilmiş (refundedOrders map'inde) → atlanır
    expect(paymentRefund.processRefund).not.toHaveBeenCalledWith("group-2");
    expect(res).toEqual({ refunded: 2, failed: 0 });
  });

  it("grup sorgusu doğru filtreyi kullanır (Order.payment null + checkoutGroup.payment completed)", async () => {
    const { service, prisma } = makeService();
    prisma.order.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await service.processRefundedOrders();

    const groupWhere = prisma.order.findMany.mock.calls[1][0].where;
    expect(groupWhere.payment).toEqual({ is: null });
    expect(groupWhere.checkoutGroupId).toEqual({ not: null });
    expect(groupWhere.checkoutGroup).toEqual({
      is: { payment: { is: { status: "completed" } } },
    });
  });

  it("bir iade patlarsa failed sayılır, diğerleri devam eder", async () => {
    const { service, prisma, paymentRefund } = makeService();
    prisma.order.findMany
      .mockResolvedValueOnce([{ id: "single-1" }])
      .mockResolvedValueOnce([
        { id: "group-1", checkoutGroup: { payment: { metadata: {} } } },
      ])
      .mockResolvedValueOnce([]);
    paymentRefund.processRefund
      .mockRejectedValueOnce(new Error("PayTR down")) // single-1 patlar
      .mockResolvedValueOnce({ success: true }); // group-1 başarılı

    const res = await service.processRefundedOrders();

    expect(res).toEqual({ refunded: 1, failed: 1 });
  });

  // SEAM-B3: outbound paket göndericiye iade dönmüş (shipment=returned) ama
  // refund_requested'da takılı siparişler de retry edilir.
  it("SEAM-B3: returned-arm refund_requested + shipment=returned siparişini iade eder", async () => {
    const { service, prisma, paymentRefund } = makeService();
    prisma.order.findMany
      .mockResolvedValueOnce([]) // tekil
      .mockResolvedValueOnce([]) // grup
      .mockResolvedValueOnce([{ id: "returned-1" }]); // returned-arm

    const res = await service.processRefundedOrders();

    expect(paymentRefund.processRefund).toHaveBeenCalledWith("returned-1");
    expect(res).toEqual({ refunded: 1, failed: 0 });

    // returned-arm doğru filtreyi kullanmalı
    const returnedWhere = prisma.order.findMany.mock.calls[2][0].where;
    expect(returnedWhere.status).toBe("refund_requested");
    expect(returnedWhere.shipment).toEqual({ is: { status: "returned" } });
  });
});
