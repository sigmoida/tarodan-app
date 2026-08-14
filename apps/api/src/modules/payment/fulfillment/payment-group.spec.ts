import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { ModuleRef } from "@nestjs/core";
import { BadRequestException } from "@nestjs/common";
import { PaymentService } from "../payment.service";
import { PaymentQueryService } from "../payment-query.service";
import { PaymentCommonService } from "../payment-common.service";
import { PaymentRefundService } from "../refund/payment-refund.service";
import { PaymentHoldReleaseService } from "../refund/payment-hold-release.service";
import { PaymentRefundAttemptService } from "../refund/payment-refund-attempt.service";
import { PaymentTradeRefundService } from "../refund/payment-trade-refund.service";
import { PaymentReconciliationService } from "../reconciliation/payment-reconciliation.service";
import { ReservationReconciliationService } from "../reconciliation/reservation-reconciliation.service";
import { PaymentExpiryReconciliationService } from "../reconciliation/payment-expiry-reconciliation.service";
import { PspReconciliationService } from "../reconciliation/psp-reconciliation.service";
import { RefundReconciliationService } from "../refund/refund-reconciliation.service";
import { MiscReconciliationService } from "../reconciliation/misc-reconciliation.service";
import { PaymentInitiationService } from "../checkout/payment-initiation.service";
import { PaymentCallbackService } from "../checkout/payment-callback.service";
import { PaymentProviderEventService } from "../payment-provider-event.service";
import { PaymentFulfillmentService } from "./payment-fulfillment.service";
import { FulfillmentNotifier } from "./fulfillment-notifier.service";
import { FulfillmentFinalizer } from "./fulfillment-finalizer.service";
import { EscrowHoldService } from "./escrow-hold.service";
import { FulfillmentStockService } from "./fulfillment-stock.service";
import { VirtualOrderFulfillmentService } from "./virtual-order-fulfillment.service";
import { PaymentLifecycleService } from "../checkout/payment-lifecycle.service";
import { PrismaService } from "../../../prisma";
import { CacheService } from "../../cache/cache.service";
import { PaymentProviderRegistry } from "../../payment-providers/payment-provider.registry";
import { EventService } from "../../events";
import { InvoiceService } from "../../invoice/invoice.service";
import { ElogoInvoicingService } from "../../elogo";
import { ProductLockService } from "../../product/product-lock.service";
import { NotificationService } from "../../notification/notification.service";
import { SuratCargoService } from "../../surat-cargo/surat-cargo.service";
import { CARGO_PROVIDER } from "../../surat-cargo/cargo-provider";
import { OrderShipmentProvisioner } from "../../surat-cargo/order-shipment-provisioner.service";
import { CarrierCancellationService } from "../../surat-cargo/carrier-cancellation.service";
import { CommissionLedgerService } from "../../commission/commission-ledger.service";
import { StorageService } from "../../storage/storage.service";
import { I18nService } from "../../i18n";
import { OutboxService } from "../../outbox/outbox.service";
import { OUTBOX_ORDER_FULFILLMENT } from "../../outbox/outbox.types";
import { DiscountService } from "../../discount/discount.service";
import { OrderStatus, PaymentStatus, ProductStatus } from "@prisma/client";

/**
 * Grup ödemesi (CheckoutGroup): tek Payment satırı gruptaki tüm siparişleri kapsar.
 * Bu suite başarı işleme sıralamasını (önce TÜM siparişler preparing, sonra stok),
 * sipariş başına hold oluşturmayı ve başarısızlıkta toplu serbest bırakmayı test eder.
 */
