import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { createHash } from "crypto";
import { OrderService } from "../order.service";
import { OrderPricingService } from "../pricing/order-pricing.service";
import { ShippingTariffService } from "../../shipping/shipping-tariff.service";
import { OrderCheckoutService } from "./order-checkout.service";
import { OrderCheckoutCommonService } from "./order-checkout-common.service";
import { OrderCheckoutDirectService } from "./order-checkout-direct.service";
import { OrderCheckoutGroupService } from "./order-checkout-group.service";
import { OrderGuestCheckoutService } from "./order-guest-checkout.service";
import { OrderCommonService } from "../order-common.service";
import { OrderQueryService } from "../order-query.service";
import { OrderLifecycleService } from "../order-lifecycle.service";
import { PrismaService } from "../../../prisma";
import { CacheService } from "../../cache/cache.service";
import { EventService } from "../../events";
import { NotificationService } from "../../notification/notification.service";
import { DiscountService } from "../../discount/discount.service";
import { SuratCargoService } from "../../surat-cargo/surat-cargo.service";
import { ProductLockService } from "../../product/product-lock.service";
import { CommissionLedgerService } from "../../commission/commission-ledger.service";
import { TaxService } from "../../tax/tax.service";
import { ElogoInvoicingService } from "../../elogo";
import { RefundService } from "../../refund/refund.service";
import { OrderStatus, ProductKind, ProductStatus } from "@prisma/client";
import { flatPackageTiers } from "../../shipping/testing/tariff-fixture";
import { OrderTaxPolicyService } from "../pricing/order-tax-policy.service";

// Active shipping tariff stub (29.99 / free over 500) so the real OrderPricingService
// resolves without a DB.
const SHIPPING_TARIFF_MOCK = {
  getActiveOutboundTariff: async () => ({
    freeShippingEnabled: true,
    freeShippingThreshold: 500,
    packageTiers: flatPackageTiers(29.99),
  }),
  getActiveTariffSnapshot: async () => ({
    tariffId: "tariff-1",
    tariffVersion: 1,
    tariff: {
      freeShippingEnabled: true,
      freeShippingThreshold: 500,
      packageTiers: flatPackageTiers(29.99),
    },
  }),
};

const DEFAULT_COMMISSION_RULE = {
  id: "default-commission-rule",
  ruleSetId: "set-1",
  name: "Default seller commission",
  categoryId: "category-1",
  sellerType: "FREE",
  minAmount: 0,
  maxAmount: null,
  buyerCommissionRate: 0,
  buyerServiceFeeRate: 0,
  sellerCommissionRate: 10,
  sellerPlatformFeeRate: 0,
  shippingBuyerShare: 100,
  shippingShares: [],
};

/**
 * Toplu checkout (CheckoutGroup): sepetteki tüm ürünler tek grupta sipariş edilir,
 * tek ödeme grubu kapsar. Bu suite idempotensi, doğrulama ve atomiklik koruyucularını test eder.
 */
