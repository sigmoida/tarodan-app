import { AdminProductService } from "./admin-product.service";

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
