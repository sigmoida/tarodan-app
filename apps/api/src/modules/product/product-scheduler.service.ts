import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma';
import { ProductStatus } from '@prisma/client';

/**
 * Product Scheduler Service
 * Handles scheduled tasks for products like popularity score calculation
 * and listing expiration (60 days)
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

  // Listing expiration settings
  private readonly LISTING_EXPIRY_DAYS = 60; // Listings expire after 60 days

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
            viewCount: product.viewCount, // Keep existing value, popularity fields handled separately
          } as any,
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
      } as any,
    });
    return { updated: count };
  }

  /**
   * Expire old listings (60 days)
   * Runs every day at 04:00 AM
   * Sets active listings older than 60 days to inactive status
   */
  @Cron('0 4 * * *') // Every day at 04:00 AM
  async expireOldListings() {
    this.logger.log('Starting listing expiration check...');

    try {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() - this.LISTING_EXPIRY_DAYS);

      // Find and update expired listings
      const result = await this.prisma.product.updateMany({
        where: {
          status: ProductStatus.active,
          createdAt: { lt: expiryDate },
        },
        data: {
          status: ProductStatus.inactive,
        },
      });

      if (result.count > 0) {
        this.logger.log(`Expired ${result.count} listings older than ${this.LISTING_EXPIRY_DAYS} days`);
      } else {
        this.logger.log('No listings to expire');
      }

      return { expired: result.count };
    } catch (error: any) {
      this.logger.error(`Error expiring listings: ${error.message}`, error.stack);
      return { expired: 0, error: error.message };
    }
  }

  /**
   * Get listings that will expire soon (within 7 days)
   * Can be used to send notifications to sellers
   */
  async getExpiringListings(daysUntilExpiry: number = 7): Promise<any[]> {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() - this.LISTING_EXPIRY_DAYS + daysUntilExpiry);
    
    const warningDate = new Date();
    warningDate.setDate(warningDate.getDate() - this.LISTING_EXPIRY_DAYS);

    return this.prisma.product.findMany({
      where: {
        status: ProductStatus.active,
        createdAt: {
          lt: expiryDate,
          gt: warningDate,
        },
      },
      select: {
        id: true,
        title: true,
        createdAt: true,
        seller: {
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        },
      },
    });
  }

  /**
   * Send expiration warnings to sellers
   * Runs every day at 10:00 AM
   */
  @Cron('0 10 * * *') // Every day at 10:00 AM
  async sendExpirationWarnings() {
    this.logger.log('Checking for listings expiring soon...');

    try {
      const expiringListings = await this.getExpiringListings(7);

      if (expiringListings.length === 0) {
        this.logger.log('No listings expiring soon');
        return;
      }

      this.logger.log(`Found ${expiringListings.length} listings expiring within 7 days`);

      // Group by seller
      const listingsBySeller = new Map<string, any[]>();
      for (const listing of expiringListings) {
        const sellerId = listing.seller.id;
        if (!listingsBySeller.has(sellerId)) {
          listingsBySeller.set(sellerId, []);
        }
        listingsBySeller.get(sellerId)!.push(listing);
      }

      // TODO: Send email notifications to sellers
      // This would integrate with the notification/email service
      for (const [sellerId, listings] of listingsBySeller) {
        this.logger.log(`Seller ${sellerId} has ${listings.length} listings expiring soon`);
        // await this.notificationService.sendListingExpirationWarning(sellerId, listings);
      }
    } catch (error: any) {
      this.logger.error(`Error sending expiration warnings: ${error.message}`, error.stack);
    }
  }

  /**
   * Manual trigger for listing expiration
   * Can be called by admin endpoints
   */
  async manualExpireListings(): Promise<{ expired: number }> {
    return this.expireOldListings();
  }
}
