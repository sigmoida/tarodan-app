import { PaymentRefundService } from "./payment-refund.service";
import { PaymentRefundAttemptService } from "./payment-refund-attempt.service";
import {
  PaymentStatus,
  RefundAttemptStatus,
  PaymentHoldStatus,
} from "@prisma/client";

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
    existingAttempt?: {
      idempotencyKey: string;
      amount: number;
      status: RefundAttemptStatus;
    };
    unresolvedAttempt?: boolean;
    /** Faz 6.2 defter kaydı testleri için enjekte edilen LedgerService taklidi. */
    ledger?: { recordRefund: jest.Mock };
  }) => {
    const captured = {
      paymentUpdate: undefined as any,
      holdUpdate: undefined as any,
    };
    const metadata = opts.metadata ?? {};
    // 11.2b: STATEFUL metadata — claimRefundSlot marker'ı KİLİT ALTINDA yazar, ardından
    // finalize tx TAZE okur. Mock'u gerçeğe uygun tut: `update` metadata'yı biriktirir,
    // `findUnique` güncel hâli döndürür. Böylece taze iadede claim marker'ı yazıp "proceed"
    // döner (PayTR çağrılır); önceden set marker "recovered" verir (PayTR atlanır) — ikisi de
    // gerçek davranış. (Eskiden findUnique sabit sahte marker döndürüp claim'i yanıltıyordu.)
    let currentMeta: Record<string, any> = { ...metadata };
    const attempt = {
      id: "attempt-1",
      paymentId: "pay-1",
      orderId: ORDER_ID,
      amount: opts.existingAttempt?.amount ?? 0,
      idempotencyKey:
        opts.existingAttempt?.idempotencyKey ?? "partial-refund-1",
      status: opts.existingAttempt?.status ?? RefundAttemptStatus.prepared,
      providerRefundId: null,
      providerResponse:
        opts.existingAttempt?.status === RefundAttemptStatus.succeeded
          ? { status: "success", merchant_oid: "REFUND1" }
          : null,
    };

    const mockTx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      refundAttempt: {
        findUnique: jest
          .fn()
          .mockImplementation(
            ({
              where,
            }: {
              where: { id?: string; idempotencyKey?: string };
            }) => {
              if (where.id) {
                return Promise.resolve({
                  ...attempt,
                  status: RefundAttemptStatus.succeeded,
                });
              }
              return Promise.resolve(
                opts.existingAttempt &&
                  where.idempotencyKey === opts.existingAttempt.idempotencyKey
                  ? attempt
                  : null,
              );
            },
          ),
        findFirst: jest
          .fn()
          .mockResolvedValue(opts.unresolvedAttempt ? attempt : null),
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
        findUnique: jest
          .fn()
          .mockImplementation(() => Promise.resolve({ metadata: currentMeta })),
        update: jest.fn().mockImplementation((arg: any) => {
          captured.paymentUpdate = arg;
          if (arg?.data?.metadata) currentMeta = arg.data.metadata;
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
                status: PaymentHoldStatus.held,
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
      refundAttempt: {
        findUnique: jest
          .fn()
          .mockResolvedValue(opts.existingAttempt ? attempt : null),
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
      opts.ledger as any, // Faz 6.2 ledger (@Optional)
    );
    return {
      service,
      captured,
      paytr,
      mockTx,
      prisma,
      commissionLedger,
      paymentCommon,
    };
  };

  it("H3: 1000 TL siparişte 50 TL jest → hold'un yalnız %5'i tüketilir (950 kalır), payment completed kalır", async () => {
    const { service, captured, paymentCommon } = makeService({
      paymentAmount: 1000,
      holdAmount: 1000, // satıcı payı = 1000 (test kolaylığı)
    });

    await service.processRefund(ORDER_ID, 50, {
      idempotencyKey: "partial-refund-50",
    });

    // Hold TUM'ü değil, tutar oranı (50/1000 = %5) kadar tüketilir → refundedAmount=50.
    expect(captured.holdUpdate.data).toEqual(
      expect.objectContaining({ refundedAmount: 50, frozenByRefundId: null }),
    );
    // Kısmi iade → payment refunded OLMAZ (completed kalır).
    expect(captured.paymentUpdate.data.status).toBe(PaymentStatus.completed);
    expect(paymentCommon.cancelSuratShipmentIfExists).not.toHaveBeenCalled();
  });

  it("H4: 1000 TL siparişte ilk 400 TL iade payment'ı refunded YAPMAZ", async () => {
    const { service, captured, paytr, paymentCommon } = makeService({
      paymentAmount: 1000,
    });

    await service.processRefund(ORDER_ID, 400, {
      idempotencyKey: "partial-refund-400",
    });

    expect(paytr.createRefund).toHaveBeenCalled();
    expect(captured.paymentUpdate.data.status).toBe(PaymentStatus.completed);
    // Kümülatif iade 400 olarak persist edilir (sonraki kısmi iade bunu okur).
    expect(captured.paymentUpdate.data.metadata.refundedOrders[ORDER_ID]).toBe(
      400,
    );
    expect(paymentCommon.cancelSuratShipmentIfExists).not.toHaveBeenCalled();
  });

  it("H4: önceki 400 TL iadeden sonra kalan 600 TL iade → kümülatif tam → refunded", async () => {
    const { service, captured, paymentCommon } = makeService({
      paymentAmount: 1000,
      metadata: { refundedOrders: { [ORDER_ID]: 400 } },
    });

    await service.processRefund(ORDER_ID, 600, {
      idempotencyKey: "partial-refund-600",
    });

    expect(captured.paymentUpdate.data.status).toBe(PaymentStatus.refunded);
    expect(captured.paymentUpdate.data.metadata.refundedOrders[ORDER_ID]).toBe(
      1000,
    );
    expect(paymentCommon.cancelSuratShipmentIfExists).toHaveBeenCalledWith(
      ORDER_ID,
      "ORD1",
    );
  });

  it("H4 tavan: kümülatif iade işlem tutarını aşarsa PayTR ÖNCESİ reddedilir", async () => {
    const { service, paytr } = makeService({
      paymentAmount: 1000,
      metadata: { refundedOrders: { [ORDER_ID]: 800 } },
    });

    await expect(
      service.processRefund(ORDER_ID, 300, {
        idempotencyKey: "partial-refund-over-cap",
      }),
    ).rejects.toMatchObject({
      response: { i18nKey: "server.payment.refundAmountExceedsLimit" },
    });
    // PayTR'a hiç gidilmemeli (fazladan para iade edilmesin).
    expect(paytr.createRefund).not.toHaveBeenCalled();
  });

  it("aynı idempotency anahtarı farklı tutarla tekrar kullanılamaz", async () => {
    const { service, paytr } = makeService({
      paymentAmount: 1000,
      existingAttempt: {
        idempotencyKey: "partial-refund-conflict",
        amount: 200,
        status: RefundAttemptStatus.failed,
      },
    });

    await expect(
      service.processRefund(ORDER_ID, 100, {
        idempotencyKey: "partial-refund-conflict",
      }),
    ).rejects.toMatchObject({
      response: { i18nKey: "server.payment.refundInitiationFailed" },
    });
    expect(paytr.createRefund).not.toHaveBeenCalled();
  });

  it("kalıcı sağlayıcı başarısını PayTR'a tekrar gitmeden finalize eder", async () => {
    const { service, captured, paytr } = makeService({
      paymentAmount: 1000,
      existingAttempt: {
        idempotencyKey: "partial-refund-recovery",
        amount: 300,
        status: RefundAttemptStatus.succeeded,
      },
    });

    await service.processRefund(ORDER_ID, 300, {
      idempotencyKey: "partial-refund-recovery",
    });

    expect(paytr.createRefund).not.toHaveBeenCalled();
    expect(captured.paymentUpdate.data.metadata.refundedOrders[ORDER_ID]).toBe(
      300,
    );
  });

  it("aynı ödeme için çözümlenmemiş farklı bir deneme varken yeni iade başlatmaz", async () => {
    const { service, paytr } = makeService({
      paymentAmount: 1000,
      unresolvedAttempt: true,
    });

    await expect(
      service.processRefund(ORDER_ID, 100, {
        idempotencyKey: "partial-refund-new",
      }),
    ).rejects.toThrow();
    expect(paytr.createRefund).not.toHaveBeenCalled();
  });

  it("fiziksel tam iadeyi nakit tutardan bağımsız kapatır ve kesin komisyon tutarlarını kullanır", async () => {
    const { service, captured, mockTx, commissionLedger } = makeService({
      paymentAmount: 1000,
      holdAmount: 800,
    });

    await service.processRefund(ORDER_ID, 820, {
      idempotencyKey: "policy-refund-full-return",
      refundQuantity: 1,
      settlement: {
        closeOrder: true,
        holdPortion: 1,
        sellerFeeRefundAmount: 100,
        buyerFeeRefundAmount: 0,
      },
    });

    expect(captured.paymentUpdate.data.status).toBe(PaymentStatus.completed);
    expect(captured.holdUpdate.data).toEqual(
      expect.objectContaining({
        status: PaymentHoldStatus.cancelled,
        refundedAmount: 800,
      }),
    );
    expect(commissionLedger.applyRefundAmounts).toHaveBeenCalledWith(
      ORDER_ID,
      {
        sellerFeeAmount: 100,
        buyerFeeAmount: 0,
        closeOrder: true,
      },
      mockTx,
    );
    expect(mockTx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ORDER_ID },
        data: { status: "cancelled" },
      }),
    );
  });

  it("holdRetainedAmount satıcının kargo payını hold'da bırakır (tam iade)", async () => {
    // Escrow hold TAM kargoyu düştüğü için satıcı kendi payını peşin ödemiş sayılır.
    // Cayma iadesinde bu pay satıcıya BIRAKILIR: hold tümüyle tüketilmez.
    const { service, captured } = makeService({
      paymentAmount: 1121,
      holdAmount: 861,
    });

    await service.processRefund(ORDER_ID, 1000, {
      idempotencyKey: "policy-refund-remorse-retain",
      refundQuantity: 1,
      settlement: {
        closeOrder: true,
        holdPortion: 1,
        sellerFeeRefundAmount: 0,
        buyerFeeRefundAmount: 0,
        holdRetainedAmount: 39,
      },
    });

    // 861 − 39 = 822 tüketilir; hold held kalır (39 satıcıya ödenecek).
    expect(captured.holdUpdate.data).toEqual(
      expect.objectContaining({ refundedAmount: 822, frozenByRefundId: null }),
    );
    expect(captured.holdUpdate.data.status).toBeUndefined();
  });

  it("holdRetainedAmount tüketimi YALNIZ aşağı çeker, asla yukarı", async () => {
    // Kısmi iade oranı zaten bırakılacak tutardan azını tüketiyorsa dokunulmaz.
    const { service, captured } = makeService({
      paymentAmount: 1000,
      holdAmount: 800,
    });

    await service.processRefund(ORDER_ID, 50, {
      idempotencyKey: "policy-refund-retain-noop",
      refundQuantity: 1,
      settlement: { holdRetainedAmount: 100 },
    });

    // Oran tüketimi 40 (50/1000 × 800); 800 − 100 = 700 tavanının altında → 40 kalır.
    expect(captured.holdUpdate.data).toEqual(
      expect.objectContaining({ refundedAmount: 40 }),
    );
  });

  it("bırakılacak tutar hold'u aşarsa hiç tüketim olmaz", async () => {
    const { service, captured } = makeService({
      paymentAmount: 200,
      holdAmount: 30,
    });

    await service.processRefund(ORDER_ID, 200, {
      idempotencyKey: "policy-refund-retain-over",
      refundQuantity: 1,
      settlement: { closeOrder: true, holdPortion: 1, holdRetainedAmount: 40 },
    });

    expect(captured.holdUpdate.data).toEqual(
      expect.objectContaining({ refundedAmount: 0 }),
    );
  });

  /**
   * Faz 6.2 `refund_issued` kaydı iade TX'İNİN İÇİNDE yazılır. İki sertleştirme:
   *
   *  - İDEMPOTENCY: anahtar iade DENEMESİNDEN türetilir → aynı deneme tekrar
   *    işlenirse ikinci ters kayıt DB'de (idempotency_key, line_no) UNIQUE ile düşer.
   *  - FAIL-LOUD: tx içindeki defter hatası artık YUTULMAZ. Yutulduğunda para geri
   *    dönmüş ama ters kayıt yazılmamış oluyordu; defter sessizce eksiliyordu.
   *    Aynı tx'te olduğu için fırlatmak iadeyi geri alır → ya ikisi ya hiçbiri.
   *    (POST-COMMIT yollar — capture, payout tamamlama — best-effort KALIR: orada
   *    para zaten commit'li, fırlatmak hiçbir şeyi geri almaz.)
   */
  describe("refund_issued defter kaydı", () => {
    it("ters kaydı iade denemesinin kimliğiyle (idempotency) yazar", async () => {
      const ledger = { recordRefund: jest.fn().mockResolvedValue("group-1") };
      const { service, mockTx } = makeService({
        paymentAmount: 1000,
        holdAmount: 1000,
        ledger,
      });

      await service.processRefund(ORDER_ID, 400, {
        idempotencyKey: "ledger-refund-400",
      });

      expect(ledger.recordRefund).toHaveBeenCalledTimes(1);
      const [txArg, input] = ledger.recordRefund.mock.calls[0];
      expect(txArg).toBe(mockTx); // iade ile AYNI transaction
      expect(input).toMatchObject({
        orderId: ORDER_ID,
        refundAttemptId: "attempt-1",
        orderTotal: 1000,
        refundAmount: 400,
      });
    });

    it("defter yazımı düşerse iade TX'İ GERİ ALINIR (hata yutulmaz)", async () => {
      const ledger = {
        recordRefund: jest.fn().mockRejectedValue(new Error("ledger down")),
      };
      const { service } = makeService({
        paymentAmount: 1000,
        holdAmount: 1000,
        ledger,
      });

      await expect(
        service.processRefund(ORDER_ID, 400, {
          idempotencyKey: "ledger-refund-fails",
        }),
      ).rejects.toThrow("ledger down");
    });
  });
});
