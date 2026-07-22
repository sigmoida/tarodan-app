import { PaymentRefundService } from "./payment-refund.service";
import { PaymentStatus } from "@prisma/client";

/**
 * MONEY-H3 + H4: Tekil ödemede kısmi iade doğruluğu.
 *  - H3: tutar-bazlı iade (admin jest) hold'u yalnız TUTAR oranında tüketir (tümünü değil).
 *  - H4: kısmi iade payment'ı tümden `refunded` YAPMAZ (completed kalır → sonraki kısmi
 *        iade açılabilir); kümülatif toplam işlem tutarına ulaşınca `refunded` olur.
 *  - H4 tavan: art arda kısmi iadelerin toplamı işlem tutarını aşarsa PayTR ÖNCESİ reddedilir.
 */
describe("PaymentRefundService.processRefund — MONEY-H3/H4 partial refund", () => {
  const ORDER_ID = "order-1";

  const makeService = (opts: {
    paymentAmount: number;
    metadata?: Record<string, unknown>;
    holdAmount?: number;
    holdRefundedAmount?: number;
  }) => {
    const captured = {
      paymentUpdate: undefined as any,
      holdUpdate: undefined as any,
    };
    const metadata = opts.metadata ?? {};

    const mockTx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      payment: {
        findUnique: jest.fn().mockResolvedValue({ metadata }),
        update: jest.fn().mockImplementation((arg: any) => {
          captured.paymentUpdate = arg;
          return Promise.resolve({});
        }),
      },
      paymentHold: {
        findFirst: jest.fn().mockResolvedValue(
          opts.holdAmount != null
            ? {
                id: "hold-1",
                amount: opts.holdAmount,
                refundedAmount: opts.holdRefundedAmount ?? 0,
                status: "held",
              }
            : null,
        ),
        update: jest.fn().mockImplementation((arg: any) => {
          captured.holdUpdate = arg;
          return Promise.resolve({});
        }),
      },
      payoutTransfer: { findFirst: jest.fn().mockResolvedValue(null) },
      order: {
        findUnique: jest.fn().mockResolvedValue({
          status: "preparing",
          productId: "prod-1",
          quantity: 1,
          stockRestoredAt: null,
          buyerId: "b1",
          sellerId: "s1",
          orderNumber: "ORD1",
          cancellationType: "iade",
          buyer: { id: "b1", email: "b@x", displayName: "B" },
          seller: { id: "s1", email: "s@x", displayName: "S" },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      product: {
        findUnique: jest.fn().mockResolvedValue({ quantity: 5 }),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    const prisma = {
      payment: {
        findFirst: jest.fn().mockResolvedValue({
          id: "pay-1",
          orderId: ORDER_ID,
          checkoutGroupId: null,
          amount: opts.paymentAmount,
          provider: "paytr",
          status: PaymentStatus.completed,
          providerConversationId: "OID123",
          metadata,
          order: { quantity: 1, orderNumber: "ORD1" },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: ORDER_ID,
          orderNumber: "ORD1",
          totalAmount: opts.paymentAmount,
          checkoutGroupId: null,
        }),
      },
      payoutTransfer: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn((fn: any) => fn(mockTx)),
    };

    const paytr = {
      createRefund: jest.fn().mockResolvedValue({ status: "success" }),
    };
    const service = new PaymentRefundService(
      prisma as any,
      { get: jest.fn().mockReturnValue(undefined) } as any,
      { resolve: () => paytr } as any,
      { emitPaymentRefunded: jest.fn().mockResolvedValue(undefined) } as any,
      {
        createInAppNotification: jest.fn().mockResolvedValue(undefined),
        sendOrderCancelledEmails: jest.fn().mockResolvedValue(undefined),
      } as any,
      { applyRefund: jest.fn().mockResolvedValue(undefined) } as any,
      { handleOrderRefund: jest.fn().mockResolvedValue(undefined) } as any,
      {
        cancelSuratShipmentIfExists: jest.fn().mockResolvedValue(undefined),
      } as any,
    );
    return { service, captured, paytr, mockTx };
  };

  it("H3: 1000 TL siparişte 50 TL jest → hold'un yalnız %5'i tüketilir (950 kalır), payment completed kalır", async () => {
    const { service, captured } = makeService({
      paymentAmount: 1000,
      holdAmount: 1000, // satıcı payı = 1000 (test kolaylığı)
    });

    await service.processRefund(ORDER_ID, 50);

    // Hold TUM'ü değil, tutar oranı (50/1000 = %5) kadar tüketilir → refundedAmount=50.
    expect(captured.holdUpdate.data).toEqual(
      expect.objectContaining({ refundedAmount: 50, frozenByRefundId: null }),
    );
    // Kısmi iade → payment refunded OLMAZ (completed kalır).
    expect(captured.paymentUpdate.data.status).toBe(PaymentStatus.completed);
  });

  it("H4: 1000 TL siparişte ilk 400 TL iade payment'ı refunded YAPMAZ", async () => {
    const { service, captured, paytr } = makeService({ paymentAmount: 1000 });

    await service.processRefund(ORDER_ID, 400);

    expect(paytr.createRefund).toHaveBeenCalled();
    expect(captured.paymentUpdate.data.status).toBe(PaymentStatus.completed);
    // Kümülatif iade 400 olarak persist edilir (sonraki kısmi iade bunu okur).
    expect(captured.paymentUpdate.data.metadata.refundedOrders[ORDER_ID]).toBe(
      400,
    );
  });

  it("H4: önceki 400 TL iadeden sonra kalan 600 TL iade → kümülatif tam → refunded", async () => {
    const { service, captured } = makeService({
      paymentAmount: 1000,
      metadata: { refundedOrders: { [ORDER_ID]: 400 } },
    });

    await service.processRefund(ORDER_ID, 600);

    expect(captured.paymentUpdate.data.status).toBe(PaymentStatus.refunded);
    expect(captured.paymentUpdate.data.metadata.refundedOrders[ORDER_ID]).toBe(
      1000,
    );
  });

  it("H4 tavan: kümülatif iade işlem tutarını aşarsa PayTR ÖNCESİ reddedilir", async () => {
    const { service, paytr } = makeService({
      paymentAmount: 1000,
      metadata: { refundedOrders: { [ORDER_ID]: 800 } },
    });

    await expect(service.processRefund(ORDER_ID, 300)).rejects.toMatchObject({
      response: { i18nKey: "server.payment.refundAmountExceedsLimit" },
    });
    // PayTR'a hiç gidilmemeli (fazladan para iade edilmesin).
    expect(paytr.createRefund).not.toHaveBeenCalled();
  });
});
