import { BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { createHash } from "crypto";
import { OrderService } from "./order.service";
import { OrderPricingService } from "./order-pricing.service";
import { ShippingTariffService } from "../shipping/shipping-tariff.service";
import { OrderCheckoutService } from "./order-checkout.service";
import { OrderCheckoutCommonService } from "./order-checkout-common.service";
import { OrderCheckoutDirectService } from "./order-checkout-direct.service";
import { OrderCheckoutGroupService } from "./order-checkout-group.service";
import { OrderGuestCheckoutService } from "./order-guest-checkout.service";
import { OrderCommonService } from "./order-common.service";
import { OrderQueryService } from "./order-query.service";
import { OrderLifecycleService } from "./order-lifecycle.service";
import { PrismaService } from "../../prisma";
import { CacheService } from "../cache/cache.service";
import { EventService } from "../events";
import { NotificationService } from "../notification/notification.service";
import { DiscountService } from "../discount/discount.service";
import { DiscountCalculator } from "../discount/discount-calculator";
import { SuratCargoService } from "../surat-cargo/surat-cargo.service";
import { ProductLockService } from "../product/product-lock.service";
import { CommissionLedgerService } from "../commission/commission-ledger.service";
import { TaxService } from "../tax/tax.service";
import { ElogoInvoicingService } from "../elogo";
import { DirectBuyDto } from "./dto";
import { OrderStatus, ProductStatus } from "@prisma/client";

// Active shipping tariff stub (29.99 / free over 500) so the real OrderPricingService
// resolves without a DB; snapshot id/version null (no persisted tariff in unit tests).
const SHIPPING_TARIFF_MOCK = {
  getActiveOutboundTariff: async () => ({
    outboundPackageFee: 29.99,
    freeShippingEnabled: true,
    freeShippingThreshold: 500,
  }),
  getActiveTariffSnapshot: async () => ({
    tariffId: null,
    tariffVersion: null,
    tariff: {
      outboundPackageFee: 29.99,
      freeShippingEnabled: true,
      freeShippingThreshold: 500,
    },
  }),
};

/**
 * Edge case 1.6 — duplicate Buy Now without payment: createDirectOrder returns
 * the existing pending_payment order (idempotent); no second Order row.
 */
// TODO: stale unit test — OrderService dependencies/signatures drifted; covered by E2E purchase + idempotency suites
describe.skip("OrderService createDirectOrder (1.6 idempotent Buy Now)", () => {
  let service: OrderService;

  const buyerId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const productId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const addressId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
  const categoryId = "dddddddd-dddd-dddd-dddd-dddddddddddd";

  const directBuyDto: DirectBuyDto = {
    productId,
    shippingAddressId: addressId,
  };

  let mockTx: {
    $queryRaw: jest.Mock;
    product: { findUnique: jest.Mock; update: jest.Mock };
    order: { findFirst: jest.Mock; create: jest.Mock };
    address: { findUnique: jest.Mock; create: jest.Mock };
  };

  const mockPrisma = {
    user: { findUnique: jest.fn() },
    order: { count: jest.fn() },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const existingOrder = {
      id: "order-pending-1",
      orderNumber: "ORD-2025-000099",
      totalAmount: 129.99,
      subtotal: 100,
      discountAmount: 0,
      discountCode: null as string | null,
    };

    mockTx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: productId }]),
      product: {
        findUnique: jest.fn().mockResolvedValue({
          id: productId,
          status: ProductStatus.active,
          sellerId: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
          categoryId,
          price: 100,
          oldPrice: null,
          saleStartDate: null,
          saleEndDate: null,
          quantity: null,
          seller: {
            id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
            displayName: "Seller",
          },
        }),
        update: jest.fn(),
      },
      order: {
        findFirst: jest.fn().mockResolvedValue(existingOrder),
        create: jest.fn(),
      },
      address: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    };

    mockPrisma.user.findUnique.mockResolvedValue({ isBanned: false });
    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        OrderPricingService,
        { provide: ShippingTariffService, useValue: SHIPPING_TARIFF_MOCK },
        OrderCheckoutService,
        OrderCommonService,
        OrderQueryService,
        OrderLifecycleService,
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
          useValue: { del: jest.fn(), delPattern: jest.fn() },
        },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: EventService, useValue: { emitOrderCreated: jest.fn() } },
        { provide: NotificationService, useValue: {} },
        {
          provide: DiscountService,
          useValue: { validateCoupon: jest.fn(), recordUsage: jest.fn() },
        },
        { provide: DiscountCalculator, useValue: {} },
        {
          provide: SuratCargoService,
          useValue: {
            isIntegrationEnabled: () => false,
            submitShipmentWithRetry: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(OrderService);
  });

  it("returns existing pending_payment order with existingOrder true and does not create a new order", async () => {
    const result = await service.createDirectOrder(buyerId, directBuyDto);

    expect(result).toMatchObject({
      orderId: "order-pending-1",
      orderNumber: "ORD-2025-000099",
      totalAmount: 129.99,
      subtotal: 100,
      discountAmount: 0,
      productId,
      paymentUrl: "",
      provider: "paytr",
      existingOrder: true,
    });
    expect(mockTx.order.findFirst).toHaveBeenCalledWith({
      where: {
        productId,
        buyerId,
        status: OrderStatus.pending_payment,
      },
      orderBy: { createdAt: "desc" },
    });
    expect(mockTx.order.create).not.toHaveBeenCalled();
    expect(mockTx.product.update).not.toHaveBeenCalled();
    expect(mockPrisma.order.count).not.toHaveBeenCalled();
  });

  it("second Buy Now returns the same order id and still does not call order.create", async () => {
    const first = await service.createDirectOrder(buyerId, directBuyDto);
    const second = await service.createDirectOrder(buyerId, directBuyDto);

    expect(first.orderId).toBe("order-pending-1");
    expect(second.orderId).toBe(first.orderId);
    expect((second as any).existingOrder).toBe(true);
    expect(mockTx.order.findFirst).toHaveBeenCalledTimes(2);
    expect(mockTx.order.create).not.toHaveBeenCalled();
  });
});

