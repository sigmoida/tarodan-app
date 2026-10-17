import { BrandService } from "../../brand/brand.service";
import { CategoryService } from "../../category/category.service";
import { ManufacturerService } from "../../manufacturer/manufacturer.service";
import { publicListingWhere } from "./catalog-product-where";

/**
 * Marka / üretici / kategori public `_count.products` sayımı, listenin
 * (`status=active`) gördüğü kümeyle AYNI tek kuraldan (`publicListingWhere`)
 * beslenir — "N ilan" yazıp boş liste çıkmasın (stok koşulu dahil).
 */
describe("public catalog counts use publicListingWhere", () => {
  const expectedWhere = () =>
    expect.objectContaining({
      kind: "listing",
      status: "active",
      AND: [{ OR: [{ quantity: { gt: 0 } }, { quantity: null }] }],
    });
  const countWhere = (call: any) =>
    call.select?._count?.select?.products?.where ??
    call.include?._count?.select?.products?.where;

  const cache = {
    getOrSet: jest.fn(async (_k: string, factory: () => Promise<unknown>) =>
      factory(),
    ),
    del: jest.fn(),
  };

  it("rule itself matches the helper", () => {
    expect(publicListingWhere()).toEqual(expectedWhere());
  });

  it("brands: list and slug lookups", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const findUnique = jest.fn().mockResolvedValue({
      id: "b",
      name: "B",
      slug: "b",
      logo: null,
      _count: { products: 0 },
    });
    const service = new BrandService(
      { brand: { findMany, findUnique } } as any,
      cache as any,
      { getPublicAssetUrl: jest.fn() } as any,
    );
    await service.findAll();
    await service.findBySlug("b");
    expect(countWhere(findMany.mock.calls[0][0])).toEqual(expectedWhere());
    expect(countWhere(findUnique.mock.calls[0][0])).toEqual(expectedWhere());
  });

  it("manufacturers: list and slug lookups", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const findUnique = jest.fn().mockResolvedValue({
      id: "m",
      name: "M",
      slug: "m",
      logo: null,
      _count: { products: 0 },
    });
    const service = new ManufacturerService(
      { manufacturer: { findMany, findUnique } } as any,
      { getPublicAssetUrl: jest.fn() } as any,
    );
    await service.findAll();
    await service.findBySlug("m");
    expect(countWhere(findMany.mock.calls[0][0])).toEqual(expectedWhere());
    expect(countWhere(findUnique.mock.calls[0][0])).toEqual(expectedWhere());
  });

  it("categories: list", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new CategoryService(
      { category: { findMany } } as any,
      cache as any,
    );
    await service.findAll();
    expect(countWhere(findMany.mock.calls[0][0])).toEqual(expectedWhere());
  });
});
