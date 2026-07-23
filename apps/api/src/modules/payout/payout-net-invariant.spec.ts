import { PayoutService } from "./payout.service";

/**
 * #1 (KRİTİK): DB CHECK'i `net_amount = amount - commission`'dan `<=`'ye gevşetildi.
 * Bu test, kodun stopaj + kısmi iade durumunda net_amount'u gerçekten
 * `amount - commission`'ın ALTINDA ürettiğini kanıtlar — yani eski eşitlik constraint'i
 * bu payout'u REDDEDERDİ (satıcı ödenmezdi), yeni `<=` constraint'i geçirir.
 * (Gerçek PostgreSQL constraint'i için ayrıca DB entegrasyon testi gerekir; bu test
 * uygulama tarafındaki değer üretimini kilitler.)
 */
describe("PayoutService — net_amount <= amount - commission invariant (#1)", () => {
  const makeService = (hold: any, order: any) => {
    const created: any[] = [];
    const prisma = {
      paymentHold: { findMany: jest.fn().mockResolvedValue([hold]) },
      order: { findMany: jest.fn().mockResolvedValue([order]) },
      refundRequest: { findFirst: jest.fn().mockResolvedValue(null) },
      tradeCashPayment: { findMany: jest.fn().mockResolvedValue([]) },
      payoutTransfer: {
        create: jest.fn().mockImplementation((arg: any) => {
          created.push(arg.data);
          return Promise.resolve({});
        }),
      },
    };
    const service = new PayoutService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return { service, created };
  };

  it("stopaj + kısmi iade → netAmount < amount - commission (eski '=' constraint'i reddederdi)", async () => {
    // order: total=100, komisyon=12, stopaj=3 → sellerAmount(hold.amount)=85
    // hold.refundedAmount=10 → netPayout = 85 - 10 = 75
    const order = {
      id: "o1",
      orderNumber: "ORD1",
      totalAmount: 100,
      commissionAmount: 12,
      withholdingTaxAmount: 3,
    };
    const hold = {
      id: "hold-1",
      orderId: "o1",
      amount: 85,
      refundedAmount: 10,
      sellerId: "s1",
      payment: { providerConversationId: "OID" },
      seller: { bankAccount: { iban: "TR..", accountHolder: "S" } },
    };
    const { service, created } = makeService(hold, order);

    const count = await service.createPayoutsForReleasedHolds();

    expect(count).toBe(1);
    const t = created[0];
    expect(Number(t.amount)).toBe(100);
    expect(Number(t.commission)).toBe(12);
    expect(Number(t.netAmount)).toBe(75); // 85 - 10
    // Yeni constraint: net <= amount - commission (75 <= 88) ✓
    expect(Number(t.netAmount)).toBeLessThanOrEqual(
      Number(t.amount) - Number(t.commission),
    );
    // Eski constraint net = amount - commission (75 == 88) olsaydı REDDEDERDİ:
    expect(Number(t.netAmount)).not.toBe(
      Number(t.amount) - Number(t.commission),
    );
  });

  it("stopajsız + iadesiz → net = amount - commission (sınır durum, yeni constraint de geçer)", async () => {
    const order = {
      id: "o2",
      orderNumber: "ORD2",
      totalAmount: 100,
      commissionAmount: 12,
      withholdingTaxAmount: 0,
    };
    const hold = {
      id: "hold-2",
      orderId: "o2",
      amount: 88, // 100 - 12 - 0
      refundedAmount: 0,
      sellerId: "s1",
      payment: { providerConversationId: "OID" },
      seller: { bankAccount: { iban: "TR..", accountHolder: "S" } },
    };
    const { service, created } = makeService(hold, order);

    await service.createPayoutsForReleasedHolds();

    const t = created[0];
    expect(Number(t.netAmount)).toBe(88);
    expect(Number(t.netAmount)).toBeLessThanOrEqual(
      Number(t.amount) - Number(t.commission),
    );
  });
});
