import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { ModuleRef } from "@nestjs/core";
import { PaymentService } from "./payment.service";
import { PaymentQueryService } from "./payment-query.service";
import { PaymentCommonService } from "./payment-common.service";
import { PaymentRefundService } from "./payment-refund.service";
import { PaymentReconciliationService } from "./payment-reconciliation.service";
import { PaymentInitiationService } from "./payment-initiation.service";
import { PaymentCallbackService } from "./payment-callback.service";
import { PaymentFulfillmentService } from "./payment-fulfillment.service";
import { PaymentLifecycleService } from "./payment-lifecycle.service";
import { PrismaService } from "../../prisma";
import { CacheService } from "../cache/cache.service";
import { PaymentProviderRegistry } from "../payment-providers/payment-provider.registry";
import { EventService } from "../events";
import { InvoiceService } from "../invoice/invoice.service";
import { ElogoInvoicingService } from "../elogo";
import { ProductLockService } from "../product/product-lock.service";
import { NotificationService } from "../notification/notification.service";
import { SuratCargoService } from "../surat-cargo/surat-cargo.service";
import { CommissionLedgerService } from "../commission/commission-ledger.service";
import { StorageService } from "../storage/storage.service";
import { I18nService } from "../i18n";
import { PaymentStatus } from "@prisma/client";

/**
 * B3: PayTR çift-iade koruması. refundInProgressAt marker'ı PayTR çağrısından önce
 * yazılır; marker zaten varsa (önceki denemede PayTR çağrılmış ama persist başarısız
 * olmuş) PayTR tekrar çağrılmaz, yalnız persist-recovery denenir.
 */
