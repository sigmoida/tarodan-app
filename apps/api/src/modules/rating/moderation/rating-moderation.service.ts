import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, ProductStatus, RatingStatus } from "@prisma/client";
import type { MessageKey } from "@tarodan/i18n";
import type { ReviewModerationStatus } from "@tarodan/types";
import { PrismaService } from "../../../prisma";
import { CacheService } from "../../cache/cache.service";
import { SearchIndexingService } from "../../search/indexing/search-indexing.service";
import { SentryService } from "../../sentry/sentry.service";
import { OutboxService } from "../../outbox/outbox.service";
import {
  OUTBOX_SEARCH_PRODUCT_REINDEX,
  searchProductReindexDedupeKey,
} from "../../outbox/outbox.types";
import { lockProductRow, RatingService } from "../rating.service";
import { i18nMessage } from "../../i18n";
import {
  normalizeModerationReason,
  ratingModerationData,
  type RatingModerationData,
} from "../helpers/rating-moderation.helper";
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
  /** False when nothing was written (the same status again: a double submit). */
  changed: boolean;
}

/**
 * Most listing pages of the rated user asked to revalidate after a user
 * rating changes visibility: their product pages show the seller's rating.
 * Pages past the cap refresh with the web ISR window (60 s).
 */
export const SELLER_LISTING_REVALIDATE_LIMIT = 200;

/** The columns a moderation reads, plus the key its refresh needs. */
type ModerationRow = {
  id: string;
  status: RatingStatus;
  moderationReason: string | null;
  moderatedAt: Date | null;
};

const MODERATION_SELECT = {
  id: true,
  status: true,
  moderationReason: true,
  moderatedAt: true,
} as const;

/** What differs between the two review tables. */
interface ModerationTarget<R extends ModerationRow> {
  kind: RatingModerationKind;
  notFoundKey: MessageKey;
  find(tx: Prisma.TransactionClient, id: string): Promise<R | null>;
  /** Compare-and-set on the status the row had; returns the rows changed. */
  update(
    tx: Prisma.TransactionClient,
    row: R,
    data: RatingModerationData,
  ): Promise<number>;
  /** Locks taken before the row update, when the visibility changes. */
  lock?(tx: Prisma.TransactionClient, row: R): Promise<void>;
  /** Writes after the row update, in the transaction, when the visibility changes. */
  afterUpdate?(
    tx: Prisma.TransactionClient,
    row: R,
    data: RatingModerationData,
  ): Promise<void>;
  /** After commit, when the visibility changed. */
  refresh(row: R, data: RatingModerationData): Promise<void>;
}

/**
 * Admin moderation of reviews: hide (`hidden`, with a reason) and show again
 * (`approved`), for product reviews and user ratings.
 *
 * - One transaction: compare-and-set on the status the row had, the
 *   moderation columns, the product counters (product reviews, under the
 *   product row lock) and the caller's audit entry. Two admins acting at
 *   once: the second gets 409.
 * - The same status again writes nothing (`changed: false`), except a hidden
 *   review hidden again with a different reason: that corrects the reason
 *   (audited), without touching visibility.
 * - After commit: the API caches and the web ISR pages that show the review
 *   or its aggregates (best effort: both expire on their own), and the
 *   product's search document through the outbox (lossless: it has no TTL).
 *   The trust score follows at the next nightly run (ADR 0014).
 */
@Injectable()
export class RatingModerationService {
  private readonly logger = new Logger(RatingModerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ratingService: RatingService,
    private readonly cache: CacheService,
    private readonly searchIndexing: SearchIndexingService,
    private readonly outbox: OutboxService,
    private readonly sentry: SentryService,
  ) {}

  moderateProductRating(
    input: RatingModerationInput,
    audit: RatingModerationAuditWriter,
  ): Promise<RatingModerationResult> {
    type Row = ModerationRow & { productId: string };
    return this.moderate<Row>(
      {
        kind: "product",
        notFoundKey: "server.rating.reviewNotFound",
        find: (tx, id) =>
          tx.productRating.findUnique({
            where: { id },
            select: { ...MODERATION_SELECT, productId: true },
          }),
        update: async (tx, row, data) =>
          (
            await tx.productRating.updateMany({
              where: { id: row.id, status: row.status },
              data,
            })
          ).count,
        // Lock order product -> review: a concurrent recompute of the same
        // product (another moderation, a new review) waits for this commit.
        lock: (tx, row) => lockProductRow(tx, row.productId),
        afterUpdate: async (tx, row, data) => {
          await this.ratingService.updateProductRatingStats(row.productId, tx);
          await this.outbox.enqueue(tx, {
            type: OUTBOX_SEARCH_PRODUCT_REINDEX,
            payload: { productId: row.productId },
            dedupeKey: reindexKey(row, data),
          });
        },
        refresh: (row, data) => this.refreshProduct(row, data),
      },
      input,
      audit,
    );
  }

