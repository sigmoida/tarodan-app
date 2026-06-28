import { Injectable, Logger, Inject, forwardRef, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { TrackedCron } from '../../monitoring/tracked-cron.decorator';
import { cronsViaBull, registerRepeatableCron } from '../../monitoring/bull-cron.helper';
import { QUEUE_NAMES } from '../../workers/constants';
import { PrismaService } from '../../prisma';
import { ProductStatus, MembershipTierType } from '@prisma/client';
import { computeQualityScore } from './helpers/quality-score';
import { computeRelevanceScore } from './helpers/relevance-score';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/dto';

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

  // Listing expiration settings
  private readonly LISTING_EXPIRY_DAYS = 60; // Listings expire after 60 days

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => NotificationService))
    private readonly notificationService: NotificationService,
    @InjectQueue(QUEUE_NAMES.SCHEDULED) private readonly scheduledQueue: Queue,
  ) {}

  /**
   * Flag (CRONS_VIA_BULL) açıkken expireBoosts'u Bull repeatable job'una bağla.
   * Flag kapalıyken hiçbir şey yapma — eski in-process @Cron çalışmaya devam eder.
   */
  async onModuleInit(): Promise<void> {
    const on = cronsViaBull();
    await registerRepeatableCron(this.scheduledQueue, 'expire-boosts', '*/15 * * * *', on, this.logger);
    await registerRepeatableCron(this.scheduledQueue, 'update-popularity', '0 3 * * *', on, this.logger);
    await registerRepeatableCron(this.scheduledQueue, 'expire-old-listings', '0 4 * * *', on, this.logger);
    await registerRepeatableCron(this.scheduledQueue, 'send-expiration-warnings', '0 10 * * *', on, this.logger);
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
   * Update popularity scores + İlan Kalite Skoru (qualityScore) + rankTier reconcile
   * for all active products. Runs every night at 03:00.
   *
   * - popularityScore: mevcut ağırlıklı skor (popularityScore kolonuna yazılır)
   * - qualityScore: foto sayısı + açıklama + satıcı güven puanı (sıralamada kullanılır)
   * - rankTier reconcile: aktif boost → 2; ücretli (free olmayan) üyeli satıcı → 1; standart → 0
   */
  @TrackedCron('0 3 * * *') // Every day at 03:00 AM
  async updatePopularityScores() {
    if (cronsViaBull()) {
      return;
    }
    return this.runUpdatePopularityScores();
  }

  /** Gerçek iş — in-process cron ve Bull processor buradan çağırır. */
  async runUpdatePopularityScores(log: (msg: string) => void = () => {}) {
    this.logger.log('Starting popularity + quality score update...');
    log('Popülerlik/kalite skoru güncellemesi başladı');

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
          boostedUntil: true,
          sellerId: true,
          seller: { select: { isVerified: true } },
          _count: {
            select: {
              images: true,
              orders: { where: { status: 'completed' } },
              likes: { where: { createdAt: { gte: sevenDaysAgo } } },
            },
          },
        },
      });

      this.logger.log(`Processing ${products.length} products...`);

      // Satıcı güven puanlarını tek sorguda topla (N+1 önlemek için)
      const sellerIds = [...new Set(products.map((p) => p.sellerId))];
      const ratingGroups = sellerIds.length
        ? await this.prisma.rating.groupBy({
            by: ['receiverId'],
            where: { receiverId: { in: sellerIds }, status: 'approved' },
            _avg: { score: true },
          })
        : [];
      const sellerRatingMap = new Map<string, number>();
      for (const g of ratingGroups) {
        if (g._avg?.score != null) sellerRatingMap.set(g.receiverId, Number(g._avg.score));
      }

      // Ücretli (free olmayan) aktif üyeli satıcılar → rankTier 1
      const premiumMemberships = sellerIds.length
        ? await this.prisma.userMembership.findMany({
            where: {
              userId: { in: sellerIds },
              status: 'active',
              tier: { type: { not: MembershipTierType.free } },
            },
            select: { userId: true },
          })
        : [];
      const premiumSet = new Set(premiumMemberships.map((m) => m.userId));

      // Ürün başına mesaj (konuşma) sayısını tek sorguda topla — "Mesaj alma" aktivite faktörü
      const productIds = products.map((p) => p.id);
      const messageGroups = productIds.length
        ? await this.prisma.messageThread.groupBy({
            by: ['productId'],
            where: { productId: { in: productIds } },
            _count: true,
          })
        : [];
      const messageCountMap = new Map<string, number>();
      for (const g of messageGroups) {
        if (g.productId) messageCountMap.set(g.productId, (g as any)._count ?? 0);
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
          sellerRating: sellerRatingMap.get(product.sellerId) ?? null,
          isVerifiedSeller: product.seller?.isVerified ?? false,
        });

        // rankTier reconcile
        const hasActiveBoost =
          product.boostedUntil != null && new Date(product.boostedUntil) > now;
        const rankTier = hasActiveBoost ? 2 : premiumSet.has(product.sellerId) ? 1 : 0;

        const relevanceScore = computeRelevanceScore({ rankTier, qualityScore, popularityScore });

        await this.prisma.product.update({
          where: { id: product.id },
          data: { popularityScore, popularityUpdatedAt: now, qualityScore, rankTier, relevanceScore } as any,
        });

        updatedCount++;
      }

      this.logger.log(`Popularity/quality scores updated for ${updatedCount} products`);
      log(`${updatedCount} ürünün skoru güncellendi`);
      return { summary: `${updatedCount} ürün skoru güncellendi`, stats: { updated: updatedCount } };
    } catch (error: any) {
      this.logger.error(`Error updating scores: ${error.message}`, error.stack);
      log(`HATA: ${error.message}`);
      return { summary: `Hata: ${error.message}`, stats: { updated: 0, errors: 1 } };
    }
  }

  /**
   * Manual trigger for popularity/quality score update
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
   * Süresi dolan boost'ları düşür. Her 15 dakikada çalışır.
   * - boostedUntil geçmişte kalan ürünlerin rankTier'ını premium(1)/standart(0)'a indirir.
   * - İlgili ProductBoost kayıtlarını 'expired' yapar.
   * - Uzun süredir 'pending' kalan (ödenmemiş) boost'ları 'failed' yapar.
   */
  @TrackedCron('*/15 * * * *') // Her 15 dakikada
  async expireBoosts() {
    // Flag açıkken bu iş Bull repeatable'a taşındı; in-process cron no-op olur
    // (çift çalışmayı önler). Flag kapalıyken eski davranış birebir devam eder.
    if (cronsViaBull()) {
      return;
    }
    return this.runExpireBoosts();
  }

  /**
   * Boost süresi dolanları düşüren GERÇEK iş. Hem in-process cron hem Bull
   * processor buradan çağırır — mantık tek kaynakta, davranış birebir korunur.
   */
  async runExpireBoosts(log: (msg: string) => void = () => {}) {
    try {
      const now = new Date();

      // rankTier=2 ama boostedUntil süresi dolmuş ürünler
      const expiredProducts = await this.prisma.product.findMany({
        where: { rankTier: 2, boostedUntil: { lt: now } },
        select: { id: true, sellerId: true, qualityScore: true, popularityScore: true },
      });

      // Şimdi sona eren aktif boost'lar (otomatik yenileme hatırlatması için)
      const expiringBoosts = await this.prisma.productBoost.findMany({
        where: { status: 'active', endsAt: { lt: now } },
        select: {
          id: true,
          userId: true,
          autoRenew: true,
          product: { select: { title: true, sellerId: true } },
        },
      });

      // İlgili tüm satıcıların premium durumunu tek sorguda topla
      const sellerIds = [
        ...new Set([
          ...expiredProducts.map((p) => p.sellerId),
          ...expiringBoosts.map((b) => b.product?.sellerId).filter(Boolean) as string[],
        ]),
      ];
      const premiumSet = new Set<string>();
      if (sellerIds.length > 0) {
        const premiumMemberships = await this.prisma.userMembership.findMany({
          where: {
            userId: { in: sellerIds },
            status: 'active',
            tier: { type: { not: MembershipTierType.free } },
          },
          select: { userId: true },
        });
        premiumMemberships.forEach((m) => premiumSet.add(m.userId));
      }

      // rankTier'ı premium(1)/standart(0)'a indir + relevanceScore'u yeniden hesapla
      for (const p of expiredProducts) {
        const newRankTier = premiumSet.has(p.sellerId) ? 1 : 0;
        await this.prisma.product.update({
          where: { id: p.id },
          data: {
            rankTier: newRankTier,
            relevanceScore: computeRelevanceScore({
              rankTier: newRankTier,
              qualityScore: p.qualityScore ?? 0,
              popularityScore: p.popularityScore,
            }),
          },
        });
      }
      if (expiredProducts.length > 0) {
        this.logger.log(`Expired boost on ${expiredProducts.length} product(s)`);
      }

      // Otomatik yenileme açık + premium satıcı → yenileme hatırlatma bildirimi
      // (Gerçek recurring çekim yok; üyelik auto-renew gibi hatırlatma gönderilir.)
      for (const b of expiringBoosts) {
        if (b.autoRenew && b.product && premiumSet.has(b.product.sellerId)) {
          await this.notificationService
            .createInAppNotification(b.userId, NotificationType.BOOST_EXPIRED, {
              productTitle: b.product.title,
            })
            .catch(() => {});
        }
      }

      // ProductBoost kayıtlarını expired yap
      await this.prisma.productBoost.updateMany({
        where: { status: 'active', endsAt: { lt: now } },
        data: { status: 'expired' },
      });

      // 1 günden uzun süredir ödenmemiş (pending) boost'ları failed yap
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      await this.prisma.productBoost.updateMany({
        where: { status: 'pending', createdAt: { lt: oneDayAgo } },
        data: { status: 'failed' },
      });
      log(`${expiredProducts.length} ürün boost düşürüldü · ${expiringBoosts.length} boost sona erdi`);
      return {
        summary: `${expiredProducts.length} boost düşürüldü · ${expiringBoosts.length} sona erdi`,
        stats: { downgraded: expiredProducts.length, expired: expiringBoosts.length },
      };
    } catch (error: any) {
      this.logger.error(`Error expiring boosts: ${error.message}`, error.stack);
      log(`HATA: ${error.message}`);
      return { summary: `Hata: ${error.message}`, stats: { downgraded: 0, errors: 1 } };
    }
  }

  /**
   * Expire old listings (60 days)
   * Runs every day at 04:00 AM
   * Sets active listings older than 60 days to inactive status
   */
  @TrackedCron('0 4 * * *') // Every day at 04:00 AM
  async expireOldListings() {
    if (cronsViaBull()) {
      return;
    }
    return this.runExpireOldListings();
  }

  /** Gerçek iş — in-process cron ve Bull processor buradan çağırır. */
  async runExpireOldListings(log: (msg: string) => void = () => {}) {
    this.logger.log('Starting listing expiration check...');

    try {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() - this.LISTING_EXPIRY_DAYS);

      // Bu turda dolacak ilanları, satıcıya "ilanınız sona erdi" e-postası
      // gönderebilmek için updateMany'den ÖNCE topla (updateMany etkilenen
      // satırları döndürmez). Aynı where ile güncellendiği için tutarlı.
      const toExpire = await this.prisma.product.findMany({
        where: {
          status: ProductStatus.active,
          createdAt: { lt: expiryDate },
        },
        select: {
          id: true,
          title: true,
          seller: { select: { id: true, displayName: true } },
        },
      });

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

      // "İlanınız sona erdi" e-postaları (ilan başına, satıcıya). İlan 60 günü
      // doldurduğu ilk gün expire olup active'den çıktığı için mükerrer gitmez.
      const frontendUrl = process.env.FRONTEND_URL || 'https://tarodan.com';
      for (const listing of toExpire) {
        try {
          await this.notificationService.sendTemplateEmailToUser(listing.seller.id, 'listing-expired', {
            sellerName: listing.seller.displayName ?? '',
            productTitle: listing.title,
            listingUrl: `${frontendUrl}/products/${listing.id}`,
          });
        } catch (err: any) {
          this.logger.warn(`listing-expired email failed for ${listing.id}: ${err?.message}`);
        }
      }

      log(`${result.count} eski ilan pasif yapıldı (>${this.LISTING_EXPIRY_DAYS} gün)`);
      return { summary: `${result.count} eski ilan pasif yapıldı`, stats: { expired: result.count } };
    } catch (error: any) {
      this.logger.error(`Error expiring listings: ${error.message}`, error.stack);
      log(`HATA: ${error.message}`);
      return { summary: `Hata: ${error.message}`, stats: { expired: 0, errors: 1 } };
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
  @TrackedCron('0 10 * * *') // Every day at 10:00 AM
  async sendExpirationWarnings() {
    if (cronsViaBull()) {
      return;
    }
    return this.runSendExpirationWarnings();
  }

  /** Gerçek iş — in-process cron ve Bull processor buradan çağırır. */
  async runSendExpirationWarnings(log: (msg: string) => void = () => {}) {
    this.logger.log('Checking for listings expiring soon...');

    try {
      // Cron günlük çalışır. 7 günlük pencerenin TAMAMINI seçersek aynı ilana
      // 7 gün boyunca her gün uyarı gider. Bunun yerine yalnız BUGÜN 53 günü
      // (60 - 7) dolduran ilanları (1 günlük bant) seç → ilan başına tek uyarı.
      const WARN_DAYS_BEFORE = 7;
      const bandEnd = new Date();
      bandEnd.setDate(bandEnd.getDate() - (this.LISTING_EXPIRY_DAYS - WARN_DAYS_BEFORE));
      const bandStart = new Date(bandEnd);
      bandStart.setDate(bandStart.getDate() - 1);

      const expiringListings = await this.prisma.product.findMany({
        where: {
          status: ProductStatus.active,
          createdAt: { gte: bandStart, lt: bandEnd },
        },
        select: {
          id: true,
          title: true,
          createdAt: true,
          seller: { select: { id: true, displayName: true } },
        },
      });

      if (expiringListings.length === 0) {
        this.logger.log('No listings entering the 7-day expiry warning window');
        log('Süresi yaklaşan ilan yok');
        return { summary: '0 yaklaşan ilan', stats: { sellers: 0, listings: 0 } };
      }

      this.logger.log(`Warning sellers about ${expiringListings.length} listing(s) expiring in ~7 days`);
      log(`${expiringListings.length} ilan 7 gün içinde sona eriyor`);

      // "İlanınızın süresi doluyor" e-postası (ilan başına, satıcıya).
      const frontendUrl = process.env.FRONTEND_URL || 'https://tarodan.com';
      for (const listing of expiringListings) {
        const expirationDate = new Date(listing.createdAt);
        expirationDate.setDate(expirationDate.getDate() + this.LISTING_EXPIRY_DAYS);
        try {
          await this.notificationService.sendTemplateEmailToUser(listing.seller.id, 'listing-expiring', {
            sellerName: listing.seller.displayName ?? '',
            productTitle: listing.title,
            daysRemaining: WARN_DAYS_BEFORE,
            expirationDate: expirationDate.toLocaleDateString('tr-TR'),
            listingUrl: `${frontendUrl}/products/${listing.id}`,
          });
        } catch (err: any) {
          this.logger.warn(`listing-expiring email failed for ${listing.id}: ${err?.message}`);
        }
      }

      const sellerCount = new Set(expiringListings.map((l) => l.seller.id)).size;
      log(`${sellerCount} satıcıya ${expiringListings.length} ilan için süre uyarısı gönderildi`);
      return {
        summary: `${sellerCount} satıcı · ${expiringListings.length} ilan`,
        stats: { sellers: sellerCount, listings: expiringListings.length },
      };
    } catch (error: any) {
      this.logger.error(`Error sending expiration warnings: ${error.message}`, error.stack);
      log(`HATA: ${error.message}`);
      return { summary: `Hata: ${error.message}`, stats: { sellers: 0, listings: 0, errors: 1 } };
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
