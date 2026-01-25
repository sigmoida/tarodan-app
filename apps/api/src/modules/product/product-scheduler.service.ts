import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma';
import { ProductStatus } from '@prisma/client';

/**
 * Product Scheduler Service
 * Handles scheduled tasks for products like popularity score calculation
 */
@Injectable()
export class ProductSchedulerService {
  private readonly logger = new Logger(ProductSchedulerService.name);

  // Popularity score weights
  private readonly WEIGHTS = {
    view: 1,
    like: 5,
    sale: 20,
    recentView: 2, // Bonus for views in last 7 days
    recentLike: 10, // Bonus for likes in last 7 days
  };

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculate popularity score for a product
   */
  calculatePopularityScore(product: {
    viewCount: number;
    likeCount: number;
    salesCount?: number;
    recentViews?: number;
    recentLikes?: number;
  }): number {
    const salesCount = product.salesCount || 0;
    const recentViews = product.recentViews || 0;
    const recentLikes = product.recentLikes || 0;

    return (
      product.viewCount * this.WEIGHTS.view +
      product.likeCount * this.WEIGHTS.like +
      salesCount * this.WEIGHTS.sale +
      recentViews * this.WEIGHTS.recentView +
      recentLikes * this.WEIGHTS.recentLike
    );
  }

  /**
   * Update popularity scores for all active products
   * Runs every night at 03:00
   */
  @Cron('0 3 * * *') // Every day at 03:00 AM
  async updatePopularityScores() {
    this.logger.log('Starting popularity score update...');

    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // Get all active products with their stats
      const products = await this.prisma.product.findMany({
        where: { status: ProductStatus.active },
        select: {
          id: true,
          viewCount: true,
          likeCount: true,
          _count: {
            select: {
              orders: {
                where: { status: 'completed' },
              },
              likes: {
                where: { createdAt: { gte: sevenDaysAgo } },
              },
            },
          },
        },
      });

      this.logger.log(`Processing ${products.length} products...`);

      // Update each product's popularity score
      let updatedCount = 0;
      for (const product of products) {
        const popularityScore = this.calculatePopularityScore({
          viewCount: product.viewCount,
          likeCount: product.likeCount,
          salesCount: product._count.orders,
          recentLikes: product._count.likes,
          // Note: Recent views would need a separate tracking mechanism
          // For now, we use total views
          recentViews: 0,
        });

        await this.prisma.product.update({
          where: { id: product.id },
          data: {
            popularityScore,
            popularityUpdatedAt: new Date(),
          },
        });

        updatedCount++;
      }

      this.logger.log(`Popularity scores updated for ${updatedCount} products`);
    } catch (error: any) {
      this.logger.error(`Error updating popularity scores: ${error.message}`, error.stack);
    }
  }

  /**
   * Manual trigger for popularity score update
   * Can be called by admin endpoints
   */
  async manualUpdatePopularityScores(): Promise<{ updated: number }> {
    await this.updatePopularityScores();
    const count = await this.prisma.product.count({
      where: {
        status: ProductStatus.active,
        popularityUpdatedAt: { not: null },
      },
    });
    return { updated: count };
  }
}
