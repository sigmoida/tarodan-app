import { ProductQueryService } from "./product-query.service";

describe("ProductQueryService — hidden sellers (user blocks)", () => {
  const build = (hidden: string[]) => {
    const cache = {
      getOrSet: jest.fn((_key: string, factory: () => Promise<unknown>) =>
        factory(),
      ),
    };
    const userBlocks = {
      getHiddenUserIds: jest.fn().mockResolvedValue(hidden),
      isBlockedEither: jest.fn(),
    };
    const service = new ProductQueryService(
      { product: { count: jest.fn().mockResolvedValue(0) } } as any,
      cache as any,
      { isAvailable: () => false } as any,
      {} as any,
      {} as any,
      userBlocks as any,
    );
    const pg = jest
      .spyOn(service as any, "findAllViaPostgres")
      .mockResolvedValue({ data: [], meta: {} });
    return { service, cache, userBlocks, pg };
  };

  it("keeps the shared cache key for viewers with nothing hidden", async () => {
    const { service, cache, pg } = build([]);
    await service.findAll({ page: 1, limit: 20 } as any, "viewer");
    expect(cache.getOrSet.mock.calls[0][0]).not.toContain("hidden");
    expect(pg).toHaveBeenCalledWith(expect.anything(), []);
  });

  it("keys the list cache by hidden sellers and threads them into the query", async () => {
    const { service, cache, pg } = build(["s9", "s2"]);
    await service.findAll({ page: 1, limit: 20 } as any, "viewer");
    // Liste anahtara ham değil, kısa hash olarak girer (1000 id'lik anahtar yok).
    expect(cache.getOrSet.mock.calls[0][0]).toMatch(/"hidden":"[0-9a-f]{16}"/);
    expect(pg).toHaveBeenCalledWith(expect.anything(), ["s9", "s2"]);
  });

  it("findOne treats a hidden seller's listing as not found", async () => {
    const { service, userBlocks } = build(["s9"]);
    await expect(service.findOne("p1", "viewer")).rejects.toMatchObject({
      status: 404,
    });
    expect(userBlocks.getHiddenUserIds).toHaveBeenCalledWith("viewer");
  });
});
