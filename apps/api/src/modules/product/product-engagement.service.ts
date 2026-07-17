import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { i18nMessage } from "../i18n";
import { PrismaService } from "../../prisma";
import { CacheService } from "../cache/cache.service";

/**
 * ProductEngagementService — beğeni/görüntülenme sistemi (leaf; prisma + cache).
 * Beğeni/görüntülenme popularity+relevance skoruna canlı yansır; cache invalidation
 * (products:detail/list) birebir korunur.
 */
@Injectable()
export class ProductEngagementService {
  private readonly logger = new Logger(ProductEngagementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /**
   * Like a product
   * POST /products/:id/like
   */
  async likeProduct(
    productId: string,
    userId: string,
  ): Promise<{ liked: boolean; likeCount: number }> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(i18nMessage("server.product.notFound"));
    }

    // Cannot like own product
    if (product.sellerId === userId) {
      throw new BadRequestException(
        i18nMessage("server.product.cannotLikeOwn"),
      );
    }

    // Check if already liked
    const existingLike = await this.prisma.productLike.findUnique({
      where: {
        productId_userId: {
          productId,
          userId,
        },
      },
    });

    if (existingLike) {
      throw new BadRequestException(i18nMessage("server.product.alreadyLiked"));
    }

    // Create like and increment counter in transaction
    const [_, updatedProduct] = await this.prisma.$transaction([
      this.prisma.productLike.create({
        data: {
          productId,
          userId,
        },
      }),
      this.prisma.product.update({
        where: { id: productId },
        // Beğeni etkileşim skoruna canlı yansır (like ağırlığı 5 — gece job ile aynı)
        data: {
          likeCount: { increment: 1 },
          popularityScore: { increment: 5 },
          relevanceScore: { increment: 5 },
        },
      }),
    ]);

    // Invalidate cache
    await this.cache.del(`products:detail:${productId}`);
    await this.cache.delPattern("products:list:*");

    return { liked: true, likeCount: updatedProduct.likeCount };
  }

  /**
   * Unlike a product
   * DELETE /products/:id/unlike
   */
  async unlikeProduct(
    productId: string,
    userId: string,
  ): Promise<{ liked: boolean; likeCount: number }> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(i18nMessage("server.product.notFound"));
    }

    // Check if liked
    const existingLike = await this.prisma.productLike.findUnique({
      where: {
        productId_userId: {
          productId,
          userId,
        },
      },
    });

    if (!existingLike) {
      throw new BadRequestException(i18nMessage("server.product.notLiked"));
    }

    // Delete like and decrement counter in transaction
    const [_, updatedProduct] = await this.prisma.$transaction([
      this.prisma.productLike.delete({
        where: {
          productId_userId: {
            productId,
            userId,
          },
        },
      }),
      this.prisma.product.update({
        where: { id: productId },
        data: {
          likeCount: { decrement: 1 },
          popularityScore: { decrement: 5 },
          relevanceScore: { decrement: 5 },
        },
      }),
    ]);

    // Invalidate cache
    await this.cache.del(`products:detail:${productId}`);
    await this.cache.delPattern("products:list:*");

    return { liked: false, likeCount: Math.max(0, updatedProduct.likeCount) };
  }

  /**
   * Check if user has liked a product
   */
  async isProductLikedByUser(
    productId: string,
    userId: string,
  ): Promise<boolean> {
    const like = await this.prisma.productLike.findUnique({
      where: {
        productId_userId: {
          productId,
          userId,
        },
      },
    });
    return !!like;
  }

  /**
   * Increment product view count
   * POST /products/:id/view
   * Uses Redis to prevent same user incrementing multiple times per day
   */
  async incrementViewCount(
    productId: string,
    userId?: string,
    clientIp?: string,
    userAgent?: string,
  ): Promise<{ viewCount: number }> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(i18nMessage("server.product.notFound"));
    }

    if (userId && product.sellerId === userId) {
      return { viewCount: product.viewCount };
    }

    if (this.isBot(userAgent)) {
      return { viewCount: product.viewCount };
    }

    const identifier = userId || clientIp || "unknown";
    const rateLimitKey = `viewCount:${productId}:${identifier}`;
    try {
      const { allowed } = await this.cache.checkRateLimit(
        rateLimitKey,
        1,
        1800,
      );
      if (!allowed) {
        return { viewCount: product.viewCount };
      }
    } catch {
      // Redis down - fall through and count the view
    }

    const updatedProduct = await this.prisma.product.update({
      where: { id: productId },
      // Görüntülenme etkileşim skoruna canlı yansır (view ağırlığı 1 — gece job ile aynı)
      data: {
        viewCount: { increment: 1 },
        popularityScore: { increment: 1 },
        relevanceScore: { increment: 1 },
      },
    });

    await this.cache.del(`products:detail:${productId}`);
    await this.cache.delPattern("products:list:*");

    return { viewCount: updatedProduct.viewCount };
  }

  /**
   * Check if user agent indicates a bot
   */
  private isBot(userAgent?: string): boolean {
    if (!userAgent) return true; // No user agent is suspicious

    const botPatterns = [
      "bot",
      "crawler",
      "spider",
      "scraper",
      "curl",
      "wget",
      "python-requests",
      "java/",
      "go-http-client",
      "libwww",
      "httpunit",
      "nutch",
      "linkwalker",
      "archiver",
      "fetch",
      "slurp",
      "yandex",
      "bingbot",
      "googlebot",
      "baiduspider",
    ];

    const ua = userAgent.toLowerCase();
    return botPatterns.some((pattern) => ua.includes(pattern));
  }
}
