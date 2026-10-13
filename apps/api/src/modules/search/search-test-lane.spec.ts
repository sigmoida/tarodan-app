import { SearchProductService } from "./query/search-product.service";
import { SearchAutocompleteService } from "./query/search-autocomplete.service";
import { SearchCollectionService } from "./query/search-collection.service";

/**
 * ES indeksi YALNIZ canlı ilanları taşır (indexableProductWhere → canlı satıcı).
 * Bu yüzden test şeridi viewer'ı ES'e hiç gitmemeli: aksi hâlde arama canlı
 * ilanları gösterir, sepete atınca 403 gelir — App Review için ret sebebi.
 */
describe("search — test lane", () => {
  const prismaStub = () => ({
    product: {
      findMany: jest.fn(async (_args: any): Promise<any[]> => []),
      count: jest.fn(async (_args: any) => 0),
    },
    $queryRawUnsafe: jest.fn(async () => [{ id: "p1" }]),
  });

  describe("SearchProductService.searchProducts", () => {
    const build = () => {
      const esSearch = jest.fn(async () => ({ hits: { hits: [], total: 0 } }));
      const common = {
        isAvailable: () => true,
        client: { search: esSearch },
        productsIndex: "products",
      };
      const prisma = prismaStub();
      const service = new SearchProductService(
        prisma as never,
        { getPublicAssetUrl: () => undefined } as never,
        common as never,
      );
      return { service, esSearch, prisma };
    };

    it("never touches Elasticsearch for a test-lane viewer", async () => {
      const { service, esSearch } = build();
      await service.searchProducts({ query: "porsche", lane: "test" });
      expect(esSearch).not.toHaveBeenCalled();
    });

    it("still uses Elasticsearch for a live viewer", async () => {
      const { service, esSearch } = build();
      await service.searchProducts({ query: "porsche", lane: "live" });
      expect(esSearch).toHaveBeenCalled();
    });

    it("threads the lane into the Postgres seller predicate", async () => {
      const { service, prisma } = build();
      await service.searchProducts({ query: "porsche", lane: "test" });
      const where = (prisma.product.findMany.mock.calls[0] as any[])[0].where;
      expect(JSON.stringify(where)).toContain('"isTestAccount":true');
    });
  });

  describe("SearchAutocompleteService", () => {
    const build = () => {
      const esSearch = jest.fn(async () => ({ hits: { hits: [] } }));
      const prisma = prismaStub();
      const service = new SearchAutocompleteService(
        prisma as never,
        { getPublicAssetUrl: () => undefined } as never,
        {
          isAvailable: () => true,
          client: { search: esSearch },
          productsIndex: "products",
        } as never,
      );
      return { service, esSearch, prisma };
    };

    it("keeps a test-lane viewer off Elasticsearch", async () => {
      const { service, esSearch } = build();
      await service.autocomplete("por", 5, [], "test");
      expect(esSearch).not.toHaveBeenCalled();
    });

    it("scopes the Postgres fallback to test sellers", async () => {
      const { service, prisma } = build();
      await service.autocomplete("por", 5, [], "test");
      const where = (prisma.product.findMany.mock.calls[0] as any[])[0].where;
      expect(JSON.stringify(where)).toContain('"isTestAccount":true');
    });
  });

  // S13 — koleksiyon indeksi de yalnız canlı sahipleri taşır: test şeridi
  // viewer'ı keşfi Postgres'ten kendi şeridiyle listeler, canlı viewer'a ES
  // test koleksiyonu döndürmez.
  describe("SearchCollectionService — live-only index", () => {
    const build = (owner: { isTestAccount: boolean }) => {
      const client = {
        index: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      };
      const prisma = {
        collection: {
          findUnique: jest.fn().mockResolvedValue({
            id: "c1",
            userId: "u1",
            name: "Koleksiyon",
            isPublic: true,
            user: { id: "u1", ...owner },
            _count: { items: 0 },
          }),
        },
      };
      const service = new SearchCollectionService(
        prisma as never,
        { getPublicAssetUrl: () => undefined } as never,
        {
          isAvailable: () => true,
          client,
          collectionsIndex: "collections",
        } as never,
      );
      return { service, client, prisma };
    };

    it("test şeridi sahibinin koleksiyonu indekslenmez, varsa silinir", async () => {
      const { service, client } = build({ isTestAccount: true });
      await service.indexCollection("c1");
      expect(client.index).not.toHaveBeenCalled();
      expect(client.delete).toHaveBeenCalledWith({
        index: "collections",
        id: "c1",
      });
    });

    it("canlı sahibin koleksiyonu indekslenir; şerit bayrağı dokümana yazılmaz", async () => {
      const { service, client } = build({ isTestAccount: false });
      await service.indexCollection("c1");
      expect(client.index).toHaveBeenCalledTimes(1);
      const [{ document }] = client.index.mock.calls[0];
      expect(document).not.toHaveProperty("isTestAccount");
      expect(client.delete).not.toHaveBeenCalled();
    });

    it("sahibin şerit bayrağı indeks sorgusunda seçilir", async () => {
      const { service, prisma } = build({ isTestAccount: false });
      await service.indexCollection("c1");
      const include = prisma.collection.findUnique.mock.calls[0][0].include;
      expect(include.user.select.isTestAccount).toBe(true);
    });
  });
});
