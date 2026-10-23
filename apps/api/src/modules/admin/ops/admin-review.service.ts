import { Injectable, Optional } from "@nestjs/common";
import { PrismaService } from "../../../prisma";
import { StorageService } from "../../storage/storage.service";
import {
  RatingModerationService,
  type RatingModerationResult,
} from "../../rating/moderation/rating-moderation.service";
import { AdminAuditService } from "./admin-audit.service";
import {
  fulltextProductRatingSearch,
  fulltextUserSearch,
} from "../../../common/helpers/fulltext-search";
import { fulltextProductSearch } from "../../product/helpers/fulltext-search";
import {
  AdminUserRatingQueryDto,
  RatingQueryDto,
  UpdateRatingStatusDto,
} from "../dto";
import { Prisma, RatingStatus } from "@prisma/client";
import { dateRangeWhere, paginate, resolveOrderBy } from "../../../common/list";

/** The moderator as the admin lists show it. */
const MODERATED_BY_SELECT = {
  select: { id: true, user: { select: { displayName: true } } },
} as const;

type ModeratedByRow = {
  id: string;
  user: { displayName: string };
} | null;

const moderatedByView = (row: ModeratedByRow) =>
  row ? { id: row.id, displayName: row.user.displayName } : null;

/**
 * Admin operations on product reviews and user (seller) ratings: the two
 * lists and the moderation (hide / show again). AdminService delegates here
 * with the same signatures. The moderation write itself lives in the rating
 * domain (`RatingModerationService`); this service adds the admin, the
 * required audit entry and the entity type.
 */
