import { ConflictException } from "@nestjs/common";
import { RatingModerationService } from "./rating-moderation.service";

/**
 * A review its author deleted is out of moderation: showing it again would
 * publish it (and count it), hiding it would lose the deleted marker. The
 * admin UI offers no action for `deleted`; the API refuses it too (QA
 * finding), with nothing written and nothing audited.
 */
function setup(status: string) {
  const row = {
    id: "rv-1",
    status,
    moderationReason: null,
    moderatedAt: null,
    productId: "p-1",
    receiverId: "seller-1",
  };
  const tx = {
    productRating: {
      findUnique: jest.fn().mockResolvedValue(row),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    rating: {
      findUnique: jest.fn().mockResolvedValue(row),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  const prisma = {
    $transaction: jest.fn(async (fn: (c: typeof tx) => unknown) => fn(tx)),
  };
  const ratingService = { updateProductRatingStats: jest.fn() };
  const cache = { del: jest.fn(), delPattern: jest.fn() };
  const outbox = { enqueue: jest.fn(), runInline: jest.fn() };
  const service = new RatingModerationService(
    prisma as never,
    ratingService as never,
    cache as never,
    { queueIndexProduct: jest.fn() } as never,
    outbox as never,
    { addBreadcrumb: jest.fn(), captureException: jest.fn() } as never,
  );
  return { service, tx, ratingService, cache, outbox };
}

const moderations = [
  ["product review", "moderateProductRating", "productRating"],
  ["user rating", "moderateUserRating", "rating"],
] as const;

describe("RatingModerationService: deleted reviews are not moderatable", () => {
  describe.each(moderations)("%s", (_label, method, table) => {
    it.each(["approved", "hidden"] as const)(
      "refuses deleted -> %s with 409 and writes nothing",
      async (target) => {
        const ctx = setup("deleted");
        const audit = jest.fn();

        await expect(
          ctx.service[method](
            {
              ratingId: "rv-1",
              status: target,
              reason: "Moderation reason",
              moderatorAdminId: "adm-1",
            },
            audit,
          ),
        ).rejects.toMatchObject({
          constructor: ConflictException,
          response: { i18nKey: "server.admin.review.deletedNotModeratable" },
        });
        expect(ctx.tx[table].updateMany).not.toHaveBeenCalled();
        expect(ctx.tx.$queryRaw).not.toHaveBeenCalled();
        expect(
          ctx.ratingService.updateProductRatingStats,
        ).not.toHaveBeenCalled();
        expect(ctx.outbox.enqueue).not.toHaveBeenCalled();
        expect(audit).not.toHaveBeenCalled();
        expect(ctx.cache.delPattern).not.toHaveBeenCalled();
      },
    );
  });

  it("still moderates the other non-public legacy statuses (pending, rejected)", async () => {
    for (const status of ["pending", "rejected"]) {
      const ctx = setup(status);
      await ctx.service.moderateProductRating(
        { ratingId: "rv-1", status: "approved", moderatorAdminId: "adm-1" },
        jest.fn(),
      );
      expect(ctx.tx.productRating.updateMany).toHaveBeenCalledTimes(1);
    }
  });
});
