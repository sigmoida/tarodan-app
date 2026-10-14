import { accountLaneServiceStub } from "../../account-lane/account-lane.testing";
import { ProductQueryService } from "./product-query.service";

const SORTS = [
  undefined,
  "relevance",
  "price_asc",
  "price_desc",
  "created_asc",
  "created_desc",
  "title_asc",
  "title_desc",
  "view_count_asc",
  "view_count_desc",
  "rating_desc",
];

describe("ProductQueryService — sıralama/sayfalama kararlılığı", () => {
  const build = (onSaleCount = 11) => {
    const priceRef = { _ref: "price" };
    // Toplam, sıralamadan bağımsız: yalnız WHERE'e bağlı.
    // In-stock kovası onSaleCount, stok-dışı kovası 0 döner.
    const count = jest.fn(async ({ where }: any) =>
      JSON.stringify(where).includes('"NOT"') ? 0 : onSaleCount,
    );
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      product: {
        count,
        findMany,
        fields: { price: priceRef, reservedQuantity: { _ref: "reserved" } },
      },
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    };
    const cache = {
      getOrSet: jest.fn((_k: string, factory: () => Promise<unknown>) =>
        factory(),
      ),
    };
    const esSearch = {
      isAvailable: jest.fn(() => true),
      searchProductIds: jest.fn(),
    };
    const service = new ProductQueryService(
      prisma as any,
      cache as any,
      esSearch as any,
      {} as any,
      { formatProductResponseMany: jest.fn(async (r: any[]) => r) } as any,
      { getHiddenUserIds: jest.fn().mockResolvedValue([]) } as any,
      accountLaneServiceStub() as any,
    );
    return { service, prisma, esSearch, priceRef };
  };

  it.each(SORTS)(
    "discountOnly: sortBy=%s için meta.total aynı (sayfa-sonrası filtre yok)",
    async (sortBy) => {
      const { service } = build(11);
      const res = await service.findAll({
        discountOnly: true,
        sortBy,
        page: 1,
        limit: 24,
      } as any);
      expect(res.meta.total).toBe(11);
      expect(res.meta.totalPages).toBe(1);
    },
  );

  it("discountOnly: arama olsa bile ES'e gitmez, WHERE'e isOnSale kuralı girer", async () => {
    const { service, prisma, esSearch, priceRef } = build();
    await service.findAll({
      search: "hot",
      discountOnly: true,
      sortBy: "price_asc",
      page: 1,
      limit: 24,
    } as any);
    expect(esSearch.searchProductIds).not.toHaveBeenCalled();
    const where = prisma.product.count.mock.calls[0][0].where;
    const json = JSON.stringify(where);
    expect(json).toContain('"oldPrice":{"gt"');
    expect(json).toContain("saleStartDate");
    expect(json).toContain("saleEndDate");
    // Kolon karşılaştırması: oldPrice > price alanı
    expect(JSON.stringify(where)).toContain(JSON.stringify(priceRef));
  });

  it.each(SORTS)(
    "sortBy=%s: orderBy her zaman id eşitlik bozucuyla biter",
    async (sortBy) => {
      const { service, prisma } = build();
      await service.findAll({ sortBy, page: 1, limit: 20 } as any);
      const orders = prisma.product.findMany.mock.calls.map(
        (c: any[]) => c[0].orderBy,
      );
      expect(orders.length).toBeGreaterThan(0);
      for (const orderBy of orders) {
        expect(orderBy[orderBy.length - 1]).toEqual({ id: "asc" });
      }
    },
  );
});
