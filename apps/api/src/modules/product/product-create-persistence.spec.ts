import { BadRequestException } from "@nestjs/common";
import { ProductCondition } from "@prisma/client";
import { ProductCreateService } from "./product-create.service";
import type { CreateProductDto } from "./dto";
import { ShippingPackageTierCode } from "@prisma/client";

describe("ProductCreateService required listing details", () => {
  const sellerId = "seller-1";
  const dto: CreateProductDto = {
    title: "Hot Wheels Porsche 911",
    description: "Kutusunda, temiz durumda koleksiyonluk model araç.",
    price: 1000,
    categoryId: "11111111-1111-4111-8111-111111111111",
    condition: ProductCondition.new,
    brandId: "22222222-2222-4222-8222-222222222222",
    carModelId: "33333333-3333-4333-8333-333333333333",
    manufacturerId: "44444444-4444-4444-8444-444444444444",
    modelCode: " HKG72 ",
    color: " Kırmızı ",
    isBoxed: true,
    scale: "1:64",
    material: "diecast",
    shippingPackageTier: ShippingPackageTierCode.medium,
    // Gerçekçi anahtarlar: yüklemeler kullanıcıya özel klasöre iner ve
    // create sahiplik doğrulaması yapar (product-image-keys).
    images: [
      {
        cardKey: `dev/products/product-images/u/${sellerId}/1-card.webp`,
        detailKey: `dev/products/product-images/u/${sellerId}/1-detail.webp`,
      },
      {
        cardKey: `dev/products/product-images/u/${sellerId}/2-card.webp`,
        detailKey: `dev/products/product-images/u/${sellerId}/2-detail.webp`,
      },
      {
        cardKey: `dev/products/product-images/u/${sellerId}/3-card.webp`,
        detailKey: `dev/products/product-images/u/${sellerId}/3-detail.webp`,
      },
    ],
  };
  const createdProduct = {
    id: "product-1",
    sellerId,
    images: [],
    seller: { id: sellerId },
    category: { id: dto.categoryId },
  };
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: sellerId,
        isBanned: false,
        isSeller: true,
      }),
      update: jest.fn(),
    },
    category: {
      findUnique: jest.fn().mockResolvedValue({
        id: dto.categoryId,
        isActive: true,
      }),
    },
    brand: {
      findUnique: jest.fn().mockResolvedValue({
        id: dto.brandId,
        isActive: true,
      }),
    },
    carModel: {
      findUnique: jest.fn().mockResolvedValue({
        id: dto.carModelId,
        brandId: dto.brandId,
        isActive: true,
      }),
    },
    manufacturer: {
      findUnique: jest.fn().mockResolvedValue({
        id: dto.manufacturerId,
        isActive: true,
      }),
    },
    platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
    userMembership: { findUnique: jest.fn().mockResolvedValue(null) },
    product: {
      create: jest.fn().mockResolvedValue(createdProduct),
      findUnique: jest.fn().mockResolvedValue({
        ...createdProduct,
        productAttributes: [],
      }),
    },
  };
  const common = {
    linkProductAttributes: jest.fn().mockResolvedValue(undefined),
    formatProductResponse: jest.fn().mockImplementation((product) => product),
  };
  const commissionGuard = {
    assertListingRuleExists: jest.fn().mockResolvedValue(undefined),
  };
  const service = new ProductCreateService(
    prisma as any,
    { delPattern: jest.fn() } as any,
    {
      canCreateListing: jest.fn().mockResolvedValue({ allowed: true }),
      getUserLimits: jest.fn().mockResolvedValue({
        maxImages: 10,
        tierName: "Free",
        remainingTotalListings: 10,
      }),
    } as any,
    {} as any,
    { add: jest.fn() } as any,
    {
      isEnabled: false,
      assertTextClean: jest.fn().mockResolvedValue(undefined),
    } as any,
    common as any,
    { recomputeProductRanking: jest.fn().mockResolvedValue(undefined) } as any,
    { getActiveListingCount: jest.fn().mockResolvedValue(0) } as any,
    commissionGuard as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.carModel.findUnique.mockResolvedValue({
      id: dto.carModelId,
      brandId: dto.brandId,
      isActive: true,
    });
  });

  it("persists model code, color and boxed state with required references", async () => {
    await service.create(sellerId, dto);

    expect(commissionGuard.assertListingRuleExists).toHaveBeenCalledWith({
      sellerId,
      categoryId: dto.categoryId,
      amount: dto.price,
    });

    expect(prisma.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          brandId: dto.brandId,
          carModelId: dto.carModelId,
          manufacturerId: dto.manufacturerId,
          modelCode: "HKG72",
          color: "Kırmızı",
          isBoxed: true,
          // Boyut seçimi ürüne yazılır ve desi ondan TÜRETİLİR (orta → 5).
          shippingPackageTier: ShippingPackageTierCode.medium,
          shippingDesi: 5,
        }),
      }),
    );
    expect(common.linkProductAttributes).toHaveBeenCalledWith(
      "product-1",
      "1:64",
      undefined,
      "diecast",
      undefined,
    );
  });

  it("requires coverage for both the normal and discounted listing prices", async () => {
    await service.create(sellerId, {
      ...dto,
      originalPrice: 1000,
      salePrice: 800,
    });

    expect(commissionGuard.assertListingRuleExists).toHaveBeenNthCalledWith(1, {
      sellerId,
      categoryId: dto.categoryId,
      amount: 800,
    });
    expect(commissionGuard.assertListingRuleExists).toHaveBeenNthCalledWith(2, {
      sellerId,
      categoryId: dto.categoryId,
      amount: 1000,
    });
  });

  it("rejects a model that does not belong to the selected brand", async () => {
    prisma.carModel.findUnique.mockResolvedValueOnce({
      id: dto.carModelId,
      brandId: "another-brand",
      isActive: true,
    });

    await expect(service.create(sellerId, dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.product.create).not.toHaveBeenCalled();
  });
});
