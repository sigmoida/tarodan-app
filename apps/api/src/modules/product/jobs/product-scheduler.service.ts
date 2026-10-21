import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { registerRepeatableCron } from "../../../monitoring/bull-cron.helper";
import { QUEUE_NAMES } from "../../../workers/constants";
import { PrismaService } from "../../../prisma";
import {
  BoostStatus,
  ListingRemovalReason,
  Prisma,
  ProductInactiveReason,
  ProductKind,
  ProductStatus,
  MembershipTierType,
} from "@prisma/client";
import { computeQualityScore } from "../helpers/quality-score";
import { NotificationService } from "../../notification/notification.service";
import { NotificationType } from "../../notification/dto";
import { SellerTrustService } from "../../seller-trust";
import {
  frontendUrl as resolveFrontendUrl,
  adminUrl,
} from "../../../config/app-urls";
import type { CronRunSummary } from "../../../monitoring/cron-run.helper";
import {
  resolveTimingAction,
  resolveTimingValue,
} from "../../../common/timing-rules";
import { CacheService } from "../../cache/cache.service";
import { SearchService } from "../../search/search.service";
import {
  errorMessage,
  errorStack,
} from "../../../common/helpers/error-message";
import { isRenewableInPlace } from "../helpers/product-renewal";
import { refreshProductVisibility } from "../helpers/product-visibility";
import { recordListingRemovals } from "../helpers/listing-removal";
import { BoostTimelineService } from "../boost-timeline/boost-timeline.service";
import { BOOST_REMINDER_LEAD_MS } from "../boost-timeline/boost-expiry.service";
import { BoostNoticeService } from "../ranking/boost-notice.service";
import { writeProductRanking } from "../helpers/product-ranking-write";

/**
 * Listings whose boosts one expire-boosts run pauses or resumes at most (each
 * in its own transaction); the rest follow on the next run, 15 minutes later.
 */
const BOOST_SYSTEM_PAUSE_BATCH = 200;

/** Listings one expire-boosts run expires (per source query) at most. */
const BOOST_EXPIRY_BATCH = 500;

/** Listings one expire-boosts run sends the ending-soon reminder at most. */
const BOOST_REMINDER_BATCH = 500;

/**
 * Product Scheduler Service
 * Handles scheduled tasks for products like popularity score calculation
 * and listing expiration (60 days)
 */
