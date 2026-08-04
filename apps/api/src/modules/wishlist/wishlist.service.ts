import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Optional,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { CacheService } from "../cache/cache.service";
import { NotificationService } from "../notification/notification.service";
import { NotificationType } from "../notification/dto";
import { ProductStatus } from "@prisma/client";
import { DiscountService } from "../discount/discount.service";
import { isPublicStorageKey, StorageService } from "../storage/storage.service";
import {
  AddToWishlistDto,
  WishlistResponseDto,
  WishlistItemResponseDto,
} from "./dto";
import { catalogProductWhere } from "../product/helpers/catalog-product-where";

@Injectable()
export class WishlistService {
  private readonly logger = new Logger(WishlistService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly notificationService: NotificationService,
    private readonly discountService: DiscountService,
    @Optional()
    private readonly storageService: StorageService,
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
      where: {
        wishlistId: wishlist.id,
        product: catalogProductWhere(),
      },
      include: {
        product: {
          include: {
            images: { take: 1 },
            seller: { select: { id: true, displayName: true } },
          },
        },
      },
      orderBy: { addedAt: "desc" },
    });

    // Map items with campaign discount prices (skip deleted products)
    const mappedItems: WishlistItemResponseDto[] = [];
    for (const item of items) {
      if (!item.product) continue;
      try {
        const dto = await this.mapItemToDto(item);
        mappedItems.push(dto);
      } catch (err) {
        this.logger.warn(
          `mapItemToDto failed for item ${item.id}: ${err?.message || err}`,
        );
      }
    }

    return {
      id: wishlist.id,
      userId: wishlist.userId,
      items: mappedItems,
      totalItems: mappedItems.length,
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
    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, ...catalogProductWhere() },
      include: {
        images: { take: 1 },
        seller: { select: { id: true, displayName: true } },
      },
    });

    if (!product) {
      throw new NotFoundException("Ürün bulunamadı");
    }

    // Cannot add own product to wishlist
    if (product.sellerId === userId) {
      throw new BadRequestException(
        "Kendi ürününüzü istek listesine ekleyemezsiniz",
      );
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
          userName: user?.displayName || "Bir kullanıcı",
        },
      );
    } catch (error) {
      this.logger.error("Failed to send product liked notification:", error);
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
      throw new NotFoundException("İstek listesi bulunamadı");
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
      throw new NotFoundException("Ürün istek listenizde değil");
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
  // HELPER - Resolve product image URL (S3 key -> presigned URL)
  // ==========================================================================
  private resolveProductImageUrl(
    imageKeyOrUrl: string | null | undefined,
  ): string | null {
    if (!imageKeyOrUrl) return null;
    if (
      imageKeyOrUrl.startsWith("http://") ||
      imageKeyOrUrl.startsWith("https://") ||
      imageKeyOrUrl.startsWith("/")
    )
      return imageKeyOrUrl;
    if (isPublicStorageKey(imageKeyOrUrl)) {
      return this.storageService?.getPublicAssetUrl(imageKeyOrUrl) ?? null;
    }
    return null;
  }

  // ==========================================================================
  // HELPER – A + oldPrice: price (A) = her zaman güncel satış fiyatı
  // ==========================================================================
  private async mapItemToDto(item: any): Promise<WishlistItemResponseDto> {
    const product = item.product;
    const basePrice = Number(product.price);

    // Get campaign discount price
    const campaignPrice = await this.discountService.getEffectiveDisplayPrice(
      product.id,
      product.sellerId,
      product.categoryId,
      basePrice,
    );

    const effectivePrice = campaignPrice ?? basePrice;
    const originalPrice = basePrice;

    // Resolve product image URL (S3 key -> presigned URL)
    const resolvedImage = this.resolveProductImageUrl(
      product.images?.[0]?.cardKey,
    );

    return {
      id: item.id,
      productId: product.id,
      productTitle: product.title,
      productImage: resolvedImage,
      productPrice: effectivePrice,
      productOriginalPrice:
        effectivePrice < originalPrice ? originalPrice : undefined,
      productCondition: product.condition,
      productStatus: product.status,
      sellerId: product.seller.id,
      sellerName: product.seller.displayName,
      addedAt: item.addedAt,
    };
  }
}
