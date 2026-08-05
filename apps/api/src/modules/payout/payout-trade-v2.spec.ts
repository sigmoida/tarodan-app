import { PayoutService } from "./payout.service";
import { PaymentStatus } from "@prisma/client";

/**
 * TAKAS v2 PAYOUT — transferi yalnız NAKİT FARK doğurur.
 *
 * v2'de her takasta iki ödeme satırı vardır. Hizmet bedeli ve kargo PLATFORMDA
 * kalır; karşı tarafa geçen tek kalem nakit farktır. Farkı olmayan tarafın
 * satırında `recipientId` NULL'dur — o satır için transfer üretilmemelidir
 * (üretilirse alıcısı olmayan bir transfer ya da 0 TL'lik gürültü doğar).
 */
describe("PayoutService — takas v2 payout yalnız nakit fark için", () => {
  const makeService = (rows: any[]) => {
    const created: any[] = [];
    const prisma = {
      paymentHold: { findMany: jest.fn().mockResolvedValue([]) },
      order: { findMany: jest.fn().mockResolvedValue([]) },
      refundRequest: { findFirst: jest.fn().mockResolvedValue(null) },
      refundAttempt: { findFirst: jest.fn().mockResolvedValue(null) },
      tradeCashPayment: {
        findMany: jest.fn().mockImplementation(({ where }: any) => {
          // Servisin filtresini gerçekten uygula: testin amacı sorgunun farkı
          // olmayan satırı DIŞARIDA bırakmasıdır.
          const wantsRecipient = where?.recipientId?.not === null;
          const minAmount = where?.amount?.gt;
          return Promise.resolve(
            rows.filter(
              (r) =>
                (!wantsRecipient || r.recipientId !== null) &&
                (minAmount === undefined || Number(r.amount) > minAmount),
            ),
          );
        }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: "u-recipient",
          bankAccount: { iban: "TR33", accountHolder: "Alıcı" },
        }),
      },
      payoutTransfer: {
        count: jest.fn().mockResolvedValue(0),
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
    return { service, created, prisma };
  };

  const row = (over: Partial<Record<string, any>> = {}) => ({
    id: "tcp-1",
    tradeId: "trade-1",
    payerId: "u-payer",
    recipientId: "u-recipient",
    amount: 200, // nakit fark
    tradeFeeAmount: 35,
    shippingAmount: 60,
    commission: 0,
    totalAmount: 295,
    status: PaymentStatus.completed,
    payment: { id: "pay-1", providerConversationId: "OID1" },
    trade: {},
    ...over,
  });

  it("farkı ödeyen tarafın satırı karşı tarafa transfer üretir (net = fark)", async () => {
    const { service, created } = makeService([row()]);

    const count = await service.createPayoutsForReleasedHolds();

    expect(count).toBe(1);
    // Transfer NET'i yalnız nakit farktır: hizmet bedeli + kargo platformda kalır.
    expect(Number(created[0].netAmount)).toBe(200);
    expect(Number(created[0].amount)).toBe(295);
    expect(created[0].sellerId).toBe("u-recipient");
  });

  it("farkı olmayan tarafın satırı transfer üretmez", async () => {
    // Kafa kafaya takasta bile iki taraf öder; bu satır yalnız ücret + kargodur.
    const { service, created } = makeService([
      row({
        id: "tcp-2",
        recipientId: null,
        amount: 0,
        totalAmount: 95,
      }),
    ]);

    const count = await service.createPayoutsForReleasedHolds();

    expect(count).toBe(0);
    expect(created).toHaveLength(0);
  });
});
