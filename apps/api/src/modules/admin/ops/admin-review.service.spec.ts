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
