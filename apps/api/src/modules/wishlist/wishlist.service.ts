import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Inject,
  forwardRef,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { CacheService } from '../cache/cache.service';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/dto';
import { ProductStatus } from '@prisma/client';
import {
  AddToWishlistDto,
  WishlistResponseDto,
  WishlistItemResponseDto,
} from './dto';

@Injectable()
export class WishlistService {
  private readonly logger = new Logger(WishlistService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    @Inject(forwardRef(() => NotificationService))
    private readonly notificationService: NotificationService,
  ) {}

  // ==========================================================================
  // GET OR CREATE WISHLIST
  // ==========================================================================
  private async getOrCreateWishlist(userId: string) {
    let wishlist = await this.prisma.wishlist.findUnique({
      where: { userId },
    });

    if (!wishlist) {
      wishlist = await this.prisma.wishlist.create({
        data: { userId },
      });
    }

    return wishlist;
  }

  // ==========================================================================
  // GET USER'S WISHLIST
  // ==========================================================================
  async getWishlist(userId: string): Promise<WishlistResponseDto> {
    const wishlist = await this.getOrCreateWishlist(userId);

    const items = await this.prisma.wishlistItem.findMany({
      where: { wishlistId: wishlist.id },
      include: {
        product: {
          include: {
            images: { take: 1 },
            seller: { select: { id: true, displayName: true } },
          },
        },
      },
      orderBy: { addedAt: 'desc' },
    });

    return {
      id: wishlist.id,
      userId: wishlist.userId,
      items: items.map((item) => this.mapItemToDto(item)),
      totalItems: items.length,
      createdAt: wishlist.createdAt,
    };
  }

  // ==========================================================================
  // ADD TO WISHLIST
  // ==========================================================================
  async addToWishlist(
    userId: string,
    dto: AddToWishlistDto,
  ): Promise<WishlistItemResponseDto> {
    // Verify product exists and is active
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      include: {
        images: { take: 1 },
        seller: { select: { id: true, displayName: true } },
      },
    });

    if (!product) {
      throw new NotFoundException('Ürün bulunamadı');
    }

    // Cannot add own product to wishlist
    if (product.sellerId === userId) {
      throw new BadRequestException('Kendi ürününüzü istek listesine ekleyemezsiniz');
    }

    const wishlist = await this.getOrCreateWishlist(userId);

    // Check if already in wishlist - return existing item if so (idempotent)
    const existingItem = await this.prisma.wishlistItem.findUnique({
      where: {
        wishlistId_productId: {
          wishlistId: wishlist.id,
          productId: dto.productId,
        },
      },
      include: {
        product: {
          include: {
            images: { take: 1 },
            seller: { select: { id: true, displayName: true } },
          },
        },
      },
    });

    if (existingItem) {
      // Return existing item instead of throwing error (idempotent behavior)
      return this.mapItemToDto(existingItem);
    }

    // Use transaction to create wishlist item and increment like count
    const [item] = await this.prisma.$transaction([
      this.prisma.wishlistItem.create({
        data: {
          wishlistId: wishlist.id,
          productId: dto.productId,
        },
        include: {
          product: {
            include: {
              images: { take: 1 },
              seller: { select: { id: true, displayName: true } },
            },
          },
        },
      }),
      // Also increment the product's likeCount for accurate display
      this.prisma.product.update({
        where: { id: dto.productId },
        data: { likeCount: { increment: 1 } },
      }),
    ]);

    // Invalidate product cache so likeCount updates immediately
    await this.cache.del(`products:detail:${dto.productId}`);

    // Send notification to seller that their product was liked
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { displayName: true },
      });

      await this.notificationService.createInAppNotification(
        product.sellerId,
        NotificationType.PRODUCT_LIKED,
        {
          productId: product.id,
          productTitle: product.title,
          userName: user?.displayName || 'Bir kullanıcı',
        },
      );
    } catch (error) {
      this.logger.error('Failed to send product liked notification:', error);
    }

    return this.mapItemToDto(item);
  }

  // ==========================================================================
  // REMOVE FROM WISHLIST
  // ==========================================================================
  async removeFromWishlist(userId: string, productId: string): Promise<void> {
    const wishlist = await this.prisma.wishlist.findUnique({
      where: { userId },
    });

    if (!wishlist) {
      throw new NotFoundException('İstek listesi bulunamadı');
    }

    const item = await this.prisma.wishlistItem.findUnique({
      where: {
        wishlistId_productId: {
          wishlistId: wishlist.id,
          productId,
        },
      },
    });

    if (!item) {
      throw new NotFoundException('Ürün istek listenizde değil');
    }

    // Use transaction to delete wishlist item and decrement like count
    await this.prisma.$transaction([
      this.prisma.wishlistItem.delete({
        where: { id: item.id },
      }),
      // Also decrement the product's likeCount for accurate display
      this.prisma.product.update({
        where: { id: productId },
        data: { likeCount: { decrement: 1 } },
      }),
    ]);

    // Invalidate product cache so likeCount updates immediately
    await this.cache.del(`products:detail:${productId}`);
  }

  // ==========================================================================
  // CHECK IF IN WISHLIST
  // ==========================================================================
  async isInWishlist(userId: string, productId: string): Promise<boolean> {
    const wishlist = await this.prisma.wishlist.findUnique({
      where: { userId },
    });

    if (!wishlist) return false;

    const item = await this.prisma.wishlistItem.findUnique({
      where: {
        wishlistId_productId: {
          wishlistId: wishlist.id,
          productId,
        },
      },
    });

    return !!item;
  }

  // ==========================================================================
  // CLEAR WISHLIST
  // ==========================================================================
  async clearWishlist(userId: string): Promise<void> {
    const wishlist = await this.prisma.wishlist.findUnique({
      where: { userId },
    });

    if (!wishlist) return;

    await this.prisma.wishlistItem.deleteMany({
      where: { wishlistId: wishlist.id },
    });
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================
  private mapItemToDto(item: any): WishlistItemResponseDto {
    return {
      id: item.id,
      productId: item.product.id,
      productTitle: item.product.title,
      productImage: item.product.images?.[0]?.url,
      productPrice: parseFloat(item.product.price),
      productCondition: item.product.condition,
      productStatus: item.product.status,
      sellerId: item.product.seller.id,
      sellerName: item.product.seller.displayName,
      addedAt: item.addedAt,
    };
  }
}
