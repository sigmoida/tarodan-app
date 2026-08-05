import { ProductQueryService } from "./product-query.service";

describe("ProductQueryService Elasticsearch visibility", () => {
  it("revalidates Elasticsearch ids with the canonical database visibility filter", async () => {
    const prisma = {
      product: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const search = {
      searchProductIds: jest.fn().mockResolvedValue({
        ids: ["stale-pending-product"],
        total: 1,
      }),
    };
    const service = new ProductQueryService(
      prisma as never,
      {} as never,
      search as never,
      {} as never,
      {} as never,
    );

    await (service as any).findAllViaElasticsearch({
      search: "flagged product",
      page: 1,
      limit: 20,
    });

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            expect.objectContaining({
              kind: "listing",
              AND: expect.arrayContaining([
                expect.objectContaining({ OR: expect.any(Array) }),
              ]),
            }),
            { id: { in: ["stale-pending-product"] } },
          ],
        },
      }),
    );
  });
});
