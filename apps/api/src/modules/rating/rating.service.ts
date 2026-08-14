import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { OrderStatus, RatingStatus, TradeStatus, Prisma } from "@prisma/client";
import {
  CreateUserRatingDto,
  CreateProductRatingDto,
  UserRatingResponseDto,
  ProductRatingResponseDto,
  UserRatingStatsDto,
  ProductRatingStatsDto,
} from "./dto";
import { CacheService } from "../cache/cache.service";
import { NotificationService } from "../notification/notification.service";
import { NotificationType } from "../notification/dto";
import { StorageService } from "../storage/storage.service";
import { ModerationAiClient } from "../moderation/moderation-ai.client";
import {
  publicProductRatingWhere,
  publicUserRatingWhere,
} from "../../common/helpers/public-rating";
import {
  PUBLIC_NAME_SELECT,
  publicIdentityFields,
  publicName,
} from "../../common/helpers/public-identity";
import { i18nMessage } from "../i18n";

@Injectable()
export class RatingService {
  private readonly logger = new Logger(RatingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly notificationService: NotificationService,
    private readonly storageService: StorageService,
    private readonly moderationAi: ModerationAiClient,
  ) {}

  /** Yorum metni küfür/uygunsuz mu kontrol et — uygunsuzsa engelle + event log'a yaz. */
  private async assertCleanComment(
    comment?: string | null,
    ctx?: { entityType: string; entityId?: string; userId?: string },
  ): Promise<void> {
    if (!comment?.trim() || !this.moderationAi.isEnabled) return;
    await this.moderationAi.assertTextClean(
      comment,
      ctx ? { ...ctx, field: "comment", label: "yorum" } : undefined,
    );
  }

  private async resolveAvatarUrl(
    avatarUrl: string | null | undefined,
  ): Promise<string | null> {
    if (!avatarUrl) return null;
    if (avatarUrl.startsWith("http://") || avatarUrl.startsWith("https://"))
      return avatarUrl;
    if (this.storageService) {
      try {
        return await this.storageService.getPresignedDownloadUrl(
          "avatars",
          avatarUrl,
          86400,
        );
      } catch {
        return null;
      }
    }
    return null;
  }

