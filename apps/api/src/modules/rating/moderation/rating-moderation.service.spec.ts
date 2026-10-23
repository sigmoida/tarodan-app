import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import {
  RatingModerationService,
  SELLER_LISTING_REVALIDATE_LIMIT,
  type RatingModerationAuditWriter,
} from "./rating-moderation.service";
import { notifyWebRevalidate } from "../../../common/helpers/revalidate";

jest.mock("../../../common/helpers/revalidate", () => ({
  ...jest.requireActual("../../../common/helpers/revalidate"),
  notifyWebRevalidate: jest.fn().mockResolvedValue(undefined),
}));

const notify = notifyWebRevalidate as jest.MockedFunction<
  typeof notifyWebRevalidate
>;

type Row = {
  id: string;
  status: string;
  moderationReason: string | null;
  moderatedAt: Date | null;
  productId?: string;
  receiverId?: string;
};

/**
 * One fake database for both review tables. `$transaction` records when it
 * commits, so the specs can prove the refresh runs only after the commit, and
 * rolls nothing back on its own: a throwing callback simply never commits.
 */
function setup(
  options: { productRow?: Row | null; userRow?: Row | null } = {},
) {
  const events: string[] = [];
  const productRow: Row | null =
    options.productRow === undefined
      ? {
          id: "pr-1",
          status: "approved",
          moderationReason: null,
          moderatedAt: null,
          productId: "p-1",
        }
      : options.productRow;
  const userRow: Row | null =
    options.userRow === undefined
      ? {
          id: "r-1",
          status: "approved",
          moderationReason: null,
          moderatedAt: null,
          receiverId: "seller-1",
        }
      : options.userRow;

  const tx = {
    productRating: {
      findUnique: jest.fn().mockResolvedValue(productRow),
      updateMany: jest.fn().mockImplementation(async () => {
        events.push("review.update");
        return { count: 1 };
      }),
    },
    rating: {
      findUnique: jest.fn().mockResolvedValue(userRow),
      updateMany: jest.fn().mockImplementation(async () => {
        events.push("rating.update");
        return { count: 1 };
      }),
    },
    $queryRaw: jest.fn().mockImplementation(async () => {
      events.push("product.lock");
      return [];
    }),
  };
  const prisma = {
    $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => {
      const result = await fn(tx);
      events.push("commit");
      return result;
    }),
    product: {
      findMany: jest.fn().mockResolvedValue([{ id: "p-7" }, { id: "p-8" }]),
    },
  };
  const ratingService = {
    updateProductRatingStats: jest.fn().mockImplementation(async () => {
      events.push("stats");
    }),
  };
  const cache = {
    del: jest.fn().mockImplementation(async (key: string) => {
      events.push(`cache.del ${key}`);
    }),
    delPattern: jest.fn().mockImplementation(async (pattern: string) => {
      events.push(`cache.delPattern ${pattern}`);
      return 0;
    }),
  };
  const searchIndexing = {
    queueIndexProduct: jest.fn().mockImplementation(async (id: string) => {
      events.push(`search.reindex ${id}`);
    }),
  };
  const outbox = {
    enqueue: jest.fn().mockImplementation(async () => {
      events.push("outbox.enqueue");
    }),
    // runs the work like a claim that succeeded
    runInline: jest.fn(
      async (_db: unknown, _key: string, work: () => Promise<unknown>) => ({
        ran: true,
        result: await work(),
      }),
    ),
  };
  const sentry = { addBreadcrumb: jest.fn(), captureException: jest.fn() };
  const audit: jest.MockedFunction<RatingModerationAuditWriter> = jest
    .fn()
    .mockImplementation(async () => {
      events.push("audit");
    });
  notify.mockImplementation(async (tags) => {
    events.push(`web ${tags.join(",")}`);
  });

  const service = new RatingModerationService(
    prisma as never,
    ratingService as never,
    cache as never,
    searchIndexing as never,
    outbox as never,
    sentry as never,
  );
  return {
    service,
    prisma,
    tx,
    ratingService,
    cache,
    searchIndexing,
    outbox,
    sentry,
    audit,
    events,
  };
}

const HIDE = {
  ratingId: "pr-1",
  status: "hidden" as const,
  reason: "  Contains a phone number  ",
  moderatorAdminId: "adm-1",
};

beforeEach(() => notify.mockReset());

