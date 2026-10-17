import { CollectionCommonService } from "./collection-common.service";

describe("CollectionCommonService.mapItemToDto — sellerId", () => {
  const storage = {
    getPublicAssetUrl: jest.fn((key: string) => `https://cdn.test/${key}`),
  };
  const service = new CollectionCommonService(storage as any);

  const productItem = (overrides: Record<string, unknown> = {}) => ({
    id: "item-1",
    productId: "p1",
    sortOrder: 1,
    isFeatured: false,
    addedAt: new Date("2026-01-01T00:00:00Z"),
    product: {
      id: "p1",
      sellerId: "seller-1",
      title: "Model",
      price: "100.50",
      status: "active",
      images: [{ cardKey: "k1" }],
      ...overrides,
    },
  });

  it("ürünü olan öğede satıcıyı döner (istemci kendi ilanında kalbi gizler)", async () => {
    const dto = await service.mapItemToDto(productItem());
    expect(dto.sellerId).toBe("seller-1");
    expect(dto.productId).toBe("p1");
    expect(dto.productPrice).toBe(100.5);
  });

  it("satıcı alanı yoksa null (undefined sızmaz)", async () => {
    const dto = await service.mapItemToDto(
      productItem({ sellerId: undefined }),
    );
    expect(dto.sellerId).toBeNull();
  });

  it("özel (ürünsüz) öğede null", async () => {
    const dto = await service.mapItemToDto({
      id: "item-2",
      productId: null,
      customTitle: "Benim modelim",
    });
    expect(dto.isCustom).toBe(true);
    expect(dto.sellerId).toBeNull();
  });

  it("ürünü silinmiş öğede null", async () => {
    const dto = await service.mapItemToDto({
      id: "item-3",
      productId: "gone",
      product: null,
    });
    expect(dto.sellerId).toBeNull();
  });

  it("koleksiyon eşlemesi her öğeye satıcıyı taşır", async () => {
    const dto = await service.mapCollectionToDto({
      id: "c1",
      userId: "owner",
      user: { id: "owner" },
      name: "Koleksiyon",
      slug: "koleksiyon",
      isPublic: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [
        {
          ...productItem(),
          product: { ...productItem().product, kind: "listing" },
        },
      ],
    });
    expect(dto.items?.[0].sellerId).toBe("seller-1");
  });
});