describe.skip("OrderService guest checkout OTP (1.12)", () => {
  let service: OrderService;
  let mockCache: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
    ttl: jest.Mock;
  };
  let mockNotification: { sendGuestCheckoutVerificationCode: jest.Mock };
  let mockPrisma: { $transaction: jest.Mock };

  beforeEach(async () => {
    mockCache = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      ttl: jest.fn(),
    };
    mockNotification = {
      sendGuestCheckoutVerificationCode: jest
        .fn()
        .mockResolvedValue({ success: true }),
    };
    mockPrisma = { $transaction: jest.fn() };

    const mockConfig = {
      get: jest.fn((key: string, def?: string) => {
        if (key === "GUEST_CHECKOUT_OTP_SECRET") return "test-pepper";
        return def;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        OrderPricingService,
        { provide: ShippingTariffService, useValue: SHIPPING_TARIFF_MOCK },
        OrderCheckoutService,
        OrderCommonService,
        OrderQueryService,
        OrderLifecycleService,
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
        { provide: CacheService, useValue: mockCache },
        { provide: ConfigService, useValue: mockConfig },
        { provide: EventService, useValue: {} },
        { provide: NotificationService, useValue: mockNotification },
        { provide: DiscountService, useValue: {} },
        { provide: DiscountCalculator, useValue: {} },
        {
          provide: SuratCargoService,
          useValue: { isIntegrationEnabled: () => false },
        },
      ],
    }).compile();

    service = module.get(OrderService);
  });

  const minimalGuestDto = {
    productId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    email: "guest@test.com",
    phone: "+905551234567",
    guestName: "Guest User",
    emailVerificationCode: "123456",
    shippingAddress: {
      fullName: "Guest User",
      phone: "+905551234567",
      city: "İstanbul",
      district: "Kadıköy",
      address: "Test cad. 1",
    },
  };

  it("sendGuestCheckoutVerificationCode blocks when rate limit exceeded", async () => {
    const now = Date.now();
    mockCache.get.mockResolvedValue([now - 1000, now - 2000, now - 3000]);

    await expect(
      service.sendGuestCheckoutVerificationCode({ email: " A@B.COM " }),
    ).rejects.toThrow(BadRequestException);

    expect(
      mockNotification.sendGuestCheckoutVerificationCode,
    ).not.toHaveBeenCalled();
  });

  it("sendGuestCheckoutVerificationCode sends email and stores hashed OTP with consumptions", async () => {
    mockCache.get.mockResolvedValue(null);

    await service.sendGuestCheckoutVerificationCode({
      email: "guest@test.com",
      expectedCheckoutCount: 3,
    });

    expect(
      mockNotification.sendGuestCheckoutVerificationCode,
    ).toHaveBeenCalledWith(
      "guest@test.com",
      expect.stringMatching(/^\d{6}$/),
      600,
    );

    const otpSet = mockCache.set.mock.calls.find((c: unknown[]) =>
      String(c[0]).includes("guest:checkout:otp:v1:"),
    );
    expect(otpSet).toBeDefined();
    expect(otpSet![1].c).toBe(3);
    expect(typeof otpSet![1].h).toBe("string");
  });

  it("guestCheckout does not run transaction when OTP record missing", async () => {
    mockCache.get.mockResolvedValue(null);

    await expect(service.guestCheckout(minimalGuestDto as any)).rejects.toThrow(
      BadRequestException,
    );

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("guestCheckout rejects wrong code and does not start transaction", async () => {
    const wrongHash = createHash("sha256")
      .update("test-pepper:guest@test.com:999999", "utf8")
      .digest("hex");
    mockCache.get.mockResolvedValue({ h: wrongHash, a: 0, c: 1, v: 5 });
    mockCache.ttl.mockResolvedValue(300);

    await expect(service.guestCheckout(minimalGuestDto as any)).rejects.toThrow(
      BadRequestException,
    );

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockCache.set).toHaveBeenCalled();
  });
});

