/**
 * Marketing Email Scheduler Service
 * Sends marketing emails to users who accepted marketing emails
 * - Weekly newsletter (every Monday at 9:00 AM)
 * - Monthly promotions (1st of every month at 10:00 AM)
 * - Special campaigns (configurable)
 */
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma';
import { SmtpProvider } from '../notification/providers/smtp.provider';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class MarketingSchedulerService {
  private readonly logger = new Logger(MarketingSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly smtpProvider: SmtpProvider,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Send weekly newsletter to users who accept marketing emails
   * Runs every Monday at 9:00 AM
   */
  @Cron('0 9 * * 1') // Every Monday at 9:00 AM
  async sendWeeklyNewsletter() {
    this.logger.log('Starting weekly newsletter email campaign...');

    try {
      // Get users who accept marketing emails and are verified
      // Note: acceptsMarketingEmails will be available after migration
      // For now, we'll get all users and filter in memory (less efficient but works pre-migration)
      const allUsers = await this.prisma.user.findMany({
        where: {
          isBanned: false,
          isEmailVerified: true,
        },
        take: 1000, // Process in batches to avoid memory issues
      });

      // Filter users who accept marketing emails
      // After migration, we can use where clause: acceptsMarketingEmails: true
      const filteredUsers = allUsers.filter((u: any) => {
        try {
          return u.acceptsMarketingEmails === true;
        } catch {
          return false; // Field doesn't exist yet, skip
        }
      }).map((u: any) => ({
        id: u.id,
        email: u.email,
        displayName: u.displayName,
      }));
      this.logger.log(`Found ${filteredUsers.length} users for weekly newsletter (out of ${allUsers.length} total)`);

      // Get trending products for the newsletter
      const trendingProducts = await this.prisma.product.findMany({
        where: {
          status: 'active',
        },
        orderBy: {
          popularityScore: 'desc',
        },
        take: 10,
        select: {
          id: true,
          title: true,
          price: true,
          images: {
            take: 1,
            select: { cardKey: true },
          },
        },
      });

      const baseUrl = process.env.FRONTEND_URL || 'https://tarodan.com';
      const mappedTrending = trendingProducts.map((p) => ({
        ...p,
        imageUrl: p.images?.[0]?.cardKey ? this.storageService.getPublicAssetUrl(p.images[0].cardKey) : undefined,
        productUrl: `${baseUrl}/listings/${p.id}`,
      }));

      for (const user of filteredUsers) {
        try {
          const htmlContent = this.generateNewsletterHtml(user.displayName, mappedTrending);
          const textContent = this.generateNewsletterText(user.displayName, mappedTrending);
          
          await this.smtpProvider.sendEmail({
            to: user.email,
            subject: '📰 Tarodan Haftalık Bülteni',
            html: htmlContent,
            text: textContent,
          });
        } catch (error: any) {
          this.logger.error(`Failed to send newsletter email for user ${user.id}: ${error.message}`);
        }
      }

      this.logger.log(`Sent ${filteredUsers.length} weekly newsletter emails`);
    } catch (error: any) {
      this.logger.error(`Error sending weekly newsletter: ${error.message}`, error.stack);
    }
  }

  /**
   * Send monthly promotional emails
   * Runs on the 1st of every month at 10:00 AM
   */
  @Cron('0 10 1 * *') // 1st of every month at 10:00 AM
  async sendMonthlyPromotions() {
    this.logger.log('Starting monthly promotional email campaign...');

    try {
      // Get users who accept marketing emails and are verified
      // Note: acceptsMarketingEmails will be available after migration
      // For now, we'll get all users and filter in memory (less efficient but works pre-migration)
      const allUsers = await this.prisma.user.findMany({
        where: {
          isBanned: false,
          isEmailVerified: true,
        },
        take: 1000, // Process in batches
      });

      // Filter users who accept marketing emails
      // After migration, we can use where clause: acceptsMarketingEmails: true
      const filteredUsers = allUsers.filter((u: any) => {
        try {
          return u.acceptsMarketingEmails === true;
        } catch {
          return false; // Field doesn't exist yet, skip
        }
      }).map((u: any) => ({
        id: u.id,
        email: u.email,
        displayName: u.displayName,
      }));
      this.logger.log(`Found ${filteredUsers.length} users for monthly promotions (out of ${allUsers.length} total)`);

      // Get featured products (high popularity, recent)
      const featuredProducts = await this.prisma.product.findMany({
        where: {
          status: 'active',
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
          },
        },
        orderBy: [
          { popularityScore: 'desc' },
          { createdAt: 'desc' },
        ],
        take: 8,
        select: {
          id: true,
          title: true,
          price: true,
          images: {
            take: 1,
            select: { cardKey: true },
          },
        },
      });

      const baseUrl = process.env.FRONTEND_URL || 'https://tarodan.com';
      const mappedFeatured = featuredProducts.map((p) => ({
        ...p,
        imageUrl: p.images?.[0]?.cardKey ? this.storageService.getPublicAssetUrl(p.images[0].cardKey) : undefined,
        productUrl: `${baseUrl}/listings/${p.id}`,
      }));

      for (const user of filteredUsers) {
        try {
          const htmlContent = this.generateMonthlyPromotionHtml(user.displayName, mappedFeatured);
          const textContent = this.generateMonthlyPromotionText(user.displayName, mappedFeatured);
          
          await this.smtpProvider.sendEmail({
            to: user.email,
            subject: '🎁 Tarodan Aylık Özel Fırsatlar',
            html: htmlContent,
            text: textContent,
          });
        } catch (error: any) {
          this.logger.error(`Failed to send monthly promotion email for user ${user.id}: ${error.message}`);
        }
      }

      this.logger.log(`Sent ${filteredUsers.length} monthly promotion emails`);
    } catch (error: any) {
      this.logger.error(`Error sending monthly promotions: ${error.message}`, error.stack);
    }
  }

  /**
   * Generate HTML content for weekly newsletter
   */
  private generateNewsletterHtml(userName: string, products: any[]): string {
    const baseStyle = `
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      max-width: 600px;
      margin: 0 auto;
      background: #ffffff;
      padding: 32px;
    `;
    const headerStyle = `color: #1a1a2e; margin-bottom: 24px;`;
    const buttonStyle = `
      display: inline-block;
      padding: 14px 28px;
      background-color: #4f46e5;
      color: white;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
    `;
    const boxStyle = `
      background: #f8fafc;
      padding: 20px;
      border-radius: 12px;
      margin: 20px 0;
      border: 1px solid #e2e8f0;
    `;

    const productsHtml = products.length > 0
      ? `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 24px 0;">
          ${products.map((p) => `
            <div style="${boxStyle}">
              ${p.imageUrl ? `<img src="${p.imageUrl}" alt="${p.title}" style="width: 100%; border-radius: 8px; margin-bottom: 12px;" />` : ''}
              <p style="font-weight: 600; margin: 8px 0;">${p.title}</p>
              <p style="color: #4f46e5; font-size: 18px; font-weight: 600; margin: 8px 0;">${p.price} TL</p>
              <a href="${p.productUrl}" style="${buttonStyle}">İncele</a>
            </div>
          `).join('')}
        </div>
      `
      : '<p>Bu hafta öne çıkan ürün bulunmamaktadır.</p>';

    return `
      <div style="${baseStyle}">
        <h1 style="${headerStyle}">📰 Tarodan Haftalık Bülteni</h1>
        <p>Merhaba ${userName},</p>
        <p>Bu hafta en çok ilgi gören ürünler:</p>
        ${productsHtml}
        <p style="margin-top: 24px; color: #64748b; font-size: 14px;">
          <a href="${process.env.FRONTEND_URL || 'https://tarodan.com'}/profile/settings" style="color: #64748b;">Bildirim tercihlerinizi değiştirmek için tıklayın</a>
        </p>
      </div>
    `;
  }

  /**
   * Generate text content for weekly newsletter
   */
  private generateNewsletterText(userName: string, products: any[]): string {
    const productsText = products.length > 0
      ? products.map((p) => `- ${p.title}: ${p.price} TL`).join('\n')
      : 'Bu hafta öne çıkan ürün bulunmamaktadır.';

    return `
Tarodan Haftalık Bülteni

Merhaba ${userName},

Bu hafta en çok ilgi gören ürünler:

${productsText}

Bildirim tercihlerinizi değiştirmek için: ${process.env.FRONTEND_URL || 'https://tarodan.com'}/profile/settings
    `.trim();
  }

  /**
   * Generate HTML content for monthly promotions
   */
  private generateMonthlyPromotionHtml(userName: string, products: any[]): string {
    const baseStyle = `
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      max-width: 600px;
      margin: 0 auto;
      background: #ffffff;
      padding: 32px;
    `;
    const headerStyle = `color: #1a1a2e; margin-bottom: 24px;`;
    const buttonStyle = `
      display: inline-block;
      padding: 14px 28px;
      background-color: #4f46e5;
      color: white;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
    `;
    const boxStyle = `
      background: #f8fafc;
      padding: 20px;
      border-radius: 12px;
      margin: 20px 0;
      border: 1px solid #e2e8f0;
    `;

    const productsHtml = products.length > 0
      ? `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 24px 0;">
          ${products.map((p) => `
            <div style="${boxStyle}">
              ${p.imageUrl ? `<img src="${p.imageUrl}" alt="${p.title}" style="width: 100%; border-radius: 8px; margin-bottom: 12px;" />` : ''}
              <p style="font-weight: 600; margin: 8px 0;">${p.title}</p>
              <p style="color: #4f46e5; font-size: 18px; font-weight: 600; margin: 8px 0;">${p.price} TL</p>
              <a href="${p.productUrl}" style="${buttonStyle}">İncele</a>
            </div>
          `).join('')}
        </div>
      `
      : '<p>Bu ay öne çıkan ürün bulunmamaktadır.</p>';

    return `
      <div style="${baseStyle}">
        <h1 style="${headerStyle}">🎁 Tarodan Aylık Özel Fırsatlar</h1>
        <p>Merhaba ${userName},</p>
        <p>Bu ay sizin için özel olarak seçtiğimiz ürünler:</p>
        ${productsHtml}
        <p style="margin-top: 24px; color: #64748b; font-size: 14px;">
          <a href="${process.env.FRONTEND_URL || 'https://tarodan.com'}/profile/settings" style="color: #64748b;">Bildirim tercihlerinizi değiştirmek için tıklayın</a>
        </p>
      </div>
    `;
  }

  /**
   * Generate text content for monthly promotions
   */
  private generateMonthlyPromotionText(userName: string, products: any[]): string {
    const productsText = products.length > 0
      ? products.map((p) => `- ${p.title}: ${p.price} TL`).join('\n')
      : 'Bu ay öne çıkan ürün bulunmamaktadır.';

    return `
Tarodan Aylık Özel Fırsatlar

Merhaba ${userName},

Bu ay sizin için özel olarak seçtiğimiz ürünler:

${productsText}

Bildirim tercihlerinizi değiştirmek için: ${process.env.FRONTEND_URL || 'https://tarodan.com'}/profile/settings
    `.trim();
  }
}
