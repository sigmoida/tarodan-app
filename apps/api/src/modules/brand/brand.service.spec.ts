import { publicListingWhere } from "../product/helpers/catalog-product-where";
import {
  BRANDS_ALL_CACHE_KEY,
  BRANDS_CACHE_PATTERN,
  BRANDS_WITH_LISTINGS_CACHE_KEY,
} from "./brand-cache";
import { BrandService } from "./brand.service";

describe("BrandService.findAll", () => {
  const build = () => {
    const prisma = {
      brand: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const cache = {
      getOrSet: jest.fn((_key: string, factory: () => Promise<unknown>) =>
        factory(),
      ),
    };
    const storage = { getPublicAssetUrl: jest.fn() };
    const service = new BrandService(
      prisma as any,
      cache as any,
      storage as any,
    );
    return { prisma, cache, service };
  };

  beforeAll(() => {
    jest.useFakeTimers({ now: new Date("2026-10-14T10:00:00Z") });
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it("varsayılan: tüm aktif markalar, mevcut cache anahtarı", async () => {
    const { prisma, cache, service } = build();

    await service.findAll();

    expect(cache.getOrSet.mock.calls[0][0]).toBe(BRANDS_ALL_CACHE_KEY);
    expect(prisma.brand.findMany.mock.calls[0][0].where).toEqual({
      isActive: true,
    });
  });

  it("hasListings=true: aktif ilan predikatıyla süzer, ayrı cache anahtarı", async () => {
    const { prisma, cache, service } = build();
    prisma.brand.findMany.mockResolvedValue([
      {
        id: "b1",
        name: "Ferrari",
        slug: "ferrari",
        logo: null,
        description: null,
        country: "IT",
        foundedYear: 1939,
        _count: { products: 3 },
      },
    ]);

    const result = await service.findAll({ hasListings: true });

    expect(cache.getOrSet.mock.calls[0][0]).toBe(
      BRANDS_WITH_LISTINGS_CACHE_KEY,
    );
    const args = prisma.brand.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      isActive: true,
      products: { some: publicListingWhere() },
    });
    expect(args.include._count.select.products.where).toEqual(
      publicListingWhere(),
    );
    expect(result).toEqual([
      expect.objectContaining({ id: "b1", productCount: 3 }),
    ]);
  });

  it("filtreli anahtar admin temizliğinin deseni altında kalır", () => {
    const prefix = BRANDS_CACHE_PATTERN.replace(/\*$/, "");
    expect(BRANDS_WITH_LISTINGS_CACHE_KEY.startsWith(prefix)).toBe(true);
  });
});