/**
 * findOne response shape — mobil Sipariş Detayı ekranının okuduğu alanların
 * formatOrderResponse tarafından gönderildiğini doğrular (kayıplı yanıt regresyonu).
 */
describe("OrderService findOne (response shape for mobile order detail)", () => {
  let service: OrderService;

  const buyerId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const sellerId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
  const orderId = "order-detail-1";

  const mockOrder = {
    id: orderId,
    orderNumber: "ORD-2025-000123",
    buyerId,
    sellerId,
    productId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    status: OrderStatus.shipped,
    totalAmount: 329.99,
    shippingCost: 29.99,
    commissionAmount: 20,
    buyerFeeAmount: 10,
    sellerFeeAmount: 8,
    deliveredAt: null as Date | null,
    completedAt: null as Date | null,
    confirmationDeadline: new Date("2026-06-10T12:00:00Z"),
    buyerConfirmedAt: null as Date | null,
    createdAt: new Date("2026-06-01T10:00:00Z"),
    updatedAt: new Date("2026-06-02T10:00:00Z"),
    product: {
      id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      title: "Vintage Star Wars Figure",
      status: ProductStatus.sold,
      price: 300,
      condition: "good",
      images: [{ cardKey: "https://cdn.test/img.jpg" }],
    },
    buyer: {
      id: buyerId,
      displayName: "Buyer",
      isVerified: true,
      avatarUrl: null,
    },
    seller: {
      id: sellerId,
      displayName: "Seller",
      isVerified: true,
      avatarUrl: null,
    },
    shipment: {
      id: "ship-1",
      provider: "surat",
      trackingNumber: "TRK123456",
      status: "in_transit",
      cost: 29.99,
      shippedAt: new Date("2026-06-02T09:00:00Z"),
      deliveredAt: null,
    },
    payment: {
      id: "pay-1",
      status: "completed",
      amount: 329.99,
      provider: "paytr",
      paidAt: new Date("2026-06-01T11:00:00Z"),
    },
    shippingAddress: {
      id: "addr-1",
      title: "Ev",
      fullName: "Alıcı Adı",
      phone: "+905551234567",
      city: "İstanbul",
      district: "Kadıköy",
      address: "Test cad. No:1 D:2",
      zipCode: "34000",
    },
    refundRequests: [],
  };

  const mockPrisma = {
    order: { findUnique: jest.fn().mockResolvedValue(mockOrder) },
    productRating: { findFirst: jest.fn().mockResolvedValue(null) },
    rating: { findFirst: jest.fn().mockResolvedValue(null) },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.order.findUnique.mockResolvedValue(mockOrder);
    mockPrisma.productRating.findFirst.mockResolvedValue(null);
    mockPrisma.rating.findFirst.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        OrderPricingService,
        { provide: ShippingTariffService, useValue: SHIPPING_TARIFF_MOCK },
        OrderCheckoutService,
        OrderCheckoutCommonService,
        OrderCheckoutDirectService,
        OrderCheckoutGroupService,
        OrderGuestCheckoutService,
        OrderCommonService,
        OrderQueryService,
        OrderLifecycleService,
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
        { provide: EventService, useValue: {} },
        { provide: CacheService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: NotificationService, useValue: {} },
        { provide: DiscountService, useValue: {} },
        { provide: DiscountCalculator, useValue: {} },
        { provide: SuratCargoService, useValue: {} },
        { provide: ProductLockService, useValue: {} },
        { provide: CommissionLedgerService, useValue: {} },
        {
          provide: TaxService,
          useValue: {
            resolveTaxRate: jest.fn().mockResolvedValue(null),
            calculateTaxAmount: jest.fn().mockReturnValue(0),
          },
        },
      ],
    }).compile();

    service = module.get(OrderService);
  });

  it("returns product price/condition, full shipping address, tracking and timeline timestamps", async () => {
    const result: any = await service.findOne(orderId, buyerId);

    // Ürün: fiyat + durum (mobilde ₺0 / boş "Durum:" regresyonu)
    expect(result.product.price).toBe(300);
    expect(result.product.condition).toBe("good");

    // Teslimat adresi: ad, telefon, açık adres (mobilde boş satır regresyonu)
    expect(result.shippingAddress.fullName).toBe("Alıcı Adı");
    expect(result.shippingAddress.phone).toBe("+905551234567");
    expect(result.shippingAddress.address).toBe("Test cad. No:1 D:2");
    expect(result.shippingAddress.zipCode).toBe("34000");
    // Mevcut tüketiciler için geriye dönük alanlar korunmalı
    expect(result.shippingAddress.addressLine1).toBe("Test cad. No:1 D:2");
    expect(result.shippingAddress.postalCode).toBe("34000");

    // Kargo takip: üst seviye trackingNumber + türetilmiş Sürat URL
    expect(result.trackingNumber).toBe("TRK123456");
    expect(result.trackingUrl).toContain("suratkargo.com.tr");
    expect(result.trackingUrl).toContain("TRK123456");

    // Zaman çizelgesi: paidAt / shippedAt üst seviyede
    expect(result.paidAt).toEqual(mockOrder.payment.paidAt);
    expect(result.shippedAt).toEqual(mockOrder.shipment.shippedAt);
    expect(result.confirmationDeadline).toEqual(mockOrder.confirmationDeadline);
  });

  it("does not derive a tracking URL for non-surat providers", async () => {
    mockPrisma.order.findUnique.mockResolvedValueOnce({
      ...mockOrder,
      shipment: { ...mockOrder.shipment, provider: "other" },
    });

    const result: any = await service.findOne(orderId, buyerId);

    expect(result.trackingNumber).toBe("TRK123456");
    expect(result.trackingUrl).toBeNull();
  });

  it("surfaces withholding (stopaj) in pricing and subtracts it from sellerNetAmount", async () => {
    mockPrisma.order.findUnique.mockResolvedValueOnce({
      ...mockOrder,
      taxAmount: 0,
      withholdingTaxAmount: 3,
    });

    const result: any = await service.findOne(orderId, buyerId);

    // subtotal = 329.99 − 29.99 (kargo) − 10 (buyerFee) − 0 (KDV) = 290
    // net = 290 + 0 − 8 (sellerFee) − 3 (stopaj) = 279
    expect(result.pricing.withholdingTaxAmount).toBe(3);
    expect(result.pricing.sellerNetAmount).toBeCloseTo(279, 2);
  });
});

