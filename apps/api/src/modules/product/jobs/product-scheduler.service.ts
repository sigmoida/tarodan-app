import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { registerRepeatableCron } from "../../../monitoring/bull-cron.helper";
import { QUEUE_NAMES } from "../../../workers/constants";
import { PrismaService } from "../../../prisma";
import {
  ListingRemovalReason,
  Prisma,
  ProductInactiveReason,
  ProductKind,
  ProductStatus,
  MembershipTierType,
} from "@prisma/client";
import { computeQualityScore } from "../helpers/quality-score";
import { computeRelevanceScore } from "../helpers/relevance-score";
import { NotificationService } from "../../notification/notification.service";
import { NotificationType } from "../../notification/dto";
import { publicUserRatingWhere } from "../../../common/helpers/public-rating";
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
import { errorMessage } from "../../../common/helpers/error-message";
import { isRenewableInPlace } from "../helpers/product-renewal";
import { refreshProductVisibility } from "../helpers/product-visibility";
import { recordListingRemovals } from "../helpers/listing-removal";

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
   * Update popularity scores + İlan Kalite Skoru (qualityScore) + rankTier reconcile
   * for all active products. Runs every night at 03:00.
   *
   * - popularityScore: mevcut ağırlıklı skor (popularityScore kolonuna yazılır)
   * - qualityScore: foto sayısı + açıklama + satıcı güven puanı (sıralamada kullanılır)
   * - rankTier reconcile: aktif boost → 2; ücretli (free olmayan) üyeli satıcı → 1; standart → 0
   * Gerçek iş — Bull processor 'update-popularity' buradan çağırır.
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
          boostedUntil: true,
          sellerId: true,
          seller: { select: { isVerified: true } },
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

      // Satıcı güven puanlarını tek sorguda topla (N+1 önlemek için)
      const sellerIds = [...new Set(products.map((p) => p.sellerId))];
      const ratingGroups = sellerIds.length
        ? await this.prisma.rating.groupBy({
            by: ["receiverId"],
            where: publicUserRatingWhere({ receiverId: { in: sellerIds } }),
            _avg: { score: true },
          })
        : [];
      const sellerRatingMap = new Map<string, number>();
      for (const g of ratingGroups) {
        if (g._avg?.score != null)
          sellerRatingMap.set(g.receiverId, Number(g._avg.score));
      }

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
        if (g.productId)
          messageCountMap.set(g.productId, (g as any)._count ?? 0);
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
        const rankTier = hasActiveBoost
          ? 2
          : premiumSet.has(product.sellerId)
            ? 1
            : 0;

        const relevanceScore = computeRelevanceScore({
          rankTier,
          qualityScore,
          popularityScore,
        });

        await this.prisma.product.update({
          where: { id: product.id },
          data: {
            popularityScore,
            popularityUpdatedAt: now,
            qualityScore,
            rankTier,
            relevanceScore,
          } as any,
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
    } catch (error: any) {
      this.logger.error(`Error updating scores: ${error.message}`, error.stack);
      log(`HATA: ${error.message}`);
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
      } as any,
    });
    return { updated: count };
  }

  /**
   * Süresi dolan boost'ları düşür. Her 15 dakikada çalışır.
   * - boostedUntil geçmişte kalan ürünlerin rankTier'ını premium(1)/standart(0)'a indirir.
   * - İlgili ProductBoost kayıtlarını 'expired' yapar.
   * - Uzun süredir 'pending' kalan (ödenmemiş) boost'ları 'failed' yapar.
   * Gerçek iş — Bull processor 'expire-boosts' buradan çağırır.
   */
  async runExpireBoosts(log: (msg: string) => void = () => {}) {
    try {
      const now = new Date();

      // Süresi dolmuş boost izleri: filtre rankTier'a DEĞİL boost alanlarına
      // bakar. Eskiden yalnız rankTier=2 taranıyordu; gece mutabakatı rankTier'ı
      // indirmiş ama boostedAt'i temizlememişse ürün SÜRESİZ olarak LIFO
      // sıralamasının tepesinde kalıyordu (stale boostedAt asla süpürülmüyordu).
      const expiredProducts = await this.prisma.product.findMany({
        where: {
          boostedAt: { not: null },
          boostedUntil: { lt: now },
        },
        select: {
          id: true,
          sellerId: true,
          qualityScore: true,
          popularityScore: true,
        },
      });

      // Şimdi sona eren aktif boost'lar (otomatik yenileme hatırlatması için)
      const expiringBoosts = await this.prisma.productBoost.findMany({
        where: { status: "active", endsAt: { lt: now } },
        select: {
          id: true,
          userId: true,
          autoRenew: true,
          product: {
            select: {
              title: true,
              sellerId: true,
              viewCount: true,
              likeCount: true,
              clickCount: true,
            },
          },
        },
      });

      // İlgili tüm satıcıların premium durumunu tek sorguda topla
      const sellerIds = [
        ...new Set([
          ...expiredProducts.map((p) => p.sellerId),
          ...(expiringBoosts
            .map((b) => b.product?.sellerId)
            .filter(Boolean) as string[]),
        ]),
      ];
      const premiumSet = new Set<string>();
      if (sellerIds.length > 0) {
        const premiumMemberships = await this.prisma.userMembership.findMany({
          where: {
            userId: { in: sellerIds },
            status: { in: ["active", "cancelled"] },
            currentPeriodEnd: { gt: now },
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
            // Clear the LIFO key + home-showcase window so an expired boost no
            // longer ranks by recency or shows in the home showcase area.
            boostedAt: null,
            homeShowcaseUntil: null,
            relevanceScore: computeRelevanceScore({
              rankTier: newRankTier,
              qualityScore: p.qualityScore ?? 0,
              popularityScore: p.popularityScore,
            }),
          },
        });
      }
      if (expiredProducts.length > 0) {
        this.logger.log(
          `Expired boost on ${expiredProducts.length} product(s)`,
        );
      }

      // Otomatik yenileme açık + premium satıcı → yenileme hatırlatma bildirimi
      // (Gerçek recurring çekim yok; üyelik auto-renew gibi hatırlatma gönderilir.)
      for (const b of expiringBoosts) {
        if (b.product) {
          await this.prisma.productBoost.update({
            where: { id: b.id },
            data: {
              finalViewCount: b.product.viewCount,
              finalLikeCount: b.product.likeCount,
              finalClickCount: b.product.clickCount,
            },
          });
        }
        // Süre dolumu HER satın alana bildirilir — eskiden yalnız autoRenew
        // açık + premium satıcı haber alıyordu; normal alıcı boost'unun
        // bittiğini hiçbir kanaldan öğrenmiyordu.
        if (b.product) {
          await this.notificationService
            .createInAppNotification(b.userId, NotificationType.BOOST_EXPIRED, {
              productTitle: b.product.title,
            })
            .catch(() => {});
        }
      }

      // ProductBoost kayıtlarını expired yap
      await this.prisma.productBoost.updateMany({
        where: { status: "active", endsAt: { lt: now } },
        data: { status: "expired" },
      });

      // 1 günden uzun süredir ödenmemiş (pending) boost'ları failed yap
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
        `${expiredProducts.length} ürün boost düşürüldü · ${expiringBoosts.length} boost sona erdi · ${paused} duraklatıldı · ${resumed} sürdürüldü`,
      );
      return {
        summary: `${expiredProducts.length} boost düşürüldü · ${expiringBoosts.length} sona erdi`,
        stats: {
          downgraded: expiredProducts.length,
          expired: expiringBoosts.length,
          systemPaused: paused,
          systemResumed: resumed,
        },
      };
    } catch (error: any) {
      this.logger.error(`Error expiring boosts: ${error.message}`, error.stack);
      log(`HATA: ${error.message}`);
      // Yutmadan yükselt: Bull job'ı "failed" olsun ki attempts/backoff ve Sentry
      // Cron alarmı gerçekten devreye girsin (aksi halde başarısız tur bile
      // "başarılı" görünür ve hata yalnız log satırında kalır).
      throw error;
    }
  }

  /**
   * Yayında OLMAYAN ürünlerin süresi akan boost'larını sistem duraklatmasına
   * alır (kalan süre saklanır) ve ürünün boost kolonlarını temizler.
   */
  private async pauseBoostsOfDelistedProducts(now: Date): Promise<number> {
    const rows = await this.prisma.productBoost.findMany({
      where: {
        status: "active",
        endsAt: { gt: now },
        product: { status: { not: ProductStatus.active } },
      },
      select: { id: true, productId: true, endsAt: true },
    });
    if (!rows.length) return 0;

    for (const row of rows) {
      // Unreachable: the query above filters `endsAt: { gt: now }`. The column
      // is nullable, so the compiler cannot see that from here.
      if (!row.endsAt) continue;
      await this.prisma.productBoost.update({
        where: { id: row.id },
        data: {
          status: "paused",
          pausedAt: now,
          pausedBySystem: true,
          pausedRemainingSeconds: Math.max(
            1,
            Math.ceil((row.endsAt.getTime() - now.getTime()) / 1000),
          ),
        },
      });
    }
    const productIds = [...new Set(rows.map((row) => row.productId))];
    await this.prisma.product.updateMany({
      where: { id: { in: productIds } },
      data: { boostedUntil: null, boostedAt: null, homeShowcaseUntil: null },
    });
    this.logger.log(
      `Sistem duraklatması: ${rows.length} boost (${productIds.length} yayın dışı ürün)`,
    );
    return rows.length;
  }

  /**
   * Ürünü yeniden YAYINA dönen sistem-duraklatmalı boost'ları kalan süreyle
   * sürdürür ve ürünün boost kolonlarını yeniden kurar. Yalnız
   * `pausedBySystem` olanlar — admin'in elle duraklattığı boost'a dokunulmaz.
   */
  private async resumeSystemPausedBoosts(now: Date): Promise<number> {
    const rows = await this.prisma.productBoost.findMany({
      where: {
        status: "paused",
        pausedBySystem: true,
        product: { status: ProductStatus.active },
      },
      orderBy: { purchasedAt: "asc" },
      select: {
        id: true,
        productId: true,
        showcaseOnHome: true,
        pausedRemainingSeconds: true,
        product: { select: { qualityScore: true, popularityScore: true } },
      },
    });
    if (!rows.length) return 0;

    const byProduct = new Map<string, typeof rows>();
    for (const row of rows) {
      byProduct.set(row.productId, [
        ...(byProduct.get(row.productId) ?? []),
        row,
      ]);
    }
    for (const [productId, productRows] of byProduct) {
      // Kalan süreler satın alma sırasıyla arka arkaya dizilir (stacking).
      let base = now;
      let showcaseBase = now;
      let showcaseEnd: Date | null = null;
      for (const row of productRows) {
        const remainingMs = (row.pausedRemainingSeconds ?? 0) * 1000;
        const endsAt = new Date(base.getTime() + remainingMs);
        base = endsAt;
        if (row.showcaseOnHome) {
          showcaseEnd = new Date(showcaseBase.getTime() + remainingMs);
          showcaseBase = showcaseEnd;
        }
        await this.prisma.productBoost.update({
          where: { id: row.id },
          data: {
            status: "active",
            endsAt,
            pausedAt: null,
            pausedBySystem: false,
            pausedRemainingSeconds: null,
          },
        });
      }
      await this.prisma.product.update({
        where: { id: productId },
        data: {
          boostedUntil: base,
          boostedAt: now,
          homeShowcaseUntil: showcaseEnd,
          rankTier: 2,
          relevanceScore: computeRelevanceScore({
            rankTier: 2,
            qualityScore: productRows[0].product?.qualityScore ?? 0,
            popularityScore: productRows[0].product?.popularityScore,
          }),
        },
      });
    }
    this.logger.log(
      `Sistem sürdürmesi: ${rows.length} boost (${byProduct.size} yayına dönen ürün)`,
    );
    return rows.length;
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
    } catch (error: any) {
      this.logger.error(
        `Error expiring listings: ${error.message}`,
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
      } catch (err: any) {
        this.logger.warn(
          `pending-moderation-digest bildirimi başarısız (${admin.userId}): ${err?.message}`,
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
  async getExpiringListings(daysUntilExpiry?: number): Promise<any[]> {
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
        } catch (err: any) {
          this.logger.warn(
            `listing-expiring email failed for ${listing.id}: ${err?.message}`,
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
    } catch (error: any) {
      this.logger.error(
        `Error sending expiration warnings: ${error.message}`,
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
   * Manual trigger for listing expiration
   * Can be called by admin endpoints
   */
  async manualExpireListings(): Promise<{ expired: number }> {
    // run*()'u doğrudan çağır (flag açıkken bile manuel tetik gerçek işi yapsın).
    const res = await this.runExpireOldListings();
    return { expired: res.stats?.expired ?? 0 };
  }
}