describe("PaymentService group payment (checkout group)", () => {
  let service: PaymentService;
  let fulfillment: PaymentFulfillmentService;
  let initiation: PaymentInitiationService;
  let refund: PaymentRefundService;
  let common: PaymentCommonService;

  const groupId = "group-1";
  const paymentId = "pay-group-1";

  const makeOrder = (n: number, overrides: Record<string, unknown> = {}) => ({
    id: `order-${n}`,
    orderNumber: `ORD-${n}`,
    buyerId: "buyer-1",
    sellerId: `seller-${n}`,
    productId: `product-${n}`,
    status: OrderStatus.pending_payment,
    totalAmount: 100 + n,
    commissionAmount: 10,
    buyerFeeAmount: 5,
    shippingCost: 20,
    paymentExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    reservationReleasedAt: null,
    shippingAddress: { fullName: "Alıcı", phone: "+90555", city: "İstanbul" },
    buyer: { id: "buyer-1", email: "buyer@test.com", displayName: "Buyer" },
    seller: {
      id: `seller-${n}`,
      email: `s${n}@test.com`,
      displayName: `Seller ${n}`,
    },
    product: { id: `product-${n}`, title: `Ürün ${n}` },
    ...overrides,
  });

  const basePayment = () => ({
    id: paymentId,
    orderId: null,
    checkoutGroupId: groupId,
    tradeCashPaymentId: null,
    status: PaymentStatus.pending,
    amount: 201,
    provider: "paytr",
    providerPaymentId: null,
    metadata: {},
  });

  let mockTx: any;
  let callSequence: string[];

  const mockPrisma: any = {
    payment: {
      updateMany: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    order: { findMany: jest.fn(), findUnique: jest.fn() },
    product: { findUnique: jest.fn() },
    shipment: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    },
    checkoutGroup: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };

  const mockCommissionLedger = { upsertPending: jest.fn() };
  const mockProductLock = {
    invalidatePendingOrdersForProduct: jest
      .fn()
      .mockResolvedValue({ cancelledOrders: [] }),
    invalidateRelatedOffers: jest
      .fn()
      .mockResolvedValue({ rejectedOffers: [] }),
    checkAndReserve: jest.fn(),
  };
  const mockEvents = {
    emitOrderPaid: jest.fn(),
    emitGroupBuyerOrderPaid: jest.fn(),
    emitOrderFulfillmentRequested: jest.fn(),
    emitPaymentFailed: jest.fn(),
  };
  // #8: fulfillment backstop — ödeme tx'iyle atomik enqueue'yu doğrulamak için mock.
  const mockOutbox = { enqueue: jest.fn().mockResolvedValue(undefined) };
  const mockDiscount = {
    consumeReservedUsageForOrders: jest.fn().mockResolvedValue(undefined),
    releaseReservedUsageForOrders: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    callSequence = [];

    mockTx = {
      // Bulgu E: stok düşümünden önce ürün satırı FOR UPDATE ile kilitleniyor.
      $queryRaw: jest.fn().mockResolvedValue([]),
      payment: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(),
      },
      order: {
        findMany: jest.fn().mockResolvedValue([makeOrder(1), makeOrder(2)]),
        update: jest.fn().mockImplementation(({ where }: any) => {
          callSequence.push(`order.update:${where.id}`);
          return Promise.resolve({});
        }),
      },
      product: {
        findUnique: jest.fn().mockImplementation(({ where }: any) =>
          Promise.resolve({
            id: where.id,
            quantity: 5,
            reservedQuantity: 1,
            categoryId: null,
            status: ProductStatus.active,
          }),
        ),
        update: jest.fn().mockImplementation(({ where }: any) => {
          callSequence.push(`product.update:${where.id}`);
          return Promise.resolve({});
        }),
      },
      paymentHold: {
        create: jest.fn().mockImplementation(({ data }: any) => {
          callSequence.push(`hold.create:${data.orderId}`);
          return Promise.resolve({ id: `hold-${data.orderId}` });
        }),
      },
    };

    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx),
    );

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
        // Faz 8.1: finalizer artık OrderFulfillmentListener üzerinden çağrılır; burada
        // yalnız PaymentFulfillmentService DI'ı için sağlanır (trade capture yolu kullanır).
        FulfillmentFinalizer,
        // Gerçek escrow servisi → paymentHold.create / upsertPending assertion'ları için.
        EscrowHoldService,
        // Gerçek stok servisi → product.update / invalidate kaskad assertion'ları için.
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
        {
          provide: CacheService,
          useValue: {
            del: jest.fn(),
            delPattern: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: PaymentProviderRegistry, useValue: { resolve: () => ({}) } },
        { provide: EventService, useValue: mockEvents },
        {
          provide: InvoiceService,
          useValue: { generateAndSendInvoice: jest.fn() },
        },
        { provide: ProductLockService, useValue: mockProductLock },
        { provide: NotificationService, useValue: {} },
        { provide: SuratCargoService, useValue: {} },
        // Faz 11.5a: PaymentCommonService artık CARGO_PROVIDER token'ına bağlı.
        { provide: CARGO_PROVIDER, useValue: {} },
        { provide: OrderShipmentProvisioner, useValue: {} },
        { provide: CarrierCancellationService, useValue: {} },
        { provide: CommissionLedgerService, useValue: mockCommissionLedger },
        {
          provide: StorageService,
          useValue: { getPublicAssetUrl: jest.fn().mockReturnValue("") },
        },
        { provide: ModuleRef, useValue: {} },
        {
          provide: PaymentProviderEventService,
          useValue: { record: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: OutboxService, useValue: mockOutbox },
        { provide: DiscountService, useValue: mockDiscount },
      ],
    }).compile();

    service = module.get(PaymentService);
    fulfillment = module.get(PaymentFulfillmentService);
    initiation = module.get(PaymentInitiationService);
    refund = module.get(PaymentRefundService);
    common = module.get(PaymentCommonService);
  });

  it("marks ALL orders preparing BEFORE any stock decrement (stockout cascade cannot cancel siblings)", async () => {
    const did = await (fulfillment as any).processSuccessfulGroupPayment(
      basePayment(),
      "txn-1",
    );

    expect(did).toBe(true);
    expect(mockDiscount.consumeReservedUsageForOrders).toHaveBeenCalledWith(
      ["order-1", "order-2"],
      mockTx,
    );

    // Sıralama: order.update'lerin TÜMÜ ilk product.update'ten önce gelmeli
    const firstProductUpdate = callSequence.findIndex((c) =>
      c.startsWith("product.update"),
    );
    const orderUpdates = callSequence
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.startsWith("order.update"));
    expect(orderUpdates).toHaveLength(2);
    for (const { i } of orderUpdates) {
      expect(i).toBeLessThan(firstProductUpdate);
    }

    // Tek payment'a sipariş/satıcı başına bir hold
    expect(mockTx.paymentHold.create).toHaveBeenCalledTimes(2);
    for (const call of mockTx.paymentHold.create.mock.calls) {
      expect(call[0].data.paymentId).toBe(paymentId);
    }
    const holdOrderIds = mockTx.paymentHold.create.mock.calls.map(
      (c: any) => c[0].data.orderId,
    );
    expect(holdOrderIds.sort()).toEqual(["order-1", "order-2"]);

    // Ledger sipariş başına
    expect(mockCommissionLedger.upsertPending).toHaveBeenCalledTimes(2);

    // Faz 8.1: tx sonrası sipariş başına fulfillment sonlandırması EVENT ile istenir
    // (OrderFulfillmentListener tüketir; order.paid/Sürat orada). Burada seam doğrulanır.
    expect(mockEvents.emitOrderFulfillmentRequested).toHaveBeenCalledTimes(2);

    // #8 (dayanıklılık): her sipariş için fulfillment backstop satırı ödeme tx'inin
    // İÇİNDE (mockTx ile) enqueue edilmeli — çökme penceresinde drainer tamamlar.
    expect(mockOutbox.enqueue).toHaveBeenCalledTimes(2);
    for (const call of mockOutbox.enqueue.mock.calls) {
      expect(call[0]).toBe(mockTx); // tx client → ödeme commit'iyle atomik
      expect(call[1].type).toBe(OUTBOX_ORDER_FULFILLMENT);
      expect(call[1].payload.skipBuyer).toBe(true); // sepet: alıcı grup başına tek
    }
    const enqueuedDedupe = mockOutbox.enqueue.mock.calls
      .map((c: any) => c[1].dedupeKey)
      .sort();
    expect(enqueuedDedupe).toEqual([
      `${OUTBOX_ORDER_FULFILLMENT}:order-1`,
      `${OUTBOX_ORDER_FULFILLMENT}:order-2`,
    ]);

    // ALICI tarafı: grup başına TEK onay maili (ürün başına değil)
    expect(mockEvents.emitGroupBuyerOrderPaid).toHaveBeenCalledTimes(1);
    const groupBuyerArg = mockEvents.emitGroupBuyerOrderPaid.mock.calls[0][0];
    expect(groupBuyerArg.items).toHaveLength(2);
    expect(groupBuyerArg.buyerId).toBe("buyer-1");

    // Sipariş başına fulfillment isteği alıcıyı atlamalı (skipBuyer:true) — grup onayı
    // yukarıda emitGroupBuyerOrderPaid ile bir kez gönderildi.
    for (const call of mockEvents.emitOrderFulfillmentRequested.mock.calls) {
      expect(call[0].skipBuyer).toBe(true);
    }
  });

  it("does NOT cascade-cancel siblings when physical stock remains (q=1, r=1 → available=0)", async () => {
    // Regression: 2-stock + 2-buyer concurrent checkout. After the first
    // payment decrements, the product sits at quantity=1, reservedQuantity=1
    // (the second buyer's still-valid reservation). The old condition gated on
    // available = quantity - reservedQuantity = 0 and WRONGLY cancelled the
    // second order, then auto-refunded its payment. The cascade must gate on
    // PHYSICAL quantity (>0 here) and leave the sibling order alone.
    mockTx.product.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve({
        id: where.id,
        quantity: 1,
        reservedQuantity: 1,
        categoryId: null,
        status: ProductStatus.active,
      }),
    );

    const did = await (fulfillment as any).processSuccessfulGroupPayment(
      basePayment(),
      "txn-1",
    );

    expect(did).toBe(true);
    expect(
      mockProductLock.invalidatePendingOrdersForProduct,
    ).not.toHaveBeenCalled();
    expect(mockProductLock.invalidateRelatedOffers).not.toHaveBeenCalled();
  });

  it("stok ödeme anında yetersizse hold/kargo oluşturmaz ve satırı iadeye alır", async () => {
    mockTx.product.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve({
        id: where.id,
        quantity: 0,
        reservedQuantity: 0,
        categoryId: null,
        status: ProductStatus.sold,
      }),
    );
    const refundSpy = jest
      .spyOn(refund as any, "processRefund")
      .mockResolvedValue({ success: true });

    const did = await (fulfillment as any).processSuccessfulGroupPayment(
      basePayment(),
      "txn-1",
    );

    expect(did).toBe(true);
    expect(mockDiscount.releaseReservedUsageForOrders).toHaveBeenCalledWith(
      ["order-1", "order-2"],
      mockTx,
    );
    expect(
      mockProductLock.invalidatePendingOrdersForProduct,
    ).not.toHaveBeenCalled();
    expect(mockTx.paymentHold.create).not.toHaveBeenCalled();
    expect(mockOutbox.enqueue).not.toHaveBeenCalled();
    expect(mockEvents.emitOrderFulfillmentRequested).not.toHaveBeenCalled();
    expect(refundSpy).toHaveBeenCalledTimes(2);
    expect(refundSpy).toHaveBeenCalledWith(
      "order-1",
      101,
      expect.objectContaining({
        skipRefundEvent: true,
        idempotencyKey: `stock-shortage-refund:${paymentId}:order-1`,
      }),
    );
  });

  it("is idempotent: second success callback does nothing (CAS claim fails)", async () => {
    mockTx.payment.updateMany.mockResolvedValue({ count: 0 });

    const did = await (fulfillment as any).processSuccessfulGroupPayment(
      basePayment(),
      "txn-1",
    );

    expect(did).toBe(false);
    expect(mockTx.order.update).not.toHaveBeenCalled();
    expect(mockTx.paymentHold.create).not.toHaveBeenCalled();
  });

  it("auto-refunds (partial) an order cancelled by cron race; siblings still complete", async () => {
    mockTx.order.findMany.mockResolvedValue([
      makeOrder(1),
      makeOrder(2, { status: OrderStatus.cancelled }),
    ]);
    const refundSpy = jest
      .spyOn(refund as any, "processRefund")
      .mockResolvedValue({ success: true });

    const did = await (fulfillment as any).processSuccessfulGroupPayment(
      basePayment(),
      "txn-1",
    );

    expect(did).toBe(true);
    expect(refundSpy).toHaveBeenCalledWith("order-2", 102);
    // Sadece canlı sipariş işlenir
    expect(mockTx.paymentHold.create).toHaveBeenCalledTimes(1);
    expect(mockTx.paymentHold.create.mock.calls[0][0].data.orderId).toBe(
      "order-1",
    );
    expect(mockEvents.emitOrderFulfillmentRequested).toHaveBeenCalledTimes(1);
  });

  it("group payment initiation rejects when any order is no longer pending_payment", async () => {
    mockPrisma.checkoutGroup.findUnique.mockResolvedValue({
      id: groupId,
      buyerId: "buyer-1",
      isGuest: false,
      totalAmount: 201,
      orders: [makeOrder(1), makeOrder(2, { status: OrderStatus.cancelled })],
    });

    await expect(
      (initiation as any).initiateGroupPayment("buyer-1", {
        checkoutGroupId: groupId,
        provider: "paytr",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("failed group payment releases every order in the group", async () => {
    // processFailedPayment now flips only a still-pending payment via a
    // conditional updateMany (#71); count > 0 means the claim succeeded.
    mockPrisma.payment.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.order.findMany.mockResolvedValue([makeOrder(1), makeOrder(2)]);
    const releaseSpy = jest
      .spyOn(fulfillment as any, "releaseProductForFailedPayment")
      .mockResolvedValue(undefined);
    const cancelSuratSpy = jest
      .spyOn(common as any, "cancelSuratShipmentIfExists")
      .mockResolvedValue(undefined);
    const logSpy = jest
      .spyOn(common as any, "logPaymentAction")
      .mockResolvedValue(undefined);

    await (fulfillment as any).processFailedPayment(
      basePayment(),
      "kart reddedildi",
    );

    expect(releaseSpy).toHaveBeenCalledTimes(2);
    expect(releaseSpy).toHaveBeenCalledWith("order-1");
    expect(releaseSpy).toHaveBeenCalledWith("order-2");
    expect(cancelSuratSpy).toHaveBeenCalledTimes(2);
    expect(mockEvents.emitPaymentFailed).toHaveBeenCalledTimes(2);
    expect(logSpy).toHaveBeenCalled();
  });
});
