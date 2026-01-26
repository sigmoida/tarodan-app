import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { OrderStatus, TradeStatus } from '@prisma/client';
import {
  CreateUserRatingDto,
  CreateProductRatingDto,
  UserRatingResponseDto,
  ProductRatingResponseDto,
  UserRatingStatsDto,
  ProductRatingStatsDto,
} from './dto';
import { CacheService } from '../cache/cache.service';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/dto';

@Injectable()
export class RatingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    @Inject(forwardRef(() => NotificationService))
    private readonly notificationService: NotificationService,
  ) {}

  // ==========================================================================
  // CREATE USER RATING
  // ==========================================================================
  async createUserRating(
    giverId: string,
    dto: CreateUserRatingDto,
  ): Promise<UserRatingResponseDto> {
    // Cannot rate yourself
    if (giverId === dto.receiverId) {
      throw new BadRequestException('Kendinizi puanlayamazsınız');
    }

    // Verify receiver exists
    const receiver = await this.prisma.user.findUnique({
      where: { id: dto.receiverId },
    });

    if (!receiver) {
      throw new NotFoundException('Kullanıcı bulunamadı');
    }

    // Must have either orderId or tradeId
    if (!dto.orderId && !dto.tradeId) {
      throw new BadRequestException('Sipariş veya takas ID gerekli');
    }

    // Verify transaction
    if (dto.orderId) {
      const order = await this.prisma.order.findUnique({
        where: { id: dto.orderId },
      });

      if (!order) {
        throw new NotFoundException('Sipariş bulunamadı');
      }

      // Allow rating only for delivered or completed orders (must receive before rating)
      const allowedStatuses: OrderStatus[] = [OrderStatus.completed, OrderStatus.delivered];
      if (!allowedStatuses.includes(order.status)) {
        throw new BadRequestException('Sadece teslim edilmiş siparişler puanlanabilir');
      }

      // Giver must be buyer or seller
      if (order.buyerId !== giverId && order.sellerId !== giverId) {
        throw new ForbiddenException('Bu siparişi puanlama yetkiniz yok');
      }

      // Receiver must be the other party
      if (
        (order.buyerId === giverId && order.sellerId !== dto.receiverId) ||
        (order.sellerId === giverId && order.buyerId !== dto.receiverId)
      ) {
        throw new BadRequestException('Geçersiz alıcı');
      }

      // Check if already rated
      const existingRating = await this.prisma.rating.findUnique({
        where: { giverId_orderId: { giverId, orderId: dto.orderId } },
      });

      if (existingRating) {
        throw new BadRequestException('Bu sipariş için zaten puan verdiniz');
      }
    }

    if (dto.tradeId) {
      const trade = await this.prisma.trade.findUnique({
        where: { id: dto.tradeId },
      });

      if (!trade) {
        throw new NotFoundException('Takas bulunamadı');
      }

      if (trade.status !== TradeStatus.completed) {
        throw new BadRequestException('Sadece tamamlanmış takaslar puanlanabilir');
      }

      // Giver must be initiator or receiver
      if (trade.initiatorId !== giverId && trade.receiverId !== giverId) {
        throw new ForbiddenException('Bu takası puanlama yetkiniz yok');
      }

      // Receiver must be the other party
      if (
        (trade.initiatorId === giverId && trade.receiverId !== dto.receiverId) ||
        (trade.receiverId === giverId && trade.initiatorId !== dto.receiverId)
      ) {
        throw new BadRequestException('Geçersiz alıcı');
      }

      // Check if already rated
      const existingRating = await this.prisma.rating.findUnique({
        where: { giverId_tradeId: { giverId, tradeId: dto.tradeId } },
      });

      if (existingRating) {
        throw new BadRequestException('Bu takas için zaten puan verdiniz');
      }
    }

    const rating = await this.prisma.rating.create({
      data: {
        giverId,
        receiverId: dto.receiverId,
        orderId: dto.orderId,
        tradeId: dto.tradeId,
        score: dto.score,
        comment: dto.comment,
      },
      include: {
        giver: { select: { id: true, displayName: true, avatarUrl: true } },
        receiver: { select: { id: true, displayName: true } },
      },
    });

    // Invalidate product caches for this seller (receiver) so rating updates show
    await this.cache.delPattern(`products:detail:*`);
    await this.cache.delPattern(`products:list:*`);

    // Send notification to the receiver about the new review
    try {
      await this.notificationService.createInAppNotification(
        dto.receiverId,
        NotificationType.REVIEW_RECEIVED,
        {
          reviewerName: rating.giver?.displayName || 'Bir kullanıcı',
          score: dto.score,
          orderId: dto.orderId,
          tradeId: dto.tradeId,
        },
      );
    } catch (error) {
      // Don't fail if notification fails
      console.error('Failed to send review notification:', error);
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
      throw new NotFoundException('Sipariş bulunamadı');
    }

    if (order.buyerId !== userId) {
      throw new ForbiddenException('Sadece alıcı ürünü puanlayabilir');
    }

    if (order.productId !== dto.productId) {
      throw new BadRequestException('Siparişteki ürün eşleşmiyor');
    }

    // Allow rating only for delivered or completed orders (must receive before rating)
    const allowedStatuses: OrderStatus[] = [OrderStatus.completed, OrderStatus.delivered];
    if (!allowedStatuses.includes(order.status)) {
      throw new BadRequestException('Sadece teslim edilmiş siparişler puanlanabilir');
    }

    // Check if already rated
    const existingRating = await this.prisma.productRating.findUnique({
      where: { orderId: dto.orderId },
    });

    if (existingRating) {
      throw new BadRequestException('Bu sipariş için zaten ürün puanı verdiniz');
    }

    const rating = await this.prisma.productRating.create({
      data: {
        productId: dto.productId,
        userId,
        orderId: dto.orderId,
        score: dto.score,
        title: dto.title,
        review: dto.review,
        images: dto.images || [],
        isVerifiedPurchase: true,
      },
      include: {
        product: { select: { id: true, title: true } },
        user: { select: { id: true, displayName: true } },
      },
    });

    // Invalidate product cache so rating updates show immediately
    await this.cache.del(`products:detail:${dto.productId}`);
    await this.cache.delPattern(`products:list:*`);

    return this.mapProductRatingToDto(rating);
  }

  // ==========================================================================
  // GET USER RATINGS
  // ==========================================================================
  async getUserRatings(
    userId: string,
    page?: number,
    pageSize?: number,
  ): Promise<{ ratings: UserRatingResponseDto[]; total: number; page: number; pageSize: number }> {
    // Ensure valid pagination values
    const safePage = Math.max(1, Number(page) || 1);
    const safePageSize = Math.min(100, Math.max(1, Number(pageSize) || 20));
    
    const [ratings, total] = await Promise.all([
      this.prisma.rating.findMany({
        where: { receiverId: userId },
        select: {
          id: true,
          giverId: true,
          receiverId: true,
          orderId: true,
          tradeId: true,
          score: true,
          comment: true,
          createdAt: true,
          giver: { select: { id: true, displayName: true, avatarUrl: true } },
          receiver: { select: { id: true, displayName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
      }),
      this.prisma.rating.count({ where: { receiverId: userId } }),
    ]);

    return {
      ratings: ratings.map((r) => this.mapUserRatingToDto(r)),
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
  ): Promise<{ ratings: ProductRatingResponseDto[]; total: number; page: number; pageSize: number }> {
    // Ensure valid pagination values
    const safePage = Math.max(1, Number(page) || 1);
    const safePageSize = Math.min(100, Math.max(1, Number(pageSize) || 20));
    
    const [ratings, total] = await Promise.all([
      this.prisma.productRating.findMany({
        where: { productId },
        include: {
          product: { select: { id: true, title: true } },
          user: { select: { id: true, displayName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
      }),
      this.prisma.productRating.count({ where: { productId } }),
    ]);

    return {
      ratings: ratings.map((r) => this.mapProductRatingToDto(r)),
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
      where: { receiverId: userId },
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
  async getProductRatingStats(productId: string): Promise<ProductRatingStatsDto> {
    const ratings = await this.prisma.productRating.findMany({
      where: { productId },
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
  async markProductRatingHelpful(ratingId: string): Promise<ProductRatingResponseDto> {
    const rating = await this.prisma.productRating.update({
      where: { id: ratingId },
      data: { helpfulCount: { increment: 1 } },
      include: {
        product: { select: { id: true, title: true } },
        user: { select: { id: true, displayName: true } },
      },
    });

    return this.mapProductRatingToDto(rating);
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================
  private mapUserRatingToDto(rating: any): UserRatingResponseDto {
    return {
      id: rating.id,
      giverId: rating.giverId,
      giverName: rating.giver?.displayName || '',
      receiverId: rating.receiverId,
      receiverName: rating.receiver?.displayName || '',
      orderId: rating.orderId || undefined,
      tradeId: rating.tradeId || undefined,
      score: rating.score,
      comment: rating.comment || undefined,
      createdAt: rating.createdAt,
      giver: rating.giver ? {
        id: rating.giver.id,
        displayName: rating.giver.displayName || '',
        avatarUrl: rating.giver.avatarUrl || undefined,
      } : undefined,
    };
  }

  private mapProductRatingToDto(rating: any): ProductRatingResponseDto {
    return {
      id: rating.id,
      productId: rating.productId,
      productTitle: rating.product?.title || '',
      userId: rating.userId,
      userName: rating.user?.displayName || '',
      orderId: rating.orderId,
      score: rating.score,
      title: rating.title || undefined,
      review: rating.review || undefined,
      images: rating.images || [],
      isVerifiedPurchase: rating.isVerifiedPurchase,
      helpfulCount: rating.helpfulCount,
      createdAt: rating.createdAt,
    };
  }
}
