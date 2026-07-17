import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { NotFoundException } from "@nestjs/common";
import { PaymentService } from "./payment.service";
import { PrismaService } from "../../prisma";
import { CacheService } from "../cache/cache.service";
import { PaymentProviderRegistry } from "../payment-providers/payment-provider.registry";
import { EventService } from "../events";
import { InvoiceService } from "../invoice/invoice.service";
import { ElogoInvoicingService } from "../elogo";
import { OrderStatus, PaymentStatus } from "@prisma/client";

// TODO: stale unit test — PaymentService dependencies/types drifted; covered by E2E purchase + concurrency suites
describe.skip("PaymentService handlePayTRCallback — hash mismatch + durum-sorgu (4.1)", () => {
  let service: PaymentService;

  const mockConfigGet = jest.fn((key: string): string | undefined => {
    if (key === "PAYTR_RECONCILE_AMOUNT_TOLERANCE_TL") return "0.05";
    return undefined;
  });

  const mockPrisma = {
    payment: {
      findFirst: jest.fn(),
    },
  };

  const mockPaytr = {
    verifyCallback: jest.fn(),
    queryPaymentStatus: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

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
        { provide: CacheService, useValue: { del: jest.fn() } },
        { provide: ConfigService, useValue: { get: mockConfigGet } },
        {
          provide: PaymentProviderRegistry,
          useValue: { resolve: () => mockPaytr },
        },
        { provide: EventService, useValue: {} },
        { provide: InvoiceService, useValue: {} },
      ],
    }).compile();

    service = module.get(PaymentService);
  });

  it("when hash invalid and durum-sorgu succeeds with matching amount, calls processSuccessfulPayment", async () => {
    mockPaytr.verifyCallback.mockReturnValue(false);
    mockPrisma.payment.findFirst.mockResolvedValue({
      id: "pay-1",
      provider: "paytr",
      status: PaymentStatus.pending,
      amount: 100,
      providerConversationId: "oid-1",
      orderId: "order-uuid",
      order: {
        id: "order-uuid",
        status: OrderStatus.pending_payment,
        buyer: {},
        seller: {},
        product: {},
      },
      tradeCashPayment: null,
    });

    mockPaytr.queryPaymentStatus.mockResolvedValue({
      ok: true,
      paymentTotalTl: 100,
      paymentAmountTl: 100,
      paymentDate: "2024-01-01 12:00:00",
      currency: "TL",
    });

    const processSpy = jest
      .spyOn(service as any, "processSuccessfulPayment")
      .mockResolvedValue(true);

    const result = await service.handlePayTRCallback({
      merchant_oid: "oid-1",
      status: "failed",
      total_amount: "10000",
      hash: "bad",
    } as any);

    expect(result).toBe("OK");
    expect(mockPaytr.queryPaymentStatus).toHaveBeenCalled();
    expect(processSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: "pay-1" }),
      "paytr:oid-1:2024-01-01 12:00:00",
    );
  });

  it("when hash invalid and no payment row, throws NotFoundException", async () => {
    mockPaytr.verifyCallback.mockReturnValue(false);
    mockPrisma.payment.findFirst.mockResolvedValue(null);

    await expect(
      service.handlePayTRCallback({
        merchant_oid: "unknown",
        status: "success",
        total_amount: "10000",
        hash: "bad",
      } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