  moderateUserRating(
    input: RatingModerationInput,
    audit: RatingModerationAuditWriter,
  ): Promise<RatingModerationResult> {
    type Row = ModerationRow & { receiverId: string };
    return this.moderate<Row>(
      {
        kind: "user",
        notFoundKey: "server.admin.review.notFound",
        find: (tx, id) =>
          tx.rating.findUnique({
            where: { id },
            select: { ...MODERATION_SELECT, receiverId: true },
          }),
        update: async (tx, row, data) =>
          (
            await tx.rating.updateMany({
              where: { id: row.id, status: row.status },
              data,
            })
          ).count,
        refresh: (row) => this.refreshRatedUser(row.receiverId),
      },
      input,
      audit,
    );
  }

  private async moderate<R extends ModerationRow>(
    target: ModerationTarget<R>,
    input: RatingModerationInput,
    audit: RatingModerationAuditWriter,
  ): Promise<RatingModerationResult> {
    const reason = normalizeModerationReason(input.status, input.reason);
    const outcome = await this.prisma.$transaction(async (tx) => {
      const before = await target.find(tx, input.ratingId);
      if (!before) {
        throw new NotFoundException(i18nMessage(target.notFoundKey));
      }
      const visibilityChanges = before.status !== input.status;
      const reasonCorrected =
        input.status === RatingStatus.hidden &&
        reason !== before.moderationReason;
      if (!visibilityChanges && !reasonCorrected) {
        return { changed: false, visibilityChanges, row: before, data: null };
      }
      if (visibilityChanges) await target.lock?.(tx, before);
      const data = ratingModerationData(
        input.status,
        reason,
        input.moderatorAdminId,
        new Date(),
      );
      if ((await target.update(tx, before, data)) !== 1) {
        throw new ConflictException(
          i18nMessage("server.admin.review.statusChanged"),
        );
      }
      if (visibilityChanges) await target.afterUpdate?.(tx, before, data);
      await audit(tx, {
        before: {
          status: before.status,
          moderationReason: before.moderationReason,
        },
        after: { status: input.status, reason },
      });
      return {
        changed: true,
        visibilityChanges,
        row: { ...before, ...data },
        data,
      };
    });

    this.trace(target.kind, input, outcome.changed);
    if (outcome.visibilityChanges && outcome.data) {
      const { row, data } = outcome;
      await this.afterCommit(target.kind, input.ratingId, () =>
        target.refresh(row, data),
      );
    }
    return {
      success: true,
      id: outcome.row.id,
      status: outcome.row.status,
      moderationReason: outcome.row.moderationReason,
      moderatedAt: outcome.row.moderatedAt,
      changed: outcome.changed,
    };
  }

  /**
   * A product review shows on the product page and its counters on every
   * card and list. The API caches go first, so the web, asked to revalidate
   * next, fetches fresh data. The search re-index queued in the transaction
   * runs now; if it fails, the outbox drainer retries it.
   */
  private async refreshProduct(
    row: { id: string; productId: string },
    data: RatingModerationData,
  ): Promise<void> {
    await this.cache.del(`products:detail:${row.productId}`);
    await this.cache.delPattern("products:list:*");
    await this.outbox.runInline(this.prisma, reindexKey(row, data), () =>
      this.searchIndexing.queueIndexProduct(row.productId),
    );
    void notifyWebRevalidate(productListTags([row.productId]));
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
   * turn the response into an error: the caches expire on their own (TTL,
   * ISR) and the search re-index stays queued in the outbox.
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

/** One outbox row per visibility change of one review. */
const reindexKey = (
  row: { id: string; productId: string },
  data: RatingModerationData,
): string =>
  searchProductReindexDedupeKey(
    row.productId,
    `review:${row.id}:${data.moderatedAt.toISOString()}`,
  );