/**
 * E-ticaret stopajı (GVK 94/19): yalnız kurumsal (approved + taxId) satıcıda,
 * KDV hariç ürün bedeli üzerinden; oran PlatformSetting 'withholding_tax_rate'
 * (varsayılan %1). Bireysel satıcı kapsam dışı (330 Seri No'lu GV Tebliği).
 */
describe("OrderService getCommissionPreview (stopaj / withholding)", () => {
  const sellerId = "ffffffff-ffff-ffff-ffff-ffffffffffff";

  const commissionRule = {
    id: "rule-1",
    name: "Varsayılan",
    ruleType: "default",
    appliesTo: "BOTH",
    sellerRate: 10,
    sellerMin: null,
    sellerMax: null,
    buyerRate: 3,
    buyerMin: null,
    buyerMax: null,
    categoryId: null,
    sellerType: null,
    priority: 0,
    isActive: true,
    category: null,
  };

  const mockPrisma = {
    user: { findUnique: jest.fn() },
    commissionRule: { findMany: jest.fn().mockResolvedValue([commissionRule]) },
    platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
  };

  let service: OrderService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.commissionRule.findMany.mockResolvedValue([commissionRule]);
    mockPrisma.platformSetting.findUnique.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        OrderPricingService,
        { provide: ShippingTariffService, useValue: SHIPPING_TARIFF_MOCK },
        OrderCheckoutService,
        OrderCheckoutCommonService,
        OrderCheckoutDirectService,
        OrderCheckoutGroupService,
        OrderGuestCheckoutService,
        OrderCommonService,
        OrderQueryService,
        OrderLifecycleService,
        { provide: ElogoInvoicingService, useValue: {} },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventService, useValue: {} },
        { provide: CacheService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: NotificationService, useValue: {} },
        { provide: DiscountService, useValue: {} },
        { provide: DiscountCalculator, useValue: {} },
        { provide: SuratCargoService, useValue: {} },
        { provide: ProductLockService, useValue: {} },
        { provide: CommissionLedgerService, useValue: {} },
        {
          provide: TaxService,
          useValue: {
            resolveTaxRate: jest.fn().mockResolvedValue(null),
            calculateTaxAmount: jest.fn().mockReturnValue(0),
          },
        },
      ],
    }).compile();

    service = module.get(OrderService);
  });

  it("bireysel satıcıda stopaj kesilmez (net = tutar − komisyon)", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      sellerType: "individual",
      membership: null,
      businessStatus: null,
      taxId: null,
    });

    const preview = await service.getCommissionPreview(1000, sellerId, null);

    expect(preview.withholdingTaxAmount).toBe(0);
    expect(preview.sellerFeeAmount).toBe(100);
    expect(preview.sellerNetAmount).toBe(900);
  });

  it("kurumsal satıcıda varsayılan %1 stopaj kesilir", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      sellerType: "business",
      membership: null,
      businessStatus: "approved",
      taxId: "1234567890",
    });

    const preview = await service.getCommissionPreview(1000, sellerId, null);

    expect(preview.withholdingTaxAmount).toBe(10);
    expect(preview.sellerNetAmount).toBe(890);
  });

  it("stopaj oranı PlatformSetting withholding_tax_rate ile değişir", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      sellerType: "business",
      membership: null,
      businessStatus: "approved",
      taxId: "1234567890",
    });
    mockPrisma.platformSetting.findUnique.mockResolvedValue({
      settingValue: "2",
    });

    const preview = await service.getCommissionPreview(1000, sellerId, null);

    expect(preview.withholdingTaxAmount).toBe(20);
    expect(preview.sellerNetAmount).toBe(880);
  });

  it("oran 0 yapılırsa kurumsal satıcıda da stopaj kesilmez", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      sellerType: "business",
      membership: null,
      businessStatus: "approved",
      taxId: "1234567890",
    });
    mockPrisma.platformSetting.findUnique.mockResolvedValue({
      settingValue: "0",
    });

    const preview = await service.getCommissionPreview(1000, sellerId, null);

    expect(preview.withholdingTaxAmount).toBe(0);
    expect(preview.sellerNetAmount).toBe(900);
  });
});
