import { Test, TestingModule } from "@nestjs/testing";
import { CartService } from "./cart.service";
import { PrismaService } from "../../prisma";
import { DiscountService } from "../discount/discount.service";
import { StorageService } from "../storage/storage.service";
import { ShippingTariffService } from "../shipping/shipping-tariff.service";
import { ProductStatus } from "@prisma/client";

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
              outboundPackageFee: 29.99,
              freeShippingEnabled: true,
              freeShippingThreshold: 500,
              rates: [{ desi: 1, amount: 29.99 }],
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
});

describe("CartService.calculateCart — unavailable items", () => {
  const mockCartFindUnique = jest.fn();
  const mockDiscountFindUnique = jest.fn();
  const mockGetEffectiveDisplayPrice = jest.fn();
  const mockCheckUsageLimit = jest.fn();
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
          outboundPackageFee: 29.99,
          freeShippingEnabled: true,
          freeShippingThreshold: 500,
          rates: [{ desi: 1, amount: 29.99 }],
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

  it("calculates coupon (base price, no cap) and shipping from available items only", async () => {
    mockDiscountFindUnique.mockResolvedValue({
      id: "discount-1",
      name: "Sabit indirim",
      code: "SAVE500",
      isActive: true,
      startDate: new Date("2020-01-01"),
      endDate: new Date("2100-01-01"),
      scope: "global",
      sellerId: null,
      targetProductIds: [],
      minCartValue: null,
      type: "fixed",
      value: 500,
      maxDiscountAmount: null,
      isStackable: true,
    });

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
    // Fixed 500 coupon clamps to the eligible base amount (100); no 50% cap now.
    expect(result.couponDiscountTotal).toBe(100);
    expect(result.totalDiscount).toBe(100);
    expect(result.shippingCost).toBe(29.99);
    expect(result.amountToFreeShipping).toBe(500);
    expect(result.grandTotal).toBeCloseTo(29.99, 2);
    expect(result.appliedDiscounts[0].affectedProductIds).toEqual([
      "product-available",
    ]);
  });
});
