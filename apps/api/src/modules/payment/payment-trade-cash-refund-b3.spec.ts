import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { ModuleRef } from "@nestjs/core";
import { PaymentStatus, RefundAttemptStatus } from "@prisma/client";
import { PaymentService } from "./payment.service";
import { PaymentQueryService } from "./payment-query.service";
import { PaymentCommonService } from "./payment-common.service";
import { PaymentRefundService } from "./payment-refund.service";
import { PaymentHoldReleaseService } from "./payment-hold-release.service";
import { PaymentRefundAttemptService } from "./payment-refund-attempt.service";
import { PaymentTradeRefundService } from "./payment-trade-refund.service";
import { PaymentReconciliationService } from "./payment-reconciliation.service";
import { ReservationReconciliationService } from "./reservation-reconciliation.service";
import { PaymentExpiryReconciliationService } from "./payment-expiry-reconciliation.service";
import { PspReconciliationService } from "./psp-reconciliation.service";
import { RefundReconciliationService } from "./refund-reconciliation.service";
import { MiscReconciliationService } from "./misc-reconciliation.service";
import { PaymentInitiationService } from "./payment-initiation.service";
import { PaymentCallbackService } from "./payment-callback.service";
import { PaymentFulfillmentService } from "./payment-fulfillment.service";
import { FulfillmentNotifier } from "./fulfillment-notifier.service";
import { FulfillmentFinalizer } from "./fulfillment-finalizer.service";
import { EscrowHoldService } from "./escrow-hold.service";
import { FulfillmentStockService } from "./fulfillment-stock.service";
import { VirtualOrderFulfillmentService } from "./virtual-order-fulfillment.service";
import { PaymentProviderEventService } from "./payment-provider-event.service";
import { PaymentLifecycleService } from "./payment-lifecycle.service";
import { PrismaService } from "../../prisma";
import { CacheService } from "../cache/cache.service";
import { PaymentProviderRegistry } from "../payment-providers/payment-provider.registry";
import {
  ProviderRefundRejectedException,
  RefundPendingReconciliationException,
} from "../payment-providers/refund-errors";
import { EventService } from "../events";
import { InvoiceService } from "../invoice/invoice.service";
import { ElogoInvoicingService } from "../elogo";
import { ProductLockService } from "../product/product-lock.service";
import { NotificationService } from "../notification/notification.service";
import { SuratCargoService } from "../surat-cargo/surat-cargo.service";
import { CARGO_PROVIDER } from "../surat-cargo/cargo-provider";
import { OrderShipmentProvisioner } from "../surat-cargo/order-shipment-provisioner.service";
import { CarrierCancellationService } from "../surat-cargo/carrier-cancellation.service";
import { CommissionLedgerService } from "../commission/commission-ledger.service";
import { StorageService } from "../storage/storage.service";
import { I18nService } from "../i18n";
import { OutboxService } from "../outbox/outbox.service";

