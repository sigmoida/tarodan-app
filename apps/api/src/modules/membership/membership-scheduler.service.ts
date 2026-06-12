/**
 * Membership Scheduler Service
 * Handles scheduled tasks for membership:
 * - Monthly premium offer emails to free users
 * - Membership expiration reminders
 */
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { MembershipService } from './membership.service';

@Injectable()
export class MembershipSchedulerService {
  private readonly logger = new Logger(MembershipSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('email') private readonly emailQueue: Queue,
    private readonly membershipService: MembershipService,
  ) {}

  /**
   * Süresi dolan paralı üyelikleri free tier'a düşür (her gün 03:00).
   * Auto-renew (processAutoRenewals) saatlik çalıştığından buraya düşenler
   * yenilenmemiş/yenilenememiş üyeliklerdir.
   *
   * ÖNEMLİ: checkExpiredMemberships() önceden HİÇBİR cron'a bağlı değildi (dead
   * code) → süresi geçmiş paralı üyelikler hiç düşürülmüyor, status=active +
   * tier=premium kalıyordu. canCreateTrade ham tier'ı okuduğu için süresi geçmiş
   * premium kullanıcı hâlâ takas yapabiliyordu. Bu cron o boşluğu kapatır.
   */
  @Cron('0 3 * * *') // Her gün 03:00
  async processExpiredDowngrades() {
    try {
      const count = await this.membershipService.checkExpiredMemberships();
      if (count > 0) {
        this.logger.log(`Downgraded ${count} expired membership(s) to free tier`);
      }
    } catch (error: any) {
      this.logger.error(
        `Error downgrading expired memberships: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Send monthly premium offer emails to free users
   * Runs on the 1st of every month at 10:00 AM
   */
  @Cron('0 10 1 * *') // 1st of every month at 10:00 AM
  async sendMonthlyPremiumOffers() {
    this.logger.log('Starting monthly premium offer email campaign...');

    try {
      // Get users who:
      // 1. Have no active premium membership
      // 2. Have been active in the last 30 days (have listings or orders)
      // 3. Accept marketing emails
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Find free users who are active
      const freeUsers = await this.prisma.user.findMany({
        where: {
          isBanned: false,
          isEmailVerified: true,
          // No active premium membership
          AND: [
            {
              OR: [
                { membership: null },
                {
                  membership: {
                    tier: {
                      type: 'free',
                    },
                  },
                },
              ],
            },
            // Has been active (has products or orders)
            {
              OR: [
                { products: { some: { createdAt: { gte: thirtyDaysAgo } } } },
                { buyerOrders: { some: { createdAt: { gte: thirtyDaysAgo } } } },
              ],
            },
          ],
        },
        select: {
          id: true,
          email: true,
          displayName: true,
          _count: {
            select: {
              products: true,
              buyerOrders: true,
            },
          },
        },
        take: 1000, // Process in batches
      });

      this.logger.log(`Found ${freeUsers.length} eligible users for premium offer emails`);

      // Queue emails for each user
      for (const user of freeUsers) {
        await this.emailQueue.add('send-template', {
          to: user.email,
          subject: '🌟 Premium Üyelik ile Daha Fazla Fırsat!',
          template: 'premium-offer',
          templateData: {
            userName: user.displayName,
            productCount: user._count.products,
            orderCount: user._count.buyerOrders,
            benefits: [
              'Sınırsız ilan yayınlama',
              'Takas özelliği',
              'Digital Garage oluşturma',
              'Öne çıkan ilan hakkı',
              'Reklamsız deneyim',
              'Düşük komisyon oranları',
            ],
            ctaUrl: 'https://tarodan.com/membership',
            ctaText: 'Premium Üye Ol',
          },
        });
      }

      this.logger.log(`Queued ${freeUsers.length} premium offer emails`);

      return { sent: freeUsers.length };
    } catch (error: any) {
      this.logger.error(`Error sending premium offer emails: ${error.message}`, error.stack);
      return { sent: 0, error: error.message };
    }
  }

  /**
   * Send membership expiration reminders
   * Runs every day at 09:00 AM
   * Sends reminders 7 days and 1 day before expiration
   */
  @Cron('0 9 * * *') // Every day at 09:00 AM
  async sendExpirationReminders() {
    this.logger.log('Checking for expiring memberships...');

    try {
      const now = new Date();
      const sevenDaysFromNow = new Date();
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
      const oneDayFromNow = new Date();
      oneDayFromNow.setDate(oneDayFromNow.getDate() + 1);

      // Find memberships expiring in 7 days
      const expiringIn7Days = await this.prisma.userMembership.findMany({
        where: {
          status: 'active',
          currentPeriodEnd: {
            gte: new Date(sevenDaysFromNow.setHours(0, 0, 0, 0)),
            lt: new Date(sevenDaysFromNow.setHours(23, 59, 59, 999)),
          },
        },
        include: {
          user: {
            select: { id: true, email: true, displayName: true },
          },
          tier: {
            select: { name: true, type: true },
          },
        },
      });

      // Find memberships expiring tomorrow
      const expiringTomorrow = await this.prisma.userMembership.findMany({
        where: {
          status: 'active',
          currentPeriodEnd: {
            gte: new Date(oneDayFromNow.setHours(0, 0, 0, 0)),
            lt: new Date(oneDayFromNow.setHours(23, 59, 59, 999)),
          },
        },
        include: {
          user: {
            select: { id: true, email: true, displayName: true },
          },
          tier: {
            select: { name: true, type: true },
          },
        },
      });

      this.logger.log(`Found ${expiringIn7Days.length} memberships expiring in 7 days`);
      this.logger.log(`Found ${expiringTomorrow.length} memberships expiring tomorrow`);

      // Send 7-day reminders
      for (const membership of expiringIn7Days) {
        await this.emailQueue.add('send-template', {
          to: membership.user.email,
          subject: `⏰ ${membership.tier.name} Üyeliğiniz 7 Gün İçinde Sona Eriyor`,
          template: 'membership-expiring',
          templateData: {
            userName: membership.user.displayName,
            tierName: membership.tier.name,
            expirationDate: membership.currentPeriodEnd.toLocaleDateString('tr-TR'),
            daysRemaining: 7,
            renewUrl: 'https://tarodan.com/membership/renew',
            autoRenew: membership.autoRenew,
            renewNote: membership.autoRenew
              ? 'Otomatik yenileme açık: üyeliğin bitince hatırlatma göndereceğiz, tek tıkla yenileyebilirsin.'
              : 'Üyeliğini kaybetmemek için yenilemeyi unutma.',
          },
        });
      }

      // Send 1-day reminders (more urgent)
      for (const membership of expiringTomorrow) {
        await this.emailQueue.add('send-template', {
          to: membership.user.email,
          subject: `🚨 ${membership.tier.name} Üyeliğiniz Yarın Sona Eriyor!`,
          template: 'membership-expiring-urgent',
          templateData: {
            userName: membership.user.displayName,
            tierName: membership.tier.name,
            expirationDate: membership.currentPeriodEnd.toLocaleDateString('tr-TR'),
            daysRemaining: 1,
            renewUrl: 'https://tarodan.com/membership/renew',
            autoRenew: membership.autoRenew,
            renewNote: membership.autoRenew
              ? 'Otomatik yenileme açık: üyeliğin bitince hatırlatma göndereceğiz, tek tıkla yenileyebilirsin.'
              : 'Üyeliğini kaybetmemek için yenilemeyi unutma.',
          },
        });
      }

      return {
        sevenDayReminders: expiringIn7Days.length,
        oneDayReminders: expiringTomorrow.length,
      };
    } catch (error: any) {
      this.logger.error(`Error sending expiration reminders: ${error.message}`, error.stack);
      return { sevenDayReminders: 0, oneDayReminders: 0, error: error.message };
    }
  }

  /**
   * Otomatik yenileme: HATIRLATMA-tabanlıdır, kayıtlı karttan çekim YAPMAZ.
   *
   * Saved-card özelliği kaldırıldığı için (Faz 1) depolanmış karttan otomatik çekim
   * mümkün değildir. Dönem bitişinde kullanıcı normal PayTR hosted-iframe akışından
   * tek tıkla yeniler; gerekli hatırlatmalar ayrı bir akışta (expiry reminders)
   * gönderilir. Bu job artık çekim yapmayan bir no-op'tur.
   */
  @Cron('0 * * * *') // Her saat
  async processAutoRenewals() {
    // Kayıtlı karttan otomatik çekim kaldırıldı; yenileme manuel PayTR akışıyla yapılır.
    return { renewed: 0 };
  }

  /** Manuel tetikleme (test/admin) */
  async manualProcessAutoRenewals(): Promise<{ renewed: number }> {
    return this.processAutoRenewals();
  }

  /**
   * Manual trigger for premium offer campaign
   * Can be called by admin endpoints
   */
  async manualSendPremiumOffers(): Promise<{ sent: number }> {
    return this.sendMonthlyPremiumOffers();
  }
}
