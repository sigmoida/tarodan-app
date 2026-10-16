import {
  inStockWhere,
  publicListingWhere,
} from "../../product/helpers/catalog-product-where";
import { AdminCatalogService } from "./admin-catalog.service";

type CatalogMocks = {
  prisma: any;
  cache: { del: jest.Mock; delPattern: jest.Mock };
  audit: { createAuditLog: jest.Mock };
  service: AdminCatalogService;
};

function buildCatalogService(): CatalogMocks {
  const model = () => ({
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  });
  const prisma = {
    category: model(),
    brand: model(),
    manufacturer: model(),
    carModel: model(),
    attributeGroup: model(),
    attribute: model(),
    commissionRuleSet: model(),
    product: { groupBy: jest.fn().mockResolvedValue([]) },
  };
  const cache = {
    del: jest.fn().mockResolvedValue(undefined),
    delPattern: jest.fn().mockResolvedValue(0),
  };
  const audit = { createAuditLog: jest.fn().mockResolvedValue(undefined) };
  const service = new AdminCatalogService(
    prisma as any,
    cache as any,
    audit as any,
    {} as any,
  );
  return { prisma, cache, audit, service };
}

describe("AdminCatalogService list sorting", () => {
  let prisma: any;
  let cache: { del: jest.Mock; delPattern: jest.Mock };
  let audit: { createAuditLog: jest.Mock };
  let service: AdminCatalogService;

  beforeEach(() => {
    ({ prisma, cache, audit, service } = buildCatalogService());
  });

  it("paginates categories with their existing default sort", async () => {
    prisma.category.count.mockResolvedValue(42);

    const result = await service.getCategories();

    expect(prisma.category.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { name: "asc" },
        skip: 0,
        take: 20,
      }),
    );
    expect(result.meta).toEqual({
      total: 42,
      page: 1,
      limit: 20,
      totalPages: 3,
    });
  });

  it("sorts categories by a scalar field", async () => {
    await service.getCategories({
      page: 2,
      limit: 10,
      sortBy: "sortOrder",
      sortOrder: "desc",
    });

    expect(prisma.category.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { sortOrder: "desc" },
        skip: 10,
        take: 10,
      }),
    );
  });

  it("maps displayed category count accessors to relation counts", async () => {
    await service.getCategories({
      sortBy: "productCount",
      sortOrder: "desc",
    });
    expect(prisma.category.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        orderBy: { products: { _count: "desc" } },
      }),
    );

    await service.getCategories({
      sortBy: "collectionCount",
      sortOrder: "asc",
    });
    expect(prisma.category.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        orderBy: { collections: { _count: "asc" } },
      }),
    );
  });

  it("keeps the brand status filter while applying scalar sorting", async () => {
    await service.getBrands({
      status: "active",
      sortBy: "createdAt",
      sortOrder: "desc",
    });

    expect(prisma.brand.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
      }),
    );
  });

  it("paginates manufacturers and preserves response mapping", async () => {
    prisma.manufacturer.findMany.mockResolvedValue([
      { id: "m1", name: "Maker", slug: "maker", logo: null },
    ]);
    prisma.manufacturer.count.mockResolvedValue(1);

    const result = await service.getManufacturers({
      sortBy: "name",
      sortOrder: "desc",
    });

    expect(prisma.manufacturer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { name: "desc" } }),
    );
    expect(result.data[0].logo).toBeNull();
    expect(result.meta.total).toBe(1);
  });

  it("keeps the compound car-model default and maps brand.name sorting", async () => {
    await service.getCarModels({});
    expect(prisma.carModel.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        orderBy: [{ brand: { name: "asc" } }, { name: "asc" }],
      }),
    );

    await service.getCarModels({
      sortBy: "brand.name",
      sortOrder: "desc",
    });
    expect(prisma.carModel.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ orderBy: { brand: { name: "desc" } } }),
    );
  });

  it("sorts attribute groups while preserving attributeCount mapping", async () => {
    prisma.attributeGroup.findMany.mockResolvedValue([
      { id: "g1", name: "Scale", _count: { attributes: 3 } },
    ]);

    const result = await service.getAttributeGroups({
      sortBy: "isActive",
      sortOrder: "desc",
    });

    expect(prisma.attributeGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { isActive: "desc" } }),
    );
    expect(result.data[0].attributeCount).toBe(3);
  });

  it("sorts attributes and preserves the compound default", async () => {
    await service.getAttributes({});
    expect(prisma.attribute.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        orderBy: [{ groupId: "asc" }, { sortOrder: "asc" }],
      }),
    );

    await service.getAttributes({ sortBy: "value", sortOrder: "asc" });
    expect(prisma.attribute.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ orderBy: { value: "asc" } }),
    );
  });

  it("invalidates the public category cache after creating a category", async () => {
    prisma.category.findUnique.mockResolvedValue(null);
    prisma.category.create.mockResolvedValue({
      id: "category-1",
      name: "Yeni kategori",
      slug: "yeni-kategori",
      isActive: false,
    });

    await service.createCategory("admin-1", { name: "Yeni kategori" });

    expect(cache.del).toHaveBeenCalledWith("categories:all");
  });

  it("rejects activation below an inactive ancestor", async () => {
    prisma.category.findUnique
      .mockResolvedValueOnce({
        id: "child",
        parentId: "parent",
        isActive: false,
        children: [],
      })
      .mockResolvedValueOnce({
        id: "parent",
        parentId: null,
        isActive: false,
      });

    await expect(
      service.updateCategory("admin-1", "child", { isActive: true }),
    ).rejects.toMatchObject({
      response: { i18nKey: "server.category.ancestorsMustBeActive" },
    });
    expect(prisma.category.update).not.toHaveBeenCalled();
    expect(cache.del).not.toHaveBeenCalled();
  });

  it("rejects deactivation while any active descendant remains", async () => {
    prisma.category.findUnique.mockResolvedValue({
      id: "root",
      parentId: null,
      isActive: true,
      children: [{ id: "child" }],
    });
    prisma.category.findMany.mockResolvedValue([
      { id: "root", parentId: null, isActive: true },
      { id: "child", parentId: "root", isActive: false },
      { id: "grandchild", parentId: "child", isActive: true },
    ]);

    await expect(
      service.updateCategory("admin-1", "root", { isActive: false }),
    ).rejects.toMatchObject({
      response: { i18nKey: "server.category.deactivateChildrenFirst" },
    });
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it("invalidates the public category cache after updating a category", async () => {
    prisma.category.findUnique.mockResolvedValue({
      id: "category-1",
      name: "Eski ad",
      slug: "eski-ad",
      parentId: null,
      isActive: false,
      children: [],
    });
    prisma.category.update.mockResolvedValue({
      id: "category-1",
      name: "Yeni ad",
      slug: "yeni-ad",
      isActive: false,
    });

    await service.updateCategory("admin-1", "category-1", {
      name: "Yeni ad",
    });

    expect(cache.del).toHaveBeenCalledWith("categories:all");
  });

  it("invalidates the public category cache after deleting a category", async () => {
    const category = {
      id: "category-1",
      children: [],
      _count: { products: 0 },
    };
    prisma.category.findUnique.mockResolvedValue(category);
    prisma.category.delete.mockResolvedValue(category);

    await service.deleteCategory("admin-1", "category-1");

    expect(cache.del).toHaveBeenCalledWith("categories:all");
  });
});

