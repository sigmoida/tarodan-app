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

  it("discountOnly + arama: ES yolunda kalır, indirim ES sorgusunda filtrelenir", async () => {
    const { service, prisma, esSearch, priceRef } = build();
    esSearch.searchProductIds.mockResolvedValue({
      ids: ["p2", "p1"],
      total: 37,
    });
    prisma.product.findMany.mockResolvedValue([
      { id: "p1", status: "active", quantity: 1, reservedQuantity: 0 },
      { id: "p2", status: "active", quantity: 1, reservedQuantity: 0 },
    ]);

    const res = await service.findAll({
      search: "hot",
      discountOnly: true,
      sortBy: "relevance",
      page: 2,
      limit: 2,
    } as any);

    // Filtre ES sorgusunun içinde: total ve sayfa filtreden sonra hesaplanır.
    expect(esSearch.searchProductIds).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "hot",
        discountOnly: true,
        page: 2,
        pageSize: 2,
      }),
    );
    // Postgres tam-metin yoluna (ilk 1000 id) düşülmez.
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
    expect(prisma.product.count).not.toHaveBeenCalled();
    expect(res.meta).toEqual({ total: 37, page: 2, limit: 2, totalPages: 19 });
    // Alaka sırası (ES sırası) korunur.
    expect(res.data.map((p: any) => p.id)).toEqual(["p2", "p1"]);
    // Hidrasyon canlı isOnSale kuralıyla doğrular (pencere indekste yok).
    const json = JSON.stringify(prisma.product.findMany.mock.calls[0][0].where);
    expect(json).toContain("saleEndDate");
    expect(json).toContain(JSON.stringify(priceRef));
  });

  it("discountOnly + arama: penceresi kapanmış ürün (stale) Postgres'e düşer", async () => {
    const { service, prisma, esSearch } = build(5);
    esSearch.searchProductIds.mockResolvedValue({
      ids: ["p1", "p2"],
      total: 2,
    });
    // Biri isOnSale doğrulamasından geçmedi → kanonik Postgres yolu.
    prisma.product.findMany
      .mockResolvedValueOnce([
        { id: "p1", status: "active", quantity: 1, reservedQuantity: 0 },
      ])
      .mockResolvedValue([]);

    const res = await service.findAll({
      search: "hot",
      discountOnly: true,
      page: 1,
      limit: 24,
    } as any);

    expect(prisma.product.count).toHaveBeenCalled();
    const where = JSON.stringify(prisma.product.count.mock.calls[0][0].where);
    expect(where).toContain("saleEndDate");
    expect(res.meta.total).toBe(5);
  });

  it("discountOnly arama olmadan: Postgres yolu, ES çağrılmaz", async () => {
    const { service, esSearch } = build();
    await service.findAll({ discountOnly: true, page: 1, limit: 24 } as any);
    expect(esSearch.searchProductIds).not.toHaveBeenCalled();
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