describe("PaymentService refundTradeCashPaymentIfCompleted — B3 çift-iade koruması", () => {
  let service: PaymentService;

  const mockTx = {
    payment: { update: jest.fn() },
    tradeCashPayment: { update: jest.fn() },
  };

  const mockPrisma = {
    payment: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    payoutTransfer: { findFirst: jest.fn() },
    $transaction: jest.fn(async (fn: (tx: typeof mockTx) => Promise<void>) => {
      await fn(mockTx);
    }),
  };

  const mockPaytr = { createRefund: jest.fn() };

  const TRADE_ID = "550e8400-e29b-41d4-a716-446655440000";

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.payoutTransfer.findFirst.mockResolvedValue(null);

    const noop = {} as any;
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        PaymentQueryService,
        PaymentCommonService,
        PaymentRefundService,
        PaymentReconciliationService,
        PaymentInitiationService,
        PaymentCallbackService,
        PaymentFulfillmentService,
        PaymentLifecycleService,
        I18nService,
        {
          provide: ElogoInvoicingService,
          useValue: {
            issueCommissionInvoice: jest.fn().mockResolvedValue(undefined),
            issueServiceFeeInvoice: jest.fn().mockResolvedValue(undefined),
            issueMembershipInvoice: jest.fn().mockResolvedValue(undefined),
            issueBoostInvoice: jest.fn().mockResolvedValue(undefined),
            handleOrderRefund: jest.fn().mockResolvedValue(undefined),
            issuePlatformSaleInvoice: jest.fn().mockResolvedValue(undefined),
            handleTradeCashRefund: jest.fn().mockResolvedValue(undefined),
            issueTradeCashCommissionInvoice: jest
              .fn()
              .mockResolvedValue(undefined),
            retryPendingInvoices: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CacheService, useValue: { del: jest.fn() } },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(undefined) },
        },
        {
          provide: PaymentProviderRegistry,
          useValue: { resolve: () => mockPaytr },
        },
        { provide: EventService, useValue: noop },
        { provide: InvoiceService, useValue: noop },
        { provide: ProductLockService, useValue: noop },
        { provide: NotificationService, useValue: noop },
        { provide: SuratCargoService, useValue: noop },
        { provide: CommissionLedgerService, useValue: noop },
        { provide: StorageService, useValue: noop },
        { provide: ModuleRef, useValue: noop },
      ],
    }).compile();

    service = module.get(PaymentService);
  });

  const basePayment = (metadata: Record<string, unknown>) => ({
    id: "pay-1",
    amount: 99.5,
    provider: "paytr",
    status: PaymentStatus.completed,
    providerConversationId: "ORDER123",
    tradeCashPaymentId: "tcp-1",
    metadata,
    tradeCashPayment: { id: "tcp-1", tradeId: TRADE_ID, totalAmount: 99.5 },
  });

  it("marker yokken: önce marker yazar, sonra PayTR iadesini çağırır", async () => {
    mockPrisma.payment.findFirst.mockResolvedValue(basePayment({ foo: 1 }));
    mockPaytr.createRefund.mockResolvedValue({ status: "success" });

    const r = await service.refundTradeCashPaymentIfCompleted(TRADE_ID);

    expect(r.refunded).toBe(true);
    // marker, PayTR çağrısından önce kalıcı yazılmalı (prisma.payment.update, tx dışı)
    expect(mockPrisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "pay-1" },
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            refundInProgressAt: expect.any(String),
          }),
        }),
      }),
    );
    expect(mockPaytr.createRefund).toHaveBeenCalledWith("ORDER123", 99.5);
  });

  it("marker varken: PayTR tekrar ÇAĞRILMAZ, yalnız persist-recovery denenir", async () => {
    mockPrisma.payment.findFirst.mockResolvedValue(
      basePayment({ refundInProgressAt: "2026-06-29T00:00:00.000Z" }),
    );

    const r = await service.refundTradeCashPaymentIfCompleted(TRADE_ID);

    expect(r.refunded).toBe(true);
    expect(mockPaytr.createRefund).not.toHaveBeenCalled();
    // recovery: refundedAt persist edilmeli
    expect(mockTx.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: PaymentStatus.refunded }),
      }),
    );
  });

  it("marker yazımı başarısızsa PayTR çağrılmadan abort eder", async () => {
    mockPrisma.payment.findFirst.mockResolvedValue(basePayment({ foo: 1 }));
    mockPrisma.payment.update.mockRejectedValueOnce(new Error("db down"));

    await expect(
      service.refundTradeCashPaymentIfCompleted(TRADE_ID),
    ).rejects.toThrow();
    expect(mockPaytr.createRefund).not.toHaveBeenCalled();
  });

  // G5: çift-iade idempotency guard'ları — PayTR ASLA çağrılmamalı.
  it("G5: tradeCashPayment.refundedAt zaten doluysa iade atlanır (already_refunded)", async () => {
    mockPrisma.payment.findFirst.mockResolvedValue(null); // refundedAt:null filtresi eşleşmez
    const r = await service.refundTradeCashPaymentIfCompleted(TRADE_ID);
    expect(r.refunded).toBe(false);
    expect(r.skippedReason).toBe("no_completed_paytr_payment");
    expect(mockPaytr.createRefund).not.toHaveBeenCalled();
  });

  it("G5: PayoutTransfer processing/completed varsa iade atlanır (payout_already_in_progress)", async () => {
    mockPrisma.payment.findFirst.mockResolvedValue(basePayment({ foo: 1 }));
    mockPrisma.payoutTransfer.findFirst.mockResolvedValue({
      id: "po-1",
      status: "completed",
    });

    const r = await service.refundTradeCashPaymentIfCompleted(TRADE_ID);

    expect(r.refunded).toBe(false);
    expect(r.skippedReason).toBe("payout_already_in_progress");
    expect(mockPaytr.createRefund).not.toHaveBeenCalled();
  });

  // D3: PayTR "ödeme henüz siteye bildirilmemiş" hatasını kullanıcı-dostu
  // "1-2 dakika sonra tekrar deneyin" mesajına çevirir (yeni tamamlanan ödemede iade).
  it('D3: PayTR "henüz bildirilmemiş" hatası → "1-2 dakika sonra tekrar deneyin" mesajına çevrilir', async () => {
    mockPrisma.payment.findFirst.mockResolvedValue(basePayment({ foo: 1 }));
    mockPaytr.createRefund.mockRejectedValue(
      new Error("odeme henuz siteye bildirilmemis"),
    );

    await expect(
      service.refundTradeCashPaymentIfCompleted(TRADE_ID),
    ).rejects.toMatchObject({
      response: { i18nKey: "server.payment.paymentNotYetSynced" },
    });
  });

  // MONEY-H1: Geçici PayTR hatasında (throw) refundInProgressAt marker'ı GERİ ALINMALI.
  // Aksi halde marker kalır, sonraki deneme refundAlreadyInitiated=true görüp PayTR'yi
  // ATLAR ve parayı iade ETMEDEN refunded işaretler (sahte iade).
  it("MONEY-H1: geçici PayTR hatasında marker geri alınır (retry PayTR'yi tekrar çağırabilsin)", async () => {
    mockPrisma.payment.findFirst.mockResolvedValue(basePayment({ foo: 1 }));
    // clearTradeRefundInProgress fresh metadata okur → marker set edilmiş hâli döner
    mockPrisma.payment.findUnique.mockResolvedValue({
      metadata: { foo: 1, refundInProgressAt: "2026-07-22T00:00:00.000Z" },
    });
    mockPaytr.createRefund.mockRejectedValue(
      new Error("odeme henuz siteye bildirilmemis"),
    );

    await expect(
      service.refundTradeCashPaymentIfCompleted(TRADE_ID),
    ).rejects.toMatchObject({
      response: { i18nKey: "server.payment.paymentNotYetSynced" },
    });

    // Bir payment.update çağrısı, refundInProgressAt İÇERMEYEN metadata ile yapılmalı
    // (marker temizleme). İlk update marker'ı YAZAR (içerir); temizleme onu SİLER.
    const clearCall = mockPrisma.payment.update.mock.calls.find(
      ([arg]: [{ data?: { metadata?: Record<string, unknown> } }]) =>
        arg?.data?.metadata !== undefined &&
        !("refundInProgressAt" in arg.data.metadata),
    );
    expect(clearCall).toBeDefined();
  });

  // FLOW-M5: iade GERÇEKTEN çekilen oid = providerConversationId ile yapılır. Bu yoksa
  // gerçek yolda (bypass değil) eski kod UUID'yi oid sanıp yanlış çağrı yapıyordu; artık
  // createRefund'a hiç gidilmeden reddedilir.
  it("FLOW-M5: providerConversationId yoksa (gerçek yol) createRefund çağrılmadan reddedilir", async () => {
    mockPrisma.payment.findFirst.mockResolvedValue({
      ...basePayment({ foo: 1 }),
      providerConversationId: null,
    });

    await expect(
      service.refundTradeCashPaymentIfCompleted(TRADE_ID),
    ).rejects.toThrow();
    expect(mockPaytr.createRefund).not.toHaveBeenCalled();
  });

  // MONEY-H1: PayTR non-success status DÖNERSE de (throw değil) marker geri alınmalı.
  it("MONEY-H1: PayTR non-success status'ta da marker geri alınır", async () => {
    mockPrisma.payment.findFirst.mockResolvedValue(basePayment({ foo: 1 }));
    mockPrisma.payment.findUnique.mockResolvedValue({
      metadata: { foo: 1, refundInProgressAt: "2026-07-22T00:00:00.000Z" },
    });
    mockPaytr.createRefund.mockResolvedValue({
      status: "failed",
      err_msg: "insufficient balance",
    });

    await expect(
      service.refundTradeCashPaymentIfCompleted(TRADE_ID),
    ).rejects.toThrow();

    const clearCall = mockPrisma.payment.update.mock.calls.find(
      ([arg]: [{ data?: { metadata?: Record<string, unknown> } }]) =>
        arg?.data?.metadata !== undefined &&
        !("refundInProgressAt" in arg.data.metadata),
    );
    expect(clearCall).toBeDefined();
  });
});
