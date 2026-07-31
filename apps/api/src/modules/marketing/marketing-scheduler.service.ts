/**
 * Marketing Email Scheduler Service
 * Sends marketing emails to users who accepted marketing emails
 * - Weekly newsletter (every Monday at 9:00 AM)
 * - Monthly promotions (1st of every month at 10:00 AM)
 * - Special campaigns (configurable)
 */
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { registerRepeatableCron } from "../../monitoring/bull-cron.helper";
import { QUEUE_NAMES } from "../../workers/constants";
import { PrismaService } from "../../prisma";
import { SmtpProvider } from "../mail/smtp.provider";
import { StorageService } from "../storage/storage.service";
import { renderManagedEmailTemplate } from "../../common/helpers/email-template-renderer";

@Injectable()
export class MarketingSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(MarketingSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly smtpProvider: SmtpProvider,
    private readonly storageService: StorageService,
    @InjectQueue(QUEUE_NAMES.SCHEDULED) private readonly scheduledQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await registerRepeatableCron(
      this.scheduledQueue,
      "marketing-weekly",
      "0 9 * * 1",
      this.logger,
    );
    await registerRepeatableCron(
      this.scheduledQueue,
      "marketing-monthly",
      "0 10 1 * *",
      this.logger,
    );
  }

  /**
   * Send weekly newsletter to users who accept marketing emails
   * Runs every Monday at 9:00 AM
   * Gerçek iş — Bull processor 'marketing-weekly' buradan çağırır.
   */
  async runSendWeeklyNewsletter(log: (msg: string) => void = () => {}) {
    this.logger.log("Starting weekly newsletter email campaign...");
    log("Haftalık bülten kampanyası başladı");

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
      const filteredUsers = allUsers
        .filter((u: any) => {
          try {
            return u.acceptsMarketingEmails === true;
          } catch {
            return false; // Field doesn't exist yet, skip
          }
        })
        .map((u: any) => ({
          id: u.id,
          email: u.email,
          displayName: u.displayName,
        }));
      this.logger.log(
        `Found ${filteredUsers.length} users for weekly newsletter (out of ${allUsers.length} total)`,
      );

      // Get trending products for the newsletter
      const trendingProducts = await this.prisma.product.findMany({
        where: {
          status: "active",
        },
        orderBy: {
          popularityScore: "desc",
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

      const baseUrl = process.env.FRONTEND_URL || "https://tarodan.com.tr";
      const mappedTrending = trendingProducts.map((p) => ({
        ...p,
        imageUrl: p.images?.[0]?.cardKey
          ? this.storageService.getPublicAssetUrl(p.images[0].cardKey)
          : undefined,
        productUrl: `${baseUrl}/listings/${p.id}`,
      }));

      const newsletterDbTemplate = await this.prisma.emailTemplate.findUnique({
        where: { key: "marketing-newsletter" },
      });

      for (const user of filteredUsers) {
        try {
          const templateData = {
            userName: user.displayName,
            trendingProducts: mappedTrending,
          };
          const email = renderManagedEmailTemplate(
            "marketing-newsletter",
            { ...templateData, to: user.email },
            newsletterDbTemplate,
            baseUrl,
          );

          await this.smtpProvider.sendEmail({
            to: user.email,
            subject: email.subject,
            html: email.html,
          });
        } catch (error: any) {
          this.logger.error(
            `Failed to send newsletter email for user ${user.id}: ${error.message}`,
          );
        }
      }

      this.logger.log(`Sent ${filteredUsers.length} weekly newsletter emails`);
      log(`${filteredUsers.length} kullanıcıya haftalık bülten gönderildi`);
      return {
        summary: `${filteredUsers.length} bülten gönderildi`,
        stats: { sent: filteredUsers.length },
      };
    } catch (error: any) {
      this.logger.error(
        `Error sending weekly newsletter: ${error.message}`,
        error.stack,
      );
      log(`HATA: ${error.message}`);
      // Yutmadan yükselt: Bull job'ı "failed" olsun ki attempts/backoff ve Sentry
      // Cron alarmı gerçekten devreye girsin (aksi halde başarısız tur bile
      // "başarılı" görünür ve hata yalnız log satırında kalır).
      throw error;
    }
  }

  /**
   * Send monthly promotional emails
   * Runs on the 1st of every month at 10:00 AM
   * Gerçek iş — Bull processor 'marketing-monthly' buradan çağırır.
   */
  async runSendMonthlyPromotions(log: (msg: string) => void = () => {}) {
    this.logger.log("Starting monthly promotional email campaign...");

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
      const filteredUsers = allUsers
        .filter((u: any) => {
          try {
            return u.acceptsMarketingEmails === true;
          } catch {
            return false; // Field doesn't exist yet, skip
          }
        })
        .map((u: any) => ({
          id: u.id,
          email: u.email,
          displayName: u.displayName,
        }));
      this.logger.log(
        `Found ${filteredUsers.length} users for monthly promotions (out of ${allUsers.length} total)`,
      );

      // Get featured products (high popularity, recent)
      const featuredProducts = await this.prisma.product.findMany({
        where: {
          status: "active",
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
          },
        },
        orderBy: [{ popularityScore: "desc" }, { createdAt: "desc" }],
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

      const baseUrl = process.env.FRONTEND_URL || "https://tarodan.com.tr";
      const mappedFeatured = featuredProducts.map((p) => ({
        ...p,
        imageUrl: p.images?.[0]?.cardKey
          ? this.storageService.getPublicAssetUrl(p.images[0].cardKey)
          : undefined,
        productUrl: `${baseUrl}/listings/${p.id}`,
      }));

      const monthlyDbTemplate = await this.prisma.emailTemplate.findUnique({
        where: { key: "marketing-monthly" },
      });

      for (const user of filteredUsers) {
        try {
          const templateData = {
            userName: user.displayName,
            featuredProducts: mappedFeatured,
          };
          const email = renderManagedEmailTemplate(
            "marketing-monthly",
            { ...templateData, to: user.email },
            monthlyDbTemplate,
            baseUrl,
          );

          await this.smtpProvider.sendEmail({
            to: user.email,
            subject: email.subject,
            html: email.html,
          });
        } catch (error: any) {
          this.logger.error(
            `Failed to send monthly promotion email for user ${user.id}: ${error.message}`,
          );
        }
      }

      this.logger.log(`Sent ${filteredUsers.length} monthly promotion emails`);
      log(`${filteredUsers.length} kullanıcıya aylık kampanya gönderildi`);
      return {
        summary: `${filteredUsers.length} kampanya maili gönderildi`,
        stats: { sent: filteredUsers.length },
      };
    } catch (error: any) {
      this.logger.error(
        `Error sending monthly promotions: ${error.message}`,
        error.stack,
      );
      log(`HATA: ${error.message}`);
      // Yutmadan yükselt: Bull job'ı "failed" olsun ki attempts/backoff ve Sentry
      // Cron alarmı gerçekten devreye girsin (aksi halde başarısız tur bile
      // "başarılı" görünür ve hata yalnız log satırında kalır).
      throw error;
    }
  }
}
