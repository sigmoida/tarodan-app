import { AdminCatalogService } from "./admin-catalog.service";

/**
 * #101 faz-2: optional server pagination for categories / brands / manufacturers.
 * Verifies the backward-compat contract that keeps dropdown consumers working
 * (omit page AND limit → full list, no count/meta) and the paginated path
 * (page/limit → skip/take + meta), plus search and the brands status filter.
 */
describe("AdminCatalogService — #101 faz-2 optional pagination", () => {
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
    };
    // Only prisma + the pure resolveProductImageUrl helper are exercised here.
    service = new AdminCatalogService(prisma, {} as any, {} as any, {} as any);
  });

  describe("getCategories", () => {
    it("no page/limit → full list (no skip/take, no count, no meta)", async () => {
      const res = await service.getCategories();
      expect(prisma.category.count).not.toHaveBeenCalled();
      const args = prisma.category.findMany.mock.calls[0][0];
      expect(args.skip).toBeUndefined();
      expect(args.take).toBeUndefined();
      expect(res).not.toHaveProperty("meta");
    });

    it("page/limit → skip/take + meta with totalPages", async () => {
      prisma.category.count.mockResolvedValue(42);
      const res: any = await service.getCategories({ page: 2, limit: 20 });
      const args = prisma.category.findMany.mock.calls[0][0];
      expect(args.skip).toBe(20);
      expect(args.take).toBe(20);
      expect(res.meta).toEqual({
        total: 42,
        page: 2,
        limit: 20,
        totalPages: 3,
      });
    });

    it("search → case-insensitive OR over name/slug/description", async () => {
      await service.getCategories({ page: 1, limit: 10, search: "bmw" });
      const where = prisma.category.findMany.mock.calls[0][0].where;
      expect(where.OR).toEqual([
        { name: { contains: "bmw", mode: "insensitive" } },
        { slug: { contains: "bmw", mode: "insensitive" } },
        { description: { contains: "bmw", mode: "insensitive" } },
      ]);
    });
  });

  describe("getBrands", () => {
    it("status=active → where.isActive true", async () => {
      await service.getBrands({ page: 1, limit: 10, status: "active" });
      expect(prisma.brand.findMany.mock.calls[0][0].where.isActive).toBe(true);
    });

    it("status=inactive → where.isActive false", async () => {
      await service.getBrands({ page: 1, limit: 10, status: "inactive" });
      expect(prisma.brand.findMany.mock.calls[0][0].where.isActive).toBe(false);
    });

    it("status=all → no isActive filter (full-list dropdown safe)", async () => {
      await service.getBrands({ page: 1, limit: 10, status: "all" });
      expect(
        prisma.brand.findMany.mock.calls[0][0].where.isActive,
      ).toBeUndefined();
    });

    it("no params → full list (no count, no meta)", async () => {
      const res = await service.getBrands();
      expect(prisma.brand.count).not.toHaveBeenCalled();
      expect(res).not.toHaveProperty("meta");
    });
  });

  describe("getManufacturers", () => {
    it("paginates and resolves logo", async () => {
      prisma.manufacturer.findMany.mockResolvedValue([
        { id: "m1", name: "X", slug: "x", logo: null },
      ]);
      prisma.manufacturer.count.mockResolvedValue(1);
      const res: any = await service.getManufacturers({ page: 1, limit: 10 });
      expect(res.data[0].logo).toBeNull();
      expect(res.meta.total).toBe(1);
    });

    it("no params → full list (no count, no meta)", async () => {
      const res = await service.getManufacturers();
      expect(prisma.manufacturer.count).not.toHaveBeenCalled();
      expect(res).not.toHaveProperty("meta");
    });
  });
});
