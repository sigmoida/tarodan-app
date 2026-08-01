import { enqueueTradeListingReindex } from "./trade-listing-reindex";

/**
 * Arama dokümanındaki `sellerCanTrade` üyelikten türetilir ve ürün düzenlemesi
 * olmadan bayatlar. Reindex tetiklemesi eskiden YALNIZ düşüş cron'undaydı:
 * üyeliğini yenileyen satıcının ilanları, doküman `false` kaldığı için takas
 * aramasında süresiz görünmez oluyordu (detay sayfası "takas edilebilir"
 * derken). Bu yardımcı tek tetikleme noktasıdır; düşüş, ödeme aktivasyonu ve
 * admin katman değişikliği aynı fonksiyonu çağırır.
 */
describe("enqueueTradeListingReindex", () => {
  const makePrisma = (ids: string[]) => ({
    product: {
      findMany: jest.fn().mockResolvedValue(ids.map((id) => ({ id }))),
    },
  });

  it("satıcının takas bayraklı ürünlerini bulk-index'e kuyruklar", async () => {
    const prisma = makePrisma(["p1", "p2"]);
    const queue = { add: jest.fn().mockResolvedValue(undefined) };

    const count = await enqueueTradeListingReindex(
      prisma as any,
      queue as any,
      "seller-1",
    );

    expect(count).toBe(2);
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sellerId: "seller-1", isTradeEnabled: true },
      }),
    );
    expect(queue.add).toHaveBeenCalledWith("bulk-index", {
      type: "bulk-index",
      entityType: "product",
      entityIds: ["p1", "p2"],
    });
  });

  it("takas bayraklı ürün yoksa kuyruğa hiç yazmaz", async () => {
    const prisma = makePrisma([]);
    const queue = { add: jest.fn() };

    const count = await enqueueTradeListingReindex(
      prisma as any,
      queue as any,
      "seller-1",
    );

    expect(count).toBe(0);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it("kuyruk yoksa (opsiyonel DI) sessizce geçer", async () => {
    const prisma = makePrisma(["p1"]);
    await expect(
      enqueueTradeListingReindex(prisma as any, undefined, "seller-1"),
    ).resolves.toBe(0);
  });

  it("kuyruk hatası yutulur — indeksleme ana akışı BOZMAZ", async () => {
    const prisma = makePrisma(["p1"]);
    const queue = { add: jest.fn().mockRejectedValue(new Error("redis down")) };
    await expect(
      enqueueTradeListingReindex(prisma as any, queue as any, "seller-1"),
    ).resolves.toBe(0);
  });
});
