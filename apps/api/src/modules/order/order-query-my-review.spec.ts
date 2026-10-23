import { ForbiddenException } from "@nestjs/common";
import { RatingStatus } from "@prisma/client";
import { OrderQueryService } from "./order-query.service";

/**
 * `GET /orders/:id/my-review`: the author always sees their own review, and
 * `hidden` tells them when it is not shown publicly (admin moderation or a
 * legacy unpublished row). Contract: `OrderOwnReview` in `@tarodan/types`.
 */
describe("OrderQueryService.getOrderReview (author's own view)", () => {
  const createdAt = new Date("2026-10-20T09:00:00.000Z");
  const makeService = (
    productStatus: RatingStatus | null,
    sellerStatus: RatingStatus | null,
  ) => {
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: "o-1",
          buyerId: "buyer-1",
          sellerId: "seller-1",
        }),
      },
      productRating: {
        findFirst: jest.fn().mockResolvedValue(
          productStatus && {
            score: 2,
            title: "Broken box",
            review: "Arrived damaged",
            images: ["ratings/a.jpg"],
            createdAt,
            status: productStatus,
          },
        ),
      },
      rating: {
        findFirst: jest.fn().mockResolvedValue(
          sellerStatus && {
            score: 1,
            comment: "Slow",
            createdAt,
            status: sellerStatus,
          },
        ),
      },
    };
    const orderCommon = {
      resolveProductImageUrl: (key: string) => `https://cdn.test/${key}`,
    };
    return {
      service: new OrderQueryService(prisma as never, orderCommon as never),
      prisma,
    };
  };

  it("a hidden review still reaches its author, flagged hidden", async () => {
    const { service, prisma } = makeService(
      RatingStatus.hidden,
      RatingStatus.hidden,
    );

    const view = await service.getOrderReview("o-1", "buyer-1");

    expect(view).toEqual({
      product: {
        score: 2,
        title: "Broken box",
        review: "Arrived damaged",
        images: ["https://cdn.test/ratings/a.jpg"],
        createdAt,
        hidden: true,
      },
      seller: { score: 1, comment: "Slow", createdAt, hidden: true },
    });
    // the author's own rows are read whatever their status
    expect(prisma.productRating.findFirst.mock.calls[0][0].where).toEqual({
      orderId: "o-1",
      userId: "buyer-1",
    });
    expect(prisma.rating.findFirst.mock.calls[0][0].where).toEqual({
      orderId: "o-1",
      giverId: "buyer-1",
      receiverId: "seller-1",
    });
  });

  it("a published review is not hidden", async () => {
    const { service } = makeService(
      RatingStatus.approved,
      RatingStatus.approved,
    );

    const view = await service.getOrderReview("o-1", "buyer-1");

    expect(view.product?.hidden).toBe(false);
    expect(view.seller?.hidden).toBe(false);
  });

  it.each([RatingStatus.pending, RatingStatus.rejected])(
    "a legacy %s row is flagged hidden too (not public)",
    async (status) => {
      const { service } = makeService(status, null);

      const view = await service.getOrderReview("o-1", "buyer-1");

      expect(view.product?.hidden).toBe(true);
      expect(view.seller).toBeNull();
    },
  );

  it("another user cannot read it (403)", async () => {
    const { service } = makeService(RatingStatus.hidden, null);

    await expect(
      service.getOrderReview("o-1", "someone-else"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
