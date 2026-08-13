/**
 * Membership Scheduler Service
 * Handles scheduled tasks for membership:
 * - Monthly premium offer emails to free users
 * - Membership expiration reminders
 */
import { Injectable, Logger, OnModuleInit, Optional } from "@nestjs/common";
import { registerRepeatableCron } from "../../monitoring/bull-cron.helper";
import { QUEUE_NAMES } from "../../workers/constants";
import { PrismaService } from "../../prisma";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { MembershipService } from "./membership.service";
import { NotificationService } from "../notification/notification.service";
import { NotificationType } from "../notification/dto";

@Injectable()
export class MembershipSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(MembershipSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue("email") private readonly emailQueue: Queue,
    @InjectQueue(QUEUE_NAMES.SCHEDULED) private readonly scheduledQueue: Queue,
    private readonly membershipService: MembershipService,
    // Hatırlatma e-postasının yanında in-app+push bildirimi. Best-effort;
    // @Optional — mevcut spec harness'ları konumsal kurar.
    @Optional()
    private readonly notifications?: NotificationService,
  ) {}

  async onModuleInit(): Promise<void> {
    await registerRepeatableCron(
      this.scheduledQueue,
      "membership-expired-downgrades",
      "0 3 * * *",
      this.logger,
    );
    await registerRepeatableCron(
      this.scheduledQueue,
      "membership-expiration-reminders",
      "0 9 * * *",
      this.logger,
    );
    await registerRepeatableCron(
      this.scheduledQueue,
      "membership-monthly-offers",
      "0 10 1 * *",
      this.logger,
    );
    // Tier 3: kart çekimi (yalnız PAYTR_RECURRING_ENABLED iken gerçek çekim).
    // Bull tek-sefer garantisi = çift-çekim kilidi.
    await registerRepeatableCron(
      this.scheduledQueue,
      "membership-auto-renewals",
      "0 * * * *",
      this.logger,
    );
  }

  /**
   * Süresi dolan paralı üyelikleri free tier'a düşür (her gün 03:00).
   * Auto-renew (processAutoRenewals) saatlik çalıştığından buraya düşenler
   * yenilenmemiş/yenilenememiş üyeliklerdir.
   *
   * ÖNEMLİ: checkExpiredMemberships() önceden HİÇBİR cron'a bağlı değildi (dead
   * code) → süresi geçmiş paralı üyelikler hiç düşürülmüyor, status=active +
   * tier=premium kalıyordu. canCreateTrade ham tier'ı okuduğu için süresi geçmiş
   * premium kullanıcı hâlâ takas yapabiliyordu. Bu cron o boşluğu kapatır.
   * Gerçek iş — Bull processor 'membership-expired-downgrades' buradan çağırır.
   */
  async runProcessExpiredDowngrades(log: (msg: string) => void = () => {}) {
    try {
      const count = await this.membershipService.checkExpiredMemberships();
      log(`${count} süresi dolmuş üyelik free tier'a düşürüldü`);
      if (count > 0) {
        this.logger.log(
          `Downgraded ${count} expired membership(s) to free tier`,
        );
      }
      return {
        summary: `${count} üyelik düşürüldü`,
        stats: { downgraded: count },
      };
    } catch (error: any) {
      this.logger.error(
        `Error downgrading expired memberships: ${error.message}`,
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
   * Send monthly premium offer emails to free users
   * Runs on the 1st of every month at 10:00 AM
   * Gerçek iş — Bull processor 'membership-monthly-offers' ve manuel tetik buradan çağırır.
   */
  async runSendMonthlyPremiumOffers(log: (msg: string) => void = () => {}) {
    this.logger.log("Starting monthly premium offer email campaign...");
    log("Aylık premium teklif kampanyası başladı");

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
          // Pazarlama e-postasıdır: izin ŞARTTIR. Yorumdaki 3. madde WHERE'de
          // eksikti — teklif e-postası izne bakılmadan kuyruklanıyordu.
          acceptsMarketingEmails: true,
          // No active premium membership
          AND: [
            {
              OR: [
                { membership: null },
                {
                  membership: {
                    tier: {
                      type: "free",
                    },
                  },
                },
              ],
            },
            // Has been active (has products or orders)
            {
              OR: [
                { products: { some: { createdAt: { gte: thirtyDaysAgo } } } },
                {
                  buyerOrders: { some: { createdAt: { gte: thirtyDaysAgo } } },
                },
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

      this.logger.log(
        `Found ${freeUsers.length} eligible users for premium offer emails`,
      );

      // Queue emails for each user
      for (const user of freeUsers) {
        await this.emailQueue.add("send-template", {
          to: user.email,
          subject: "Premium Üyelik ile Daha Fazla Fırsat",
          template: "premium-offer",
          templateData: {
            userName: user.displayName,
            productCount: user._count.products,
            orderCount: user._count.buyerOrders,
            // Yalnız GERÇEK üyelik ayrıcalıkları vaat edilir (üyelik katmanı
            // tablosundaki alanlar). "Reklamsız deneyim" ve "öne çıkan ilan
            // hakkı" üründen kaldırıldı; e-postada vaat etmek yanıltıcıydı.
            benefits: [
              "Takas yapabilme",
              "Koleksiyon oluşturma",
              "İlan başına daha fazla görsel",
              "Daha yüksek ilan limiti",
              "İlanlarınız standart ilanların önünde sıralanır",
            ],
            ctaUrl: `${process.env.FRONTEND_URL || "https://tarodan.com.tr"}/membership`,
            ctaText: "Premium Üye Ol",
          },
        });
      }

      this.logger.log(`Queued ${freeUsers.length} premium offer emails`);
      log(
        `${freeUsers.length} kullanıcıya premium teklif maili kuyruğa atıldı`,
      );

      return {
        sent: freeUsers.length,
        summary: `${freeUsers.length} premium teklif maili`,
        stats: { sent: freeUsers.length },
      };
    } catch (error: any) {
      this.logger.error(
        `Error sending premium offer emails: ${error.message}`,
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
   * Send membership expiration reminders
   * Runs every day at 09:00 AM
   * Sends reminders 7 days and 1 day before expiration
   * Gerçek iş — Bull processor 'membership-expiration-reminders' buradan çağırır.
   */
  async runSendExpirationReminders(log: (msg: string) => void = () => {}) {
    this.logger.log("Checking for expiring memberships...");
    log("Üyelik bitiş hatırlatmaları kontrol ediliyor");

    try {
      const now = new Date();
      const sevenDaysFromNow = new Date();
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
      const oneDayFromNow = new Date();
      oneDayFromNow.setDate(oneDayFromNow.getDate() + 1);

      // Find memberships expiring in 7 days
      const expiringIn7Days = await this.prisma.userMembership.findMany({
        where: {
          // cancelled da dahil: iptal "dönem sonuna kadar hak sürer" demek —
          // erişimini kaybetmek üzere olan kitle tam olarak onlar.
          status: { in: ["active", "cancelled"] },
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
          // cancelled da dahil (7 günlük hatırlatma ile aynı gerekçe).
          status: { in: ["active", "cancelled"] },
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

      this.logger.log(
        `Found ${expiringIn7Days.length} memberships expiring in 7 days`,
      );
      this.logger.log(
        `Found ${expiringTomorrow.length} memberships expiring tomorrow`,
      );

      // Send 7-day reminders
      for (const membership of expiringIn7Days) {
        await this.sendExpirationReminder(membership, 7);
      }

      // Send 1-day reminders (more urgent)
      for (const membership of expiringTomorrow) {
        await this.sendExpirationReminder(membership, 1);
      }

      log(
        `${expiringIn7Days.length} adet 7-gün, ${expiringTomorrow.length} adet 1-gün hatırlatması gönderildi`,
      );
      return {
        sevenDayReminders: expiringIn7Days.length,
        oneDayReminders: expiringTomorrow.length,
        summary: `${expiringIn7Days.length} (7g) · ${expiringTomorrow.length} (1g) hatırlatma`,
        stats: {
          sevenDay: expiringIn7Days.length,
          oneDay: expiringTomorrow.length,
        },
      };
    } catch (error: any) {
      this.logger.error(
        `Error sending expiration reminders: ${error.message}`,
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
   * Tek hatırlatma: e-posta + in-app/push birlikte. 7-gün ve 1-gün turları
   * yalnız şablon/aciliyet farkıyla aynı içeriği üretir — tek noktadan.
   */
  private async sendExpirationReminder(
    membership: {
      autoRenew: boolean;
      currentPeriodEnd: Date;
      user: { id: string; email: string; displayName: string | null };
      tier: { name: string; type: string };
    },
    daysRemaining: 7 | 1,
  ): Promise<void> {
    await this.emailQueue.add("send-template", {
      to: membership.user.email,
      subject:
        daysRemaining === 7
          ? `${membership.tier.name} Üyeliğiniz 7 Gün İçinde Sona Eriyor`
          : `${membership.tier.name} Üyeliğiniz Yarın Sona Eriyor`,
      template:
        daysRemaining === 7
          ? "membership-expiring"
          : "membership-expiring-urgent",
      templateData: {
        userName: membership.user.displayName,
        tierName: membership.tier.name,
        expirationDate: membership.currentPeriodEnd.toLocaleDateString("tr-TR"),
        daysRemaining,
        // /membership/renew diye bir sayfa yok; yenileme üyelik sayfasından yapılır.
        renewUrl: `${process.env.FRONTEND_URL || "https://tarodan.com.tr"}/membership`,
        autoRenew: membership.autoRenew,
        renewNote: membership.autoRenew
          ? "Otomatik yenileme açık: üyeliğin bitince hatırlatma göndereceğiz, tek tıkla yenileyebilirsin."
          : "Üyeliğini kaybetmemek için yenilemeyi unutma.",
      },
    });
    // Zil + push: e-postayı görmeyen kullanıcı için. Best-effort — bildirim
    // hatası hatırlatma turunu durdurmaz.
    await this.notifications
      ?.createInAppNotification(
        membership.user.id,
        NotificationType.MEMBERSHIP_EXPIRING,
        { tierName: membership.tier.name, daysLeft: daysRemaining },
      )
      .catch((err: any) =>
        this.logger.warn(
          `MEMBERSHIP_EXPIRING bildirimi başarısız (user ${membership.user.id}): ${err?.message}`,
        ),
      );
  }

  /**
   * Otomatik yenileme (MIT recurring): kayıtlı kartla kullanıcısız çekim.
   * Gerçek çekim YALNIZCA PAYTR_RECURRING_ENABLED=true iken yapılır; aksi halde
   * MembershipService.runAutoRenewals no-op döner (yetki + flag olmadan kör çekim yok).
   * Gerçek iş — Bull processor 'membership-auto-renewals' ve manuel tetik buradan çağırır.
   */
  async runProcessAutoRenewals(log: (msg: string) => void = () => {}) {
    try {
      const result = await this.membershipService.runAutoRenewals();
      log(
        `Oto-yenileme: ${result.renewed} yenilendi · ${result.failed} başarısız · ${result.attempted} denendi`,
      );
      if (result.attempted > 0) {
        this.logger.log(
          `Oto-yenileme turu: ${result.renewed} yenilendi, ${result.failed} başarısız (${result.attempted} denendi)`,
        );
      }
      return {
        renewed: result.renewed,
        summary: `${result.renewed} yenilendi · ${result.failed} başarısız`,
        stats: {
          attempted: result.attempted,
          renewed: result.renewed,
          failed: result.failed,
        },
      };
    } catch (error: any) {
      this.logger.error(
        `Oto-yenileme cron hatası: ${error.message}`,
        error.stack,
      );
      log(`HATA: ${error.message}`);
      // Yutmadan yükselt: Bull job'ı "failed" olsun ki attempts/backoff ve Sentry
      // Cron alarmı gerçekten devreye girsin (aksi halde başarısız tur bile
      // "başarılı" görünür ve hata yalnız log satırında kalır).
      throw error;
    }
  }

  /** Manuel tetikleme (test/admin) */
  async manualProcessAutoRenewals(): Promise<{ renewed: number }> {
    // run*()'u doğrudan çağırır: flag açıkken bile manuel tetik gerçek çekimi yapsın.
    return this.runProcessAutoRenewals();
  }

  /**
   * Manual trigger for premium offer campaign
   * Can be called by admin endpoints
   */
  async manualSendPremiumOffers(): Promise<{ sent: number }> {
    // run*()'u doğrudan çağırır: flag açıkken bile manuel tetik gerçek işi yapsın
    // (guard'lı sendMonthlyPremiumOffers no-op döner).
    return this.runSendMonthlyPremiumOffers();
  }
}