  // ==========================================================================
  // CREATE USER RATING
  // ==========================================================================
  async createUserRating(
    giverId: string,
    dto: CreateUserRatingDto,
  ): Promise<UserRatingResponseDto> {
    // Cannot rate yourself
    if (giverId === dto.receiverId) {
      throw new BadRequestException(i18nMessage("server.rating.rateSelf"));
    }

    // Verify receiver exists
    const receiver = await this.prisma.user.findUnique({
      where: { id: dto.receiverId },
    });

    if (!receiver) {
      throw new NotFoundException(i18nMessage("server.auth.userNotFound"));
    }

    // Must have either orderId or tradeId
    if (!dto.orderId && !dto.tradeId) {
      throw new BadRequestException(
        i18nMessage("server.rating.orderOrTradeRequired"),
      );
    }

    // Yorum metni denetimi (küfür/uygunsuz) — event log'a yaz
    await this.assertCleanComment(dto.comment, {
      entityType: "user",
      entityId: dto.receiverId,
      userId: giverId,
    });

    // Verify transaction
    if (dto.orderId) {
      const order = await this.prisma.order.findUnique({
        where: { id: dto.orderId },
      });

      if (!order) {
        throw new NotFoundException(i18nMessage("server.order.notFound"));
      }

      // Üyelik/dijital siparişler (sanal ürün + platform satıcısı) puanlanamaz
      if (order.orderNumber?.startsWith("MEM-")) {
        throw new BadRequestException(
          i18nMessage("server.rating.membershipOrder"),
        );
      }

      // Allow rating only for delivered or completed orders (must receive before rating)
      const allowedStatuses: OrderStatus[] = [
        OrderStatus.completed,
        OrderStatus.delivered,
      ];
      if (!allowedStatuses.includes(order.status)) {
        throw new BadRequestException(
          i18nMessage("server.rating.deliveredOnly"),
        );
      }

      // Giver must be buyer or seller
      if (order.buyerId !== giverId && order.sellerId !== giverId) {
        throw new ForbiddenException(
          i18nMessage("server.rating.orderForbidden"),
        );
      }

      // Receiver must be the other party
      if (
        (order.buyerId === giverId && order.sellerId !== dto.receiverId) ||
        (order.sellerId === giverId && order.buyerId !== dto.receiverId)
      ) {
        throw new BadRequestException(
          i18nMessage("server.rating.invalidRecipient"),
        );
      }

      // Check if already rated
      const existingRating = await this.prisma.rating.findUnique({
        where: { giverId_orderId: { giverId, orderId: dto.orderId } },
      });

      if (existingRating) {
        throw new BadRequestException(
          i18nMessage("server.rating.orderAlreadyRated"),
        );
      }
    }

    if (dto.tradeId) {
      const trade = await this.prisma.trade.findUnique({
        where: { id: dto.tradeId },
      });

      if (!trade) {
        throw new NotFoundException(i18nMessage("server.trade.notFound"));
      }

      if (trade.status !== TradeStatus.completed) {
        throw new BadRequestException(
          i18nMessage("server.rating.completedTradesOnly"),
        );
      }

      // Giver must be initiator or receiver
      if (trade.initiatorId !== giverId && trade.receiverId !== giverId) {
        throw new ForbiddenException(
          i18nMessage("server.rating.tradeForbidden"),
        );
      }

      // Receiver must be the other party
      if (
        (trade.initiatorId === giverId &&
          trade.receiverId !== dto.receiverId) ||
        (trade.receiverId === giverId && trade.initiatorId !== dto.receiverId)
      ) {
        throw new BadRequestException(
          i18nMessage("server.rating.invalidRecipient"),
        );
      }

      // Check if already rated
      const existingRating = await this.prisma.rating.findUnique({
        where: { giverId_tradeId: { giverId, tradeId: dto.tradeId } },
      });

      if (existingRating) {
        throw new BadRequestException(
          i18nMessage("server.rating.tradeAlreadyRated"),
        );
      }
    }

    let rating;
    try {
      rating = await this.prisma.rating.create({
        data: {
          giverId,
          receiverId: dto.receiverId,
          orderId: dto.orderId,
          tradeId: dto.tradeId,
          score: dto.score,
          comment: dto.comment,
          // Post-moderasyon: değerlendirme anında yayınlanır (profilde hemen görünür),
          // admin uygunsuzsa panelden kaldırabilir/rejected yapabilir.
          status: RatingStatus.approved,
        },
        include: {
          giver: {
            select: { id: true, ...PUBLIC_NAME_SELECT, avatarUrl: true },
          },
          receiver: { select: { id: true, ...PUBLIC_NAME_SELECT } },
        },
      });
    } catch (e) {
      // Eşzamanlı ikinci puan: unique (giverId, orderId/tradeId) ihlali → 500 yerine
      // temiz 409. Var-olan kontrolü ile yarışı kaybeden istek buraya düşer.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        throw new ConflictException(i18nMessage("server.rating.alreadyRated"));
      }
      throw e;
    }

    // Invalidate product caches for this seller (receiver) so rating updates show
    await this.cache.delPattern(`products:detail:*`);
    await this.cache.delPattern(`products:list:*`);

    // Send notification to the receiver about the new review
    try {
      await this.notificationService.createInAppNotification(
        dto.receiverId,
        NotificationType.REVIEW_RECEIVED,
        {
          reviewerName: publicName(rating.giver),
          score: dto.score,
          orderId: dto.orderId,
          tradeId: dto.tradeId,
        },
      );
      await this.notificationService.sendTemplateEmailToUser(
        dto.receiverId,
        "review-received-seller",
        {
          sellerName: publicName(rating.receiver),
          reviewerName: publicName(rating.giver),
          rating: dto.score,
          comment: dto.comment || undefined,
        },
      );
    } catch (error) {
      // Don't fail if notification fails
      this.logger.warn("Failed to send review notification");
    }

