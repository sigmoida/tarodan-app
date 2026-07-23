import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { createHash } from "crypto";
import { OrderService } from "./order.service";
import { OrderPricingService } from "./order-pricing.service";
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
import { OrderStatus, ProductStatus } from "@prisma/client";

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

  const makeProduct = (
    id: string,
    overrides: Record<string, unknown> = {},
  ) => ({
    id,
    title: `Ürün ${id.slice(-1)}`,
    status: ProductStatus.active,
    sellerId,
    categoryId: null,
    price: 100,
    oldPrice: null,
    saleStartDate: null,
    saleEndDate: null,
    quantity: 5,
    reservedQuantity: 0,
    seller: { id: sellerId, email: "seller@test.com", displayName: "Seller" },
    ...overrides,
  });

  let mockTx: any;
  let cache: any;

  const mockPrisma: any = {
    user: { findUnique: jest.fn() },
    order: { count: jest.fn().mockResolvedValue(0) },
    checkoutGroup: {
      findUnique: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    commissionRule: { findMany: jest.fn().mockResolvedValue([]) },
    platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
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
    };

    mockPrisma.user.findUnique.mockResolvedValue({
      id: buyerId,
      isBanned: false,
      email: "buyer@test.com",
      displayName: "Buyer",
      sellerType: "individual",
      membership: null,
    });
    mockPrisma.checkoutGroup.findUnique.mockResolvedValue(null);
    mockPrisma.order.count.mockResolvedValue(0);
    mockPrisma.checkoutGroup.count.mockResolvedValue(0);
    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        OrderPricingService,
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
    cache = module.get(CacheService);
  });

  const baseDto = () => ({
    items: [{ productId: productA }, { productId: productB }],
    idempotencyKey,
    shippingAddressId: addressId,
  });

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

  it("guest checkout rejects coupon codes", async () => {
    // OTP tüketimi öncesi idempotensi: yeni anahtar → null
    mockPrisma.checkoutGroup.findUnique.mockResolvedValue(null);

    await expect(
      (service as any).createCheckoutGroup({
        buyerId,
        dto: { ...baseDto(), couponCode: "INDIRIM10" },
        isGuest: true,
        guest: { email: "g@test.com" },
      }),
    ).rejects.toMatchObject({
      response: { i18nKey: "server.order.couponNotSupportedForGuest" },
    });
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
    ) => ({
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
    });

    beforeEach(() => {
      // Tek ürün, bol stok: adet doğrulaması stoktan değil sınır/geçişten sınansın.
      mockTx.$queryRaw.mockResolvedValue([{ id: productA }]);
      mockTx.product.findMany.mockResolvedValue([
        makeProduct(productA, { quantity: 100 }),
      ]);
      primeGuestOtp();
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
  });
});
