import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
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
import { RefundService } from "../refund/refund.service";
import { OrderStatus, ProductStatus } from "@prisma/client";
import { flatPackageTiers } from "../shipping/testing/tariff-fixture";
import { OrderTaxPolicyService } from "./order-tax-policy.service";

// Active shipping tariff stub (29.99 / free over 500) so the real OrderPricingService
// resolves without a DB. Kademeler zorunlu: önizleme de checkout gibi kademe
// çözer, kademesiz tarife fail-closed 503'tür.
const SHIPPING_TARIFF_TIERS = flatPackageTiers(29.99);
const SHIPPING_TARIFF_MOCK = {
  getActiveOutboundTariff: async () => ({
    outboundPackageFee: 29.99,
    freeShippingEnabled: true,
    freeShippingThreshold: 500,
    packageTiers: SHIPPING_TARIFF_TIERS,
  }),
  getActiveTariffSnapshot: async () => ({
    tariffId: "tariff-1",
    tariffVersion: 1,
    tariff: {
      outboundPackageFee: 29.99,
      freeShippingEnabled: true,
      freeShippingThreshold: 500,
      packageTiers: SHIPPING_TARIFF_TIERS,
    },
  }),
};

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
      providerTrackingId: "CARGO987654",
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
        OrderTaxPolicyService,
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
        { provide: RefundService, useValue: {} },
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

    // trackingNumber dahili Sürat sorgu referansıdır; dış takip URL'si gerçek
    // providerTrackingId (KargoTakipNo) ile oluşturulur.
    expect(result.trackingNumber).toBe("TRK123456");
    expect(result.trackingUrl).toContain("suratkargo.com.tr");
    expect(result.trackingUrl).toContain("CARGO987654");

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
    platformSetting: {
      // Vergi politikası tek sorguda okunur (OrderTaxPolicyService).
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
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
        OrderTaxPolicyService,
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
        { provide: RefundService, useValue: {} },
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

  /** Politika ayarlarını (PlatformSetting) tek sorgulu okumaya besler. */
  const withSettings = (settings: Record<string, string>) =>
    mockPrisma.platformSetting.findMany.mockResolvedValue(
      Object.entries(settings).map(([settingKey, settingValue]) => ({
        settingKey,
        settingValue,
      })),
    );

  // Komisyon %10 → satıcı ücreti 100; hizmet KDV'si (%20) = 20; kargo 0.
  it("bireysel satıcıdan da stopaj kesilir (kapsam genişledi)", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      sellerType: "individual",
      membership: null,
      businessStatus: null,
      taxId: null,
    });

    const preview = await service.getCommissionPreview(1000, sellerId, null);

    expect(preview.withholdingTaxAmount).toBe(10);
    expect(preview.sellerFeeAmount).toBe(100);
    expect(preview.sellerServiceTaxAmount).toBe(20);
    // 1000 − 100 (ücret) − 10 (stopaj) − 20 (hizmet KDV) = 870
    expect(preview.sellerNetAmount).toBe(870);
  });

  it("bireysel kapsamı kapatılırsa stopaj yalnız kurumsalda kesilir", async () => {
    withSettings({ withholding_applies_to_individual: "false" });
    mockPrisma.user.findUnique.mockResolvedValue({
      sellerType: "individual",
      membership: null,
      businessStatus: null,
      taxId: null,
    });

    const preview = await service.getCommissionPreview(1000, sellerId, null);

    expect(preview.withholdingTaxAmount).toBe(0);
    expect(preview.sellerNetAmount).toBe(880);
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
    expect(preview.sellerNetAmount).toBe(870);
  });

  it("stopaj oranı PlatformSetting withholding_tax_rate ile değişir", async () => {
    withSettings({ withholding_tax_rate: "2" });
    mockPrisma.user.findUnique.mockResolvedValue({
      sellerType: "business",
      membership: null,
      businessStatus: "approved",
      taxId: "1234567890",
    });

    const preview = await service.getCommissionPreview(1000, sellerId, null);

    expect(preview.withholdingTaxAmount).toBe(20);
    expect(preview.sellerNetAmount).toBe(860);
  });

  it("oran 0 yapılırsa stopaj kesilmez (hizmet KDV'si kalır)", async () => {
    withSettings({ withholding_tax_rate: "0" });
    mockPrisma.user.findUnique.mockResolvedValue({
      sellerType: "business",
      membership: null,
      businessStatus: "approved",
      taxId: "1234567890",
    });

    const preview = await service.getCommissionPreview(1000, sellerId, null);

    expect(preview.withholdingTaxAmount).toBe(0);
    expect(preview.sellerNetAmount).toBe(880);
  });

  it("hizmet KDV'si kapatılırsa önizleme KDV'siz nete döner", async () => {
    withSettings({ service_vat_enabled: "false" });
    mockPrisma.user.findUnique.mockResolvedValue({
      sellerType: "business",
      membership: null,
      businessStatus: "approved",
      taxId: "1234567890",
    });

    const preview = await service.getCommissionPreview(1000, sellerId, null);

    expect(preview.sellerServiceTaxAmount).toBe(0);
    expect(preview.sellerNetAmount).toBe(890);
  });
});
