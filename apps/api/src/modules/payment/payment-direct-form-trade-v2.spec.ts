import { PaymentStatus, TradeStatus } from "@prisma/client";
import { PaymentInitiationService } from "./payment-initiation.service";

/**
 * DIRECT-FORM TAKAS HEDEFİ (v2) — web kart formunun kullandığı yol.
 *
 * `initiate-trade-cash` v2'ye çevrilmişti ama kart formunun hedef çözümlemesi
 * (`resolveDirectPaymentContext`'in tradeId dalı) v1 mantığında kalmıştı:
 *
 *  - kafa kafaya takasta `cashAmount <= 0` → 400: HİÇBİR taraf kartla ödeyemezdi,
 *  - `cashPayerId !== userId` → 403: farkı ödemeyen taraf kartla ödeyemezdi,
 *  - satır `primaryCashPayment` ile seçiliyordu → hep fark taşıyan satır.
 *
 * v2'de ödeyen "farkı ödeyen taraf" değil, SATIRIN SAHİBİDİR — kart formu da
 * `initiate-trade-cash` ile aynı kurala uymak zorunda; aksi halde iki uç aynı
 * takasta farklı taraflara izin verir.
 */
describe("PaymentInitiationService — direct-form takas hedefi (v2)", () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: "tcp-initiator",
    payerId: "user-initiator",
    recipientId: null,
    amount: 0,
    tradeFeeAmount: 35,
    shippingAmount: 60,
    commission: 0,
    totalAmount: 95,
    status: PaymentStatus.pending,
    ...over,
  });

  const makeService = (trade: Record<string, unknown>) => {
    const payments = new Map<string, any>();
    const prisma: any = {
      trade: { findUnique: jest.fn().mockResolvedValue(trade) },
      payment: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }: any) => {
          const created = {
            id: `pay-${data.tradeCashPaymentId}`,
            providerConversationId: null,
            metadata: null,
            ...data,
          };
          payments.set(created.id, created);
          return Promise.resolve(created);
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest
          .fn()
          .mockImplementation(({ where }: any) =>
            Promise.resolve(
              payments.get(where.id) ?? { id: where.id, metadata: null },
            ),
          ),
      },
    };
    const service = new PaymentInitiationService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return { service, prisma };
  };

  const v2Trade = (over: Record<string, unknown> = {}) => ({
    id: "trade-1",
    tradeNumber: "TKS-10001",
    status: TradeStatus.awaiting_payment,
    pricingVersion: "v2",
    cashAmount: null,
    cashPayerId: null,
    initiatorId: "user-initiator",
    receiverId: "user-receiver",
    initiator: {
      id: "user-initiator",
      displayName: "Başlatan",
      email: "i@test.local",
      phone: null,
    },
    receiver: {
      id: "user-receiver",
      displayName: "Alıcı",
      email: "r@test.local",
      phone: null,
    },
    cashPayments: [
      row(),
      row({ id: "tcp-receiver", payerId: "user-receiver" }),
    ],
    ...over,
  });

  const resolve = (service: PaymentInitiationService, userId: string) =>
    (service as any).resolveDirectPaymentContext(userId, {
      tradeId: "trade-1",
    });

  it("kafa kafaya v2 takasta (nakit fark yok) taraf kendi satırını ödeyebilir", async () => {
    const { service } = makeService(v2Trade());

    const context = await resolve(service, "user-initiator");

    expect(context.amount).toBe(95);
    expect(context.payment.tradeCashPaymentId).toBe("tcp-initiator");
  });

  it("farkı ödemeyen taraf da KENDİ satırını öder (v1'de 403 alırdı)", async () => {
    const { service } = makeService(
      v2Trade({
        cashAmount: 200,
        cashPayerId: "user-initiator",
        cashPayments: [
          row({
            amount: 200,
            totalAmount: 295,
            recipientId: "user-receiver",
          }),
          row({ id: "tcp-receiver", payerId: "user-receiver" }),
        ],
      }),
    );

    const context = await resolve(service, "user-receiver");

    // Karşı tarafın satırı: fark yok, yalnız ücret + kargo.
    expect(context.amount).toBe(95);
    expect(context.payment.tradeCashPaymentId).toBe("tcp-receiver");
    // Alıcı bilgisi de satırın SAHİBİNDEN gelir, farkı ödeyenden değil.
    expect(context.buyer.email).toBe("r@test.local");
  });

  it("tarafın satırı tamamlandıysa yeniden ödeme reddedilir", async () => {
    const { service } = makeService(
      v2Trade({
        cashPayments: [
          row({ status: PaymentStatus.completed }),
          row({ id: "tcp-receiver", payerId: "user-receiver" }),
        ],
      }),
    );

    await expect(resolve(service, "user-initiator")).rejects.toMatchObject({
      status: 400,
    });
  });

  it("takasın tarafı olmayan kullanıcı satır bulamaz (400)", async () => {
    const { service } = makeService(v2Trade());

    await expect(resolve(service, "user-outsider")).rejects.toMatchObject({
      status: 400,
    });
  });

  it("v1 takasta eski kural korunur: yalnız belirlenmiş ödeyen, fark satırıyla", async () => {
    const v1 = v2Trade({
      pricingVersion: "v1",
      cashAmount: 100,
      cashPayerId: "user-initiator",
      cashPayments: [
        row({
          id: "tcp-v1",
          amount: 100,
          commission: 5,
          tradeFeeAmount: 0,
          shippingAmount: 0,
          totalAmount: 105,
          recipientId: "user-receiver",
        }),
      ],
    });
    const { service } = makeService(v1);

    const context = await resolve(service, "user-initiator");
    expect(context.amount).toBe(105);

    await expect(resolve(service, "user-receiver")).rejects.toMatchObject({
      status: 403,
    });
  });
});