describe("AdminCatalogService brand/manufacturer listing counts", () => {
  let prisma: any;
  let service: AdminCatalogService;

  beforeEach(() => {
    ({ prisma, service } = buildCatalogService());
  });

  const brandRow = (id: string, name: string) => ({
    id,
    name,
    slug: name.toLowerCase(),
    logo: null,
    isActive: true,
  });

  it("counts only the page rows with the public rule (active + in-stock + sale-capable seller)", async () => {
    prisma.brand.findMany.mockResolvedValue([brandRow("b1", "Bruder")]);
    await service.getBrands({});
    const args = prisma.product.groupBy.mock.calls[0][0];
    expect(args.by).toEqual(["brandId"]);
    expect(args.where).toEqual(
      expect.objectContaining({
        ...publicListingWhere(),
        seller: expect.anything(),
        brandId: { in: ["b1"] },
      }),
    );
    expect(args.where.AND).toEqual([inStockWhere()]);
    expect(args.where.status).toBe("active");

    prisma.manufacturer.findMany.mockResolvedValue([
      { id: "m1", name: "M", slug: "m", logo: null },
    ]);
    await service.getManufacturers({});
    expect(prisma.product.groupBy.mock.calls[1][0].by).toEqual([
      "manufacturerId",
    ]);
    expect(
      prisma.product.groupBy.mock.calls[1][0].where.manufacturerId,
    ).toEqual({ in: ["m1"] });
  });

  it("skips the count query when the page is empty", async () => {
    prisma.brand.findMany.mockResolvedValue([]);
    const result = await service.getBrands({});
    expect(prisma.product.groupBy).not.toHaveBeenCalled();
    expect(result.data).toEqual([]);
  });

  it("adds listingCount to every brand row (0 when none)", async () => {
    prisma.brand.findMany.mockResolvedValue([
      brandRow("b1", "Bruder"),
      brandRow("b2", "Siku"),
    ]);
    prisma.product.groupBy.mockResolvedValue([
      { brandId: "b1", _count: { _all: 7 } },
    ]);
    const result = await service.getBrands({});
    expect(result.data.map((b) => b.listingCount)).toEqual([7, 0]);
  });

  it("filters brands with hasListings=true / false by a relation filter", async () => {
    await service.getBrands({ hasListings: true });
    expect(prisma.brand.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { products: { some: publicListingWhere() } },
      }),
    );
    await service.getBrands({ status: "active", hasListings: false });
    expect(prisma.brand.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { isActive: true, products: { none: publicListingWhere() } },
      }),
    );
  });

  it("sorts brands by listingCount using the public count, not Prisma _count", async () => {
    prisma.brand.findMany.mockResolvedValue([
      brandRow("b1", "A"),
      brandRow("b2", "B"),
      brandRow("b3", "C"),
    ]);
    prisma.brand.count.mockResolvedValue(3);
    prisma.product.groupBy.mockResolvedValue([
      { brandId: "b1", _count: { _all: 2 } },
      { brandId: "b3", _count: { _all: 9 } },
    ]);

    const desc = await service.getBrands({
      sortBy: "listingCount",
      sortOrder: "desc",
      limit: 2,
    });
    expect(desc.data.map((b) => b.id)).toEqual(["b3", "b1"]);
    expect(desc.meta).toEqual({ total: 3, page: 1, limit: 2, totalPages: 2 });

    const asc = await service.getBrands({
      sortBy: "listingCount",
      sortOrder: "asc",
    });
    expect(asc.data.map((b) => b.id)).toEqual(["b2", "b1", "b3"]);
  });

  it("filters manufacturers by status and listing presence and adds listingCount", async () => {
    prisma.manufacturer.findMany.mockResolvedValue([
      { id: "m1", name: "Maker", slug: "maker", logo: null },
    ]);
    prisma.product.groupBy.mockResolvedValue([
      { manufacturerId: "m1", _count: { _all: 4 } },
    ]);
    const result = await service.getManufacturers({
      status: "inactive",
      hasListings: true,
    });
    expect(prisma.manufacturer.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          isActive: false,
          products: { some: publicListingWhere() },
        },
      }),
    );
    expect(result.data[0].listingCount).toBe(4);
  });

  it("sorts manufacturers by listingCount", async () => {
    prisma.manufacturer.findMany.mockResolvedValue([
      { id: "m1", name: "A", slug: "a", logo: null },
      { id: "m2", name: "B", slug: "b", logo: null },
    ]);
    prisma.product.groupBy.mockResolvedValue([
      { manufacturerId: "m2", _count: { _all: 5 } },
    ]);
    const result = await service.getManufacturers({
      sortBy: "listingCount",
      sortOrder: "desc",
    });
    expect(result.data.map((m) => m.id)).toEqual(["m2", "m1"]);
  });
});

