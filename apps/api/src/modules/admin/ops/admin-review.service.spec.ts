import { AdminReviewService } from "./admin-review.service";
import { RatingStatus } from "../dto";

describe("AdminReviewService user-rating list sorting", () => {
  let prisma: any;
  let service: AdminReviewService;

  beforeEach(() => {
    prisma = {
      rating: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      productRating: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    service = new AdminReviewService(prisma, {} as any, {} as any, {} as any);
  });

  it("keeps createdAt desc as the default", async () => {
    await service.getUserRatings({});

    expect(prisma.rating.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "desc" } }),
    );
  });

  it("sorts by score without losing filters", async () => {
    await service.getUserRatings({
      status: RatingStatus.approved,
      sortBy: "score",
      sortOrder: "asc",
    });

    expect(prisma.rating.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "approved" },
        orderBy: { score: "asc" },
      }),
    );
  });

  it("sorts product reviews by a displayed relation column", async () => {
    await service.getReviews({
      sortBy: "product.title",
      sortOrder: "asc",
    });

    expect(prisma.productRating.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { product: { title: "asc" } },
      }),
    );
  });
});

/**
 * Detay çekmecesi yeni uç istemeden çizilir: liste satırı tam metni, admin
 * yanıtını, görselleri ve sipariş / ürün / satıcı bağlantılarını taşır.
 */
describe("AdminReviewService list rows carry the detail drawer's data", () => {
  const storage = {
    getPublicAssetUrl: (key: string) => `https://cdn.test/${key}`,
  };

  it("product reviews: full text, admin reply, resolved images, order/product/seller links", async () => {
    const prisma = {
      productRating: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([
          {
            id: "pr-1",
            orderId: "o-1",
            productId: "p-1",
            userId: "u-1",
            score: 4,
            title: "Güzel",
            review: "Uzun yorum metninin tamamı burada.",
            images: ["ratings/u-1/a.jpg", "https://cdn.test/b.jpg"],
            adminReply: "Teşekkürler",
            adminReplyAt: new Date("2026-10-01T00:00:00.000Z"),
            product: { id: "p-1", title: "Model", sellerId: "s-1", images: [] },
          },
        ]),
      },
      order: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: "o-1", orderNumber: "ORD-10001" }]),
      },
    };
    const service = new AdminReviewService(
      prisma as never,
      {} as never,
      {} as never,
      storage as never,
    );

    const { data } = await service.getReviews({});

    expect(data[0]).toMatchObject({
      review: "Uzun yorum metninin tamamı burada.",
      title: "Güzel",
      adminReply: "Teşekkürler",
      images: ["https://cdn.test/ratings/u-1/a.jpg", "https://cdn.test/b.jpg"],
      orderId: "o-1",
      orderNumber: "ORD-10001",
      productId: "p-1",
      sellerId: "s-1",
    });
    // the seller id comes from the product select, the number from ONE batch read
    expect(
      prisma.productRating.findMany.mock.calls[0][0].include.product.select,
    ).toMatchObject({ sellerId: true });
    expect(prisma.order.findMany).toHaveBeenCalledTimes(1);
  });

  it("seller ratings: full comment plus order and trade numbers", async () => {
    const prisma = {
      rating: {
        count: jest.fn().mockResolvedValue(2),
        findMany: jest.fn().mockResolvedValue([
          {
            id: "r-1",
            orderId: "o-1",
            tradeId: null,
            comment: "Hızlı kargo",
            giverId: "u-1",
            receiverId: "s-1",
          },
          {
            id: "r-2",
            orderId: null,
            tradeId: "t-1",
            comment: "Sorunsuz takas",
            giverId: "u-2",
            receiverId: "s-1",
          },
        ]),
      },
      order: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: "o-1", orderNumber: "ORD-10001" }]),
      },
      trade: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: "t-1", tradeNumber: "TKS-10002" }]),
      },
    };
    const service = new AdminReviewService(
      prisma as never,
      {} as never,
      {} as never,
      storage as never,
    );

    const { data } = await service.getUserRatings({});

    expect(
      data.map((row) => [row.id, row.comment, row.orderNumber, row.tradeNumber]),
    ).toEqual([
      ["r-1", "Hızlı kargo", "ORD-10001", null],
      ["r-2", "Sorunsuz takas", null, "TKS-10002"],
    ]);
  });
});
