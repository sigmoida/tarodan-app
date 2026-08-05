import { AdminCatalogService } from "./admin-catalog.service";

describe("AdminCatalogService list sorting", () => {
  let prisma: any;
  let cache: { del: jest.Mock };
  let audit: { createAuditLog: jest.Mock };
  let service: AdminCatalogService;

  beforeEach(() => {
    const model = () => ({
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    });
    prisma = {
      category: model(),
      brand: model(),
      manufacturer: model(),
      carModel: model(),
      attributeGroup: model(),
      attribute: model(),
      commissionRuleSet: model(),
    };
    cache = { del: jest.fn().mockResolvedValue(undefined) };
    audit = { createAuditLog: jest.fn().mockResolvedValue(undefined) };
    service = new AdminCatalogService(
      prisma,
      cache as any,
      audit as any,
      {} as any,
    );
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
    ).rejects.toThrow("tüm üst kategoriler aktif olmalıdır");
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
    ).rejects.toThrow("önce aktif alt kategorileri pasife alınmalıdır");
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
