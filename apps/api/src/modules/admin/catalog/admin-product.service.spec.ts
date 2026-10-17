import { AdminProductService } from "./admin-product.service";
import { computeProductContentFingerprint } from "../../product/helpers/product-content-fingerprint";

describe("AdminProductService list sorting", () => {
  let prisma: any;
  let service: AdminProductService;

  beforeEach(() => {
    prisma = {
      product: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    service = new AdminProductService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { assertListingRuleExists: jest.fn() } as any,
      {} as any, // productService — bu testler yazma yoluna girmiyor
      {} as any, // mediaService
      {} as any, // membershipService
    );
  });

  it("keeps createdAt desc as the default", async () => {
    await service.getProducts({});

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "desc" } }),
    );
  });

  it("sorts by scalar product fields", async () => {
    await service.getProducts({ sortBy: "price", sortOrder: "asc" });

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { price: "asc" } }),
    );
  });
});

describe("AdminProductService.approveProduct — onaylanan içeriğin izi", () => {
  const pending = {
    id: "p1",
    sellerId: "seller-1",
    categoryId: "cat-1",
    price: 100,
    status: "pending",
    title: "Hot Wheels Camaro",
    description: "Kutusunda",
    brandId: "brand-1",
    carModelId: null,
    manufacturerId: "man-1",
    modelCode: null,
    condition: "new",
    images: [{ cardKey: "c1", detailKey: "d1", sortOrder: 0 }],
  };

  const makeService = () => {
    const prisma = {
      product: {
        findUnique: jest.fn().mockResolvedValue(pending),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new AdminProductService(
      prisma as any,
      { createAuditLog: jest.fn() } as any, // audit
      {} as any,
      { syncProduct: jest.fn().mockResolvedValue(undefined) } as any, // search
      { del: jest.fn(), delPattern: jest.fn() } as any, // cache
      {
        createInAppNotification: jest.fn().mockResolvedValue(undefined),
        broadcastBackInStock: jest.fn().mockResolvedValue(undefined),
      } as any,
      {} as any,
      { assertListingRuleExists: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return { service, prisma };
  };

  it("onay yayına alır, publishedAt'i tazeler ve güncel içeriği onaylı olarak damgalar", async () => {
    const { service, prisma } = makeService();

    await service.approveProduct("admin-1", "p1", {} as any);

    const updates = prisma.product.update.mock.calls.map((c) => c[0]);
    expect(updates[0].data).toMatchObject({ status: "active" });
    expect(updates[0].data.publishedAt).toBeInstanceOf(Date);
    // Satıcı yenilemesinin "değişmedi" kararı bu izle karşılaştırılır.
    expect(updates[1]).toEqual({
      where: { id: "p1" },
      data: {
        approvedContentFingerprint: computeProductContentFingerprint(pending),
      },
    });
  });

  it("iz yazılamazsa onay bozulmaz (iz eksik kalır, yenileme normal onay kuralına düşer)", async () => {
    const { service, prisma } = makeService();
    prisma.product.update
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("db hiccup"));

    await expect(
      service.approveProduct("admin-1", "p1", {} as any),
    ).resolves.toMatchObject({ success: true, status: "active" });
  });
});
