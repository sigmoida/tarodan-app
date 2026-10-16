import { publicListingWhere } from "../product/helpers/catalog-product-where";
import { ManufacturerService } from "./manufacturer.service";

describe("ManufacturerService.findAll", () => {
  const build = () => {
    const prisma = {
      manufacturer: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const storage = { getPublicAssetUrl: jest.fn() };
    const service = new ManufacturerService(prisma as any, storage as any);
    return { prisma, service };
  };

  beforeAll(() => {
    jest.useFakeTimers({ now: new Date("2026-10-14T10:00:00Z") });
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it("varsayılan: tüm aktif üreticiler (ilan filtresi yok)", async () => {
    const { prisma, service } = build();

    await service.findAll();

    const args = prisma.manufacturer.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ isActive: true });
  });

  it("hasListings=false davranışı değiştirmez", async () => {
    const { prisma, service } = build();

    await service.findAll({ hasListings: false });

    expect(prisma.manufacturer.findMany.mock.calls[0][0].where).toEqual({
      isActive: true,
    });
  });

  it("hasListings=true: sayaçla AYNI aktif ilan predikatıyla süzer", async () => {
    const { prisma, service } = build();

    await service.findAll({ hasListings: true });

    const args = prisma.manufacturer.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      isActive: true,
      products: { some: publicListingWhere() },
    });
    expect(args.select._count.select.products.where).toEqual(
      publicListingWhere(),
    );
  });
});