@Injectable()
export class AdminReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ratingModeration: RatingModerationService,
    private readonly audit: AdminAuditService,
    @Optional()
    private readonly storageService: StorageService,
  ) {}

  private resolveProductImageUrl(
    imageKeyOrUrl: string | null | undefined,
  ): string | null {
    if (!imageKeyOrUrl) return null;
    // Strip expired presigned S3 query params to get the clean public URL
    if (
      (imageKeyOrUrl.startsWith("http://") ||
        imageKeyOrUrl.startsWith("https://")) &&
      imageKeyOrUrl.includes("X-Amz-Signature")
    ) {
      try {
        const parsed = new URL(imageKeyOrUrl);
        parsed.search = "";
        return parsed.toString();
      } catch {
        // fall through
      }
    }
    if (
      imageKeyOrUrl.startsWith("http://") ||
      imageKeyOrUrl.startsWith("https://") ||
      imageKeyOrUrl.startsWith("/")
    )
      return imageKeyOrUrl;
    // Try to resolve any non-URL string as an S3 key (covers dev/, prod/, and other prefixes)
    if (this.storageService) {
      return this.storageService.getPublicAssetUrl(imageKeyOrUrl) ?? null;
    }
    return null;
  }

  // ==================== REVIEWS & RATINGS ====================

  /**
   * Product reviews for the admin list. `id` opens one review (deep link from
   * a review report); `status` filters by any stored status, legacy ones too.
   */
  async getReviews(query: RatingQueryDto) {
    const { page = 1, limit = 20, status, productId, search, id } = query;

    const where: Prisma.ProductRatingWhereInput = {};

    if (id) {
      where.id = id;
    }

    if (status) {
      where.status = status;
    }

    if (productId) {
      where.productId = productId;
    }

    if (search) {
      const [ratingIds, userIds, productIds] = await Promise.all([
        fulltextProductRatingSearch(this.prisma, search),
        fulltextUserSearch(this.prisma, search),
        fulltextProductSearch(this.prisma, search),
      ]);
      const conditions: Prisma.ProductRatingWhereInput[] = [];
      if (ratingIds.length > 0) conditions.push({ id: { in: ratingIds } });
      if (userIds.length > 0) conditions.push({ userId: { in: userIds } });
      if (productIds.length > 0)
        conditions.push({ productId: { in: productIds } });
      const normalized = search.trim().toLowerCase();
      const numericScore = Number(search);
      if (Number.isInteger(numericScore))
        conditions.push({ score: numericScore });
      if (isRatingStatus(normalized)) conditions.push({ status: normalized });
      if (["true", "verified", "doğrulanmış", "onaylı"].includes(normalized))
        conditions.push({ isVerifiedPurchase: true });
      if (["false", "unverified", "doğrulanmamış"].includes(normalized))
        conditions.push({ isVerifiedPurchase: false });
      if (conditions.length === 0) {
        // The standard list envelope, like every other answer of this list.
        return { data: [], meta: { total: 0, page, limit, totalPages: 0 } };
      }
      where.OR = conditions;
    }

    Object.assign(where, dateRangeWhere(query));

    const orderBy =
      resolveOrderBy<Prisma.ProductRatingOrderByWithRelationInput>(
        "ProductRating",
        query,
        {
          defaultSort: { createdAt: "desc" },
          // Legacy preset keys still work; standard column keys (score, status,
          // product.title, user.displayName, …) resolve via the DMMF.
          sortMap: {
            newest: () => ({ createdAt: "desc" }),
            oldest: () => ({ createdAt: "asc" }),
            highest_score: () => ({ score: "desc" }),
            lowest_score: () => ({ score: "asc" }),
          },
        },
      );

    const result = await paginate(
      this.prisma.productRating,
      {
        where,
        orderBy,
        include: {
          user: {
            select: {
              id: true,
              displayName: true,
              email: true,
              avatarUrl: true,
            },
          },
          product: {
            select: {
              id: true,
              title: true,
              sellerId: true,
              images: { take: 1 },
            },
          },
          moderatedBy: MODERATED_BY_SELECT,
        },
      },
      { page, limit },
    );

    // The detail drawer draws without another endpoint: full text (`review`,
    // `title`), admin reply (`adminReply`), review images (resolved URLs), the
    // order / product / seller link ids and the last moderation are on the row.
    const orderNumbers = await this.orderNumbersOf(
      result.data.map((review) => review.orderId),
    );
    const resolvedReviews = result.data.map(({ moderatedBy, ...review }) => ({
      ...review,
      moderatedBy: moderatedByView(moderatedBy),
      images: (review.images ?? []).map(
        (image) => this.resolveProductImageUrl(image) ?? image,
      ),
      orderNumber: orderNumbers.get(review.orderId) ?? null,
      sellerId: review.product?.sellerId ?? null,
      product: review.product
        ? {
            ...review.product,
            // A product image has only storage keys (no `url` column);
            // the card variant is the thumbnail.
            images: (review.product.images || []).map((img) => ({
              ...img,
              url: this.resolveProductImageUrl(img.cardKey),
            })),
          }
        : review.product,
    }));

    return { ...result, data: resolvedReviews };
  }

  /** The order numbers of the page's reviews: one query (no N+1). */
  private async orderNumbersOf(
    orderIds: ReadonlyArray<string | null>,
  ): Promise<Map<string, string>> {
    const ids = [...new Set(orderIds.filter((id): id is string => !!id))];
    if (ids.length === 0) return new Map();
    const orders = await this.prisma.order.findMany({
      where: { id: { in: ids } },
      select: { id: true, orderNumber: true },
    });
    return new Map(orders.map((order) => [order.id, order.orderNumber]));
  }

  /**
   * Hide (`hidden`, reason required) or show again (`approved`) a product
   * review. Audited fail-closed in the same transaction as entity
   * `ProductRating`; the counters, caches and web pages follow.
   */
  async updateReviewStatus(
    adminUserId: string,
    reviewId: string,
    dto: UpdateRatingStatusDto,
  ): Promise<RatingModerationResult> {
    const moderatorAdminId = await this.audit.resolveActiveAdminId(adminUserId);
    return this.ratingModeration.moderateProductRating(
      {
        ratingId: reviewId,
        status: dto.status,
        reason: dto.reason,
        moderatorAdminId,
      },
      (tx, change) =>
        this.audit.createRequiredAuditLog(
          adminUserId,
          "review_status_update",
          "ProductRating",
          reviewId,
          change.before,
          change.after,
          tx,
        ),
    );
  }

  /**
   * Hide or show again a user (seller) rating; same rules as a product
   * review, audited as entity `Rating`.
   */
  async updateUserRatingStatus(
    adminUserId: string,
    ratingId: string,
    dto: UpdateRatingStatusDto,
  ): Promise<RatingModerationResult> {
    const moderatorAdminId = await this.audit.resolveActiveAdminId(adminUserId);
    return this.ratingModeration.moderateUserRating(
      {
        ratingId,
        status: dto.status,
        reason: dto.reason,
        moderatorAdminId,
      },
      (tx, change) =>
        this.audit.createRequiredAuditLog(
          adminUserId,
          "user_rating_status_update",
          "Rating",
          ratingId,
          change.before,
          change.after,
          tx,
        ),
    );
  }

  /**
   * User (seller) ratings for the admin list; `id` and `status` filter like
   * the product review list.
   */
  async getUserRatings(query: AdminUserRatingQueryDto) {
    const { search, status, id } = query;
    const where: Prisma.RatingWhereInput = {};

    if (id) {
      where.id = id;
    }

    if (search) {
      const normalized = search.trim().toLowerCase();
      const numericScore = Number(search);
      where.OR = [
        { giver: { displayName: { contains: search, mode: "insensitive" } } },
        { giver: { email: { contains: search, mode: "insensitive" } } },
        {
          receiver: { displayName: { contains: search, mode: "insensitive" } },
        },
        { receiver: { email: { contains: search, mode: "insensitive" } } },
        { comment: { contains: search, mode: "insensitive" } },
        { orderId: { contains: search, mode: "insensitive" } },
        { tradeId: { contains: search, mode: "insensitive" } },
      ];
      if (Number.isInteger(numericScore))
        where.OR.push({ score: numericScore });
      if (isRatingStatus(normalized)) where.OR.push({ status: normalized });
    }
    if (status) {
      where.status = status;
    }

    Object.assign(where, dateRangeWhere(query));

    const orderBy = resolveOrderBy<Prisma.RatingOrderByWithRelationInput>(
      "Rating",
      query,
      { defaultSort: { createdAt: "desc" } },
    );

    const result = await paginate(
      this.prisma.rating,
      {
        where,
        orderBy,
        include: {
          giver: {
            select: {
              id: true,
              displayName: true,
              email: true,
              avatarUrl: true,
            },
          },
          receiver: {
            select: {
              id: true,
              displayName: true,
              email: true,
              avatarUrl: true,
            },
          },
          moderatedBy: MODERATED_BY_SELECT,
        },
      },
      query,
    );

    // A user rating has no images or admin reply; the full `comment` is on
    // the row. The drawer links the order / trade by its number.
    const [orderNumbers, tradeNumbers] = await Promise.all([
      this.orderNumbersOf(result.data.map((rating) => rating.orderId)),
      this.tradeNumbersOf(result.data.map((rating) => rating.tradeId)),
    ]);
    return {
      ...result,
      data: result.data.map(({ moderatedBy, ...rating }) => ({
        ...rating,
        moderatedBy: moderatedByView(moderatedBy),
        orderNumber: rating.orderId
          ? (orderNumbers.get(rating.orderId) ?? null)
          : null,
        tradeNumber: rating.tradeId
          ? (tradeNumbers.get(rating.tradeId) ?? null)
          : null,
      })),
    };
  }

  /** The trade numbers of the page's ratings: one query (no N+1). */
  private async tradeNumbersOf(
    tradeIds: ReadonlyArray<string | null>,
  ): Promise<Map<string, string>> {
    const ids = [...new Set(tradeIds.filter((id): id is string => !!id))];
    if (ids.length === 0) return new Map();
    const trades = await this.prisma.trade.findMany({
      where: { id: { in: ids } },
      select: { id: true, tradeNumber: true },
    });
    return new Map(trades.map((trade) => [trade.id, trade.tradeNumber]));
  }
}

/** A search term that names a stored status (`hidden`, `approved`, ...). */
function isRatingStatus(value: string): value is RatingStatus {
  return (Object.values(RatingStatus) as string[]).includes(value);
}
