import { PaymentInitiationService } from "./payment-initiation.service";

/**
 * Grup üyesi siparişte TEKİL ödeme başlatılamaz: sepet tek çekimle ödenir.
 * orderId ile gelen istek, sipariş bir CheckoutGroup'a bağlıysa otomatik olarak
 * grup ödemesine yönlendirilir — aksi halde alıcı aynı grubun ürünlerini ayrı
 * ayrı ödeyebiliyordu (kısmi tahsilat + tutarsız escrow/iade zinciri).
 */
describe("PaymentInitiationService — group redirect guard", () => {
  const makeService = (order: any) => {
    const prisma: any = {
      order: { findUnique: jest.fn().mockResolvedValue(order) },
    };
    const svc = new PaymentInitiationService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const groupSpy = jest
      .spyOn(svc as any, "initiateGroupPayment")
      .mockResolvedValue({ paymentId: "pay-group" });
    const singleSpy = jest
      .spyOn(svc as any, "processPaymentInitiation")
      .mockResolvedValue({ paymentId: "pay-single" });
    return { svc, prisma, groupSpy, singleSpy };
  };

  it("checkoutGroupId'li sipariş: tekil istek grup ödemesine delege edilir", async () => {
    const { svc, groupSpy, singleSpy } = makeService({
      id: "o1",
      buyerId: "buyer-1",
      checkoutGroupId: "grp-1",
      status: "pending_payment",
      shippingAddress: null,
    });

    const result = await svc.initiatePaymentUnified("buyer-1", {
      orderId: "o1",
      provider: "paytr",
    } as any);

    expect(result).toEqual({ paymentId: "pay-group" });
    expect(groupSpy).toHaveBeenCalledWith(
      "buyer-1",
      expect.objectContaining({ orderId: "o1", checkoutGroupId: "grp-1" }),
      undefined,
    );
    expect(singleSpy).not.toHaveBeenCalled();
  });

  it("grupsuz sipariş: tekil akış aynen çalışır", async () => {
    const { svc, groupSpy, singleSpy } = makeService({
      id: "o9",
      buyerId: "buyer-1",
      checkoutGroupId: null,
      status: "pending_payment",
      paymentExpiresAt: new Date(Date.now() + 60_000),
      shippingAddress: null,
    });

    const result = await svc.initiatePaymentUnified("buyer-1", {
      orderId: "o9",
      provider: "paytr",
    } as any);

    expect(result).toEqual({ paymentId: "pay-single" });
    expect(groupSpy).not.toHaveBeenCalled();
    expect(singleSpy).toHaveBeenCalled();
  });

  it("dto'da checkoutGroupId zaten varsa doğrudan grup yoluna gider (order sorgusu yapılmaz)", async () => {
    const { svc, prisma, groupSpy } = makeService(null);

    await svc.initiatePaymentUnified("buyer-1", {
      checkoutGroupId: "grp-1",
      provider: "paytr",
    } as any);

    expect(groupSpy).toHaveBeenCalled();
    expect(prisma.order.findUnique).not.toHaveBeenCalled();
  });
});
