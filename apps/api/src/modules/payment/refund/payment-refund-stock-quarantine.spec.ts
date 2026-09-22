import { PaymentRefundService } from "./payment-refund.service";
import { PaymentRefundAttemptService } from "./payment-refund-attempt.service";
import {
  PaymentStatus,
  RefundAttemptStatus,
  PaymentHoldStatus,
  ProductStatus,
} from "@prisma/client";

/**
 * PO kararı: "İade edilen ürün otomatik stoğa döner ama hasarlı olabilir; ilan
 * PASİF kalmalı, satıcı kendisi aktive eder." Teslimat ÖNCESİ (kargo/ödeme
 * öncesi) iptallerde ürün alıcının eline hiç geçmedi → eski davranış (miktardan
 * status) korunur. Tek sinyal `Order.deliveredAt` — bkz.
 * `shouldQuarantineReturnedStock` (product-status.helper.ts).
 */
describe("PaymentRefundService.processRefund — post-delivery return stock quarantine", () => {
  const ORDER_ID = "order-1";

  const makeService = (opts: {
    paymentAmount: number;
    orderQuantity?: number;
    refundQuantity?: number;
    closeOrder?: boolean;
    deliveredAt?: Date | null;
    productQuantity?: number | null;
    productStatus?: ProductStatus;
    stockRestoredAt?: Date | null;
  }) => {
    const captured = {
      productUpdate: undefined as any,
    };

    const attempt = {
      id: "attempt-1",
      paymentId: "pay-1",
      orderId: ORDER_ID,
      amount: 0,
      idempotencyKey: "quarantine-refund-1",
      status: RefundAttemptStatus.prepared,
      providerRefundId: null,
      providerResponse: null,
    };

    const mockTx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      refundAttempt: {
        findUnique: jest
          .fn()
          .mockImplementation(
            ({ where }: { where: { id?: string; idempotencyKey?: string } }) =>
              where.id
                ? Promise.resolve({
                    ...attempt,
                    status: RefundAttemptStatus.succeeded,
                  })
                : Promise.resolve(null),
          ),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve({
              ...attempt,
              ...data,
              status: RefundAttemptStatus.prepared,
            }),
          ),
        update: jest.fn().mockResolvedValue({
          ...attempt,
          status: RefundAttemptStatus.finalized,
        }),
      },
      payment: {
        findUnique: jest.fn().mockResolvedValue({ metadata: {} }),
        update: jest.fn().mockResolvedValue({}),
      },
      paymentHold: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      payoutTransfer: { findFirst: jest.fn().mockResolvedValue(null) },
      order: {
        findUnique: jest.fn().mockResolvedValue({
          status: "delivered",
          productId: "prod-1",
          quantity: opts.orderQuantity ?? 1,
          stockRestoredAt: opts.stockRestoredAt ?? null,
          offerId: null,
          deliveredAt: opts.deliveredAt ?? null,
          buyerId: "b1",
          sellerId: "s1",
          orderNumber: "ORD1",
          cancellationType: "iade",
          commissionAmount: 0,
          withholdingTaxAmount: 0,
          buyer: { id: "b1", email: "b@x", displayName: "B" },
          seller: { id: "s1", email: "s@x", displayName: "S" },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      product: {
        findUnique: jest.fn().mockResolvedValue({
          quantity: opts.productQuantity ?? 0,
        }),
        update: jest.fn().mockImplementation((arg: any) => {
          captured.productUpdate = arg;
          return Promise.resolve({});
        }),
      },
      offer: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
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
          metadata: {},
          order: { quantity: opts.orderQuantity ?? 1, orderNumber: "ORD1" },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      refundAttempt: {
        findUnique: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn((fn: any) => fn(mockTx)),
    };

    const paytr = {
      createRefund: jest.fn().mockResolvedValue({ status: "success" }),
    };
    const commissionLedger = {
      applyRefund: jest.fn().mockResolvedValue(undefined),
      applyRefundAmounts: jest.fn().mockResolvedValue(undefined),
    };
    const paymentCommon = {
      cancelSuratShipmentIfExists: jest.fn().mockResolvedValue(undefined),
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
      commissionLedger as any,
      { handleOrderRefund: jest.fn().mockResolvedValue(undefined) } as any,
      paymentCommon as any,
      { record: jest.fn().mockResolvedValue(undefined) } as any, // providerEvents
      {} as any, // holdRelease
      new PaymentRefundAttemptService(prisma as any), // attempts
      {} as any, // tradeRefunds — bu spec yalnız SİPARİŞ iadesini sürüyor
      undefined, // outbox
      undefined, // ledger (Faz 6.2, @Optional)
    );
    return { service, captured, mockTx, prisma };
  };

  const refundOpts = (over: Record<string, unknown> = {}) => ({
    idempotencyKey: "quarantine-refund-1",
    refundQuantity: 1,
    settlement: { closeOrder: true, holdPortion: 1 },
    ...over,
  });

  it("teslim SONRASI tam iade: stok artar ama ilan PASİF (sold ürün — statüden bağımsız zorlanır)", async () => {
    const { service, captured } = makeService({
      paymentAmount: 500,
      orderQuantity: 1,
      deliveredAt: new Date("2026-09-10T10:00:00Z"),
      productQuantity: 0, // önceden tükenmiş/`sold` idi
    });

    const result = await service.processRefund(ORDER_ID, 500, refundOpts());

    expect(captured.productUpdate.data).toEqual({
      quantity: { increment: 1 },
      status: ProductStatus.inactive,
    });
    expect((result as any).stockQuarantined).toBe(true);
  });

  it("teslim SONRASI iade: çok adetli ilanda kalan adet > 0 olsa da TÜM ilan pasif", async () => {
    // 5 adetlik ilanın 2'si iade edildi; kalan 3 adet zaten stokta olsa da
    // (newQty = 3 + 2 = 5 > 0) güvenlik önceliği ile ilan pasife düşer.
    const { service, captured } = makeService({
      paymentAmount: 200,
      orderQuantity: 5,
      deliveredAt: new Date("2026-09-10T10:00:00Z"),
      productQuantity: 3,
    });

    await service.processRefund(
      ORDER_ID,
      200,
      refundOpts({ refundQuantity: 2, settlement: { closeOrder: false } }),
    );

    expect(captured.productUpdate.data.status).toBe(ProductStatus.inactive);
    expect(captured.productUpdate.data.quantity).toEqual({ increment: 2 });
  });

  it("teslim SONRASI kısmi adet iadesi de PASİF sonucu verir", async () => {
    const { service, captured } = makeService({
      paymentAmount: 1000,
      orderQuantity: 3,
      deliveredAt: new Date("2026-09-10T10:00:00Z"),
      productQuantity: 1,
    });

    // closeOrder=false → isFullRefund false; restoreQty yalnız refundQuantity'den gelir.
    await service.processRefund(
      ORDER_ID,
      333,
      refundOpts({ refundQuantity: 1, settlement: { closeOrder: false } }),
    );

    expect(captured.productUpdate.data).toEqual({
      quantity: { increment: 1 },
      status: ProductStatus.inactive,
    });
  });

  it("teslimat ÖNCESİ iptal (deliveredAt null) → eski davranış: miktardan status (active)", async () => {
    const { service, captured } = makeService({
      paymentAmount: 500,
      orderQuantity: 1,
      deliveredAt: null,
      productQuantity: 0,
    });

    const result = await service.processRefund(ORDER_ID, 500, refundOpts());

    expect(captured.productUpdate.data).toEqual({
      quantity: { increment: 1 },
      status: ProductStatus.active,
    });
    expect((result as any).stockQuarantined).toBe(false);
  });

  it("sınırsız stok (quantity null) → karantina uygulanmaz, ürün hiç güncellenmez", async () => {
    const { service, captured } = makeService({
      paymentAmount: 500,
      orderQuantity: 1,
      deliveredAt: new Date("2026-09-10T10:00:00Z"),
      productQuantity: null,
    });

    const result = await service.processRefund(ORDER_ID, 500, refundOpts());

    expect(captured.productUpdate).toBeUndefined();
    expect((result as any).stockQuarantined).toBe(false);
  });

  it("stockRestoredAt zaten set edilmişse iade tekrar restock/karantina uygulamaz (idempotency)", async () => {
    const { service, captured } = makeService({
      paymentAmount: 500,
      orderQuantity: 1,
      deliveredAt: new Date("2026-09-10T10:00:00Z"),
      productQuantity: 0,
      stockRestoredAt: new Date("2026-09-11T00:00:00Z"),
    });

    const result = await service.processRefund(ORDER_ID, 500, refundOpts());

    expect(captured.productUpdate).toBeUndefined();
    expect((result as any).stockQuarantined).toBe(false);
  });
});
