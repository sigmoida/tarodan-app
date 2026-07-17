import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { PaymentService } from "./payment.service";
import { PrismaService } from "../../prisma";
import { CacheService } from "../cache/cache.service";
import { PaymentProviderRegistry } from "../payment-providers/payment-provider.registry";
import { EventService } from "../events";
import { InvoiceService } from "../invoice/invoice.service";
import { ElogoInvoicingService } from "../elogo";
import { ProductLockService } from "../product/product-lock.service";
import { OrderStatus, PaymentStatus, ProductStatus } from "@prisma/client";

const TEST_PAYMENT_TIMEOUT_MINUTES = "1";

// TODO: stale unit test — PaymentService dependencies/types drifted; covered by E2E purchase suite
describe.skip("PaymentService expiry (callback gelmeyen pending ödeme)", () => {
  let service: PaymentService;

  const mockConfigGet = jest.fn((key: string) => {
    if (key === "PAYMENT_TIMEOUT_MINUTES") return TEST_PAYMENT_TIMEOUT_MINUTES;
    return undefined;
  });

  const mockPrisma = {
    payment: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    order: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    product: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    offer: {
      update: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn().mockImplementation(async (cb: any) => {
      if (typeof cb === "function") return cb(mockPrisma);
      for (const op of cb) await op;
    }),
    $queryRaw: jest.fn().mockResolvedValue([]),
  };

  const mockProductLockService = {
    checkAndReserve: jest.fn().mockResolvedValue({}),
    sweepOutOfStockProducts: jest.fn().mockResolvedValue({
      productsScanned: 0,
      offersCancelled: 0,
      tradesCancelled: 0,
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (cb: any) => {
      if (typeof cb === "function") return cb(mockPrisma);
      for (const op of cb) await op;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
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
        {
          provide: CacheService,
          useValue: { del: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: ConfigService, useValue: { get: mockConfigGet } },
        { provide: PaymentProviderRegistry, useValue: { resolve: () => ({}) } },
        {
          provide: EventService,
          useValue: {
            emitPaymentFailed: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: InvoiceService, useValue: {} },
        { provide: ProductLockService, useValue: mockProductLockService },
      ],
    }).compile();

    service = module.get(PaymentService);
  });

  it("cancelExpiredPayments: süresi geçmiş pending ödemeyi failed yapar ve rezervasyonu serbest bırakır", async () => {
    const oldCreated = new Date(Date.now() - 120_000);
    mockPrisma.payment.findMany.mockResolvedValue([
      {
        id: "pay-expired",
        orderId: "order-1",
        amount: 100,
        currency: "TRY",
        provider: "paytr",
        createdAt: oldCreated,
        order: {
          orderNumber: "T-100",
          buyerId: "buyer-1",
          buyer: { email: "b@test.com", displayName: "Buyer" },
        },
      },
    ]);

    mockPrisma.order.findUnique.mockResolvedValue({
      status: OrderStatus.pending_payment,
      productId: "prod-1",
      offerId: null,
    });
    mockPrisma.product.findUnique.mockResolvedValue({
      reservedQuantity: 1,
      status: ProductStatus.reserved,
    });

    const result = await service.cancelExpiredPayments();

    expect(result.count).toBe(1);
    expect(mockPrisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "pay-expired" },
        data: expect.objectContaining({
          status: PaymentStatus.failed,
          failureReason: expect.stringContaining(TEST_PAYMENT_TIMEOUT_MINUTES),
        }),
      }),
    );
    // Order iptal edilmeli
    expect(mockPrisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "order-1" },
        data: { status: OrderStatus.cancelled },
      }),
    );
    // reservedQuantity azaltılmalı
    expect(mockPrisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "prod-1" },
        data: expect.objectContaining({
          reservedQuantity: 0,
        }),
      }),
    );
  });

  it("releaseExpiredOrderReservations: pending_payment siparişi zaman aşımında iptal eder", async () => {
    mockPrisma.order.findMany.mockResolvedValue([
      {
        id: "order-2",
        productId: "prod-2",
        orderNumber: "T-200",
        offerId: null,
      },
    ]);
    mockPrisma.payment.findFirst.mockResolvedValue(null);
    mockPrisma.order.findUnique.mockResolvedValue({
      status: OrderStatus.pending_payment,
    });
    mockPrisma.product.findUnique.mockResolvedValue({
      reservedQuantity: 1,
      status: ProductStatus.reserved,
    });

    const result = await service.releaseExpiredOrderReservations();

    expect(result.count).toBe(1);
    expect(mockPrisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "order-2" },
        data: { status: OrderStatus.cancelled },
      }),
    );
  });
});
