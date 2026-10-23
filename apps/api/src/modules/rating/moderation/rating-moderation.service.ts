import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, ProductStatus, RatingStatus } from "@prisma/client";
import type { ReviewModerationStatus } from "@tarodan/types";
import { PrismaService } from "../../../prisma";
import { CacheService } from "../../cache/cache.service";
import { SearchService } from "../../search/search.service";
import { SentryService } from "../../sentry/sentry.service";
import { RatingService } from "../rating.service";
import { i18nMessage } from "../../i18n";
import {
  normalizeModerationReason,
  ratingModerationData,
} from "../helpers/rating-moderation.helper";
import { refreshProductVisibility } from "../../product/helpers/product-visibility";
import {
  notifyWebRevalidate,
  productListTags,
} from "../../../common/helpers/revalidate";
import { errorMessage } from "../../../common/helpers/error-message";

/** Which review table a moderation targets. */
export type RatingModerationKind = "product" | "user";

export interface RatingModerationInput {
  ratingId: string;
  status: ReviewModerationStatus;
  /** Required (5-500) to hide; an optional audit note to show again. */
  reason?: string | null;
  /** `admin_users.id` of the moderator (not the user id). */
  moderatorAdminId: string;
}

/**
 * The change the caller records in its audit entry. No review text: the row
 * keeps it, and the audit log must not become a second copy of user content.
 */
export interface RatingModerationChange {
  before: { status: RatingStatus; moderationReason: string | null };
  after: { status: RatingStatus; reason: string | null };
}

/**
 * Writes the caller's audit entry inside the moderation transaction, so a
 * status change without its audit row cannot commit.
 */
export type RatingModerationAuditWriter = (
  tx: Prisma.TransactionClient,
  change: RatingModerationChange,
) => Promise<unknown>;

export interface RatingModerationResult {
  success: true;
  id: string;
  status: RatingStatus;
  moderationReason: string | null;
  moderatedAt: Date | null;
  /** False when the review already had the status (double submit): nothing was written. */
  changed: boolean;
}

/** The columns a moderation reads back, plus the key its refresh needs. */
const MODERATION_SELECT = {
  id: true,
  status: true,
  moderationReason: true,
  moderatedAt: true,
} as const;

/**
 * Most listing pages of the rated user asked to revalidate after a user
 * rating changes visibility: their product pages show the seller's rating.
 * Pages past the cap refresh with the web ISR window (60 s).
 */
export const SELLER_LISTING_REVALIDATE_LIMIT = 200;

type ModerationRow = Prisma.ProductRatingGetPayload<{
  select: typeof MODERATION_SELECT;
}>;

/**
 * Admin moderation of reviews: hide (`hidden`, with a reason) and show again
 * (`approved`), for product reviews and user ratings.
 *
 * - One transaction: compare-and-set on the status the row had, the
 *   moderation columns, the product counters (product reviews) and the
 *   caller's audit entry. Two admins acting at once: the second gets 409.
 * - The same status again (double submit) writes nothing and returns
 *   `changed: false`.
 * - After commit: the API caches, the search document and the web ISR pages
 *   that show the review or its aggregates. The trust score follows at the
 *   next nightly run (ADR 0014).
 */
@Injectable()
export class RatingModerationService {
  private readonly logger = new Logger(RatingModerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ratingService: RatingService,
    private readonly cache: CacheService,
    private readonly search: SearchService,
    private readonly sentry: SentryService,
  ) {}

  async moderateProductRating(
    input: RatingModerationInput,
    audit: RatingModerationAuditWriter,
  ): Promise<RatingModerationResult> {
    const reason = normalizeModerationReason(input.status, input.reason);
    const outcome = await this.prisma.$transaction(async (tx) => {
      const before = await tx.productRating.findUnique({
        where: { id: input.ratingId },
        select: { ...MODERATION_SELECT, productId: true },
      });
      if (!before) {
        throw new NotFoundException(
          i18nMessage("server.rating.reviewNotFound"),
        );
      }
      if (before.status === input.status) {
        return { changed: false, row: before };
      }
      // Lock order product -> review: a second moderation of the same
      // product waits here, so its counter recompute sees this one's commit.
      await tx.$queryRaw`SELECT id FROM "products" WHERE id = ${before.productId} FOR UPDATE`;
      const data = ratingModerationData(
        input.status,
        reason,
        input.moderatorAdminId,
        new Date(),
      );
      const { count } = await tx.productRating.updateMany({
        where: { id: before.id, status: before.status },
        data,
      });
      if (count !== 1) {
        throw new ConflictException(
          i18nMessage("server.admin.review.statusChanged"),
        );
      }
      await this.ratingService.updateProductRatingStats(before.productId, tx);
      await audit(tx, changeOf(before, input.status, reason));
      return { changed: true, row: { ...before, ...data } };
    });

    this.trace("product", input, outcome.changed);
    if (outcome.changed) {
      await this.afterCommit("product", input.ratingId, () =>
        refreshProductVisibility(
          {
            cache: this.cache,
            searchService: this.search,
            logger: this.logger,
          },
          [outcome.row.productId],
        ),
      );
    }
    return toResult(outcome.row, outcome.changed);
  }

