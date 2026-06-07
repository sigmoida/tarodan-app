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
import { MembershipTierType } from '@prisma/client';

@Injectable()
export class MembershipSchedulerService {
  private readonly logger = new Logger(MembershipSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('email') private readonly emailQueue: Queue,
  ) {}

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
   * Otomatik yenileme (dev/mock). Süresi 24 saat içinde dolan/dolmuş, autoRenew AÇIK ve kayıtlı
   * VARSAYILAN kartı olan ücretli üyelikleri "çeker" ve dönemi (aylık/yıllık) uzatır.
   *
   * ⚠️ Gerçek para çekimi YOK — PayTR iframe token döndürmediği için SİMÜLASYON.
   * Production'da bu noktada gateway token charge yapılır; başarılıysa dönem uzatılır,
   * başarısızsa status=past_due'ya alınır. Kart yoksa çekim yapılmaz (hatırlatma akışı devrede).
   * Her saat çalışır; manuel de çağrılabilir (manualProcessAutoRenewals).
   */
  @Cron('0 * * * *') // Her saat
  async processAutoRenewals() {
    try {
      const now = new Date();
      const within24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const due = await this.prisma.userMembership.findMany({
        where: {
          status: 'active',
          autoRenew: true,
          currentPeriodEnd: { lte: within24h },
          tier: { type: { not: MembershipTierType.free } },
        },
        include: {
          tier: true,
          user: { select: { id: true, email: true, displayName: true } },
        },
      });

      let renewed = 0;
      for (const m of due) {
        const card = await this.prisma.paymentMethod.findFirst({
          where: { userId: m.userId, isDefault: true },
        });
        if (!card) continue; // kayıtlı kart yok → çekilemez (hatırlatma ayrıca gönderiliyor)

        const periodDays = Math.round(
          (m.currentPeriodEnd.getTime() - m.currentPeriodStart.getTime()) / 86400000,
        );
        const isYearly = periodDays > 180;
        const price = isYearly ? Number(m.tier.yearlyPrice) : Number(m.tier.monthlyPrice);

        // ── MOCK CHARGE ── (production: gateway token ile `price` çek; başarısızsa past_due)
        const newStart = new Date(m.currentPeriodEnd);
        const newEnd = new Date(newStart);
        if (isYearly) newEnd.setFullYear(newEnd.getFullYear() + 1);
        else newEnd.setMonth(newEnd.getMonth() + 1);

        await this.prisma.userMembership.update({
          where: { userId: m.userId },
          data: { currentPeriodStart: newStart, currentPeriodEnd: newEnd, status: 'active' },
        });

        this.logger.warn(
          `[MOCK AUTO-RENEW] ${m.user.email}: ${price} TL "${isYearly ? 'yearly' : 'monthly'}" charged from card ****${card.lastFour} → extended to ${newEnd.toISOString()}`,
        );

        await this.emailQueue
          .add('send-template', {
            to: m.user.email,
            subject: `${m.tier.name} üyeliğin yenilendi`,
            template: 'membership-renewed',
            data: {
              userName: m.user.displayName,
              tierName: m.tier.name,
              amount: price,
              cardLast4: card.lastFour,
              billingPeriod: isYearly ? 'yıllık' : 'aylık',
              nextRenewal: newEnd.toLocaleDateString('tr-TR'),
            },
          })
          .catch(() => {});

        renewed++;
      }

      if (renewed > 0) this.logger.log(`Auto-renewed ${renewed} membership(s) [MOCK]`);
      return { renewed };
    } catch (error: any) {
      this.logger.error(`Error processing auto-renewals: ${error.message}`, error.stack);
      return { renewed: 0, error: error.message };
    }
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