describe("RatingModerationService.moderateProductRating", () => {
  it("hides with compare-and-set, moderation columns, counters and audit in one transaction", async () => {
    const ctx = setup();

    const result = await ctx.service.moderateProductRating(HIDE, ctx.audit);

    expect(ctx.tx.productRating.updateMany).toHaveBeenCalledWith({
      where: { id: "pr-1", status: "approved" },
      data: {
        status: "hidden",
        moderationReason: "Contains a phone number",
        moderatedAt: expect.any(Date),
        moderatedByAdminId: "adm-1",
      },
    });
    // the counters are recomputed on the transaction client, not the pool
    expect(ctx.ratingService.updateProductRatingStats).toHaveBeenCalledWith(
      "p-1",
      ctx.tx,
    );
    expect(ctx.audit).toHaveBeenCalledWith(ctx.tx, {
      before: { status: "approved", moderationReason: null },
      after: { status: "hidden", reason: "Contains a phone number" },
    });
    expect(result).toEqual({
      success: true,
      id: "pr-1",
      status: "hidden",
      moderationReason: "Contains a phone number",
      moderatedAt: expect.any(Date),
      changed: true,
    });
  });

  it("locks the product before the review, and refreshes only after the commit", async () => {
    const ctx = setup();

    await ctx.service.moderateProductRating(HIDE, ctx.audit);

    expect(ctx.events).toEqual([
      "product.lock",
      "review.update",
      "stats",
      // the search re-index is durable: written with the change
      "outbox.enqueue",
      "audit",
      "commit",
      // API caches first, then the search document and the web pages
      "cache.del products:detail:p-1",
      "cache.delPattern products:list:*",
      "search.reindex p-1",
      "web products:list,product:p-1",
    ]);
  });

  it("queues the search re-index in the outbox with one key per change, and runs that same row after commit", async () => {
    const ctx = setup();

    await ctx.service.moderateProductRating(HIDE, ctx.audit);

    const [txArg, event] = ctx.outbox.enqueue.mock.calls[0];
    expect(txArg).toBe(ctx.tx);
    expect(event).toEqual({
      type: "search.product_reindex",
      payload: { productId: "p-1" },
      dedupeKey: expect.stringMatching(
        /^search\.product_reindex:p-1:review:pr-1:\d{4}-\d{2}-\d{2}T/,
      ),
    });
    expect(ctx.outbox.runInline).toHaveBeenCalledWith(
      ctx.prisma,
      event.dedupeKey,
      expect.any(Function),
    );
  });

  it("a failed inline re-index leaves the outbox row to the drainer and still answers", async () => {
    const ctx = setup();
    ctx.outbox.runInline.mockRejectedValue(new Error("redis down"));

    await expect(
      ctx.service.moderateProductRating(HIDE, ctx.audit),
    ).resolves.toMatchObject({ status: "hidden", changed: true });
    expect(ctx.outbox.enqueue).toHaveBeenCalledTimes(1);
  });

  it("hiding a hidden review with a new reason corrects the reason only (audited, no visibility work)", async () => {
    const ctx = setup({
      productRow: {
        id: "pr-1",
        status: "hidden",
        moderationReason: "Spam link",
        moderatedAt: new Date("2026-10-01T00:00:00.000Z"),
        productId: "p-1",
      },
    });

    const result = await ctx.service.moderateProductRating(
      { ...HIDE, reason: "Spam link to an outside shop" },
      ctx.audit,
    );

    expect(ctx.tx.productRating.updateMany).toHaveBeenCalledWith({
      where: { id: "pr-1", status: "hidden" },
      data: {
        status: "hidden",
        moderationReason: "Spam link to an outside shop",
        moderatedAt: expect.any(Date),
        moderatedByAdminId: "adm-1",
      },
    });
    expect(ctx.audit).toHaveBeenCalledWith(ctx.tx, {
      before: { status: "hidden", moderationReason: "Spam link" },
      after: { status: "hidden", reason: "Spam link to an outside shop" },
    });
    expect(result).toMatchObject({
      changed: true,
      moderationReason: "Spam link to an outside shop",
    });
    expect(ctx.tx.$queryRaw).not.toHaveBeenCalled();
    expect(ctx.ratingService.updateProductRatingStats).not.toHaveBeenCalled();
    expect(ctx.outbox.enqueue).not.toHaveBeenCalled();
    expect(ctx.cache.del).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("refuses a hide without a reason before opening a transaction", async () => {
    const ctx = setup();

    await expect(
      ctx.service.moderateProductRating(
        { ...HIDE, reason: "  abc " },
        ctx.audit,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(ctx.prisma.$transaction).not.toHaveBeenCalled();
    expect(ctx.audit).not.toHaveBeenCalled();
    expect(ctx.cache.del).not.toHaveBeenCalled();
  });

  it("shows again: keeps the last reason on the row, audits the optional note", async () => {
    const ctx = setup({
      productRow: {
        id: "pr-1",
        status: "hidden",
        moderationReason: "Contains a phone number",
        moderatedAt: new Date("2026-10-01T00:00:00.000Z"),
        productId: "p-1",
      },
    });

    const result = await ctx.service.moderateProductRating(
      {
        ratingId: "pr-1",
        status: "approved",
        reason: " Reviewed again ",
        moderatorAdminId: "adm-2",
      },
      ctx.audit,
    );

    const { data } = ctx.tx.productRating.updateMany.mock.calls[0][0];
    expect(data).toEqual({
      status: "approved",
      moderatedAt: expect.any(Date),
      moderatedByAdminId: "adm-2",
    });
    expect(ctx.audit).toHaveBeenCalledWith(ctx.tx, {
      before: { status: "hidden", moderationReason: "Contains a phone number" },
      after: { status: "approved", reason: "Reviewed again" },
    });
    expect(result.moderationReason).toBe("Contains a phone number");
    expect(ctx.ratingService.updateProductRatingStats).toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(["products:list", "product:p-1"]);
  });

  it("publishes a legacy pending row (approved) without a reason", async () => {
    const ctx = setup({
      productRow: {
        id: "pr-1",
        status: "pending",
        moderationReason: null,
        moderatedAt: null,
        productId: "p-1",
      },
    });

    await ctx.service.moderateProductRating(
      { ratingId: "pr-1", status: "approved", moderatorAdminId: "adm-1" },
      ctx.audit,
    );

    expect(ctx.tx.productRating.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "pr-1", status: "pending" } }),
    );
  });

  it("a double submit (same status) writes nothing, audits nothing, refreshes nothing", async () => {
    const ctx = setup({
      productRow: {
        id: "pr-1",
        status: "hidden",
        moderationReason: "Spam link",
        moderatedAt: new Date("2026-10-01T00:00:00.000Z"),
        productId: "p-1",
      },
    });

    const result = await ctx.service.moderateProductRating(
      { ...HIDE, reason: "Spam link" },
      ctx.audit,
    );

    expect(result).toMatchObject({
      status: "hidden",
      moderationReason: "Spam link",
      changed: false,
    });
    expect(ctx.tx.$queryRaw).not.toHaveBeenCalled();
    expect(ctx.tx.productRating.updateMany).not.toHaveBeenCalled();
    expect(ctx.ratingService.updateProductRatingStats).not.toHaveBeenCalled();
    expect(ctx.audit).not.toHaveBeenCalled();
    expect(ctx.cache.del).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("409 when another admin changed the status first; no counters, audit or refresh", async () => {
    const ctx = setup();
    ctx.tx.productRating.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      ctx.service.moderateProductRating(HIDE, ctx.audit),
    ).rejects.toMatchObject({
      constructor: ConflictException,
      response: { i18nKey: "server.admin.review.statusChanged" },
    });
    expect(ctx.ratingService.updateProductRatingStats).not.toHaveBeenCalled();
    expect(ctx.audit).not.toHaveBeenCalled();
    expect(ctx.cache.del).not.toHaveBeenCalled();
  });

  it("404 for an unknown review", async () => {
    const ctx = setup({ productRow: null });

    await expect(
      ctx.service.moderateProductRating(HIDE, ctx.audit),
    ).rejects.toMatchObject({
      constructor: NotFoundException,
      response: { i18nKey: "server.rating.reviewNotFound" },
    });
  });

  it("a failing audit write fails the change (fail-closed) and refreshes nothing", async () => {
    const ctx = setup();
    ctx.audit.mockRejectedValue(new Error("audit unavailable"));

    await expect(
      ctx.service.moderateProductRating(HIDE, ctx.audit),
    ).rejects.toThrow("audit unavailable");
    expect(ctx.events).not.toContain("commit");
    expect(ctx.cache.del).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("a failing refresh after the commit does not fail the response", async () => {
    const ctx = setup();
    ctx.cache.del.mockRejectedValue(new Error("redis down"));

    await expect(
      ctx.service.moderateProductRating(HIDE, ctx.audit),
    ).resolves.toMatchObject({ status: "hidden", changed: true });
    expect(ctx.sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      { flow: "review.moderation", kind: "product", ratingId: "pr-1" },
    );
  });

  it("traces the flow in Sentry with ids only, never the reason text", async () => {
    const ctx = setup();

    await ctx.service.moderateProductRating(HIDE, ctx.audit);

    expect(ctx.sentry.addBreadcrumb).toHaveBeenCalledWith({
      category: "review.moderation",
      message: "product review set to hidden",
      level: "info",
      data: {
        kind: "product",
        ratingId: "pr-1",
        status: "hidden",
        changed: true,
      },
    });
    expect(JSON.stringify(ctx.sentry.addBreadcrumb.mock.calls)).not.toContain(
      "phone number",
    );
  });
});

describe("RatingModerationService.moderateUserRating", () => {
  const HIDE_USER = { ...HIDE, ratingId: "r-1" };

  it("hides with compare-and-set and audit; no product counters", async () => {
    const ctx = setup();

    await ctx.service.moderateUserRating(HIDE_USER, ctx.audit);

    expect(ctx.tx.rating.updateMany).toHaveBeenCalledWith({
      where: { id: "r-1", status: "approved" },
      data: {
        status: "hidden",
        moderationReason: "Contains a phone number",
        moderatedAt: expect.any(Date),
        moderatedByAdminId: "adm-1",
      },
    });
    expect(ctx.audit).toHaveBeenCalledWith(ctx.tx, {
      before: { status: "approved", moderationReason: null },
      after: { status: "hidden", reason: "Contains a phone number" },
    });
    expect(ctx.tx.$queryRaw).not.toHaveBeenCalled();
    expect(ctx.ratingService.updateProductRatingStats).not.toHaveBeenCalled();
  });

  it("after commit clears the product caches (they embed seller ratings) and revalidates the seller's listing pages", async () => {
    const ctx = setup();

    await ctx.service.moderateUserRating(HIDE_USER, ctx.audit);

    expect(ctx.events).toEqual([
      "rating.update",
      "audit",
      "commit",
      "cache.delPattern products:detail:*",
      "cache.delPattern products:list:*",
      "web products:list,product:p-7,product:p-8",
    ]);
    expect(ctx.prisma.product.findMany).toHaveBeenCalledWith({
      where: { sellerId: "seller-1", status: "active" },
      select: { id: true },
      orderBy: { updatedAt: "desc" },
      take: SELLER_LISTING_REVALIDATE_LIMIT,
    });
  });

  it("refuses a hide without a reason with 400", async () => {
    const ctx = setup();

    await expect(
      ctx.service.moderateUserRating({ ...HIDE_USER, reason: "" }, ctx.audit),
    ).rejects.toMatchObject({
      response: { i18nKey: "server.admin.review.reasonRequired" },
    });
    expect(ctx.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("404 for an unknown rating", async () => {
    const ctx = setup({ userRow: null });

    await expect(
      ctx.service.moderateUserRating(HIDE_USER, ctx.audit),
    ).rejects.toMatchObject({
      constructor: NotFoundException,
      response: { i18nKey: "server.admin.review.notFound" },
    });
  });

  it("409 when the status changed concurrently", async () => {
    const ctx = setup();
    ctx.tx.rating.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      ctx.service.moderateUserRating(HIDE_USER, ctx.audit),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(ctx.audit).not.toHaveBeenCalled();
    expect(ctx.cache.delPattern).not.toHaveBeenCalled();
  });

  it("same status again is a no-op", async () => {
    const ctx = setup({
      userRow: {
        id: "r-1",
        status: "approved",
        moderationReason: null,
        moderatedAt: null,
        receiverId: "seller-1",
      },
    });

    const result = await ctx.service.moderateUserRating(
      { ratingId: "r-1", status: "approved", moderatorAdminId: "adm-1" },
      ctx.audit,
    );

    expect(result.changed).toBe(false);
    expect(ctx.tx.rating.updateMany).not.toHaveBeenCalled();
    expect(ctx.audit).not.toHaveBeenCalled();
    expect(ctx.cache.delPattern).not.toHaveBeenCalled();
  });
});
