import { AdminCatalogService } from "./admin-catalog.service";

describe("AdminCatalogService list sorting", () => {
  let prisma: any;
  let service: AdminCatalogService;

  beforeEach(() => {
    const model = () => ({
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    });
    prisma = {
      category: model(),
      brand: model(),
      manufacturer: model(),
      carModel: model(),
      attributeGroup: model(),
      attribute: model(),
    };
    service = new AdminCatalogService(prisma, {} as any, {} as any, {} as any);
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
});
