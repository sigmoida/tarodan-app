import { ProductUpdateService } from "./product-update.service";

/**
 * Düzenlemede nitelik sıfırlaması.
 *
 * Regresyon: `attributes` payload'ı geldiğinde yalnız üreticiye bağlı grupların
 * bağları siliniyordu. Genel özel bir grubun (Nadirlik gibi) seçimi geri
 * alınamıyor, eski bağlar birikiyordu. Artık `attributes` sahibi olduğu tüm
 * özel grupları (sabit üçlü ve gizli dışı) ilişki filtresiyle sıfırlar; ölçek/
 * malzeme/renk yalnız kendi alanı gelince temizlenir.
 */
describe("ProductUpdateService — nitelik sıfırlaması", () => {
  const sellerId = "seller-1";
  const productId = "product-1";

  const makeService = () => {
    const updatedRow = {
      id: productId,
      sellerId,
      images: [],
      productAttributes: [],
    };
    const tx = {
      productImage: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      product: { update: jest.fn().mockResolvedValue(updatedRow) },
    };
    const prisma = {
      product: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: productId,
            sellerId,
            version: 1,
            price: 100,
            oldPrice: null,
            categoryId: "cat-1",
            brandId: "brand-1",
            carModelId: null,
            manufacturerId: "manufacturer-1",
            status: "active",
            quantity: 1,
            reservedQuantity: 0,
            images: [],
          })
          .mockResolvedValue(updatedRow),
      },
      $transaction: jest.fn(async (fn: (client: unknown) => unknown) => fn(tx)),
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ isBanned: false, bannedUntil: null }),
      },
      brand: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: "brand-1", isActive: true }),
      },
      manufacturer: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: "manufacturer-1", isActive: true }),
      },
      attribute: { findMany: jest.fn() },
      productAttribute: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      productImage: { deleteMany: jest.fn(), createMany: jest.fn() },
    };
    const common = {
      formatProductResponse: jest.fn().mockResolvedValue({}),
      resolveProductAttributes: jest
        .fn()
        .mockResolvedValue({ ids: ["attr-nadir"], colorLabels: [] }),
      attachProductAttributes: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ProductUpdateService(
      prisma as any,
      { del: jest.fn(), delPattern: jest.fn() } as any,
      { syncProduct: jest.fn().mockResolvedValue(undefined) } as any,
      {} as any,
      {} as any,
      common as any,
      {
        recomputeProductRanking: jest.fn().mockResolvedValue(undefined),
      } as any,
      {
        getUserLimits: jest
          .fn()
          .mockResolvedValue({ maxImages: 3, tierName: "Ücretsiz" }),
      } as any,
      { assertListingRuleExists: jest.fn() } as any,
      { assertTextClean: jest.fn(), isEnabled: false } as any,
    );
    return { service, prisma, common };
  };

  it("`attributes` gelince tüm özel grup bağlarını ilişki filtresiyle siler", async () => {
    const { service, prisma, common } = makeService();

    await service.update(productId, sellerId, { attributes: ["nadir"] } as any);

    expect(prisma.productAttribute.deleteMany).toHaveBeenCalledWith({
      where: {
        productId,
        attribute: {
          group: {
            slug: {
              notIn: expect.arrayContaining([
                "scale",
                "material",
                "color",
                "vehicle_type",
              ]),
            },
          },
        },
      },
    });
    // Attribute id'leri belleğe çekilmez.
    expect(prisma.attribute.findMany).not.toHaveBeenCalled();
    expect(common.attachProductAttributes).toHaveBeenCalledWith(productId, [
      "attr-nadir",
    ]);
  });

  it("`attributes` gelince zorunlu genel gruplar denetlenir, gelmeyince denetlenmez", async () => {
    const { service, common } = makeService();

    await service.update(productId, sellerId, { attributes: [] } as any);
    expect(common.resolveProductAttributes).toHaveBeenLastCalledWith(
      expect.objectContaining({ attributeSlugs: [] }),
      { enforceRequiredGroups: true },
    );

    await service.update(productId, sellerId, { scale: "1:64" } as any);
    expect(common.resolveProductAttributes).toHaveBeenLastCalledWith(
      expect.objectContaining({ scale: "1:64" }),
      { enforceRequiredGroups: false },
    );
  });

  it("yalnız ölçek gelince özel gruplara dokunmaz, ölçek grubunu sıfırlar", async () => {
    const { service, prisma } = makeService();

    await service.update(productId, sellerId, { scale: "1:64" } as any);

    expect(prisma.productAttribute.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.productAttribute.deleteMany).toHaveBeenCalledWith({
      where: {
        productId,
        attribute: { group: { slug: { in: ["scale"] } } },
      },
    });
  });

  it("yalnız özel grup değişince de yanıt yeniden okunur", async () => {
    const { service, prisma } = makeService();

    await service.update(productId, sellerId, { attributes: ["nadir"] } as any);

    // İlki ön okuma, ikincisi bağlama sonrası taze `attributes[]` için.
    expect(prisma.product.findUnique).toHaveBeenCalledTimes(2);
  });

  it("nitelik alanı gelmeyen bir PATCH hiçbir bağa dokunmaz", async () => {
    const { service, prisma, common } = makeService();

    await service.update(productId, sellerId, { title: "Yeni başlık" } as any);

    expect(common.resolveProductAttributes).not.toHaveBeenCalled();
    expect(prisma.productAttribute.deleteMany).not.toHaveBeenCalled();
    expect(prisma.product.findUnique).toHaveBeenCalledTimes(1);
  });
});