describe("OrderService checkout group (batch checkout)", () => {
  let service: OrderService;

  const buyerId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const sellerId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
  const productA = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1";
  const productB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2";
  const addressId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
  const idempotencyKey = "11111111-1111-4111-8111-111111111111";
  // Misafir OTP hash pepper'ı: ConfigService.getOrThrow bunu döndürür; testte aynı
  // değerle beklenen hash'i üretip Redis kaydını taklit ederiz (OTP tüketimini geçmek için).
  const OTP_SECRET = "test-otp-secret";
  const pricingHashFor = (
    items: Array<{
      productId: string;
      quantity?: number;
      shippingDesi?: number;
      /** Tahsil edilecek birim fiyat — indirimli üründe liste fiyatı değil. */
      unitPrice?: number;
    }>,
  ) =>
    createHash("sha256")
      .update(
        items
          .map(
            (item) =>
              `${item.productId}:${(item.unitPrice ?? 100).toFixed(2)}:${item.quantity ?? 1}:${item.shippingDesi ?? 1}`,
          )
          .sort()
          .join("|"),
      )
      .digest("hex")
      .slice(0, 16);

  const makeProduct = (
    id: string,
    overrides: Record<string, unknown> = {},
  ) => ({
    id,
    title: `Ürün ${id.slice(-1)}`,
    kind: ProductKind.listing,
    status: ProductStatus.active,
    sellerId,
    categoryId: "category-1",
    price: 100,
    oldPrice: null,
    saleStartDate: null,
    saleEndDate: null,
    quantity: 5,
    reservedQuantity: 0,
    shippingDesi: 1,
    seller: { id: sellerId, email: "seller@test.com", displayName: "Seller" },
    ...overrides,
  });

  let mockTx: any;
  let cache: any;
  let discountService: any;

  const mockPrisma: any = {
    user: { findUnique: jest.fn(), findFirst: jest.fn() },
    order: { count: jest.fn().mockResolvedValue(0) },
    checkoutGroup: {
      findUnique: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    // Koli numarası (PKG-…) da sipariş/sepet numarası gibi çakışma kontrolüyle
    // üretilir → generateUniqueReference bu sayacı çağırır.
    orderPackage: { count: jest.fn().mockResolvedValue(0) },
    commissionRuleSet: {
      findFirst: jest.fn().mockResolvedValue({ id: "set-1", version: 1 }),
    },
    commissionRule: { findMany: jest.fn().mockResolvedValue([]) },
    platformSetting: {
      // Vergi politikası tek sorguda okunur (OrderTaxPolicyService).
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    analyticsSnapshot: { upsert: jest.fn() },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockTx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ id: productA }, { id: productB }]),
      product: {
        findMany: jest
          .fn()
          .mockResolvedValue([makeProduct(productA), makeProduct(productB)]),
        // Tekil misafir alımı ürünü findUnique ile okur.
        findUnique: jest.fn().mockResolvedValue(makeProduct(productA)),
        update: jest.fn(),
      },
      order: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        create: jest.fn().mockImplementation(({ data }: any) =>
          Promise.resolve({
            id: `order-${data.productId}`,
            orderNumber: data.orderNumber,
            productId: data.productId,
          }),
        ),
      },
      address: {
        findUnique: jest.fn().mockResolvedValue({
          id: addressId,
          userId: buyerId,
          title: "Ev",
          fullName: "Alıcı",
          phone: "+905551112233",
          city: "İstanbul",
          district: "Kadıköy",
          address: "Test cad. 1",
          zipCode: "34000",
        }),
      },
      checkoutGroup: {
        create: jest
          .fn()
          .mockImplementation(({ data }: any) =>
            Promise.resolve({ id: "group-1", ...data }),
          ),
      },
      // Faz 1: satıcı-paketi (çatı) — checkout satıcı başına bir OrderPackage yaratır.
      orderPackage: {
        create: jest
          .fn()
          .mockImplementation(({ data }: any) =>
            Promise.resolve({ id: `pkg-${data.sellerId}`, ...data }),
          ),
      },
      // Sipariş oluşturulunca alıcının sepetindeki sipariş edilen ürünler silinir.
      cartItem: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      // Tekil misafir alımı sistem misafir kullanıcısını arar/yaratır.
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: "guest-user",
          email: "guest@tarodan.system",
        }),
        create: jest.fn().mockResolvedValue({
          id: "guest-user",
          email: "guest@tarodan.system",
        }),
      },
    };

    mockPrisma.user.findUnique.mockResolvedValue({
      id: buyerId,
      isBanned: false,
      email: "buyer@test.com",
      displayName: "Buyer",
      sellerType: "individual",
      membership: null,
    });
    // Misafir akışı e-postanın KAYITLI OLMADIĞINI doğrular.
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockPrisma.checkoutGroup.findUnique.mockResolvedValue(null);
    mockPrisma.order.count.mockResolvedValue(0);
    mockPrisma.checkoutGroup.count.mockResolvedValue(0);
    mockPrisma.commissionRule.findMany.mockResolvedValue([
      DEFAULT_COMMISSION_RULE,
    ]);
    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx),
    );

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
            issueTradeCashFeeInvoice: jest.fn().mockResolvedValue(undefined),
            retryPendingInvoices: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: CacheService,
          useValue: {
            del: jest.fn(),
            delPattern: jest.fn(),
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn(),
            ttl: jest.fn().mockResolvedValue(300),
          },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn(), getOrThrow: jest.fn(() => OTP_SECRET) },
        },
        { provide: EventService, useValue: { emitOrderCreated: jest.fn() } },
        { provide: NotificationService, useValue: {} },
        {
          provide: DiscountService,
          useValue: {
            validateCoupon: jest.fn(),
            reserveUsage: jest.fn(),
            releaseReservedUsageForOrders: jest.fn(),
            getEffectiveDisplayPriceMany: jest
              .fn()
              .mockResolvedValue(new Map()),
            getEffectiveDisplayPrice: jest.fn().mockResolvedValue(null),
            quantityDiscountsForLines: jest.fn().mockResolvedValue(new Map()),
          },
        },
        {
          provide: SuratCargoService,
          useValue: {
            isIntegrationEnabled: () => false,
            submitShipmentWithRetry: jest.fn(),
          },
        },
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
    cache = module.get(CacheService);
    discountService = module.get(DiscountService);
  });

  const baseDto = () => {
    const items = [{ productId: productA }, { productId: productB }];
    return {
      items,
      idempotencyKey,
      shippingAddressId: addressId,
      expectedShippingTariffVersion: 1,
      expectedCommissionRuleSetId: "set-1",
      expectedCommissionRuleSetVersion: 1,
      expectedPricingHash: pricingHashFor(items),
    };
  };

  it("creates one checkout group with an order per product (2 items → 1 group + 2 orders)", async () => {
    const result: any = await service.checkout(buyerId, baseDto() as any);

    expect(result.checkoutGroupId).toBe("group-1");
    expect(result.orders).toHaveLength(2);
    expect(mockTx.checkoutGroup.create).toHaveBeenCalledTimes(1);
    expect(mockTx.order.create).toHaveBeenCalledTimes(2);

    // Her sipariş gruba bağlanır
    for (const call of mockTx.order.create.mock.calls) {
      expect(call[0].data.checkoutGroupId).toBe("group-1");
      expect(call[0].data.status).toBe(OrderStatus.pending_payment);
    }

    // Grup toplamı sipariş toplamlarının toplamıdır
    const orderTotals = mockTx.order.create.mock.calls.map(
      (c: any) => c[0].data.totalAmount,
    );
    const groupTotal =
      mockTx.checkoutGroup.create.mock.calls[0][0].data.totalAmount;
    expect(groupTotal).toBeCloseTo(
      orderTotals.reduce((s: number, v: number) => s + v, 0),
    );

    // Her ürün için 1 adet rezervasyon
    expect(mockTx.product.update).toHaveBeenCalledWith({
      where: { id: productA },
      data: { reservedQuantity: { increment: 1 } },
    });
    expect(mockTx.product.update).toHaveBeenCalledWith({
      where: { id: productB },
      data: { reservedQuantity: { increment: 1 } },
    });

    // Sipariş oluşunca alıcının sepetindeki sipariş edilen ürünler server-side silinir
    // (bayat sepet satırı kalmasın; iptal sonrası "tekrar sipariş" akışı bozulmasın).
    expect(mockTx.cartItem.deleteMany).toHaveBeenCalledWith({
      where: {
        cart: { userId: buyerId },
        productId: { in: [productA, productB].sort() },
      },
    });
  });

  // Faz 1: satıcı-bazlı kargo + OrderPackage (çatı) senaryoları.
  const sellerId2 = "ffffffff-ffff-ffff-ffff-ffffffffffff";

  it("S2 aynı mağaza 2 ürün → 1 paket + TEK kargo ücreti (alıcı 2× ödemez)", async () => {
    // varsayılan: productA ve productB aynı satıcı (sellerId)
    await service.checkout(buyerId, baseDto() as any);

    // Tek satıcı → tek OrderPackage
    expect(mockTx.orderPackage.create).toHaveBeenCalledTimes(1);
    expect(
      mockTx.orderPackage.create.mock.calls[0][0].data.shippingCost,
    ).toBeCloseTo(29.99);
    expect(mockTx.orderPackage.create.mock.calls[0][0].data.billableDesi).toBe(
      2,
    );
    expect(
      mockTx.orderPackage.create.mock.calls[0][0].data.shippingPricingSnapshot,
    ).toMatchObject({
      tariffVersion: 1,
      billableDesi: 2,
      fullShippingAmount: 29.99,
    });

    // İki order da AYNI pakete bağlı
    const pkgIds = mockTx.order.create.mock.calls.map(
      (c: any) => c[0].data.packageId,
    );
    expect(new Set(pkgIds).size).toBe(1);
    expect(pkgIds[0]).toBe(`pkg-${sellerId}`);

    // Kargo ücreti TEK sefer (bir satırda 29.99, diğerinde 0) → toplam 29.99, 59.98 değil
    const shippings = mockTx.order.create.mock.calls.map(
      (c: any) => c[0].data.shippingCost,
    );
    expect(shippings.filter((s: number) => s > 0)).toHaveLength(1);
    expect(shippings.reduce((a: number, b: number) => a + b, 0)).toBeCloseTo(
      29.99,
    );
  });

  it("S3 2 farklı mağaza birer ürün → 2 paket + 2 kargo ücreti (3 değil)", async () => {
    mockTx.product.findMany.mockResolvedValue([
      makeProduct(productA), // seller = sellerId
      makeProduct(productB, {
        sellerId: sellerId2,
        seller: { id: sellerId2, email: "s2@test.com", displayName: "Seller2" },
      }),
    ]);

    await service.checkout(buyerId, baseDto() as any);

    // 2 satıcı → 2 OrderPackage
    expect(mockTx.orderPackage.create).toHaveBeenCalledTimes(2);
    const pkgSellers = mockTx.orderPackage.create.mock.calls.map(
      (c: any) => c[0].data.sellerId,
    );
    expect(pkgSellers).toEqual(expect.arrayContaining([sellerId, sellerId2]));
    for (const c of mockTx.orderPackage.create.mock.calls) {
      expect(c[0].data.shippingCost).toBeCloseTo(29.99);
    }

    // Her order kendi satıcı-paketine bağlı + her satıcı 1 kargo ücreti → 2 ücret
    const perOrder = mockTx.order.create.mock.calls.map((c: any) => ({
      seller: c[0].data.sellerId,
      shipping: c[0].data.shippingCost,
      pkg: c[0].data.packageId,
    }));
    expect(perOrder.filter((o: any) => o.shipping > 0)).toHaveLength(2);
    const aOrder = perOrder.find((o: any) => o.seller === sellerId);
    const bOrder = perOrder.find((o: any) => o.seller === sellerId2);
    expect(aOrder.pkg).toBe(`pkg-${sellerId}`);
    expect(bOrder.pkg).toBe(`pkg-${sellerId2}`);
  });

  it("Medium A: aynı ürünü 2× ekleyip @Max(20) aşımı REDDEDİLİR (birleşik 30)", async () => {
    // Aynı ürün 2 satır, 15+15=30 → perOrderCap(20) aşımı → stoktan ÖNCE max reddi.
    mockTx.$queryRaw.mockResolvedValue([{ id: productA }]);
    mockTx.product.findMany.mockResolvedValue([
      makeProduct(productA, { quantity: 100 }), // bol stok: red max'tan, stoktan değil
    ]);

    await expect(
      service.checkout(buyerId, {
        items: [
          { productId: productA, quantity: 15 },
          { productId: productA, quantity: 15 },
        ],
        idempotencyKey,
        shippingAddressId: addressId,
        expectedShippingTariffVersion: 1,
        expectedCommissionRuleSetId: "set-1",
        expectedCommissionRuleSetVersion: 1,
      } as any),
    ).rejects.toThrow(/maksimum 20 adet/i);

    expect(mockTx.order.create).not.toHaveBeenCalled();
  });

  it("idempotency replay: same key returns the existing group without running the transaction", async () => {
    mockPrisma.checkoutGroup.findUnique.mockResolvedValue({
      id: "group-existing",
      groupNumber: "GRP-EXISTING",
      buyerId,
      totalAmount: 250,
      orders: [
        {
          id: "order-1",
          orderNumber: "ORD-1",
          productId: productA,
          totalAmount: 125,
          subtotal: 100,
          discountAmount: 0,
          discountCode: null,
        },
      ],
    });

    const result: any = await service.checkout(buyerId, baseDto() as any);

    expect(result.checkoutGroupId).toBe("group-existing");
    expect(result.existingGroup).toBe(true);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("idempotency key belonging to another buyer is rejected", async () => {
    mockPrisma.checkoutGroup.findUnique.mockResolvedValue({
      id: "group-existing",
      groupNumber: "GRP-EXISTING",
      buyerId: "ffffffff-ffff-ffff-ffff-ffffffffffff",
      totalAmount: 250,
      orders: [],
    });

    await expect(service.checkout(buyerId, baseDto() as any)).rejects.toThrow(
      ForbiddenException,
    );
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("out-of-stock product aborts the whole checkout with the failing productId (atomicity)", async () => {
    mockTx.product.findMany.mockResolvedValue([
      makeProduct(productA),
      makeProduct(productB, { quantity: 1, reservedQuantity: 1 }), // müsait adet 0
    ]);

    let thrown: any;
    try {
      await service.checkout(buyerId, baseDto() as any);
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(BadRequestException);
    expect(thrown.getResponse()).toMatchObject({ productId: productB });
    expect(mockTx.checkoutGroup.create).not.toHaveBeenCalled();
    expect(mockTx.order.create).not.toHaveBeenCalled();
  });

  it("cancels the buyer's stale pending order for the same product and releases its reservation", async () => {
    mockTx.order.findMany.mockResolvedValue([
      {
        id: "stale-order-1",
        productId: productA,
        reservationReleasedAt: null,
      },
    ]);

    await service.checkout(buyerId, baseDto() as any);

    expect(mockTx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "stale-order-1" },
        data: expect.objectContaining({ status: OrderStatus.cancelled }),
      }),
    );
    expect(mockTx.product.update).toHaveBeenCalledWith({
      where: { id: productA },
      data: { reservedQuantity: { decrement: 1 } },
    });
  });

  it("second checkout of own still-reserved product cancels the stale order and succeeds (no false stockout)", async () => {
    // Senaryo: kullanıcı "onayla ve öde"ye bastı (ilk sipariş ürünü rezerve etti:
    // quantity=1, reservedQuantity=1 → available=0). Geri dönüp tekrar bastı.
    // Kendi bekleyen siparişi iptal edilip rezervasyon serbest bırakılmalı, sonra
    // doğrulama serbest kalmış stoğu görmeli → yanlış "stokta yok" OLMAMALI.
    mockTx.$queryRaw.mockResolvedValue([{ id: productA }]);
    const productState = { reservedQuantity: 1 };
    mockTx.product.findMany.mockImplementation(() =>
      Promise.resolve([
        makeProduct(productA, {
          quantity: 1,
          reservedQuantity: productState.reservedQuantity,
        }),
      ]),
    );
    mockTx.product.update.mockImplementation(({ where, data }: any) => {
      if (where.id === productA && data?.reservedQuantity?.decrement) {
        productState.reservedQuantity -= data.reservedQuantity.decrement;
      }
      if (where.id === productA && data?.reservedQuantity?.increment) {
        productState.reservedQuantity += data.reservedQuantity.increment;
      }
      return Promise.resolve({});
    });
    mockTx.order.findMany.mockResolvedValue([
      { id: "stale-order-1", productId: productA, reservationReleasedAt: null },
    ]);

    const dto = {
      items: [{ productId: productA }],
      idempotencyKey,
      shippingAddressId: addressId,
      expectedShippingTariffVersion: 1,
      expectedCommissionRuleSetId: "set-1",
      expectedCommissionRuleSetVersion: 1,
      expectedPricingHash: pricingHashFor([{ productId: productA }]),
    };
    const result: any = await service.checkout(buyerId, dto as any);

    // Kendi bekleyen siparişi iptal edildi
    expect(mockTx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "stale-order-1" },
        data: expect.objectContaining({ status: OrderStatus.cancelled }),
      }),
    );
    // Stockout fırlatılmadı; yeni grup + sipariş oluştu
    expect(result.checkoutGroupId).toBe("group-1");
    expect(mockTx.order.create).toHaveBeenCalledTimes(1);
  });

  it("missing shipping address is rejected before any transaction", async () => {
    await expect(
      service.checkout(buyerId, {
        items: [{ productId: productA }],
        idempotencyKey,
      } as any),
    ).rejects.toThrow(BadRequestException);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  /**
   * İndirimli üründe siparişin ürün tabanı TAHSİL EDİLEN tutardır.
   *
   * Eskiden `subtotal`'a indirim ÖNCESİ liste fiyatı yazılıyordu: alıcı 70
   * öderken sipariş 100 kaydediyordu. Admin sipariş dosyası alıcı toplamını ve
   * satıcı netini o 100'den kuruyor, platform satışı e-Arşiv faturası da
   * kalemlerini oradan çıkarıyordu — belge tahsil edilenden fazlaya kesiliyordu.
   */
  it("indirimli üründe subtotal, liste fiyatını değil tahsil edilen tabanı tutar", async () => {
    mockTx.$queryRaw.mockResolvedValue([{ id: productA }]);
    mockTx.product.findMany.mockResolvedValue([
      makeProduct(productA, { price: 70, oldPrice: 100 }),
    ]);

    await service.checkout(buyerId, {
      items: [{ productId: productA }],
      idempotencyKey,
      shippingAddressId: addressId,
      expectedShippingTariffVersion: 1,
      expectedCommissionRuleSetId: "set-1",
      expectedCommissionRuleSetVersion: 1,
      expectedPricingHash: pricingHashFor([
        { productId: productA, unitPrice: 70 },
      ]),
    } as any);

    const data = mockTx.order.create.mock.calls[0][0].data;
    expect(Number(data.unitPrice)).toBe(70);
    expect(Number(data.subtotal)).toBe(70);

    // Alıcı toplamı aynı tabandan türer: taban + alıcıya eklenenler.
    expect(Number(data.totalAmount)).toBeCloseTo(
      70 +
        Number(data.buyerShippingAmount) +
        Number(data.buyerFeeAmount) +
        Number(data.buyerServiceTaxAmount),
      2,
    );

    // Liste fiyatı kaybolmaz — indirim alanlarında durur.
    expect(Number(data.discountAmount)).toBe(30);
    expect(data.discountBreakdown.originalPrice).toBe(100);
    expect((data.financialSnapshot as any).pricing.originalUnitPrice).toBe(100);
  });

  /**
   * İndirim penceresi TAHSİLATI da bağlar.
   *
   * `saleEndDate` yalnız gösterimi etkiliyordu: pencere kapandığında vitrinde
   * çizili fiyat ve rozet kayboluyor ama ürün indirimli fiyattan satılmaya
   * devam ediyordu. Fiyatı geri alan bir iş yok — tek dönüş yolu satıcının
   * ilanı elle güncellemesiydi.
   */
  it("indirim penceresi bittiyse indirim ÖNCESİ fiyattan tahsil edilir", async () => {
    mockTx.$queryRaw.mockResolvedValue([{ id: productA }]);
    mockTx.product.findMany.mockResolvedValue([
      makeProduct(productA, {
        price: 70,
        oldPrice: 100,
        saleStartDate: new Date("2020-01-01"),
        saleEndDate: new Date("2020-02-01"), // çoktan bitti
      }),
    ]);

    await service.checkout(buyerId, {
      items: [{ productId: productA }],
      idempotencyKey,
      shippingAddressId: addressId,
      expectedShippingTariffVersion: 1,
      expectedCommissionRuleSetId: "set-1",
      expectedCommissionRuleSetVersion: 1,
      // Quote da aynı kuralı uygular → hash indirim öncesi fiyattan kurulur.
      expectedPricingHash: pricingHashFor([
        { productId: productA, unitPrice: 100 },
      ]),
    } as any);

    const data = mockTx.order.create.mock.calls[0][0].data;
    expect(Number(data.unitPrice)).toBe(100);
    expect(Number(data.subtotal)).toBe(100);
    expect(Number(data.discountAmount)).toBe(0);
  });

  // ── Misafir GRUP checkout (POST /orders/checkout/guest → checkoutGuest) ──────────
  // checkoutGuest, dto.items içindeki quantity'yi createCheckoutGroup'a birebir
  // devreder → adet mantığı ÜYE grup checkout ile aynıdır. Bu blok, adet'in
  // fiyat*adet (subtotal), order.quantity, stok rezervasyonu ve birleşik üst-sınır
  // (HARD_CAP=20 / maxQuantityPerOrder) boyunca gerçekten aktığını uçtan uca doğrular.
  describe("guest group checkout (checkoutGuest) honors per-item quantity", () => {
    const guestEmail = "guest@example.com";
    const guestCode = "123456";

    // Misafir OTP tüketimini geç: Redis kaydını doğru hash ile taklit et (aynı pepper).
    const primeGuestOtp = () => {
      const normEmail = guestEmail.trim().toLowerCase();
      const h = createHash("sha256")
        .update(`${OTP_SECRET}:${normEmail}:${guestCode}`, "utf8")
        .digest("hex");
      cache.get.mockResolvedValue({ h, a: 0, c: 1, v: 5 });
      cache.ttl.mockResolvedValue(300);
    };

    const guestDto = (
      items: Array<{ productId: string; quantity?: number }>,
    ) => {
      return {
        items,
        idempotencyKey,
        email: guestEmail,
        emailVerificationCode: guestCode,
        phone: "+905551234567",
        guestName: "Guest User",
        // Misafir grup checkout inline adres ister (kayıtlı adres ID yok).
        shippingAddress: {
          fullName: "Guest User",
          phone: "+905551234567",
          city: "İstanbul",
          district: "Kadıköy",
          address: "Test cad. 1",
        },
        expectedShippingTariffVersion: 1,
        expectedCommissionRuleSetId: "set-1",
        expectedCommissionRuleSetVersion: 1,
        expectedPricingHash: pricingHashFor(items),
      };
    };

    beforeEach(() => {
      // Tek ürün, bol stok: adet doğrulaması stoktan değil sınır/geçişten sınansın.
      mockTx.$queryRaw.mockResolvedValue([{ id: productA }]);
      mockTx.product.findMany.mockResolvedValue([
        makeProduct(productA, { quantity: 100 }),
      ]);
      primeGuestOtp();
    });

    /**
     * TEKİL misafir alımı (POST /orders/guest-checkout → guestCheckout) da
     * kampanyayı uygulamalı.
     *
     * Bu yol fiyatı ham kolondan okuyordu (`salePrice ?? price`) ve indirim
     * motorunu HİÇ sormuyordu: code'suz bir kampanya aktifken ürün kartı 80
     * gösterirken misafirden 100 tahsil ediliyordu. Üye ve misafir GRUP yolları
     * bunu F1.4'te çözmüştü, tekil misafir yolu dışarıda kalmıştı.
     */
    it("tekil misafir alımında kampanya fiyatı tahsil edilir", async () => {
      mockTx.product.findUnique.mockResolvedValue(
        makeProduct(productA, { quantity: 100 }),
      );
      // code=null kampanya: kartta görünen efektif fiyat 80.
      discountService.getEffectiveDisplayPrice.mockResolvedValue(80);

      await service.guestCheckout({
        productId: productA,
        idempotencyKey,
        email: guestEmail,
        emailVerificationCode: guestCode,
        phone: "+905551234567",
        guestName: "Guest User",
        shippingAddress: {
          fullName: "Guest User",
          phone: "+905551234567",
          city: "İstanbul",
          district: "Kadıköy",
          address: "Test cad. 1",
        },
        expectedShippingTariffVersion: 1,
        expectedCommissionRuleSetId: "set-1",
        expectedCommissionRuleSetVersion: 1,
        expectedPricingHash: pricingHashFor([
          { productId: productA, unitPrice: 80 },
        ]),
      } as any);

      const data = mockTx.order.create.mock.calls[0][0].data;
      expect(Number(data.unitPrice)).toBe(80);
      expect(Number(data.subtotal)).toBe(80);
    });

    it("quantity=3 → order.quantity=3, subtotal=fiyat*3, rezervasyon +3 (1 değil)", async () => {
      await service.checkoutGuest(
        guestDto([{ productId: productA, quantity: 3 }]) as any,
      );

      expect(mockTx.order.create).toHaveBeenCalledTimes(1);
      const orderData = mockTx.order.create.mock.calls[0][0].data;
      expect(orderData.quantity).toBe(3);
      expect(orderData.unitPrice).toBe(100);
      // subtotal = originalPrice * adet = 100 * 3
      expect(orderData.subtotal).toBe(300);
      // Satır toplamı fiyat*adet üzerinden → totalAmount en az 300 (+ kargo/fee/vergi)
      expect(orderData.totalAmount).toBeGreaterThanOrEqual(300);

      // Stok rezervasyonu adet kadar artar (eskiden sabit 1 idi).
      expect(mockTx.product.update).toHaveBeenCalledWith({
        where: { id: productA },
        data: { reservedQuantity: { increment: 3 } },
      });
    });

    it("adet verilmezse (===1) davranış değişmez: order.quantity=1, rezervasyon +1", async () => {
      await service.checkoutGuest(guestDto([{ productId: productA }]) as any);

      const orderData = mockTx.order.create.mock.calls[0][0].data;
      expect(orderData.quantity).toBe(1);
      expect(orderData.subtotal).toBe(100);
      expect(mockTx.product.update).toHaveBeenCalledWith({
        where: { id: productA },
        data: { reservedQuantity: { increment: 1 } },
      });
    });

    it("birleşik adet üst sınırı (20) misafirde de zorlanır: aynı ürün 15+15 → reddedilir", async () => {
      await expect(
        service.checkoutGuest(
          guestDto([
            { productId: productA, quantity: 15 },
            { productId: productA, quantity: 15 },
          ]) as any,
        ),
      ).rejects.toThrow(/maksimum 20 adet/i);

      expect(mockTx.order.create).not.toHaveBeenCalled();
    });

    it("misafir kuponu ARTIK reddedilmez: validateCoupon userId=null ile çağrılır ve indirim uygulanır", async () => {
      discountService.validateCoupon.mockResolvedValue({
        isValid: true,
        discount: {
          id: "disc-1",
          name: "İndirim",
          code: "INDIRIM10",
          type: "percentage",
          value: 10,
          scope: "global",
          estimatedDiscount: 10,
          platformFundedShare: 1,
          eligibleProductIds: [productA],
        },
      });

      await service.checkoutGuest({
        ...guestDto([{ productId: productA }]),
        couponCode: "INDIRIM10",
      } as any);

      // Kişi-başı limit atlanır: validateCoupon userId=null ile çağrılır.
      expect(discountService.validateCoupon).toHaveBeenCalledWith(
        expect.objectContaining({ code: "INDIRIM10" }),
        null,
      );
      // Kupon indirimi siparişe yansır; ödeme öncesi yalnız kota rezerve edilir.
      expect(discountService.reserveUsage).toHaveBeenCalled();
      const orderData = mockTx.order.create.mock.calls[0][0].data;
      expect(orderData.discountAmount).toBeGreaterThan(0);
    });
  });

  /**
   * FATURA GRUPLAMASI — çok satıcılı sepette kaç fatura kesilir?
   *
   * e-Logo gelir faturaları TAMAMEN `orderId` anahtarlıdır
   * (`issueCommissionInvoice(orderId)`, `issueServiceFeeInvoice(orderId)`,
   * `dedupeKey: invoice.order_revenue:<orderId>`). Dolayısıyla "kaç fatura"
   * sorusunun cevabı "kaç Order yaratıldığı"dır — bu testler o sayıyı ve
   * satıcı dağılımını sabitler.
   */
  describe("çok satıcılı sepet → fatura gruplaması", () => {
    const productC = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3";

    const threeItemDto = () => {
      const items = [
        { productId: productA },
        { productId: productB },
        { productId: productC },
      ];
      return {
        items,
        idempotencyKey,
        shippingAddressId: addressId,
        expectedShippingTariffVersion: 1,
        expectedCommissionRuleSetId: "set-1",
        expectedCommissionRuleSetVersion: 1,
        expectedPricingHash: pricingHashFor(items),
      };
    };

    /** A + B → satıcı 1, C → satıcı 2 (kullanıcının 2+1 senaryosu). */
    const splitTwoAndOne = () => {
      // Satır kilidi sorgusu istenen ürün sayısı kadar satır dönmeli; varsayılan
      // mock iki ürüne göre sabit.
      mockTx.$queryRaw.mockResolvedValue([
        { id: productA },
        { id: productB },
        { id: productC },
      ]);
      mockTx.product.findMany.mockResolvedValue([
        makeProduct(productA),
        makeProduct(productB),
        makeProduct(productC, {
          sellerId: sellerId2,
          seller: {
            id: sellerId2,
            email: "s2@test.com",
            displayName: "Seller2",
          },
        }),
      ]);
    };

    it("satıcı başına DEĞİL, ürün başına sipariş yaratır (2+1 → 3 sipariş)", async () => {
      splitTwoAndOne();

      await service.checkout(buyerId, threeItemDto() as any);

      // Paketler satıcı başına gruplanıyor…
      expect(mockTx.orderPackage.create).toHaveBeenCalledTimes(2);
      // …ama siparişler ürün başına açılıyor.
      expect(mockTx.order.create).toHaveBeenCalledTimes(3);
    });

    it("her sipariş kendi satıcısının paketine bağlanır", async () => {
      splitTwoAndOne();

      await service.checkout(buyerId, threeItemDto() as any);

      const orders = mockTx.order.create.mock.calls.map((c: any) => ({
        seller: c[0].data.sellerId,
        pkg: c[0].data.packageId,
      }));

      expect(orders.filter((o: any) => o.seller === sellerId)).toHaveLength(2);
      expect(orders.filter((o: any) => o.seller === sellerId2)).toHaveLength(1);
      // Aynı satıcının iki siparişi TEK pakete bağlı.
      const sellerOnePkgs = new Set(
        orders.filter((o: any) => o.seller === sellerId).map((o: any) => o.pkg),
      );
      expect(sellerOnePkgs.size).toBe(1);
    });

    it("kargo satıcı başına BİR kez alınır (3 ürün → 2 kargo ücreti)", async () => {
      splitTwoAndOne();

      await service.checkout(buyerId, threeItemDto() as any);

      const shippings = mockTx.order.create.mock.calls.map(
        (c: any) => c[0].data.shippingCost,
      );
      expect(shippings.filter((s: number) => s > 0)).toHaveLength(2);
    });

    it("satıcı başına TEK fatura kaynağı üretir (3 sipariş → 2 paket)", async () => {
      // Komisyon ve hizmet bedeli faturaları artık `packageId` anahtarlı
      // kesiliyor (ElogoInvoicingService.resolvePackageInvoiceBasis), sipariş
      // değil. Paket satıcı başına tek olduğu için 2 satıcı → 2 fatura seti:
      // biri iki kalemli, diğeri tek kalemli.
      splitTwoAndOne();

      await service.checkout(buyerId, threeItemDto() as any);

      const invoiceSources = new Set(
        mockTx.order.create.mock.calls.map((c: any) => c[0].data.packageId),
      );
      expect(invoiceSources.size).toBe(2);

      const ordersPerPackage = mockTx.order.create.mock.calls.reduce(
        (acc: Record<string, number>, c: any) => {
          const pkg = c[0].data.packageId;
          acc[pkg] = (acc[pkg] ?? 0) + 1;
          return acc;
        },
        {},
      );
      // Satıcı 1'in paketi 2 kalem, satıcı 2'nin paketi 1 kalem taşır.
      expect(ordersPerPackage[`pkg-${sellerId}`]).toBe(2);
      expect(ordersPerPackage[`pkg-${sellerId2}`]).toBe(1);
    });
  });
});