describe("PaymentService trade cash refund idempotency", () => {
  let service: PaymentService;

  const TRADE_ID = "550e8400-e29b-41d4-a716-446655440000";
  const ATTEMPT_ID = "refund-attempt-1";

  const refundAttempt = (
    status: RefundAttemptStatus = RefundAttemptStatus.prepared,
  ) => ({
    id: ATTEMPT_ID,
    paymentId: "pay-1",
    tradeId: TRADE_ID,
    idempotencyKey: "trade-cash-refund:pay-1",
    amount: 99.5,
    status,
    providerRefundId: null,
    providerResponse:
      status === RefundAttemptStatus.succeeded ||
      status === RefundAttemptStatus.finalized
        ? { status: "success" }
        : null,
  });

  const mockTx = {
    $queryRaw: jest.fn(),
    refundAttempt: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    payment: { update: jest.fn() },
    tradeCashPayment: { update: jest.fn() },
  };

  const mockPrisma = {
    // v2: takasın TÜM tamamlanmış ödemeleri iade edilir → findMany.
    payment: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    // İade matrisi eşiği: herhangi bir bacak kargoya verildi mi?
    trade: { findUnique: jest.fn().mockResolvedValue(null) },
    tradeShipment: { count: jest.fn().mockResolvedValue(0) },
    refundAttempt: { updateMany: jest.fn() },
    payoutTransfer: { findFirst: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn(),
  };

  const mockPaytr = { createRefund: jest.fn() };
  const mockOutbox = { enqueue: jest.fn() };

  const basePayment = () => ({
    id: "pay-1",
    amount: 99.5,
    provider: "paytr",
    status: PaymentStatus.completed,
    providerConversationId: "ORDER123",
    tradeCashPaymentId: "tcp-1",
    metadata: { checkoutGroupId: "group-1" },
    tradeCashPayment: { id: "tcp-1", tradeId: TRADE_ID, totalAmount: 99.5 },
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTx.$queryRaw.mockResolvedValue([]);
    mockTx.refundAttempt.findUnique.mockImplementation(
      ({ where }: { where: { id?: string; idempotencyKey?: string } }) =>
        where.id
          ? Promise.resolve(refundAttempt(RefundAttemptStatus.succeeded))
          : Promise.resolve(null),
    );
    mockTx.refundAttempt.findFirst.mockResolvedValue(null);
    mockTx.refundAttempt.create.mockResolvedValue(refundAttempt());
    mockTx.refundAttempt.update.mockResolvedValue(
      refundAttempt(RefundAttemptStatus.finalized),
    );
    mockTx.payment.update.mockResolvedValue({});
    mockTx.tradeCashPayment.update.mockResolvedValue({});
    mockPrisma.refundAttempt.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.payoutTransfer.findFirst.mockResolvedValue(null);
    mockPrisma.payoutTransfer.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.$transaction.mockImplementation(
      (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx),
    );
    mockPaytr.createRefund.mockResolvedValue({ status: "success" });
    mockOutbox.enqueue.mockResolvedValue(undefined);

    const noop = {} as any;
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        PaymentQueryService,
        PaymentCommonService,
        PaymentRefundService,
        PaymentHoldReleaseService,
        PaymentRefundAttemptService,
        PaymentTradeRefundService,
        PaymentReconciliationService,
        ReservationReconciliationService,
        PaymentExpiryReconciliationService,
        PspReconciliationService,
        RefundReconciliationService,
        MiscReconciliationService,
        PaymentInitiationService,
        PaymentCallbackService,
        PaymentFulfillmentService,
        PaymentLifecycleService,
        I18nService,
        FulfillmentFinalizer,
        EscrowHoldService,
        FulfillmentStockService,
        VirtualOrderFulfillmentService,
        {
          provide: FulfillmentNotifier,
          useValue: {
            notifyStockoutCascade: jest.fn().mockResolvedValue(undefined),
            dispatchBackInStock: jest.fn().mockResolvedValue(undefined),
          },
        },
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
            issueTradeCashFeeInvoice: jest.fn().mockResolvedValue(undefined),
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
        { provide: CARGO_PROVIDER, useValue: noop },
        { provide: OrderShipmentProvisioner, useValue: noop },
        { provide: CarrierCancellationService, useValue: noop },
        { provide: CommissionLedgerService, useValue: noop },
        { provide: StorageService, useValue: noop },
        { provide: OutboxService, useValue: mockOutbox },
        { provide: ModuleRef, useValue: noop },
        {
          provide: PaymentProviderEventService,
          useValue: { record: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get(PaymentService);
  });

  it("persists a prepared attempt before calling the provider", async () => {
    mockPrisma.payment.findMany.mockResolvedValue([basePayment()]);

    const result = await service.refundTradeCashPaymentIfCompleted(TRADE_ID);

    expect(result).toEqual({ refunded: true, paymentId: "pay-1" });
    expect(mockTx.refundAttempt.create).toHaveBeenCalledWith({
      data: {
        paymentId: "pay-1",
        tradeId: TRADE_ID,
        idempotencyKey: "trade-cash-refund:pay-1",
        amount: 99.5,
        provider: "paytr",
        providerReference: "ORDER123",
      },
    });
    expect(
      mockTx.refundAttempt.create.mock.invocationCallOrder[0],
    ).toBeLessThan(mockPaytr.createRefund.mock.invocationCallOrder[0]);
    expect(mockPrisma.refundAttempt.updateMany).toHaveBeenCalledWith({
      where: { id: ATTEMPT_ID, status: RefundAttemptStatus.prepared },
      data: {
        status: RefundAttemptStatus.submitting,
        requestStartedAt: expect.any(Date),
      },
    });
    expect(mockPrisma.refundAttempt.updateMany).toHaveBeenCalledWith({
      where: { id: ATTEMPT_ID, status: RefundAttemptStatus.submitting },
      data: {
        status: RefundAttemptStatus.succeeded,
        providerRefundId: null,
        providerResponse: { status: "success" },
        providerSucceededAt: expect.any(Date),
      },
    });
    // reference_no = attempt id: PayTR durum-sorgu mutabakatı için gönderilir.
    expect(mockPaytr.createRefund).toHaveBeenCalledWith(
      "ORDER123",
      99.5,
      "refund-attempt-1",
    );
    expect(mockTx.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "pay-1" },
        data: expect.objectContaining({ status: PaymentStatus.refunded }),
      }),
    );
  });

  it("finalizes a durable provider success without submitting another refund", async () => {
    mockPrisma.payment.findMany.mockResolvedValue([basePayment()]);
    mockTx.refundAttempt.findUnique.mockResolvedValue(
      refundAttempt(RefundAttemptStatus.succeeded),
    );

    const result = await service.refundTradeCashPaymentIfCompleted(TRADE_ID);

    expect(result.refunded).toBe(true);
    expect(mockPaytr.createRefund).not.toHaveBeenCalled();
    expect(mockTx.payment.update).toHaveBeenCalled();
    expect(mockTx.refundAttempt.update).toHaveBeenCalledWith({
      where: { id: ATTEMPT_ID },
      data: {
        status: RefundAttemptStatus.finalized,
        finalizedAt: expect.any(Date),
      },
    });
  });

  it("treats an already-finalized attempt as an idempotent success", async () => {
    mockPrisma.payment.findMany.mockResolvedValue([basePayment()]);
    mockTx.refundAttempt.findUnique.mockResolvedValue(
      refundAttempt(RefundAttemptStatus.finalized),
    );

    const result = await service.refundTradeCashPaymentIfCompleted(TRADE_ID);

    expect(result).toEqual({ refunded: true, paymentId: "pay-1" });
    expect(mockPaytr.createRefund).not.toHaveBeenCalled();
    expect(mockPrisma.payoutTransfer.updateMany).not.toHaveBeenCalled();
  });

  it("does not call the provider when the durable attempt cannot be created", async () => {
    mockPrisma.payment.findMany.mockResolvedValue([basePayment()]);
    mockTx.refundAttempt.create.mockRejectedValueOnce(new Error("db down"));

    await expect(
      service.refundTradeCashPaymentIfCompleted(TRADE_ID),
    ).rejects.toThrow("db down");
    expect(mockPaytr.createRefund).not.toHaveBeenCalled();
  });

  it("skips when no refundable completed PayTR payment exists", async () => {
    mockPrisma.payment.findMany.mockResolvedValue([]);

    const result = await service.refundTradeCashPaymentIfCompleted(TRADE_ID);

    expect(result).toEqual({
      refunded: false,
      skippedReason: "no_completed_paytr_payment",
    });
    expect(mockPaytr.createRefund).not.toHaveBeenCalled();
  });

  it("moves the attempt to manual review when a payout is already in progress", async () => {
    mockPrisma.payment.findMany.mockResolvedValue([basePayment()]);
    mockPrisma.payoutTransfer.findFirst.mockResolvedValue({
      id: "po-1",
      status: "completed",
    });

    const result = await service.refundTradeCashPaymentIfCompleted(TRADE_ID);

    expect(result).toEqual({
      refunded: false,
      skippedReason: "payout_already_in_progress",
    });
    expect(mockPrisma.refundAttempt.updateMany).toHaveBeenCalledWith({
      where: { id: ATTEMPT_ID, status: RefundAttemptStatus.prepared },
      data: {
        status: RefundAttemptStatus.manual_review,
        failureReason: "payout_completed",
      },
    });
    expect(mockPaytr.createRefund).not.toHaveBeenCalled();
  });

  it("maps PayTR's not-yet-synced rejection and leaves a retryable failed attempt", async () => {
    mockPrisma.payment.findMany.mockResolvedValue([basePayment()]);
    mockPaytr.createRefund.mockRejectedValue(
      new ProviderRefundRejectedException("odeme henuz siteye bildirilmemis"),
    );

    await expect(
      service.refundTradeCashPaymentIfCompleted(TRADE_ID),
    ).rejects.toMatchObject({
      response: { i18nKey: "server.payment.paymentNotYetSynced" },
    });
    expect(mockPrisma.refundAttempt.updateMany).toHaveBeenCalledWith({
      where: { id: ATTEMPT_ID, status: RefundAttemptStatus.submitting },
      data: {
        status: RefundAttemptStatus.failed,
        failureReason: "odeme henuz siteye bildirilmemis",
      },
    });
  });

  it("requires reconciliation after an unknown provider outcome", async () => {
    mockPrisma.payment.findMany.mockResolvedValue([basePayment()]);
    mockPaytr.createRefund.mockRejectedValue(new Error("connection reset"));

    await expect(
      service.refundTradeCashPaymentIfCompleted(TRADE_ID),
    ).rejects.toBeInstanceOf(RefundPendingReconciliationException);
    expect(mockPrisma.refundAttempt.updateMany).toHaveBeenCalledWith({
      where: { id: ATTEMPT_ID, status: RefundAttemptStatus.submitting },
      data: {
        status: RefundAttemptStatus.manual_review,
        failureReason: "connection reset",
      },
    });
  });

  it("rejects a missing provider reference before creating an attempt", async () => {
    mockPrisma.payment.findMany.mockResolvedValue([
      { ...basePayment(), providerConversationId: null },
    ]);

    await expect(
      service.refundTradeCashPaymentIfCompleted(TRADE_ID),
    ).rejects.toThrow();
    expect(mockTx.refundAttempt.create).not.toHaveBeenCalled();
    expect(mockPaytr.createRefund).not.toHaveBeenCalled();
  });

  it("keeps a definitive provider rejection retryable", async () => {
    mockPrisma.payment.findMany.mockResolvedValue([basePayment()]);
    mockPaytr.createRefund.mockRejectedValue(
      new ProviderRefundRejectedException("insufficient balance"),
    );

    await expect(
      service.refundTradeCashPaymentIfCompleted(TRADE_ID),
    ).rejects.toBeInstanceOf(ProviderRefundRejectedException);
    expect(mockPrisma.refundAttempt.updateMany).toHaveBeenCalledWith({
      where: { id: ATTEMPT_ID, status: RefundAttemptStatus.submitting },
      data: {
        status: RefundAttemptStatus.failed,
        failureReason: "insufficient balance",
      },
    });
  });
});
