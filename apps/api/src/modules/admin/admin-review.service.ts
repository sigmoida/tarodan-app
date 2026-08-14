import { Injectable, NotFoundException, Optional } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { StorageService } from "../storage/storage.service";
import { RatingService } from "../rating/rating.service";
import { AdminAuditService } from "./admin-audit.service";
import {
  fulltextProductRatingSearch,
  fulltextUserSearch,
} from "../../common/helpers/fulltext-search";
import { fulltextProductSearch } from "../product/helpers/fulltext-search";
import { AdminUserRatingQueryDto, RatingQueryDto, RatingStatus } from "./dto";
import { Prisma } from "@prisma/client";
import { dateRangeWhere, paginate, resolveOrderBy } from "../../common/list";

/**
 * Ürün yorumu ve satıcı puanı admin operasyonları — AdminService'in
 * REVIEWS & RATINGS bölümünden birebir taşındı. AdminService aynı
 * imzalarla buraya delege eder.
 */
@Injectable()
export class AdminReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ratingService: RatingService,
    private readonly audit: AdminAuditService,
    @Optional()
    private readonly storageService: StorageService,
  ) {}

  // AdminService'teki leaf yardımcı ile birebir aynıydı (bilinçli kopya,
  // emsal: admin-user.service.ts); facade'daki son kullanıcı bu bölüm
  // olduğundan oradaki kopya silindi.
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
   * Get product reviews
   */
  async getReviews(query: RatingQueryDto) {
    const { page = 1, limit = 20, status, productId, search } = query;

    const where: any = {};

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
      const conditions: any[] = [];
      if (ratingIds.length > 0) conditions.push({ id: { in: ratingIds } });
      if (userIds.length > 0) conditions.push({ userId: { in: userIds } });
      if (productIds.length > 0)
        conditions.push({ productId: { in: productIds } });
      const normalized = search.trim().toLowerCase();
      const numericScore = Number(search);
      if (Number.isInteger(numericScore))
        conditions.push({ score: numericScore });
      if (Object.values(RatingStatus).includes(normalized as RatingStatus))
        conditions.push({ status: normalized as RatingStatus });
      if (["true", "verified", "doğrulanmış", "onaylı"].includes(normalized))
        conditions.push({ isVerifiedPurchase: true });
      if (["false", "unverified", "doğrulanmamış"].includes(normalized))
        conditions.push({ isVerifiedPurchase: false });
      if (conditions.length === 0) {
        return { data: [], total: 0, page, limit, totalPages: 0 };
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
          product: { select: { id: true, title: true, images: { take: 1 } } },
        },
      },
      { page, limit },
    );

    const resolvedReviews = result.data.map((review: any) => ({
      ...review,
      product: review.product
        ? {
            ...review.product,
            images: (review.product.images || []).map((img: any) => ({
              ...img,
              url:
                this.resolveProductImageUrl(img.cardKey) ||
                this.resolveProductImageUrl(img.url) ||
                img.url,
            })),
          }
        : review.product,
    }));

    return { ...result, data: resolvedReviews };
  }

  /**
   * Update review status
   */
  async updateReviewStatus(
    adminId: string,
    reviewId: string,
    status: RatingStatus,
  ) {
    const review = await this.prisma.productRating.findUnique({
      where: { id: reviewId },
    });

    if (!review) {
      throw new NotFoundException("Yorum bulunamadı");
    }

    // Cast to any to avoid TS error if prisma client is not generated
    const updated = await this.prisma.productRating.update({
      where: { id: reviewId },
      data: { status } as any,
    });

    await this.audit.createAuditLog(
      adminId,
      "review_status_update",
      "Rating",
      reviewId,
      review,
      updated,
    );

    await this.ratingService.updateProductRatingStats(review.productId);

    return updated;
  }

  /**
   * Get seller (user) ratings for admin panel
   */
  async getUserRatings(query: AdminUserRatingQueryDto) {
    const search = query.search;
    const status = query.status;
    const where: Prisma.RatingWhereInput = {};

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
      if (Object.values(RatingStatus).includes(normalized as RatingStatus))
        where.OR.push({ status: normalized as RatingStatus });
    }
    if (status && ["pending", "approved", "rejected"].includes(status)) {
      where.status = status;
    }

    Object.assign(where, dateRangeWhere(query));

    const orderBy = resolveOrderBy<Prisma.RatingOrderByWithRelationInput>(
      "Rating",
      query,
      { defaultSort: { createdAt: "desc" } },
    );

    return paginate(
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
        },
      },
      query,
    );
  }
}
