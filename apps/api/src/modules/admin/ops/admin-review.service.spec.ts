import { AdminReviewService } from "./admin-review.service";
import { RatingStatus } from "@prisma/client";

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
      data.map((row) => [
        row.id,
        row.comment,
        row.orderNumber,
        row.tradeNumber,
      ]),
    ).toEqual([
      ["r-1", "Hızlı kargo", "ORD-10001", null],
      ["r-2", "Sorunsuz takas", null, "TKS-10002"],
    ]);
  });
});

/**
 * Hide / show again: the admin layer resolves the moderator, passes the DTO
 * to the rating domain and writes a REQUIRED audit entry on the moderation
 * transaction, with the right entity type per table.
 */
describe("AdminReviewService moderation", () => {
  const tx = { marker: "tx" };
  const change = {
    before: { status: "approved", moderationReason: null },
    after: { status: "hidden", reason: "Spam link" },
  };
  const makeService = () => {
    const result = { success: true, id: "x", status: "hidden", changed: true };
    const ratingModeration = {
      moderateProductRating: jest.fn(async (_input, audit) => {
        await audit(tx, change);
        return result;
      }),
      moderateUserRating: jest.fn(async (_input, audit) => {
        await audit(tx, change);
        return result;
      }),
    };
    const audit = {
      resolveActiveAdminId: jest.fn().mockResolvedValue("adm-1"),
      createRequiredAuditLog: jest.fn().mockResolvedValue({}),
      createAuditLog: jest.fn(),
    };
    const service = new AdminReviewService(
      {} as never,
      ratingModeration as never,
      audit as never,
      {} as never,
    );
    return { service, ratingModeration, audit, result };
  };

  it("product review: entity ProductRating, required audit on the transaction", async () => {
    const { service, ratingModeration, audit, result } = makeService();

    await expect(
      service.updateReviewStatus("user-1", "pr-1", {
        status: "hidden",
        reason: "Spam link",
      }),
    ).resolves.toBe(result);

    expect(audit.resolveActiveAdminId).toHaveBeenCalledWith("user-1");
    expect(ratingModeration.moderateProductRating).toHaveBeenCalledWith(
      {
        ratingId: "pr-1",
        status: "hidden",
        reason: "Spam link",
        moderatorAdminId: "adm-1",
      },
      expect.any(Function),
    );
    expect(audit.createRequiredAuditLog).toHaveBeenCalledWith(
      "user-1",
      "review_status_update",
      "ProductRating",
      "pr-1",
      change.before,
      change.after,
      tx,
    );
    expect(audit.createAuditLog).not.toHaveBeenCalled();
  });

  it("user rating: entity Rating, moved here from the seller-application service", async () => {
    const { service, ratingModeration, audit } = makeService();

    await service.updateUserRatingStatus("user-1", "r-1", {
      status: "approved",
    });

    expect(ratingModeration.moderateUserRating).toHaveBeenCalledWith(
      {
        ratingId: "r-1",
        status: "approved",
        reason: undefined,
        moderatorAdminId: "adm-1",
      },
      expect.any(Function),
    );
    expect(audit.createRequiredAuditLog).toHaveBeenCalledWith(
      "user-1",
      "user_rating_status_update",
      "Rating",
      "r-1",
      change.before,
      change.after,
      tx,
    );
  });
});

describe("AdminReviewService list filters and moderation columns", () => {
  const moderatedBy = { id: "adm-1", user: { displayName: "Moderator" } };
  const makePrisma = () => ({
    productRating: {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue([
        {
          id: "pr-1",
          orderId: null,
          images: [],
          product: null,
          status: "hidden",
          moderationReason: "Spam link",
          moderatedAt: new Date("2026-10-23T10:00:00.000Z"),
          moderatedByAdminId: "adm-1",
          moderatedBy,
        },
      ]),
    },
    rating: {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue([
        {
          id: "r-1",
          orderId: null,
          tradeId: null,
          status: "approved",
          moderationReason: null,
          moderatedAt: null,
          moderatedByAdminId: null,
          moderatedBy: null,
        },
      ]),
    },
  });

  it("product reviews: exact id and the hidden status filter; moderator as { id, displayName }", async () => {
    const prisma = makePrisma();
    const service = new AdminReviewService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const { data } = await service.getReviews({
      id: "pr-1",
      status: RatingStatus.hidden,
    });

    const args = prisma.productRating.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ id: "pr-1", status: "hidden" });
    expect(args.include.moderatedBy).toEqual({
      select: { id: true, user: { select: { displayName: true } } },
    });
    expect(data[0]).toMatchObject({
      status: "hidden",
      moderationReason: "Spam link",
      moderatedAt: new Date("2026-10-23T10:00:00.000Z"),
      moderatedBy: { id: "adm-1", displayName: "Moderator" },
    });
  });

  it("user ratings: every stored status filters, legacy ones too", async () => {
    const prisma = makePrisma();
    const service = new AdminReviewService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );

    for (const status of Object.values(RatingStatus)) {
      prisma.rating.findMany.mockClear();
      await service.getUserRatings({ status, id: "r-1" });
      expect(prisma.rating.findMany.mock.calls[0][0].where).toEqual({
        id: "r-1",
        status,
      });
    }
    const { data } = await service.getUserRatings({});
    expect(data[0].moderatedBy).toBeNull();
  });

  it("a search that names a status finds it (hidden)", async () => {
    const prisma = makePrisma();
    const service = new AdminReviewService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.getUserRatings({ search: "Hidden" });

    expect(prisma.rating.findMany.mock.calls[0][0].where.OR).toContainEqual({
      status: "hidden",
    });
  });
});
