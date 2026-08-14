import { Test, TestingModule } from "@nestjs/testing";
import { CartService } from "./cart.service";
import { PrismaService } from "../../prisma";
import { DiscountService } from "../discount/discount.service";
import { StorageService } from "../storage/storage.service";
import { ShippingTariffService } from "../shipping/shipping-tariff.service";
import { ProductKind, ProductStatus } from "@prisma/client";
import { flatPackageTiers } from "../shipping/testing/tariff-fixture";

/**
 * addItem — "sepette zaten olan ürüne tekrar ekleme" davranışı.
 *
 * Regresyon: Tekil (quantity=1) ürünlerde ikinci "Sepete Ekle" eskiden
 * newQuantity=2 hesaplayıp "Bu üründen en fazla 1 adet sipariş verilebilir"
 * hatası fırlatıyordu. İptal sonrası kalan bayat sepet satırıyla birleşince
 * kullanıcı "tekrar sipariş veremiyorum" sanıyordu. Artık idempotent:
 * stok/limit üst sınırına sabitlenir, hata fırlatmaz.
 */
describe("CartService.addItem — idempotent re-add", () => {
  let service: CartService;

  const cartId = "cart-1";
  const productId = "prod-1";

  const mockPrisma: any = {
    product: { findUnique: jest.fn() },
    cartItem: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
    },
    cart: { update: jest.fn().mockResolvedValue({}) },
  };

  const makeProduct = (overrides: Record<string, unknown> = {}) => ({
    id: productId,
    title: "Tekil Ürün",
    kind: ProductKind.listing,
    status: ProductStatus.active,
    sellerId: "seller-1",
    quantity: 1,
    reservedQuantity: 0,
    maxQuantityPerOrder: null,
    images: [],
    seller: { id: "seller-1", displayName: "Satıcı" },
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DiscountService, useValue: {} },
        { provide: StorageService, useValue: {} },
        {
          provide: ShippingTariffService,
          useValue: {
            getActiveOutboundTariff: async () => ({
              freeShippingEnabled: true,
              freeShippingThreshold: 500,
              packageTiers: flatPackageTiers(29.99),
            }),
          },
        },
      ],
    }).compile();

    service = module.get<CartService>(CartService);
    // getOrCreateCart / getOrCreate / extendCartExpiry servis-içi yardımcılar —
    // addItem'ın karar mantığını izole test etmek için spy'lanır.
    jest
      .spyOn(service as any, "getOrCreateCart")
      .mockResolvedValue({ id: cartId });
    jest.spyOn(service as any, "extendCartExpiry").mockResolvedValue(undefined);
    jest.spyOn(service, "getOrCreate").mockResolvedValue({ id: cartId } as any);
  });

  it("tekil ürün (quantity=1) zaten sepetteyken tekrar eklenince HATA FIRLATMAZ ve adet 1 kalır (no-op)", async () => {
    mockPrisma.product.findUnique.mockResolvedValue(makeProduct());
    mockPrisma.cartItem.findUnique.mockResolvedValue({
      id: "ci-1",
      cartId,
      productId,
      quantity: 1,
    });

    await expect(
      service.addItem("user-1", { productId, quantity: 1 } as any),
    ).resolves.toBeDefined();

    // Artış yok → cartItem.update çağrılmamalı (no-op).
    expect(mockPrisma.cartItem.update).not.toHaveBeenCalled();
  });

  it("çoklu-adet ürün (quantity=3, max=3): sepette 2 varken 1 daha eklenince 3 olur", async () => {
    mockPrisma.product.findUnique.mockResolvedValue(
      makeProduct({ quantity: 3, maxQuantityPerOrder: 3 }),
    );
    mockPrisma.cartItem.findUnique.mockResolvedValue({
      id: "ci-1",
      cartId,
      productId,
      quantity: 2,
    });

    await service.addItem("user-1", { productId, quantity: 1 } as any);

    expect(mockPrisma.cartItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { quantity: 3 } }),
    );
  });

  it("çoklu-adet ürün limitte (quantity=3, sepette 3): tekrar eklenince HATA YOK, no-op", async () => {
    mockPrisma.product.findUnique.mockResolvedValue(
      makeProduct({ quantity: 3, maxQuantityPerOrder: 3 }),
    );
    mockPrisma.cartItem.findUnique.mockResolvedValue({
      id: "ci-1",
      cartId,
      productId,
      quantity: 3,
    });

    await expect(
      service.addItem("user-1", { productId, quantity: 1 } as any),
    ).resolves.toBeDefined();
    expect(mockPrisma.cartItem.update).not.toHaveBeenCalled();
  });

  it("BUSINESS hakkı bitmiş kurumsal satıcının ürünü sepete eklenemez", async () => {
    mockPrisma.product.findUnique.mockResolvedValue(
      makeProduct({
        seller: {
          id: "seller-1",
          displayName: "Kurumsal Satıcı",
          businessStatus: "approved",
          companyName: "Örnek AŞ",
          taxId: "1234567890",
          membership: {
            status: "expired",
            currentPeriodEnd: new Date("2025-01-01"),
            tier: { type: "business", isActive: true },
          },
        },
      }),
    );

    await expect(
      service.addItem("user-1", { productId, quantity: 1 } as any),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "SELLER_SALES_SUSPENDED",
        productId,
        sellerId: "seller-1",
      }),
    });
    expect(mockPrisma.cartItem.findUnique).not.toHaveBeenCalled();
  });

  it("ödeme-only ürün normal sepete eklenemez", async () => {
    mockPrisma.product.findUnique.mockResolvedValue(
      makeProduct({ kind: ProductKind.boost }),
    );

    await expect(
      service.addItem("user-1", { productId, quantity: 1 } as any),
    ).rejects.toMatchObject({
      response: { i18nKey: "server.product.notFound" },
    });
    expect(mockPrisma.cartItem.findUnique).not.toHaveBeenCalled();
  });
});