describe("AdminCatalogService slug üretimi ve marka cache'i", () => {
  let prisma: any;
  let cache: { del: jest.Mock; delPattern: jest.Mock };
  let service: AdminCatalogService;

  beforeEach(() => {
    ({ prisma, cache, service } = buildCatalogService());
  });

  it("marka slug'ında Türkçe harfleri çevirir, silmez", async () => {
    // Eski inline zincir `[^a-z0-9\s-]` kullandığı için "Öz Çelik" → "z-elik".
    prisma.brand.findFirst.mockResolvedValue(null);
    prisma.brand.create.mockImplementation(({ data }: any) => ({
      id: "brand-1",
      ...data,
    }));

    await service.createBrand("admin-1", { name: "Öz Çelik" });

    expect(prisma.brand.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ slug: "oz-celik" }),
      }),
    );
  });

  it("üretici slug'ında Türkçe harfleri çevirir", async () => {
    prisma.manufacturer.findFirst.mockResolvedValue(null);
    prisma.manufacturer.create.mockImplementation(({ data }: any) => ({
      id: "man-1",
      ...data,
    }));

    await service.createManufacturer("admin-1", { name: "Şahin Döküm" });

    expect(prisma.manufacturer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ slug: "sahin-dokum" }),
      }),
    );
  });

  it("araç modeli slug'ını marka slug'ı ile önekler", async () => {
    prisma.brand.findUnique.mockResolvedValue({ id: "b1", slug: "tofas" });
    prisma.carModel.findFirst.mockResolvedValue(null);
    prisma.carModel.create.mockImplementation(({ data }: any) => ({
      id: "cm-1",
      ...data,
    }));

    await service.createCarModel("admin-1", { brandId: "b1", name: "Şahin" });

    expect(prisma.carModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ slug: "tofas-sahin" }),
      }),
    );
  });

  it("marka oluşturunca mağaza cache'ini temizler", async () => {
    // Temizlik olmadan `brands:all` 1 saat, `brands:slug:*` 30 dk bayat kalır.
    prisma.brand.findFirst.mockResolvedValue(null);
    prisma.brand.create.mockResolvedValue({ id: "b1", name: "Ford" });

    await service.createBrand("admin-1", { name: "Ford" });

    expect(cache.delPattern).toHaveBeenCalledWith("brands:*");
  });

  it("marka güncelleyince mağaza cache'ini temizler", async () => {
    prisma.brand.findUnique.mockResolvedValue({
      id: "b1",
      name: "Ford",
      slug: "ford",
    });
    prisma.brand.findFirst.mockResolvedValue(null);
    prisma.brand.update.mockResolvedValue({ id: "b1", name: "Ford Motor" });

    await service.updateBrand("admin-1", "b1", { name: "Ford Motor" });

    expect(cache.delPattern).toHaveBeenCalledWith("brands:*");
  });

  it("marka silinince mağaza cache'ini temizler", async () => {
    prisma.brand.findUnique.mockResolvedValue({
      id: "b1",
      name: "Ford",
      _count: { products: 0, carModels: 0 },
    });
    prisma.brand.delete.mockResolvedValue({ id: "b1" });

    await service.deleteBrand("admin-1", "b1");

    expect(cache.delPattern).toHaveBeenCalledWith("brands:*");
  });

  it("ilişkili kayıt varken markayı silmez ve cache'e dokunmaz", async () => {
    prisma.brand.findUnique.mockResolvedValue({
      id: "b1",
      name: "Ford",
      _count: { products: 3, carModels: 0 },
    });

    await expect(service.deleteBrand("admin-1", "b1")).rejects.toMatchObject({
      response: {
        i18nKey: "server.admin.catalog.brandInUse",
        i18nParams: { products: 3, models: 0 },
      },
    });
    expect(prisma.brand.delete).not.toHaveBeenCalled();
    expect(cache.delPattern).not.toHaveBeenCalled();
  });
});
