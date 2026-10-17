import { SearchProductService } from "./search-product.service";

const SORTS = [
  "relevance",
  "price_asc",
  "price_desc",
  "newest",
  "created_asc",
  "created_desc",
  "view_count_asc",
  "view_count_desc",
  "title_asc",
  "title_desc",
  "rating_desc",
];

describe("SearchProductService — ES sort tiebreaker", () => {
  const build = () => {
    const esSearch = jest.fn(async (_body: any) => ({
      // Boş sonuç + query Postgres fallback'ine düşer; tek isabet döndür.
      hits: { hits: [{ _source: { id: "p1" }, _score: 1 }], total: 1 },
    }));
    const service = new SearchProductService(
      {} as never,
      { getPublicAssetUrl: () => undefined } as never,
      {
        isAvailable: () => true,
        client: { search: esSearch },
        productsIndex: "products",
      } as never,
    );
    return { service, esSearch };
  };

  it.each(SORTS)(
    "sortBy=%s (with and without query) ends with id",
    async (sortBy) => {
      for (const query of [undefined, "hot"]) {
        const { service, esSearch } = build();
        await service.searchProducts({ query, sortBy, lane: "live" } as any);
        const body = esSearch.mock.calls[0][0];
        expect(body.sort[body.sort.length - 1]).toEqual({ id: "asc" });
      }
    },
  );

  it("discountOnly adds an oldPrice > price script filter", async () => {
    const { service, esSearch } = build();
    await service.searchProducts({ discountOnly: true, lane: "live" } as any);
    const filter =
      esSearch.mock.calls[0][0].query.function_score.query.bool.filter;
    expect(JSON.stringify(filter)).toContain(
      "doc['oldPrice'].value > doc['price'].value",
    );
  });
});