describe("CartService.calculateCart — unavailable items", () => {
  const mockCartFindUnique = jest.fn();
  const mockDiscountFindUnique = jest.fn();
  const mockGetEffectiveDisplayPrice = jest.fn();
  const mockCheckUsageLimit = jest.fn();
  const mockValidateCoupon = jest.fn();
  const mockPrisma = {
    cart: {
      findUnique: mockCartFindUnique,
    },
    discount: {
      findUnique: mockDiscountFindUnique,
    },
  } as unknown as PrismaService;
  const mockDiscountService = {
    getEffectiveDisplayPrice: mockGetEffectiveDisplayPrice,
    checkUsageLimit: mockCheckUsageLimit,
    validateCoupon: mockValidateCoupon,
  } as unknown as DiscountService;

  const makeCartItem = (
    id: string,
    overrides: Record<string, unknown> = {},
  ) => ({
    id: `cart-item-${id}`,
    quantity: 1,
    product: {
      id: `product-${id}`,
      title: `Ürün ${id}`,
      price: 100,
      kind: ProductKind.listing,
      status: ProductStatus.active,
      sellerId: "seller-1",
      categoryId: "category-1",
      quantity: 5,
      reservedQuantity: 0,
      maxQuantityPerOrder: null,
      shippingDesi: 1,
      images: [],
      seller: { id: "seller-1", displayName: "Satıcı" },
      ...overrides,
    },
  });

  const calculateCart = async (
    items: ReturnType<typeof makeCartItem>[],
    couponCode: string | null = null,
  ) => {
    mockCartFindUnique.mockResolvedValue({
      id: "cart-1",
      userId: "buyer-1",
      couponCode,
      expiresAt: new Date("2100-01-01"),
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
      items,
    });

    const service = new CartService(
      mockPrisma,
      mockDiscountService,
      {
        getActiveOutboundTariff: async () => ({
          freeShippingEnabled: true,
          freeShippingThreshold: 500,
          packageTiers: flatPackageTiers(29.99),
        }),
      } as any,
      {} as StorageService,
    );

    const response = await service.getOrCreate("buyer-1");
    return response.calculation;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetEffectiveDisplayPrice.mockResolvedValue(null);
    mockCheckUsageLimit.mockResolvedValue(true);
  });

  it("keeps a deleted item visible but excludes it from every payable total", async () => {
    mockGetEffectiveDisplayPrice.mockResolvedValueOnce(100);

    const result = await calculateCart([
      makeCartItem("deleted", {
        status: ProductStatus.deleted,
        price: 125,
      }),
    ]);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      productId: "product-deleted",
      isAvailable: false,
      lineTotal: 100,
      productDiscount: 25,
    });
    expect(result.itemCount).toBe(0);
    expect(result.subtotal).toBe(0);
    expect(result.productDiscountTotal).toBe(0);
    expect(result.shippingCost).toBe(0);
    expect(result.amountToFreeShipping).toBe(0);
    expect(result.grandTotal).toBe(0);
  });

  it("askıdaki kurumsal satırı görünür bırakır fakat uygun satırların toplamını engellemez", async () => {
    const result = await calculateCart([
      makeCartItem("available"),
      makeCartItem("suspended", {
        sellerId: "seller-suspended",
        seller: {
          id: "seller-suspended",
          displayName: "Kurumsal Satıcı",
          businessStatus: "approved",
          companyName: "Örnek AŞ",
          taxId: "1234567890",
          membership: {
            status: "expired",
            currentPeriodEnd: new Date("2025-01-01"),
            tier: { type: "business", isActive: true },
          },
        },
      }),
    ]);

    expect(result.items).toHaveLength(2);
    expect(result.items[1]).toMatchObject({
      productId: "product-suspended",
      isAvailable: false,
      stockWarning: expect.stringContaining("kurumsal üyeliği"),
    });
    expect(result.itemCount).toBe(1);
    expect(result.subtotal).toBe(100);
    expect(result.shippingCost).toBe(29.99);
  });

  it("kuponu otoritatif validateCoupon'dan alır, %50 tavanla kırpar; kargo/eşik kupon ÖNCESİ tutardan", async () => {
    // Sepet kuponu artık checkout ile AYNI kaynaktan geçer: validateCoupon
    // (voucher/limit/kapsam) + allocateCouponAcrossLines (%50 satır tavanı).
    // 100 TL'lik uygun satıra 100 TL'lik kupon tahmini → 50 TL'ye kırpılır.
    mockValidateCoupon.mockResolvedValue({
      isValid: true,
      discount: {
        id: "discount-1",
        name: "Sabit indirim",
        code: "SAVE500",
        type: "fixed",
        value: 500,
        scope: "global",
        estimatedDiscount: 100,
        eligibleProductIds: ["product-available"],
        target: "product_price",
      },
    });
    mockDiscountFindUnique.mockResolvedValue({ isStackable: true });

    const result = await calculateCart(
      [
        makeCartItem("available"),
        makeCartItem("deleted", {
          status: ProductStatus.deleted,
          price: 1000,
          quantity: 10,
        }),
      ],
      "SAVE500",
    );

    expect(result.items).toHaveLength(2);
    expect(result.itemCount).toBe(1);
    expect(result.subtotal).toBe(100);
    expect(mockValidateCoupon).toHaveBeenCalledWith(
      {
        code: "SAVE500",
        cartItems: [{ productId: "product-available", quantity: 1 }],
      },
      "buyer-1",
    );
    // %50 tavan: 100 TL tabanda kupon en çok 50 TL iner (checkout ile birebir).
    expect(result.couponDiscountTotal).toBe(50);
    expect(result.totalDiscount).toBe(50);
    // Eşik/kargo kupon ÖNCESİ tutardan: kupon kargo hesabını değiştirmez ve
    // ücretsiz kargoya kalan tutarı da büyütmez (500 eşik − 100 paket = 400).
    expect(result.shippingCost).toBe(29.99);
    expect(result.amountToFreeShipping).toBe(400);
    expect(result.grandTotal).toBeCloseTo(79.99, 2);
    expect(result.appliedDiscounts[0].affectedProductIds).toEqual([
      "product-available",
    ]);
  });

  it("bedel hedefli kupon sepette ürün tabanını DÜŞÜRMEZ (tutar checkout'ta uygulanır)", async () => {
    mockValidateCoupon.mockResolvedValue({
      isValid: true,
      discount: {
        id: "discount-fee",
        name: "Komisyonsuz alışveriş",
        code: "KOMISYONSUZ",
        type: "percentage",
        value: 100,
        scope: "global",
        estimatedDiscount: 0,
        eligibleProductIds: ["product-available"],
        target: "buyer_commission",
      },
    });
    mockDiscountFindUnique.mockResolvedValue({ isStackable: true });

    const result = await calculateCart(
      [makeCartItem("available")],
      "KOMISYONSUZ",
    );

    // Kupon geçerli görünür ama ürün tabanından hiçbir şey inmez.
    expect(result.couponDiscountTotal).toBe(0);
    expect(result.appliedDiscounts[0]).toMatchObject({
      discountId: "discount-fee",
      appliedAmount: 0,
    });
    expect(result.grandTotal).toBeCloseTo(129.99, 2);
  });
});
