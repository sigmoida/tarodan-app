import { PaymentQueryService } from "./payment-query.service";

/**
 * ÖDEME SAYFASI TAKAS KALEMLERİ.
 *
 * Takas ödemesi tek rakam olarak dönüyordu; kullanıcı ödeme ekranında neyin
 * karşılığında para çekildiğini (hizmet bedeli + 2 bacaklık kargo + varsa
 * nakit fark) göremiyordu. Grup ödemesindeki `pricing` alanının aynısı takas
 * için de döner — ekran kendi hesabını yapmaz, satırları buradan okur.
 */
describe("PaymentQueryService — takas ödemesinin kalemleri", () => {
  const makeService = (tradeCashPayment: Record<string, unknown>) => {
    const prisma = {
      payment: {
        findUnique: jest.fn().mockResolvedValue({
          id: "pay-1",
          status: "pending",
          amount: 295,
          currency: "TRY",
          provider: "paytr",
          createdAt: new Date("2026-08-03T10:00:00Z"),
          updatedAt: new Date("2026-08-03T10:00:00Z"),
          order: null,
          checkoutGroup: null,
          tradeCashPayment,
        }),
      },
    };
    return new PaymentQueryService(prisma as never, {} as never, {} as never);
  };

  it("hizmet bedeli, kargo ve nakit farkı ayrı ayrı döner", async () => {
    const service = makeService({
      payerId: "user-1",
      recipientId: "user-2",
      tradeId: "trade-1",
      amount: 200,
      tradeFeeAmount: 35,
      shippingAmount: 60,
      totalAmount: 295,
    });

    const result: any = await service.getPaymentStatusUnified(
      "pay-1",
      "user-1",
    );

    expect(result.tradeId).toBe("trade-1");
    expect(result.pricing).toEqual({
      serviceFee: 35,
      shippingAmount: 60,
      cashDifference: 200,
      totalAmount: 295,
    });
  });

  it("farkı olmayan tarafta da kalemler döner (ücret + kargo)", async () => {
    const service = makeService({
      payerId: "user-2",
      recipientId: null,
      tradeId: "trade-1",
      amount: 0,
      tradeFeeAmount: 35,
      shippingAmount: 60,
      totalAmount: 95,
    });

    const result: any = await service.getPaymentStatusUnified(
      "pay-1",
      "user-2",
    );

    expect(result.pricing.cashDifference).toBe(0);
    expect(result.pricing.totalAmount).toBe(95);
  });

  it("v1 satırında ücret/kargo 0'dır (eski takaslar bozulmaz)", async () => {
    const service = makeService({
      payerId: "user-1",
      recipientId: "user-2",
      tradeId: "trade-1",
      amount: 100,
      tradeFeeAmount: 0,
      shippingAmount: 0,
      totalAmount: 105,
    });

    const result: any = await service.getPaymentStatusUnified(
      "pay-1",
      "user-1",
    );

    expect(result.pricing).toEqual({
      serviceFee: 0,
      shippingAmount: 0,
      cashDifference: 100,
      totalAmount: 105,
    });
  });
});