  async moderateUserRating(
    input: RatingModerationInput,
    audit: RatingModerationAuditWriter,
  ): Promise<RatingModerationResult> {
    const reason = normalizeModerationReason(input.status, input.reason);
    const outcome = await this.prisma.$transaction(async (tx) => {
      const before = await tx.rating.findUnique({
        where: { id: input.ratingId },
        select: { ...MODERATION_SELECT, receiverId: true },
      });
      if (!before) {
        throw new NotFoundException(
          i18nMessage("server.admin.review.notFound"),
        );
      }
      if (before.status === input.status) {
        return { changed: false, row: before };
      }
      const data = ratingModerationData(
        input.status,
        reason,
        input.moderatorAdminId,
        new Date(),
      );
      const { count } = await tx.rating.updateMany({
        where: { id: before.id, status: before.status },
        data,
      });
      if (count !== 1) {
        throw new ConflictException(
          i18nMessage("server.admin.review.statusChanged"),
        );
      }
      await audit(tx, changeOf(before, input.status, reason));
      return { changed: true, row: { ...before, ...data } };
    });

    this.trace("user", input, outcome.changed);
    if (outcome.changed) {
      await this.afterCommit("user", input.ratingId, () =>
        this.refreshRatedUser(outcome.row.receiverId),
      );
    }
    return toResult(outcome.row, outcome.changed);
  }

  /**
   * A user rating feeds the seller block of every product response (average
   * and count, `ProductCommonService`), so the product caches go, like on a
   * new rating. The seller page is client-rendered (no ISR); the web product
   * pages of the rated user's active listings are revalidated, up to a cap.
   */
  private async refreshRatedUser(receiverId: string): Promise<void> {
    await this.cache.delPattern("products:detail:*");
    await this.cache.delPattern("products:list:*");
    const listings = await this.prisma.product.findMany({
      where: { sellerId: receiverId, status: ProductStatus.active },
      select: { id: true },
      orderBy: { updatedAt: "desc" },
      take: SELLER_LISTING_REVALIDATE_LIMIT,
    });
    void notifyWebRevalidate(productListTags(listings.map(({ id }) => id)));
  }

  /**
   * Post-commit refresh. The change is committed, so a failure here must not
   * turn the response into an error: caches expire on their own (TTL, ISR).
   */
  private async afterCommit(
    kind: RatingModerationKind,
    ratingId: string,
    refresh: () => Promise<void>,
  ): Promise<void> {
    try {
      await refresh();
    } catch (err) {
      this.logger.warn(
        `Review moderation refresh failed (${kind} ${ratingId}): ${errorMessage(err)}`,
      );
      this.sentry.captureException(
        err instanceof Error ? err : new Error(errorMessage(err)),
        { flow: "review.moderation", kind, ratingId },
      );
    }
  }

  /** Ids and the status only: never the review text or the reason. */
  private trace(
    kind: RatingModerationKind,
    input: RatingModerationInput,
    changed: boolean,
  ): void {
    this.sentry.addBreadcrumb({
      category: "review.moderation",
      message: `${kind} review set to ${input.status}`,
      level: "info",
      data: {
        kind,
        ratingId: input.ratingId,
        status: input.status,
        changed,
      },
    });
  }
}

function changeOf(
  before: Pick<ModerationRow, "status" | "moderationReason">,
  status: ReviewModerationStatus,
  reason: string | null,
): RatingModerationChange {
  return {
    before: {
      status: before.status,
      moderationReason: before.moderationReason,
    },
    after: { status, reason },
  };
}

function toResult(
  row: ModerationRow,
  changed: boolean,
): RatingModerationResult {
  return {
    success: true,
    id: row.id,
    status: row.status,
    moderationReason: row.moderationReason,
    moderatedAt: row.moderatedAt,
    changed,
  };
}
