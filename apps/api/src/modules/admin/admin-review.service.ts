import { Injectable, NotFoundException, Optional } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { StorageService } from "../storage/storage.service";
import { RatingService } from "../rating/rating.service";
import { AdminAuditService } from "./admin-audit.service";
import {
  fulltextProductRatingSearch,
  fulltextUserDisplayNameSearch,
} from "../../common/helpers/fulltext-search";
import { fulltextProductSearch } from "../product/helpers/fulltext-search";
import { AdminUserRatingQueryDto, RatingQueryDto, RatingStatus } from "./dto";
import { Prisma } from "@prisma/client";
import { paginate, resolveOrderBy } from "../../common/list";

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
    const { page = 1, limit = 20, status, productId, search, sortBy } = query;

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
        fulltextUserDisplayNameSearch(this.prisma, search),
        fulltextProductSearch(this.prisma, search),
      ]);
      const conditions: any[] = [];
      if (ratingIds.length > 0) conditions.push({ id: { in: ratingIds } });
      if (userIds.length > 0) conditions.push({ userId: { in: userIds } });
      if (productIds.length > 0)
        conditions.push({ productId: { in: productIds } });
      if (conditions.length === 0) {
        return { data: [], total: 0, page, limit, totalPages: 0 };
      }
      where.OR = conditions;
    }

    const orderBy: any = {};
    if (sortBy === "newest") orderBy.createdAt = "desc";
    else if (sortBy === "oldest") orderBy.createdAt = "asc";
    else if (sortBy === "highest_score") orderBy.score = "desc";
    else if (sortBy === "lowest_score") orderBy.score = "asc";
    else orderBy.createdAt = "desc";

    const [total, reviews] = await Promise.all([
      this.prisma.productRating.count({ where }),
      this.prisma.productRating.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
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
      }),
    ]);

    const resolvedReviews = reviews.map((review: any) => ({
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

    return {
      data: resolvedReviews,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
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
      where.OR = [
        { giver: { displayName: { contains: search, mode: "insensitive" } } },
        {
          receiver: { displayName: { contains: search, mode: "insensitive" } },
        },
        { comment: { contains: search, mode: "insensitive" } },
      ];
    }
    if (status && ["pending", "approved", "rejected"].includes(status)) {
      where.status = status;
    }

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
          giver: { select: { id: true, displayName: true, email: true } },
          receiver: { select: { id: true, displayName: true, email: true } },
        },
      },
      query,
    );
  }
}
