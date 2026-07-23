import { PaymentProviderEventService } from "./payment-provider-event.service";

/**
 * PaymentProviderEventService — PSP denetim günlüğü recorder'ı.
 *  - Yapısal alanları doğru maplemeli (amount/totalAmount Decimal'a, installment Int).
 *  - BEST-EFFORT: prisma.create patlarsa record() FIRLATMAMALI (para akışını bozmaz).
 */
describe("PaymentProviderEventService.record", () => {
  const makeService = (createImpl: jest.Mock) => {
    const prisma = {
      paymentProviderEvent: { create: createImpl },
    } as any;
    return new PaymentProviderEventService(prisma);
  };

  it("yapısal alanları maplenmiş biçimde create'e geçirir", async () => {
    const create = jest.fn().mockResolvedValue({ id: "e1" });
    const svc = makeService(create);

    await svc.record({
      eventType: "callback",
      merchantOid: "OID1",
      paymentId: "pay-1",
      status: "success",
      paymentType: "card",
      installmentCount: 3,
      currency: "TL",
      amount: 100.5,
      totalAmount: 100.5,
      hashValid: true,
      raw: { foo: "bar" },
    });

    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0][0].data;
    expect(data.provider).toBe("paytr");
    expect(data.eventType).toBe("callback");
    expect(data.merchantOid).toBe("OID1");
    expect(data.paymentId).toBe("pay-1");
    expect(data.installmentCount).toBe(3);
    // Decimal alanları: string'e çevrilebilir Prisma.Decimal
    expect(String(data.amount)).toBe("100.5");
    expect(String(data.totalAmount)).toBe("100.5");
    expect(data.hashValid).toBe(true);
    expect(data.raw).toEqual({ foo: "bar" });
  });

  it("geçersiz sayısal alanlar null'a düşer (NaN amount yazılmaz)", async () => {
    const create = jest.fn().mockResolvedValue({ id: "e2" });
    const svc = makeService(create);
    await svc.record({
      eventType: "refund",
      amount: Number.NaN,
      installmentCount: Number.NaN,
    });
    const data = create.mock.calls[0][0].data;
    expect(data.amount).toBeNull();
    expect(data.installmentCount).toBeNull();
  });

  it("BEST-EFFORT: prisma.create patlarsa record() throw ETMEZ", async () => {
    const create = jest.fn().mockRejectedValue(new Error("db down"));
    const svc = makeService(create);
    await expect(
      svc.record({ eventType: "callback", merchantOid: "OID2" }),
    ).resolves.toBeUndefined();
  });
});
