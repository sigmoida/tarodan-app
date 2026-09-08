import { accountLaneServiceStub } from "../../account-lane/account-lane.testing";
import { ProductQueryService } from "./product-query.service";

/**
 * Test şeridi viewer'ı: ES yalnız canlı ilanları indeksler, bu yüzden test
 * hesabı arama yapsa bile Postgres yoluna düşer ve `lane: "test"` ile
 * yalnız test satıcılarını görür. Canlı viewer'ın anahtarıyla cache paylaşmaz.
 */
describe("ProductQueryService — test lane", () => {
  const build = () => {
    const cache = {
      getOrSet: jest.fn((_key: string, factory: () => Promise<unknown>) =>
        factory(),
      ),
    };
    const es = jest.fn();
    const service = new ProductQueryService(
      { product: { count: jest.fn().mockResolvedValue(0) } } as any,
      cache as any,
      { isAvailable: () => true } as any,
      {} as any,
      {} as any,
      { getHiddenUserIds: jest.fn().mockResolvedValue([]) } as any,
      accountLaneServiceStub({ tester: "test" }) as any,
    );
    jest
      .spyOn(service as any, "findAllViaElasticsearch")
      .mockImplementation(es);
    const pg = jest
      .spyOn(service as any, "findAllViaPostgres")
      .mockResolvedValue({ data: [], meta: {} });
    return { service, cache, pg, es };
  };

  it("routes a test viewer's search to Postgres with the test lane", async () => {
    const { service, pg, es } = build();
    await service.findAll(
      { search: "porsche", page: 1, limit: 20 } as any,
      "tester",
    );
    expect(es).not.toHaveBeenCalled();
    expect(pg).toHaveBeenCalledWith(expect.anything(), [], "test");
  });

  it("keeps live viewers on Elasticsearch for searches", async () => {
    const { service, pg, es } = build();
    es.mockResolvedValue({ data: [], meta: {} });
    await service.findAll(
      { search: "porsche", page: 1, limit: 20 } as any,
      "viewer",
    );
    expect(es).toHaveBeenCalled();
    expect(pg).not.toHaveBeenCalled();
  });

  it("separates cache keys per lane", async () => {
    const { service, cache } = build();
    await service.findAll({ page: 1, limit: 20 } as any, "tester");
    await service.findAll({ page: 1, limit: 20 } as any, "viewer");
    const [k1, k2] = cache.getOrSet.mock.calls.map((c) => c[0] as string);
    expect(k1).toContain('"lane":"test"');
    expect(k2).toContain('"lane":"live"');
    expect(k1).not.toBe(k2);
  });

  it("hides a test seller's listing detail from live viewers (404)", async () => {
    const { service } = build();
    await expect(service.findOne("p1", "viewer")).rejects.toMatchObject({
      status: 404,
    });
  });
});
