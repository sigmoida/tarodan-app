import { ForbiddenException } from "@nestjs/common";
import { ProductStatus } from "@prisma/client";
import { ProductUpdateService } from "./product-update.service";

/**
 * İlan limiti yeniden satışa açarken de geçerli olmalı.
 *
 * Limit pending+active+reserved sayar; sold/inactive SAYILMAZ. Create yolu
 * limiti uygularken (canCreateListing) update yolu hiç sormuyordu: limitte/
 * limit üstünde bir satıcı pasif ilanını aktife çevirerek limiti sınırsız
 * aşabiliyordu. Kapı create ile AYNI kaynaktan gelir ve YALNIZ sayılmayan
 * statüden sayılan kümeye geçişte çalışır — zaten sayılan aktif ilanın normal
 * düzenlemesi yeniden denetlenmez.
 */
describe("ProductUpdateService — reaktivasyonda ilan limiti", () => {
  const sellerId = "seller-1";
  const productId = "product-1";

  const makeService = ({
    status,
    canCreate,
  }: {
    status: ProductStatus;
    canCreate: boolean;
  }) => {
    const product = {
      id: productId,
      sellerId,
      version: 3,
      price: 100,
      oldPrice: null,
      categoryId: "cat-1",
      brandId: "brand-1",
      carModelId: null,
      manufacturerId: "manufacturer-1",
      status,
      quantity: 2,
      reservedQuantity: 0,
      title: "Test ürün",
      description: "Açıklama",
      images: [],
    };

    const tx = {
      productImage: { deleteMany: jest.fn(), createMany: jest.fn() },
      product: {
        update: jest.fn().mockResolvedValue({
          ...product,
          images: [],
          productAttributes: [],
        }),
      },
    };

    const prisma = {
      product: {
        findUnique: jest.fn().mockResolvedValue(product),
        update: jest.fn().mockResolvedValue({ ...product }),
      },
      $transaction: jest.fn(async (fn: (client: unknown) => unknown) => fn(tx)),
      user: {
        findUnique: jest.fn().mockResolvedValue({
          isBanned: false,
          businessStatus: null,
          companyName: null,
          taxId: null,
          membership: null,
        }),
      },
    };

    const membershipService = {
      canCreateListing: jest
        .fn()
        .mockResolvedValue(
          canCreate
            ? { allowed: true }
            : { allowed: false, reason: "İlan limitinize ulaştınız." },
        ),
      getUserLimits: jest.fn().mockResolvedValue({
        tierName: "Ücretsiz",
        maxTotalListings: 10,
      }),
    };

    const commissionGuard = { assertListingRuleExists: jest.fn() };

    const service = new ProductUpdateService(
      prisma as any,
      { del: jest.fn(), delPattern: jest.fn() } as any, // cache
      { syncProduct: jest.fn().mockResolvedValue(undefined) } as any, // search
      {} as any, // notification
      {} as any, // smtp
      {
        formatProductResponse: jest.fn(async (p: unknown) => p),
      } as any, // common
      {
        recomputeProductRanking: jest.fn().mockResolvedValue(undefined),
      } as any, // ranking
      membershipService as any,
      commissionGuard as any,
      // moderationAi — düzenleme içerik kapıları (bu spec'in konusu değil)
      { assertTextClean: jest.fn(), isEnabled: false } as any,
    );

    return { service, prisma, tx, membershipService };
  };

  it("limitteki satıcının inactive→active isteği reddedilir (yazma olmaz)", async () => {
    const { service, prisma, membershipService } = makeService({
      status: ProductStatus.inactive,
      canCreate: false,
    });

    await expect(
      service.update(productId, sellerId, {
        status: ProductStatus.active,
      } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(membershipService.canCreateListing).toHaveBeenCalledWith(sellerId);
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it("limit altında reaktivasyon admin onayına (pending) gider", async () => {
    const { service, prisma } = makeService({
      status: ProductStatus.inactive,
      canCreate: true,
    });

    await service.update(productId, sellerId, {
      status: ProductStatus.active,
    } as any);

    expect(prisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: ProductStatus.pending }),
      }),
    );
  });

  it("sold→active de aynı kapıdan geçer (sold sayılmayan statüdür)", async () => {
    const { service, prisma, membershipService } = makeService({
      status: ProductStatus.sold,
      canCreate: false,
    });

    await expect(
      service.update(productId, sellerId, {
        status: ProductStatus.active,
        quantity: 1,
      } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(membershipService.canCreateListing).toHaveBeenCalledWith(sellerId);
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it("zaten aktif (sayılan) ilanın düzenlemesi limiti YENİDEN denetlemez", async () => {
    const { service, tx, membershipService } = makeService({
      status: ProductStatus.active,
      canCreate: false, // limit dolu olsa bile düzenleme engellenmemeli
    });

    await service.update(productId, sellerId, { isBoxed: true } as any);

    expect(membershipService.canCreateListing).not.toHaveBeenCalled();
    expect(tx.product.update).toHaveBeenCalled();
  });
});