    return this.mapUserRatingToDto(rating);
  }

  // ==========================================================================
  // CREATE PRODUCT RATING
  // ==========================================================================
  async createProductRating(
    userId: string,
    dto: CreateProductRatingDto,
  ): Promise<ProductRatingResponseDto> {
    // Verify order and ownership
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: { product: true },
    });

    if (!order) {
      throw new NotFoundException(i18nMessage("server.order.notFound"));
    }

    // Üyelik/dijital siparişler (sanal ürün + platform satıcısı) puanlanamaz
    if (order.orderNumber?.startsWith("MEM-")) {
      throw new BadRequestException(
        i18nMessage("server.rating.membershipOrder"),
      );
    }

    if (order.buyerId !== userId) {
      throw new ForbiddenException(i18nMessage("server.rating.buyerOnly"));
    }

    if (order.productId !== dto.productId) {
      throw new BadRequestException(
        i18nMessage("server.rating.productMismatch"),
      );
    }

    // Yorum metni denetimi (başlık + yorum, küfür/uygunsuz) — event log'a yaz
    await this.assertCleanComment(`${dto.title ?? ""} ${dto.review ?? ""}`, {
      entityType: "product",
      entityId: dto.productId,
      userId,
    });

    // Allow rating only for delivered or completed orders (must receive before rating)
    const allowedStatuses: OrderStatus[] = [
      OrderStatus.completed,
      OrderStatus.delivered,
    ];
    if (!allowedStatuses.includes(order.status)) {
      throw new BadRequestException(i18nMessage("server.rating.deliveredOnly"));
    }

    // Check if already rated
    const existingRating = await this.prisma.productRating.findUnique({
      where: { orderId: dto.orderId },
    });

    if (existingRating) {
      throw new BadRequestException(
        i18nMessage("server.rating.productAlreadyRated"),
      );
    }

    let rating;
    try {
      rating = await this.prisma.productRating.create({
        data: {
          productId: dto.productId,
          userId,
          orderId: dto.orderId,
          score: dto.score,
          title: dto.title,
          review: dto.review,
          images: dto.images || [],
          isVerifiedPurchase: true,
          // Post-moderasyon: ürün değerlendirmesi anında yayınlanır; admin sonradan kaldırabilir.
          status: RatingStatus.approved,
        },
        include: {
          product: { select: { id: true, title: true } },
          user: { select: { id: true, ...PUBLIC_NAME_SELECT } },
        },
      });
    } catch (e) {
      // Eşzamanlı ikinci ürün puanı: unique (orderId) ihlali → 500 yerine temiz 409.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        throw new ConflictException(
          i18nMessage("server.rating.productAlreadyRated"),
        );
      }
      throw e;
    }

    // Invalidate product cache so rating updates show immediately
    await this.cache.del(`products:detail:${dto.productId}`);
    await this.cache.delPattern(`products:list:*`);

    // Update Product.averageRating and Product.ratingCount (triggers ES reindex via Prisma middleware)
    await this.updateProductRatingStats(dto.productId);

    return this.mapProductRatingToDto(rating);
  }

  /**
   * Recalculate and update Product.averageRating and Product.ratingCount.
   * Called after create/delete/update of ProductRating. Prisma middleware emits product.changed for ES sync.
   *
   * Bu kolonlar ürün kartındaki sayaç/ortalamanın TEK kaynağıdır (kart hiç
   * ProductRating okumaz), bu yüzden yalnız yayınlanmış yorumları saymalıdır —
   * aksi halde admin bir yorumu reddettiğinde kartta sayaç kalır, detayda
   * yorum çıkmaz.
   */
  async updateProductRatingStats(productId: string): Promise<void> {
    const stats = await this.prisma.productRating.aggregate({
      where: publicProductRatingWhere({ productId }),
      _avg: { score: true },
      _count: true,
    });

    const count = stats._count ?? 0;
    const avg = stats._avg?.score;

    await this.prisma.product.update({
      where: { id: productId },
      data: {
        averageRating: avg != null ? avg : null,
        ratingCount: count,
      },
    });
  }

  // ==========================================================================
  // GET USER RATINGS
  // ==========================================================================
  async getUserRatings(
    userId: string,
    page?: number,
    pageSize?: number,
  ): Promise<{
    ratings: UserRatingResponseDto[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    // Ensure valid pagination values
    const safePage = Math.max(1, Number(page) || 1);
    const safePageSize = Math.min(100, Math.max(1, Number(pageSize) || 20));

    const [ratings, total] = await Promise.all([
      this.prisma.rating.findMany({
        where: publicUserRatingWhere({ receiverId: userId }),
        select: {
          id: true,
          giverId: true,
          receiverId: true,
          orderId: true,
          tradeId: true,
          score: true,
          comment: true,
          createdAt: true,
          giver: {
            select: { id: true, ...PUBLIC_NAME_SELECT, avatarUrl: true },
          },
          receiver: { select: { id: true, ...PUBLIC_NAME_SELECT } },
        },
        orderBy: { createdAt: "desc" },
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
      }),
      this.prisma.rating.count({
        where: publicUserRatingWhere({ receiverId: userId }),
      }),
    ]);

    const resolvedRatings = await Promise.all(
      ratings.map(async (r) => {
        const resolvedUrl = await this.resolveAvatarUrl(r.giver?.avatarUrl);
        return this.mapUserRatingToDto(r, resolvedUrl);
      }),
    );

    return {
      ratings: resolvedRatings,
      total,
      page: safePage,
      pageSize: safePageSize,
    };
  }

  // ==========================================================================
  // GET PRODUCT RATINGS
  // ==========================================================================
  async getProductRatings(
    productId: string,
    page?: number,
    pageSize?: number,
    sortBy?: string,
    score?: number,
  ): Promise<{
    ratings: ProductRatingResponseDto[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    // Ensure valid pagination values
    const safePage = Math.max(1, Number(page) || 1);
    const safePageSize = Math.min(100, Math.max(1, Number(pageSize) || 20));

    // Build orderBy based on sortBy parameter
    let orderBy: any = { createdAt: "desc" };
    switch (sortBy) {
      case "oldest":
        orderBy = { createdAt: "asc" };
        break;
      case "highest":
        orderBy = { score: "desc" };
        break;
      case "lowest":
        orderBy = { score: "asc" };
        break;
      case "helpful":
        orderBy = { helpfulCount: "desc" };
        break;
      default:
        orderBy = { createdAt: "desc" };
        break;
    }

    // Build where clause with optional score filter
    const where: Prisma.ProductRatingWhereInput = publicProductRatingWhere({
      productId,
    });
    const safeScore = Number(score);
    if (safeScore >= 1 && safeScore <= 5) {
      where.score = safeScore;
    }

    const [ratings, total] = await Promise.all([
      this.prisma.productRating.findMany({
        where,
        include: {
          product: { select: { id: true, title: true } },
          user: {
            select: { id: true, ...PUBLIC_NAME_SELECT, avatarUrl: true },
          },
        },
        orderBy,
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
      }),
      this.prisma.productRating.count({ where }),
    ]);

    const resolvedRatings = await Promise.all(
      ratings.map(async (r) => {
        const resolvedUrl = await this.resolveAvatarUrl(r.user?.avatarUrl);
        return this.mapProductRatingToDto(r, resolvedUrl);
      }),
    );

    return {
      ratings: resolvedRatings,
      total,
      page: safePage,
      pageSize: safePageSize,
    };
  }

  // ==========================================================================
  // GET USER RATING STATS
  // ==========================================================================
  async getUserRatingStats(userId: string): Promise<UserRatingStatsDto> {
    const ratings = await this.prisma.rating.findMany({
      where: publicUserRatingWhere({ receiverId: userId }),
      select: { score: true },
    });

    const totalRatings = ratings.length;
    const averageScore =
      totalRatings > 0
        ? ratings.reduce((sum, r) => sum + r.score, 0) / totalRatings
        : 0;

    const scoreDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    ratings.forEach((r) => {
      scoreDistribution[r.score as keyof typeof scoreDistribution]++;
    });

    return {
      userId,
      totalRatings,
      averageScore: Math.round(averageScore * 10) / 10,
      scoreDistribution,
    };
  }

  // ==========================================================================
  // GET PRODUCT RATING STATS
  // ==========================================================================
  async getProductRatingStats(
    productId: string,
  ): Promise<ProductRatingStatsDto> {
    const ratings = await this.prisma.productRating.findMany({
      where: publicProductRatingWhere({ productId }),
      select: { score: true },
    });

    const totalRatings = ratings.length;
    const averageScore =
      totalRatings > 0
        ? ratings.reduce((sum, r) => sum + r.score, 0) / totalRatings
        : 0;

    const scoreDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    ratings.forEach((r) => {
      scoreDistribution[r.score as keyof typeof scoreDistribution]++;
    });

    return {
      productId,
      totalRatings,
      averageScore: Math.round(averageScore * 10) / 10,
      scoreDistribution,
    };
  }

  // ==========================================================================
  // MARK HELPFUL
  // ==========================================================================
  async markProductRatingHelpful(
    ratingId: string,
  ): Promise<ProductRatingResponseDto> {
    const existing = await this.prisma.productRating.findUnique({
      where: { id: ratingId },
      select: { status: true },
    });
    if (!existing || existing.status !== RatingStatus.approved) {
      throw new NotFoundException(i18nMessage("server.rating.reviewNotFound"));
    }
    const rating = await this.prisma.productRating.update({
      where: { id: ratingId, status: RatingStatus.approved },
      data: { helpfulCount: { increment: 1 } },
      include: {
        product: { select: { id: true, title: true } },
        user: { select: { id: true, ...PUBLIC_NAME_SELECT } },
      },
    });

    return this.mapProductRatingToDto(rating);
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================
  private mapUserRatingToDto(
    rating: any,
    resolvedGiverAvatar?: string | null,
  ): UserRatingResponseDto {
    return {
      id: rating.id,
      giverId: rating.giverId,
      giverName: publicName(rating.giver),
      receiverId: rating.receiverId,
      receiverName: publicName(rating.receiver),
      orderId: rating.orderId || undefined,
      tradeId: rating.tradeId || undefined,
      score: rating.score,
      comment: rating.comment || undefined,
      createdAt: rating.createdAt,
      giver: rating.giver
        ? {
            id: rating.giver.id,
            ...publicIdentityFields(rating.giver),
            avatarUrl:
              resolvedGiverAvatar ?? rating.giver.avatarUrl ?? undefined,
          }
        : undefined,
    };
  }

  private mapProductRatingToDto(
    rating: any,
    resolvedAvatarUrl?: string | null,
  ): ProductRatingResponseDto {
    return {
      id: rating.id,
      productId: rating.productId,
      productTitle: rating.product?.title || "",
      userId: rating.userId,
      userName: publicName(rating.user),
      orderId: rating.orderId,
      score: rating.score,
      title: rating.title || undefined,
      review: rating.review || undefined,
      images: rating.images || [],
      isVerifiedPurchase: rating.isVerifiedPurchase,
      helpfulCount: rating.helpfulCount,
      createdAt: rating.createdAt,
      user: rating.user
        ? {
            id: rating.user.id,
            ...publicIdentityFields(rating.user),
            avatarUrl: resolvedAvatarUrl ?? rating.user.avatarUrl ?? undefined,
          }
        : undefined,
    };
  }
}