@Injectable()
export class ProductSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(ProductSchedulerService.name);

  // Popularity (etkileşim/aktivite) skoru ağırlıkları.
  // Belgedeki aktivite faktörleri: görüntülenme + favori + mesaj alma (+ son aktivite).
  // "Aratılma" ayrı izlenmez; genel etkileşimle yaklaşık temsil edilir (ürün kararı).
  private readonly WEIGHTS = {
    view: 1,
    like: 5,
    sale: 20,
    message: 8, // Mesaj alma (ürüne gelen mesaj/konuşma) — ciddi alıcı ilgisi
    recentView: 2, // Bonus for views in last 7 days
    recentLike: 10, // Bonus for likes in last 7 days
  };

  // İlan yaşam süresi ve uyarı günü Süreler ve Kurallar'dan (`listingTtlDays`,
  // `listingExpiryWarningDays`) her cron turunun başında okunur. Süre
  // publishedAt'ten (yoksa createdAt) sayılır ve HER onayda tazelenir
  // (yenileme = yeniden onay → taze pencere). DİKKAT: bitiş tarihi ilana
  // damgalanmaz, her turda "şimdi − N gün" ile hesaplanır — değer
  // değiştirildiğinde yayındaki ilanların tamamına geriye dönük uygulanır.

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    @InjectQueue(QUEUE_NAMES.SCHEDULED) private readonly scheduledQueue: Queue,
    private readonly cache: CacheService,
    private readonly searchService: SearchService,
    private readonly sellerTrust: SellerTrustService,
    private readonly boostTimeline: BoostTimelineService,
    // Sends the expiry and reminder notices right after their commit.
    private readonly boostNotices: BoostNoticeService,
  ) {}

  /**
   * Ürün cron işlerini Bull repeatable olarak kaydeder (tek zamanlama mekanizması).
   */
  async onModuleInit(): Promise<void> {
    await registerRepeatableCron(
      this.scheduledQueue,
      "expire-boosts",
      "*/15 * * * *",
      this.logger,
    );
    await registerRepeatableCron(
      this.scheduledQueue,
      "update-popularity",
      "0 3 * * *",
      this.logger,
    );
    await registerRepeatableCron(
      this.scheduledQueue,
      "expire-old-listings",
      "0 4 * * *",
      this.logger,
    );
    await registerRepeatableCron(
      this.scheduledQueue,
      "send-expiration-warnings",
      "0 10 * * *",
      this.logger,
    );
    await registerRepeatableCron(
      this.scheduledQueue,
      "pending-moderation-digest",
      "0 9 * * *",
      this.logger,
    );
  }

  /**
   * Calculate popularity score for a product
   */
  calculatePopularityScore(product: {
    viewCount: number;
    likeCount: number;
    salesCount?: number;
    messageCount?: number;
    recentViews?: number;
    recentLikes?: number;
  }): number {
    const salesCount = product.salesCount || 0;
    const messageCount = product.messageCount || 0;
    const recentViews = product.recentViews || 0;
    const recentLikes = product.recentLikes || 0;

    return (
      product.viewCount * this.WEIGHTS.view +
      product.likeCount * this.WEIGHTS.like +
      salesCount * this.WEIGHTS.sale +
      messageCount * this.WEIGHTS.message +
      recentViews * this.WEIGHTS.recentView +
      recentLikes * this.WEIGHTS.recentLike
    );
  }

  /**
   * Update popularity scores + listing quality score (qualityScore) + rankTier
   * reconcile for all active products. Runs every night at 03:00.
   *
   * - popularityScore: the weighted engagement score
   * - qualityScore: photos + description + the seller's stored trust rating
   *   (`computeQualityScore`, used in ranking)
   * - rankTier reconcile: active boost → 2; paid (non-free) member seller → 1;
   *   standard → 0
   * The real work: the Bull processor 'update-popularity' calls this.
   */
  async runUpdatePopularityScores(log: (msg: string) => void = () => {}) {
    this.logger.log("Starting popularity + quality score update...");
    log("Popülerlik/kalite skoru güncellemesi başladı");

    try {
      const now = new Date();
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // Get all active products with their stats
      const products = await this.prisma.product.findMany({
        where: { status: ProductStatus.active },
        select: {
          id: true,
          viewCount: true,
          likeCount: true,
          description: true,
          sellerId: true,
          _count: {
            select: {
              images: true,
              orders: { where: { status: "completed" } },
              likes: { where: { createdAt: { gte: sevenDaysAgo } } },
            },
          },
        },
      });

      this.logger.log(`Processing ${products.length} products...`);

      // The sellers' stored trust scores in one query (no N+1).
      // seller-trust-refresh (02:30) normally finishes before this job
      // (03:00); if it is late or failed, this run ranks with the previous
      // night's scores and the next night catches up.
      const sellerIds = [...new Set(products.map((p) => p.sellerId))];
      const sellerTrust = await this.sellerTrust.getForUsers(sellerIds);

      // Ücretli (free olmayan) aktif üyeli satıcılar → rankTier 1
      const premiumMemberships = sellerIds.length
        ? await this.prisma.userMembership.findMany({
            where: {
              userId: { in: sellerIds },
              status: { in: ["active", "cancelled"] },
              currentPeriodEnd: { gt: new Date() },
              tier: {
                type: { not: MembershipTierType.free },
                isActive: true,
              },
              OR: [
                { tier: { type: { not: MembershipTierType.business } } },
                {
                  tier: { type: MembershipTierType.business },
                  user: {
                    businessStatus: "approved",
                    companyName: { not: null },
                    taxId: { not: null },
                  },
                },
              ],
            },
            select: { userId: true },
          })
        : [];
      const premiumSet = new Set(premiumMemberships.map((m) => m.userId));

      // Ürün başına mesaj (konuşma) sayısını tek sorguda topla — "Mesaj alma" aktivite faktörü
      const productIds = products.map((p) => p.id);
      const messageGroups = productIds.length
        ? await this.prisma.messageThread.groupBy({
            by: ["productId"],
            where: { productId: { in: productIds } },
            _count: true,
          })
        : [];
      const messageCountMap = new Map<string, number>();
      for (const g of messageGroups) {
        if (g.productId) messageCountMap.set(g.productId, g._count ?? 0);
      }

      let updatedCount = 0;
      for (const product of products) {
        const popularityScore = this.calculatePopularityScore({
          viewCount: product.viewCount,
          likeCount: product.likeCount,
          salesCount: product._count.orders,
          messageCount: messageCountMap.get(product.id) ?? 0,
          recentLikes: product._count.likes,
          recentViews: 0, // TODO: gerçek son-7-gün görüntülenme takibi (ayrı view-log gerekir)
        });

        const qualityScore = computeQualityScore({
          photoCount: product._count.images,
          description: product.description,
          sellerTrustRating: sellerTrust.get(product.sellerId)?.rating ?? null,
        });

        // rankTier reconcile: boosted (2) is decided by the row at write
        // time, so a boost activated since the read above keeps its tier and
        // bonus; otherwise a paid member seller gets 1, everyone else 0.
        await writeProductRanking(this.prisma, {
          productId: product.id,
          qualityScore,
          popularityScore,
          unboostedTier: premiumSet.has(product.sellerId) ? 1 : 0,
          writePopularity: true,
          now,
        });

        updatedCount++;
      }

      this.logger.log(
        `Popularity/quality scores updated for ${updatedCount} products`,
      );
      log(`${updatedCount} ürünün skoru güncellendi`);
      return {
        summary: `${updatedCount} ürün skoru güncellendi`,
        stats: { updated: updatedCount },
      };
    } catch (error: unknown) {
      this.logger.error(
        `Error updating scores: ${errorMessage(error)}`,
        errorStack(error),
      );
      log(`HATA: ${errorMessage(error)}`);
      // Yutmadan yükselt: Bull job'ı "failed" olsun ki attempts/backoff ve Sentry
      // Cron alarmı gerçekten devreye girsin (aksi halde başarısız tur bile
      // "başarılı" görünür ve hata yalnız log satırında kalır).
      throw error;
    }
  }

  /**
   * Manual trigger for popularity/quality score update
   * Can be called by admin endpoints
   */
  async manualUpdatePopularityScores(): Promise<{ updated: number }> {
    await this.runUpdatePopularityScores();
    const count = await this.prisma.product.count({
      where: {
        status: ProductStatus.active,
      },
    });
    return { updated: count };
  }

  /**
   * The expire-boosts job, every 15 minutes (the Bull processor
   * 'expire-boosts' calls it). Each listing is handled in its own transaction
   * through the timeline owner, under the listing lock:
   *
   * 1. Expiry: the listing's ended boosts become `expired`, its promotion is
   *    rebuilt, and the seller is told once when the promotion really ended
   *    (no running boost of the listing ends later), not once per boost.
   * 2. Reminder: a premium seller who asked for it hears 24 hours before the
   *    listing's promotion ends (`BOOST_ENDING_SOON`), once per end.
   * 3. Unpaid boosts older than a day become `failed`.
   * 4. System pause and resume of the boosts of offline and live listings.
   *
   * The notices are outbox rows written with the change and sent right after
   * the commit; the drainer sends what this run could not.
   */
  async runExpireBoosts(log: (msg: string) => void = () => {}) {
    try {
      const now = new Date();

      const expiry = await this.expireEndedPromotions(now);
      const reminded = await this.remindEndingPromotions(now);

      // Unpaid (pending) boosts older than a day become failed.
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      await this.prisma.productBoost.updateMany({
        where: { status: "pending", createdAt: { lt: oneDayAgo } },
        data: { status: "failed" },
      });

      // ── SİSTEM DURAKLAT/SÜRDÜR (B4) ─────────────────────────────────────
      // Yayında olmayan ürünün boost'u görünmezken akmasın: satın alınan süre
      // duraklatılır, ürün yayına dönünce kalan süreyle sürer. Tek yerden
      // (bu 15 dk'lık cron) yürür — süre dolumu, satış, pasife alma, red,
      // askı ve TÜM gelecekteki yollar otomatik kapsanır (en çok 15 dk sarkma).
      // Admin'in ELLE duraklattığı boost (pausedBySystem=false) otomatik
      // sürdürülmez.
      const paused = await this.pauseBoostsOfDelistedProducts(now);
      const resumed = await this.resumeSystemPausedBoosts(now);

      log(
        `${expiry.listings} listing(s) checked · ${expiry.expired} boost(s) ended · ${expiry.notices} ended notice(s) · ${reminded} reminder(s) · ${paused} paused · ${resumed} resumed`,
      );
      return {
        summary: `${expiry.expired} boost(s) ended · ${expiry.notices} listing(s) unfeatured · ${reminded} reminder(s)`,
        stats: {
          downgraded: expiry.listings,
          expired: expiry.expired,
          endedNotices: expiry.notices,
          reminded,
          systemPaused: paused,
          systemResumed: resumed,
        },
      };
    } catch (error: unknown) {
      this.logger.error(
        `Error expiring boosts: ${errorMessage(error)}`,
        errorStack(error),
      );
      log(`HATA: ${errorMessage(error)}`);
      // Yutmadan yükselt: Bull job'ı "failed" olsun ki attempts/backoff ve Sentry
      // Cron alarmı gerçekten devreye girsin (aksi halde başarısız tur bile
      // "başarılı" görünür ve hata yalnız log satırında kalır).
      throw error;
    }
  }

  /**
   * Expiry, per listing (`BoostTimelineService.expireEnded`): the listings
   * with an ended active boost, plus the listings whose promotion columns
   * outlived their boosts (an ended `boostedUntil` with a LIFO key still set:
   * the sweep looks at the boost columns, not at `rankTier`, so a listing the
   * nightly reconcile downgraded never stays on top of the LIFO order).
   * Bounded and ordered; the rest follow on the next run.
   */
  private async expireEndedPromotions(
    now: Date,
  ): Promise<{ listings: number; expired: number; notices: number }> {
    const [ended, stale] = await Promise.all([
      this.prisma.productBoost.findMany({
        where: { status: "active", endsAt: { lte: now } },
        select: { productId: true },
        distinct: ["productId"],
        orderBy: { productId: "asc" },
        take: BOOST_EXPIRY_BATCH,
      }),
      this.prisma.product.findMany({
        where: { boostedAt: { not: null }, boostedUntil: { lt: now } },
        select: { id: true },
        orderBy: { id: "asc" },
        take: BOOST_EXPIRY_BATCH,
      }),
    ]);
    const productIds = [
      ...new Set([
        ...ended.map((row) => row.productId),
        ...stale.map((row) => row.id),
      ]),
    ];
    const results = await this.perListing("expiry", productIds, (tx, id) =>
      this.boostTimeline.expireEnded(tx, id, now),
    );
    let expired = 0;
    let notices = 0;
    for (const result of results) {
      expired += result.expired;
      if (result.notice) {
        notices += 1;
        await this.boostNotices.flush(result.notice);
      }
    }
    if (expired > 0) {
      this.logger.log(
        `Boost expiry: ${expired} boost(s) on ${productIds.length} listing(s), ${notices} promotion(s) ended`,
      );
    }
    return { listings: productIds.length, expired, notices };
  }

  /**
   * Ending-soon reminders, per listing (`BoostTimelineService.remindEndingSoon`,
   * which decides and claims under the listing lock). The candidates are the
   * live listings whose last running boost ends within the lead time and has
   * not announced this end yet, with the reminder on for the listing
   * (`isBoostReminderDue` in SQL), so reminded listings never crowd out the
   * batch. Premium is checked per listing in the timeline: a seller whose
   * premium lapsed stays a candidate until the end passes (at most a day), a
   * small set ordered after the sooner ends.
   */
  private async remindEndingPromotions(now: Date): Promise<number> {
    const horizon = new Date(now.getTime() + BOOST_REMINDER_LEAD_MS);
    const leadMinutes = BOOST_REMINDER_LEAD_MS / 60_000;
    const rows = await this.prisma.$queryRaw<Array<{ productId: string }>>`
      SELECT b."product_id" AS "productId"
      FROM "product_boosts" b
      JOIN "products" p ON p."id" = b."product_id"
      WHERE b."status" = ${BoostStatus.active}::"BoostStatus"
        AND b."ends_at" > ${now}
        AND b."ends_at" <= ${horizon}
        AND (
          b."reminder_sent_at" IS NULL
          OR b."reminder_sent_at" < b."ends_at" - make_interval(mins => ${leadMinutes}::int)
        )
        AND p."status" = ${ProductStatus.active}::"ProductStatus"
        AND NOT EXISTS (
          SELECT 1 FROM "product_boosts" later
          WHERE later."product_id" = b."product_id"
            AND later."status" = ${BoostStatus.active}::"BoostStatus"
            AND later."ends_at" > b."ends_at"
        )
        AND EXISTS (
          SELECT 1 FROM "product_boosts" asked
          WHERE asked."product_id" = b."product_id"
            AND asked."status" IN (${BoostStatus.active}::"BoostStatus", ${BoostStatus.paused}::"BoostStatus")
            AND asked."auto_renew" = true
        )
      ORDER BY b."ends_at" ASC, b."product_id" ASC
      LIMIT ${BOOST_REMINDER_BATCH}`;
    const productIds = [...new Set(rows.map((row) => row.productId))];
    const notices = await this.perListing("reminder", productIds, (tx, id) =>
      this.boostTimeline.remindEndingSoon(tx, id, now),
    );
    let sent = 0;
    for (const notice of notices) {
      if (!notice) continue;
      sent += 1;
      await this.boostNotices.flush(notice);
    }
    if (sent > 0) {
      this.logger.log(`Boost reminder: ${sent} listing(s)`);
    }
    return sent;
  }

  /**
   * System pause: the running boosts of listings that are not live keep their
   * own remaining time and leave the listing, one transaction per listing
   * through the timeline owner (`BoostTimelineService.pauseForDelisting`).
   */
  private async pauseBoostsOfDelistedProducts(now: Date): Promise<number> {
    const rows = await this.prisma.productBoost.findMany({
      where: {
        status: "active",
        endsAt: { gt: now },
        product: { status: { not: ProductStatus.active } },
      },
      select: { productId: true },
      distinct: ["productId"],
      orderBy: { productId: "asc" },
      take: BOOST_SYSTEM_PAUSE_BATCH,
    });
    return this.countPerListing("pause", rows, (tx, productId) =>
      this.boostTimeline.pauseForDelisting(tx, productId, now),
    );
  }

  /**
   * System resume: the boosts the system paused run again with their own
   * remaining time once their listing is live, one transaction per listing
   * (`BoostTimelineService.resumeSystemPaused`). A staff pause
   * (`pausedBySystem = false`) is never resumed here.
   */
  private async resumeSystemPausedBoosts(now: Date): Promise<number> {
    const rows = await this.prisma.productBoost.findMany({
      where: {
        status: "paused",
        pausedBySystem: true,
        product: { status: ProductStatus.active },
      },
      select: { productId: true },
      distinct: ["productId"],
      orderBy: { productId: "asc" },
      take: BOOST_SYSTEM_PAUSE_BATCH,
    });
    return this.countPerListing("resume", rows, (tx, productId) =>
      this.boostTimeline.resumeSystemPaused(tx, productId, now),
    );
  }

  /** A system pause or resume per listing; returns the boosts changed. */
  private async countPerListing(
    action: "pause" | "resume",
    rows: Array<{ productId: string }>,
    work: (tx: Prisma.TransactionClient, productId: string) => Promise<number>,
  ): Promise<number> {
    const counts = await this.perListing(
      action,
      rows.map((row) => row.productId),
      work,
    );
    const changed = counts.reduce((sum, count) => sum + count, 0);
    if (changed > 0) {
      this.logger.log(
        `System boost ${action}: ${changed} boost(s) on ${rows.length} listing(s)`,
      );
    }
    return changed;
  }

  /**
   * Runs one listing's boost work per transaction and returns the results of
   * the listings that succeeded. A listing that fails is logged (ids only)
   * and left for the next run; it never stops the others.
   */
  private async perListing<T>(
    action: string,
    productIds: string[],
    work: (tx: Prisma.TransactionClient, productId: string) => Promise<T>,
  ): Promise<T[]> {
    const results: T[] = [];
    for (const productId of productIds) {
      try {
        results.push(
          await this.prisma.$transaction((tx) => work(tx, productId)),
        );
      } catch (error: unknown) {
        this.logger.error(
          `Boost ${action} failed for listing ${productId}: ${errorMessage(error)}`,
          errorStack(error),
        );
      }
    }
    return results;
  }

  /**
   * Expire old listings (listing lifetime — `listingTtlDays`)
   * Runs every day at 04:00 AM
   * Süresi dolan aktif ilana, seçili eylemin (`listingTtlDays` → "süre dolunca")
   * gereğini uygular:
   *  - `deactivate` (varsayılan): pasife alır ve `expired` nedeniyle işaretler
   *    (satıcı tek eylemle yenileyebilsin; elle pasife alma/stok bitişinden ayırt
   *    edilebilsin) + "süresi doldu" e-postası.
   *  - `auto_renew`: hâlâ satılabilir ilanı (stokta, satıcı banlı/askıda değil)
   *    YERİNDE yeniler — ömür baştan başlar, satıcıya e-posta gitmez; satılamaz
   *    olan ilan `deactivate` yoluna düşer.
   * Gerçek iş — Bull processor 'expire-old-listings' buradan çağırır.
   */
  async runExpireOldListings(log: (msg: string) => void = () => {}) {
    this.logger.log("Starting listing expiration check...");

    try {
      const ttlDays = await resolveTimingValue(this.prisma, "listingTtlDays");
      const action = await resolveTimingAction(this.prisma, "listingTtlDays");
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() - ttlDays);

      // Süre YAYIN anından sayılır (publishedAt; eski kayıtlarda createdAt).
      // Yalnız gerçek ilanlar: membership/boost sanal ürünleri (kind != listing)
      // yaşam süresine tabi değildir — eskiden onlar da 60 günde kapanıp
      // platform hesabına "ilanınız sona erdi" e-postası tetikliyordu.
      const expiryWhere: Prisma.ProductWhereInput = {
        status: ProductStatus.active,
        kind: ProductKind.listing,
        OR: [
          { publishedAt: { lt: expiryDate } },
          { publishedAt: null, createdAt: { lt: expiryDate } },
        ],
      };

      // Bu turda dolacak ilanları, e-posta/eylem kararı için yazımdan ÖNCE topla.
      const due = await this.prisma.product.findMany({
        where: expiryWhere,
        select: {
          id: true,
          title: true,
          quantity: true,
          seller: {
            select: {
              id: true,
              displayName: true,
              isBanned: true,
              businessStatus: true,
              companyName: true,
              taxId: true,
              membership: {
                select: {
                  status: true,
                  currentPeriodEnd: true,
                  tier: { select: { type: true, isActive: true } },
                },
              },
            },
          },
        },
      });

      // Yazım İLAN BAŞINA ve aynı süre koşuluyla yapılır: toplu updateMany ile
      // seçim arasında yenilenen/onaylanan ilan (publishedAt şimdi) koşula
      // artık uymaz → dokunulmaz, e-postası da gitmez ("az önce yenilenen ilanı
      // pasife alma" yarışı). Etkilenen satır sayısı (0/1) gerçek sonucu verir.
      const expired: typeof due = [];
      const renewed: string[] = [];
      const renewNow = new Date();
      // Tek ilanın yazım hatası turu yarıda kesmez: hata sayılır, döngü sürer.
      // Yazılmış ilanların yan etkileri (dizin/önbellek, e-posta) aşağıda her
      // durumda çalışır; yoksa artık `active` olmadıkları için bir sonraki tur
      // onları seçmez ve satıcı haberdar edilmeden aramada görünür kalırlardı.
      let failed = 0;
      for (const listing of due) {
        try {
          if (
            action === "auto_renew" &&
            isRenewableInPlace(listing, listing.seller)
          ) {
            const res = await this.prisma.product.updateMany({
              where: { ...expiryWhere, id: listing.id },
              data: { publishedAt: renewNow },
            });
            if (res.count > 0) renewed.push(listing.id);
            continue;
          }
          // Davranış işareti (`inactiveReason`) statüyle aynı yazımda kalır;
          // kaldırma nedeni aynı transaction'da kaydedilir.
          const count = await this.prisma.$transaction(async (tx) => {
            const res = await tx.product.updateMany({
              where: { ...expiryWhere, id: listing.id },
              data: {
                status: ProductStatus.inactive,
                inactiveReason: ProductInactiveReason.expired,
              },
            });
            if (res.count > 0) {
              await recordListingRemovals(tx, [
                {
                  productId: listing.id,
                  statusBefore: ProductStatus.active,
                  statusAfter: ProductStatus.inactive,
                  reason: ListingRemovalReason.expired,
                },
              ]);
            }
            return res.count;
          });
          if (count > 0) expired.push(listing);
        } catch (err: unknown) {
          failed += 1;
          this.logger.error(
            `expire-old-listings failed for listing ${listing.id}: ${errorMessage(err)}`,
          );
        }
      }

      if (expired.length > 0 || renewed.length > 0) {
        this.logger.log(
          `Listings past ${ttlDays} days: ${expired.length} expired, ${renewed.length} auto-renewed`,
        );
      } else {
        this.logger.log("No listings to expire");
      }

      // Pasife alınanlar önbellekten ve arama dizininden düşer (toplu updateMany
      // Prisma arama-senkron middleware'ini tetiklemez; elle senkronlanır).
      await refreshProductVisibility(
        {
          cache: this.cache,
          searchService: this.searchService,
          logger: this.logger,
        },
        expired.map((l) => l.id),
      );

      // "İlanınız sona erdi" e-postaları (ilan başına, satıcıya). İlan ömrünü
      // doldurduğu ilk gün expire olup active'den çıktığı için mükerrer gitmez.
      // Bağlantı, ilanın kendi sayfası değil satıcının "süresi dolan" sekmesidir:
      // pasif ilanın herkese açık sayfası yok, yenileme orada.
      const frontendUrl = resolveFrontendUrl();
      for (const listing of expired) {
        try {
          await this.notificationService.sendTemplateEmailToUser(
            listing.seller.id,
            "listing-expired",
            {
              sellerName: listing.seller.displayName ?? "",
              productTitle: listing.title,
              listingUrl: `${frontendUrl}/profile/listings?status=expired`,
            },
          );
        } catch (err: unknown) {
          this.logger.warn(
            `listing-expired email failed for ${listing.id}: ${errorMessage(err)}`,
          );
        }
      }

      log(
        `${expired.length} eski ilan pasif yapıldı, ${renewed.length} ilan otomatik yenilendi (>${ttlDays} gün)`,
      );
      if (failed > 0) {
        // Tüm ilanlar ve yan etkileri işlendikten SONRA yükselt: tracked job
        // "failed" olsun (Sentry cron alarmı), kalan ilanlar yine de işlenmiş olsun.
        throw new Error(
          `${failed} ilan işlenemedi (${expired.length} pasife alındı, ${renewed.length} yenilendi)`,
        );
      }
      return {
        summary: `${expired.length} eski ilan pasif yapıldı · ${renewed.length} yenilendi`,
        stats: { expired: expired.length, renewed: renewed.length },
      };
    } catch (error: unknown) {
      this.logger.error(
        `Error expiring listings: ${errorMessage(error)}`,
        errorStack(error),
      );
      log(`HATA: ${errorMessage(error)}`);
      // Yutmadan yükselt: Bull job'ı "failed" olsun ki attempts/backoff ve Sentry
      // Cron alarmı gerçekten devreye girsin (aksi halde başarısız tur bile
      // "başarılı" görünür ve hata yalnız log satırında kalır).
      throw error;
    }
  }

  /**
   * Moderasyonda 48 saatten uzun bekleyen ilanlar için adminlere GÜNLÜK özet.
   * `pending` süresizdir (yalnız active süre dolumuna tabidir); kuyruk sessizce
   * yığılıyordu, kimse haber almıyordu. Cron günde bir koştuğu için ayrıca
   * dedupe gerekmez. Gerçek iş — Bull processor 'pending-moderation-digest'.
   */
  async runPendingModerationDigest(
    log: (msg: string) => void = () => {},
  ): Promise<CronRunSummary> {
    const threshold = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const staleCount = await this.prisma.product.count({
      where: {
        status: ProductStatus.pending,
        kind: ProductKind.listing,
        createdAt: { lt: threshold },
      },
    });
    if (staleCount === 0) {
      log("48 saatten eski bekleyen ilan yok");
      return { summary: "0 bekleyen ilan", stats: { stale: 0 } };
    }

    const admins = await this.prisma.adminUser.findMany({
      where: { isActive: true },
      select: { userId: true },
    });
    const adminBaseUrl = adminUrl();
    for (const admin of admins) {
      try {
        await this.notificationService.createInAppNotification(
          admin.userId,
          NotificationType.MODERATION_QUEUE_STALE,
          {
            count: staleCount,
            adminLink: `${adminBaseUrl}/catalog/products?status=pending`,
          },
        );
      } catch (err: unknown) {
        this.logger.warn(
          `pending-moderation-digest bildirimi başarısız (${admin.userId}): ${errorMessage(err)}`,
        );
      }
    }
    log(
      `${staleCount} bekleyen ilan için ${admins.length} admin bilgilendirildi`,
    );
    return {
      summary: `${staleCount} bekleyen ilan (48s+)`,
      stats: { stale: staleCount, admins: admins.length },
    };
  }

  /**
   * Get listings that will expire soon (within the warning lead time)
   * Can be used to send notifications to sellers
   */
  async getExpiringListings(daysUntilExpiry?: number) {
    const ttlDays = await resolveTimingValue(this.prisma, "listingTtlDays");
    const leadDays =
      daysUntilExpiry ??
      (await resolveTimingValue(this.prisma, "listingExpiryWarningDays"));
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() - ttlDays + leadDays);

    const warningDate = new Date();
    warningDate.setDate(warningDate.getDate() - ttlDays);

    return this.prisma.product.findMany({
      where: {
        status: ProductStatus.active,
        // Süre yayın anından sayılır (publishedAt; eski kayıtta createdAt).
        OR: [
          { publishedAt: { lt: expiryDate, gt: warningDate } },
          { publishedAt: null, createdAt: { lt: expiryDate, gt: warningDate } },
        ],
      },
      select: {
        id: true,
        title: true,
        createdAt: true,
        publishedAt: true,
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
   * Gerçek iş — Bull processor 'send-expiration-warnings' buradan çağırır.
   */
  async runSendExpirationWarnings(log: (msg: string) => void = () => {}) {
    this.logger.log("Checking for listings expiring soon...");

    try {
      // `auto_renew` seçiliyken ilan dolmaz, yerinde yenilenir: "süresi doluyor"
      // uyarısı yanlış (ve her ilan için boşuna) olurdu. Yenilenemeyen ilan
      // (stok/satıcı) zaten dolumda "süresi doldu" e-postasını alır.
      const expiryAction = await resolveTimingAction(
        this.prisma,
        "listingTtlDays",
      );
      if (expiryAction === "auto_renew") {
        log("Otomatik yenileme açık: süre uyarısı gönderilmedi");
        return {
          summary: "0 yaklaşan ilan (otomatik yenileme)",
          stats: { sellers: 0, listings: 0 },
        };
      }

      // Cron günlük çalışır. 7 günlük pencerenin TAMAMINI seçersek aynı ilana
      // 7 gün boyunca her gün uyarı gider. Bunun yerine yalnız BUGÜN 53 günü
      // (60 - 7) dolduran ilanları (1 günlük bant) seç → ilan başına tek uyarı.
      // İki sayı da Süreler ve Kurallar'dan; kayıt uyarı < ömür dayatır.
      const ttlDays = await resolveTimingValue(this.prisma, "listingTtlDays");
      const warnDaysBefore = await resolveTimingValue(
        this.prisma,
        "listingExpiryWarningDays",
      );
      const bandEnd = new Date();
      bandEnd.setDate(bandEnd.getDate() - (ttlDays - warnDaysBefore));
      const bandStart = new Date(bandEnd);
      bandStart.setDate(bandStart.getDate() - 1);

      const expiringListings = await this.prisma.product.findMany({
        where: {
          status: ProductStatus.active,
          kind: ProductKind.listing,
          // Süre yayın anından sayılır (publishedAt; eski kayıtta createdAt).
          OR: [
            { publishedAt: { gte: bandStart, lt: bandEnd } },
            { publishedAt: null, createdAt: { gte: bandStart, lt: bandEnd } },
          ],
        },
        select: {
          id: true,
          title: true,
          createdAt: true,
          publishedAt: true,
          seller: { select: { id: true, displayName: true } },
        },
      });

      if (expiringListings.length === 0) {
        this.logger.log(
          `No listings entering the ${warnDaysBefore}-day expiry warning window`,
        );
        log("Süresi yaklaşan ilan yok");
        return {
          summary: "0 yaklaşan ilan",
          stats: { sellers: 0, listings: 0 },
        };
      }

      this.logger.log(
        `Warning sellers about ${expiringListings.length} listing(s) expiring in ~${warnDaysBefore} days`,
      );
      log(
        `${expiringListings.length} ilan ${warnDaysBefore} gün içinde sona eriyor`,
      );

      // "İlanınızın süresi doluyor" e-postası (ilan başına, satıcıya).
      const frontendUrl = resolveFrontendUrl();
      for (const listing of expiringListings) {
        // Bitiş tarihi sayıma esas olan YAYIN anından (publishedAt; eski kayıtta
        // createdAt) hesaplanır — eskiden createdAt'ten hesaplanıp yeniden
        // onaylanmış ilanlara yanlış tarih yazılıyordu.
        const expirationDate = new Date(
          listing.publishedAt ?? listing.createdAt,
        );
        expirationDate.setDate(expirationDate.getDate() + ttlDays);
        try {
          await this.notificationService.sendTemplateEmailToUser(
            listing.seller.id,
            "listing-expiring",
            {
              sellerName: listing.seller.displayName ?? "",
              productTitle: listing.title,
              daysRemaining: warnDaysBefore,
              expirationDate: expirationDate.toLocaleDateString("tr-TR"),
              // Süre dolunca yenileme "ilanlarım"dadır; ilan sayfası değil.
              listingUrl: `${frontendUrl}/profile/listings`,
            },
          );
        } catch (err: unknown) {
          this.logger.warn(
            `listing-expiring email failed for ${listing.id}: ${errorMessage(err)}`,
          );
        }
      }

      const sellerCount = new Set(expiringListings.map((l) => l.seller.id))
        .size;
      log(
        `${sellerCount} satıcıya ${expiringListings.length} ilan için süre uyarısı gönderildi`,
      );
      return {
        summary: `${sellerCount} satıcı · ${expiringListings.length} ilan`,
        stats: { sellers: sellerCount, listings: expiringListings.length },
      };
    } catch (error: unknown) {
      this.logger.error(
        `Error sending expiration warnings: ${errorMessage(error)}`,
        errorStack(error),
      );
      log(`HATA: ${errorMessage(error)}`);
      // Yutmadan yükselt: Bull job'ı "failed" olsun ki attempts/backoff ve Sentry
      // Cron alarmı gerçekten devreye girsin (aksi halde başarısız tur bile
      // "başarılı" görünür ve hata yalnız log satırında kalır).
      throw error;
    }
  }

  /**
   * Manual trigger for listing expiration
   * Can be called by admin endpoints
   */
  async manualExpireListings(): Promise<{ expired: number }> {
    // run*()'u doğrudan çağır (flag açıkken bile manuel tetik gerçek işi yapsın).
    const res = await this.runExpireOldListings();
    return { expired: res.stats?.expired ?? 0 };
  }
}
