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
import {
  NewsletterService,
  type NewsletterRecipient,
} from "./newsletter.service";
import { catalogProductWhere } from "../product/helpers/catalog-product-where";

/** Tek turda kaç alıcı çekileceği — bellekte tutulan sayfa boyutu. */
const RECIPIENT_PAGE_SIZE = 200;

@Injectable()
export class MarketingSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(MarketingSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly smtpProvider: SmtpProvider,
    private readonly storageService: StorageService,
    private readonly newsletterService: NewsletterService,
    @InjectQueue(QUEUE_NAMES.SCHEDULED) private readonly scheduledQueue: Queue,
  ) {}

  private get baseUrl(): string {
    return (process.env.FRONTEND_URL || "https://tarodan.com.tr").replace(
      /\/+$/,
      "",
    );
  }

  /**
   * Bir pazarlama kampanyasını abone listesine gönderir.
   *
   * Alıcılar `newsletter_subscribers`'tan sayfalanarak çekilir (eski kod
   * `user` tablosundan `take: 1000` ile okuyordu: formdan abone olan misafirler
   * hiç mail almıyor, 1000. üyeden sonrası da atlanıyordu). Her alıcı kendi
   * token'ıyla üretilmiş bir çıkış linki ve `List-Unsubscribe` başlıkları alır —
   * Gmail/Yahoo toplu gönderende bunları şart koşuyor.
   */
  private async sendCampaign(
    kind: "newsletter" | "promotions",
    templateKey: string,
    buildData: (recipient: NewsletterRecipient) => Record<string, unknown>,
    log: (msg: string) => void,
  ): Promise<number> {
    const dbTemplate = await this.prisma.emailTemplate.findUnique({
      where: { key: templateKey },
    });

    let skip = 0;
    let sent = 0;

    for (;;) {
      const recipients = await this.newsletterService.listRecipients(kind, {
        skip,
        take: RECIPIENT_PAGE_SIZE,
      });
      if (recipients.length === 0) break;
      skip += RECIPIENT_PAGE_SIZE;

      for (const recipient of recipients) {
        const unsubscribeUrl = `${this.baseUrl}/newsletter/unsubscribe?token=${encodeURIComponent(recipient.unsubscribeToken)}`;
        try {
          const email = renderManagedEmailTemplate(
            templateKey,
            { ...buildData(recipient), to: recipient.email },
            dbTemplate,
            { frontendUrl: this.baseUrl, unsubscribeUrl },
          );

          await this.smtpProvider.sendEmail({
            to: recipient.email,
            subject: email.subject,
            html: email.html,
            template: templateKey,
            headers: {
              "List-Unsubscribe": `<${unsubscribeUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          });
          sent += 1;
        } catch (error: any) {
          this.logger.error(
            `${templateKey} gönderilemedi (${recipient.email}): ${error?.message ?? error}`,
          );
        }
      }
    }

    log(`${sent} alıcıya gönderildi`);
    return sent;
  }

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
   * Send weekly newsletter to the marketing subscriber list.
   * Runs every Monday at 9:00 AM
   * Gerçek iş — Bull processor 'marketing-weekly' buradan çağırır.
   */
  async runSendWeeklyNewsletter(log: (msg: string) => void = () => {}) {
    this.logger.log("Starting weekly newsletter email campaign...");
    log("Haftalık bülten kampanyası başladı");

    try {
      // Get trending products for the newsletter
      const trendingProducts = await this.prisma.product.findMany({
        where: {
          ...catalogProductWhere(),
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

      const mappedTrending = trendingProducts.map((p) => ({
        ...p,
        imageUrl: p.images?.[0]?.cardKey
          ? this.storageService.getPublicAssetUrl(p.images[0].cardKey)
          : undefined,
        productUrl: `${this.baseUrl}/listings/${p.id}`,
      }));

      const sent = await this.sendCampaign(
        "newsletter",
        "marketing-newsletter",
        (recipient) => ({
          userName: recipient.displayName,
          trendingProducts: mappedTrending,
        }),
        log,
      );

      this.logger.log(`Sent ${sent} weekly newsletter emails`);
      return {
        summary: `${sent} bülten gönderildi`,
        stats: { sent },
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
      // Get featured products (high popularity, recent)
      const featuredProducts = await this.prisma.product.findMany({
        where: {
          ...catalogProductWhere(),
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

      const mappedFeatured = featuredProducts.map((p) => ({
        ...p,
        imageUrl: p.images?.[0]?.cardKey
          ? this.storageService.getPublicAssetUrl(p.images[0].cardKey)
          : undefined,
        productUrl: `${this.baseUrl}/listings/${p.id}`,
      }));

      const sent = await this.sendCampaign(
        "promotions",
        "marketing-monthly",
        (recipient) => ({
          userName: recipient.displayName,
          featuredProducts: mappedFeatured,
        }),
        log,
      );

      this.logger.log(`Sent ${sent} monthly promotion emails`);
      return {
        summary: `${sent} kampanya maili gönderildi`,
        stats: { sent },
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
