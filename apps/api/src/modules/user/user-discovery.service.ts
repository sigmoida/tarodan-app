import { Injectable, Logger, Optional } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { StorageService } from "../storage/storage.service";
import { CacheService } from "../cache/cache.service";
import { UserCommonService } from "./user-common.service";
import {
  isBusinessMembershipEntitled,
  saleCapableSellerWhere,
} from "../membership/membership.util";
import { publicUserRatingWhere } from "../../common/helpers/public-rating";
import { catalogProductWhere } from "../product/helpers/catalog-product-where";

/**
 * Anasayfa öne çıkarma bölümlerinin (haftanın koleksiyoneri / haftanın şirketi /
 * top koleksiyonlar) ortak skorlama ayarları. Tek kaynak: ağırlıklar üç yerde
 * tekrar etmesin ve "haftalık" pencere her bölümde aynı olsun.
 */
const FEATURED_SCORING = {
  /** Skorda "yakın zaman" sayılan pencere (gün). */
  windowDays: 7,
  weights: {
    /** Tüm zamanlar görüntülenme. */
    view: 1,
    /** Tüm zamanlar beğeni. */
    like: 5,
    /** Tamamlanmış satış. */
    sale: 20,
    /** Son `windowDays` içindeki beğeni (haftalık ivmeyi öne çıkarır). */
    recentLike: 10,
    /** Son `windowDays` içinde güncellenen aktif ürün. */
    recentUpdate: 5,
  },
  /**
   * Featured yanıtlarının cache süresi (sn). Bu bölümler haftalık değişir ve
   * hesabı pahalıdır; kısa bir cache her isteğin ağır sorgu çalıştırmasını önler.
   */
  cacheTtlSeconds: 600,
} as const;

/** Skorlama penceresinin başlangıç tarihini döndürür (şimdi - windowDays). */
function featuredWindowStart(): Date {
  return new Date(
    Date.now() - FEATURED_SCORING.windowDays * 24 * 60 * 60 * 1000,
  );
}

/**
 * UserDiscoveryService — anasayfa keşif/öne çıkarma: getTopCollections, haftanın
 * koleksiyoneri/şirketi (getFeatured / selectFeatured), refreshFeaturedSnapshots
 * (cron + admin tetikler; snapshot upsert + featured cache invalidation),
 * getTopSellers, searchSellers. Featured yanıtları @Optional CacheService ile
 * cache-aside sarılır; avatar/ürün görseli için common'a delege eder.
 */
@Injectable()
export class UserDiscoveryService {
  private readonly logger = new Logger(UserDiscoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly storageService: StorageService,
    @Optional()
    private readonly cache: CacheService,
    private readonly common: UserCommonService,
  ) {}

  /**
   * Featured (anasayfa öne çıkarma) yanıtlarını cache-aside ile sarar.
   * Redis yoksa veya hata verirse otomatik olarak factory'ye düşer (graceful).
   */
  private async cacheFeatured<T>(
    key: string,
    factory: () => Promise<T>,
  ): Promise<T> {
    if (!this.cache) return factory();
    return this.cache.getOrSet(key, factory, {
      ttl: FEATURED_SCORING.cacheTtlSeconds,
    });
  }

  /**
   * Featured snapshot satırını (haftanın kazananı) upsert eder. Cron ve okuma
   * anındaki fallback kullanır; hata durumunda sessizce geçer (best-effort).
   */
  private async upsertFeaturedSnapshot(
    type: string,
    entityId: string,
    score: number,
  ) {
    try {
      await this.prisma.featuredSnapshot.upsert({
        where: { type },
        create: { type, entityId, score },
        update: { entityId, score, computedAt: new Date() },
      });
    } catch (e: any) {
      this.logger.warn(
        `Featured snapshot upsert failed (${type}): ${e.message}`,
      );
    }
  }

  /**
   * En iyi koleksiyonlar (anasayfa). Görüntülenme/beğeniye göre sıralı, cache'li.
   */
  async getTopCollections(limit: number = 20) {
    return this.cacheFeatured(`featured:top-collections:${limit}`, () =>
      this.computeTopCollections(limit),
    );
  }

  private async computeTopCollections(limit: number) {
    const collections = await this.prisma.collection.findMany({
      where: {
        isPublic: true,
        items: { some: {} },
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            bio: true,
            isVerified: true,
          },
        },
        _count: {
          select: { items: true, likes: true },
        },
      },
      orderBy: [{ viewCount: "desc" }, { likeCount: "desc" }],
      take: limit,
    });

    return Promise.all(
      collections.map(async (collection) => {
        // Always show the collection owner's own active products so products always match the user
        const ownProducts = await this.prisma.product.findMany({
          where: {
            ...catalogProductWhere(),
            sellerId: collection.user.id,
            status: "active",
            seller: saleCapableSellerWhere(),
          },
          take: 5,
          include: { images: { take: 1, orderBy: { sortOrder: "asc" } } },
          orderBy: [
            { likeCount: "desc" },
            { viewCount: "desc" },
            { createdAt: "desc" },
          ],
        });

        const items = await Promise.all(
          ownProducts.map(async (p) => ({
            id: p.id,
            productId: p.id,
            productTitle: p.title,
            productPrice: Number(p.price),
            productImage: this.common.resolveProductImageUrl(
              p.images[0]?.cardKey,
            ),
          })),
        );

        return {
          id: collection.id,
          name: collection.name,
          description: collection.description,
          coverImageUrl: collection.coverImageKey
            ? this.storageService.getPublicAssetUrl(collection.coverImageKey)
            : undefined,
          viewCount: collection.viewCount,
          likeCount: collection.likeCount,
          itemCount: collection._count.items,
          user: {
            id: collection.user.id,
            displayName: collection.user.displayName,
            avatarUrl: await this.common.resolveAvatarUrl(
              collection.user.avatarUrl,
            ),
            bio: collection.user.bio,
            isVerified: collection.user.isVerified,
          },
          items,
        };
      }),
    );
  }

  /**
   * Haftanın koleksiyoneri (anasayfa). Haftalık snapshot'tan okur: ağır skorlama
   * cron'da yapılır, burada sadece kazanan koleksiyon taze veriyle doldurulur
   * (presigned URL'ler hep güncel kalır). Snapshot yoksa (ilk açılış) ya da
   * kazanan artık uygun değilse anında hesaplayıp snapshot'ı tazeler.
   */
  async getFeaturedCollector() {
    return this.cacheFeatured("featured:collector", async () => {
      const snap = await this.prisma.featuredSnapshot.findUnique({
        where: { type: "collector" },
      });
      if (snap) {
        const hydrated = await this.hydrateCollectorById(
          snap.entityId,
          snap.score,
        );
        if (hydrated) return hydrated;
      }
      // Snapshot yok ya da hedef koleksiyon artık uygun değil → taze hesapla + sakla
      const selected = await this.selectFeaturedCollector();
      if (!selected) return null;
      await this.upsertFeaturedSnapshot(
        "collector",
        selected.id,
        selected.score,
      );
      return this.hydrateCollectorById(
        selected.id,
        selected.score,
        selected.salesCount,
      );
    });
  }

  /**
   * Aday koleksiyonlar arasından haftalık skoru en yüksek olanı seçer (yalnızca
   * id + skor döner; ağır kısım budur, cron tarafından çağrılır).
   * Admin'in `isFeatured` işaretlediği koleksiyonlar önceliklidir.
   */
  async selectFeaturedCollector(): Promise<{
    id: string;
    score: number;
    salesCount: number;
  } | null> {
    const collectionWhere = {
      isPublic: true,
      items: { some: {} }, // Has at least one item
    };
    const candidateInclude = {
      items: { select: { product: { select: { status: true } } } },
    };
    // Bound the candidate set: previously this loaded EVERY public collection
    // (and all their items) into memory to pick one — unbounded with catalog
    // growth. The final score is view/like/sale/recentLike-weighted, so the
    // winner is virtually always among the most-liked/viewed collections; take
    // the top N by that cheap DB-orderable proxy and score only those. It's a
    // "collector of the week" pick, so this approximation is safe.
    const CANDIDATE_LIMIT = 200;
    const candidateOrder = [
      { likeCount: "desc" as const },
      { viewCount: "desc" as const },
    ];

    // Prefer admin-featured collections first; fall back to score-based selection
    const collections = await this.prisma.collection
      .findMany({
        where: { ...collectionWhere, isFeatured: true },
        include: candidateInclude,
        orderBy: candidateOrder,
        take: CANDIDATE_LIMIT,
      })
      .then(async (featured) => {
        if (featured.length > 0) return featured;
        return this.prisma.collection.findMany({
          where: collectionWhere,
          include: candidateInclude,
          orderBy: candidateOrder,
          take: CANDIDATE_LIMIT,
        });
      });

    if (collections.length === 0) {
      return null;
    }

    // "Haftanın koleksiyoneri": skor son 7 günün ivmesini de katar. Tüm zamanlar
    // metrikleri taban, son penceredeki beğeniler ise haftalık bonus olarak
    // ağırlıklanır; böylece kazanan her hafta tazelenebilir.
    const windowStart = featuredWindowStart();
    const { weights } = FEATURED_SCORING;

    // Son penceredeki koleksiyon beğenilerini tek sorguda topla (N+1 yerine groupBy)
    const recentLikeGroups = await this.prisma.collectionLike.groupBy({
      by: ["collectionId"],
      where: {
        collectionId: { in: collections.map((c) => c.id) },
        createdAt: { gte: windowStart },
      },
      _count: { _all: true },
    });
    const recentLikesByCollection = new Map(
      recentLikeGroups.map((g) => [g.collectionId, g._count._all]),
    );

    const scored = collections.map((collection) => {
      const salesCount = collection.items.filter(
        (item) => item.product && item.product.status === "sold",
      ).length;
      const recentLikes = recentLikesByCollection.get(collection.id) ?? 0;
      const score =
        collection.viewCount * weights.view +
        collection.likeCount * weights.like +
        salesCount * weights.sale +
        recentLikes * weights.recentLike;
      return { id: collection.id, score, salesCount };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0] ?? null;
  }

  /**
   * Verilen koleksiyon id'sini anasayfa DTO'suna doldurur (kullanıcı + aktif
   * ürünler). Koleksiyon yoksa / public değilse / boşsa null döner — bu durumda
   * snapshot bayatlamış demektir ve çağıran taraf yeniden hesaplamayı tetikler.
   */
  private async hydrateCollectorById(
    collectionId: string,
    score: number,
    salesCount?: number,
  ) {
    const collection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            bio: true,
            isVerified: true,
          },
        },
        items: { select: { product: { select: { status: true } } } },
        _count: { select: { items: true, likes: true } },
      },
    });

    if (!collection || !collection.isPublic || collection._count.items === 0) {
      return null;
    }

    const resolvedSalesCount =
      salesCount ??
      collection.items.filter(
        (item) => item.product && item.product.status === "sold",
      ).length;

    // Always show the collector's own active product listings (ensures products match the user)
    const ownProducts = await this.prisma.product.findMany({
      where: {
        ...catalogProductWhere(),
        sellerId: collection.user.id,
        status: "active",
        seller: saleCapableSellerWhere(),
      },
      take: 5,
      include: { images: { take: 1, orderBy: { sortOrder: "asc" } } },
      orderBy: [
        { likeCount: "desc" },
        { viewCount: "desc" },
        { createdAt: "desc" },
      ],
    });

    const items = ownProducts.map((p) => ({
      id: p.id,
      productId: p.id,
      productTitle: p.title,
      productPrice: Number(p.price),
      productImage: this.common.resolveProductImageUrl(p.images[0]?.cardKey),
    }));

    return {
      id: collection.id,
      name: collection.name,
      description: collection.description,
      coverImageUrl: collection.coverImageKey
        ? this.storageService.getPublicAssetUrl(collection.coverImageKey)
        : undefined,
      viewCount: collection.viewCount,
      likeCount: collection.likeCount,
      itemCount: collection._count.items,
      salesCount: resolvedSalesCount,
      score,
      user: {
        id: collection.user.id,
        displayName: collection.user.displayName,
        avatarUrl: await this.common.resolveAvatarUrl(
          collection.user.avatarUrl,
        ),
        bio: collection.user.bio,
        isVerified: collection.user.isVerified,
      },
      items,
    };
  }

  /**
   * Haftanın şirketi (anasayfa). Haftalık snapshot'tan okur; ağır skorlama
   * cron'da yapılır, burada kazanan iş hesabı taze veriyle doldurulur. Snapshot
   * yoksa ya da kazanan artık uygun değilse anında hesaplayıp snapshot'ı tazeler.
   */
  async getFeaturedBusiness() {
    return this.cacheFeatured("featured:business", async () => {
      const snap = await this.prisma.featuredSnapshot.findUnique({
        where: { type: "business" },
      });
      if (snap) {
        const hydrated = await this.hydrateBusinessById(snap.entityId);
        if (hydrated) return hydrated;
      }
      const selected = await this.selectFeaturedBusiness();
      if (!selected) return null;
      await this.upsertFeaturedSnapshot(
        "business",
        selected.id,
        selected.score,
      );
      return this.hydrateBusinessById(selected.id);
    });
  }

  /**
   * Aday iş hesapları arasından haftalık skoru en yüksek olanı seçer (yalnızca
   * id + skor döner). Business tier önceliklidir; yoksa en çok ürünü olan
   * satıcılara düşer. Ağır skorlama burasıdır, cron tarafından çağrılır.
   */
  async selectFeaturedBusiness(): Promise<{
    id: string;
    score: number;
  } | null> {
    const sevenDaysAgo = featuredWindowStart();

    // Only effective, KYC-approved Business members are eligible for this placement.
    const businessMemberships = await this.prisma.userMembership.findMany({
      where: {
        tier: { type: "business", isActive: true },
        status: { in: ["active", "cancelled"] },
        currentPeriodEnd: { gt: new Date() },
        user: {
          businessStatus: "approved",
          companyName: { not: null },
          taxId: { not: null },
        },
      },
      include: {
        user: {
          include: {
            _count: {
              select: {
                products: {
                  where: { ...catalogProductWhere(), status: "active" },
                },
              },
            },
          },
        },
      },
    });

    const businessUsers = businessMemberships
      .map((m) => m.user)
      .filter(
        (user) => user.companyName && user.isSeller && user._count.products > 0,
      );

    if (businessUsers.length === 0) {
      return null;
    }

    // Score = views(1) + likes(5) + recentSales(20) + recentLikes(10) + recentUpdates(5)
    const { weights } = FEATURED_SCORING;
    const businessScores = await Promise.all(
      businessUsers.map(async (user) => {
        const [productStats, salesCount, recentLikes, recentViews] =
          await Promise.all([
            this.prisma.product.aggregate({
              where: {
                ...catalogProductWhere(),
                sellerId: user.id,
                status: "active",
              },
              _sum: { viewCount: true, likeCount: true },
            }),
            this.prisma.order.count({
              where: {
                sellerId: user.id,
                status: "completed",
                createdAt: { gte: sevenDaysAgo },
              },
            }),
            this.prisma.productLike.count({
              where: {
                product: {
                  ...catalogProductWhere(),
                  sellerId: user.id,
                  status: "active",
                },
                createdAt: { gte: sevenDaysAgo },
              },
            }),
            this.prisma.product.count({
              where: {
                ...catalogProductWhere(),
                sellerId: user.id,
                status: "active",
                updatedAt: { gte: sevenDaysAgo },
              },
            }),
          ]);

        const totalViews = productStats._sum.viewCount || 0;
        const totalLikes = productStats._sum.likeCount || 0;
        const score =
          totalViews * weights.view +
          totalLikes * weights.like +
          salesCount * weights.sale +
          recentLikes * weights.recentLike +
          recentViews * weights.recentUpdate;

        return { id: user.id, score };
      }),
    );

    businessScores.sort((a, b) => b.score - a.score);
    return businessScores[0] ?? null;
  }

  /**
   * Verilen iş hesabı id'sini anasayfa DTO'suna doldurur (istatistikler,
   * koleksiyonlar, öne çıkan ürünler, puan). Kullanıcı yoksa / aktif ürünü
   * yoksa null döner — bu durumda snapshot bayatlamıştır ve çağıran taraf
   * yeniden hesaplamayı tetikler.
   */
  private async hydrateBusinessById(userId: string) {
    const sevenDaysAgo = featuredWindowStart();

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        _count: {
          select: {
            products: {
              where: { ...catalogProductWhere(), status: "active" },
            },
          },
        },
        membership: {
          include: { tier: true },
        },
      },
    });

    if (
      !user ||
      user._count.products === 0 ||
      !isBusinessMembershipEntitled(user.membership, user)
    ) {
      return null;
    }

    // Stats: tüm zamanlar view/like toplamı + son penceredeki tamamlanmış satış
    const [productStats, salesCount] = await Promise.all([
      this.prisma.product.aggregate({
        where: {
          ...catalogProductWhere(),
          sellerId: userId,
          status: "active",
        },
        _sum: { viewCount: true, likeCount: true },
      }),
      this.prisma.order.count({
        where: {
          sellerId: userId,
          status: "completed",
          createdAt: { gte: sevenDaysAgo },
        },
      }),
    ]);
    const totalViews = productStats._sum.viewCount || 0;
    const totalLikes = productStats._sum.likeCount || 0;

    // Get business's top collections (by engagement score)
    const allCollections = await this.prisma.collection.findMany({
      where: { userId, isPublic: true },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                status: true,
                title: true,
                price: true,
                images: { take: 1 },
              },
            },
          },
        },
        _count: { select: { items: true } },
      },
    });

    // Calculate collection scores and get top 4
    const collectionsWithScores = allCollections.map((collection) => {
      const salesCount = collection.items.filter(
        (item) => item.product && item.product.status === "sold",
      ).length;
      const { weights } = FEATURED_SCORING;
      const score =
        collection.viewCount * weights.view +
        collection.likeCount * weights.like +
        salesCount * weights.sale;
      return { collection, score };
    });

    collectionsWithScores.sort((a, b) => b.score - a.score);
    const topCollections = collectionsWithScores
      .slice(0, 4)
      .map((item) => item.collection);

    // Format collections with preview items (only active products)
    const formattedCollections = await Promise.all(
      topCollections.map(async (collection) => {
        const activeItems = await Promise.all(
          collection.items
            .filter((item) => item.product && item.product.status === "active")
            .slice(0, 3)
            .map(async (item) => ({
              id: item.id,
              productTitle: item.product!.title,
              productPrice: Number(item.product!.price),
              productImage: this.common.resolveProductImageUrl(
                item.product!.images[0]?.cardKey,
              ),
            })),
        );

        return {
          id: collection.id,
          name: collection.name,
          viewCount: collection.viewCount,
          likeCount: collection.likeCount,
          coverImageUrl: collection.coverImageKey
            ? this.storageService.getPublicAssetUrl(collection.coverImageKey)
            : undefined,
          _count: collection._count,
          items: activeItems,
        };
      }),
    );

    // Get business's featured products (top performing products)
    // Priority: featured products, then by engagement score (views + likes)
    const allProducts = await this.prisma.product.findMany({
      where: {
        ...catalogProductWhere(),
        sellerId: userId,
        status: "active",
      },
      include: {
        images: { take: 1 },
        _count: {
          select: { likes: true },
        },
      },
    });

    // Calculate product scores and sort
    const productsWithScores = allProducts.map((product) => ({
      product,
      score: (product.viewCount || 0) * 1 + (product.likeCount || 0) * 5,
    }));

    productsWithScores.sort((a, b) => b.score - a.score);

    // Get top 6 products
    const products = productsWithScores.slice(0, 6).map((item) => item.product);

    // Get ratings — yalnız yayınlanmış puanlar (getTopSellers/getPublicProfile
    // ile aynı kural); filtresiz sayım ana sayfadaki öne çıkan işletme kartına
    // onaysız puan sızdırıyordu.
    const ratings = await this.prisma.rating.aggregate({
      where: publicUserRatingWhere({ receiverId: userId }),
      _avg: { score: true },
      _count: true,
    });

    return {
      id: user.id,
      displayName: user.displayName,
      companyName: user.companyName,
      avatarUrl: await this.common.resolveAvatarUrl(user.avatarUrl),
      bio: user.bio,
      isVerified: user.isVerified,
      stats: {
        totalProducts: user._count.products,
        totalViews,
        totalLikes,
        totalSales: salesCount,
        averageRating: ratings._avg?.score || 0,
        totalRatings: ratings._count,
      },
      collections: formattedCollections.map((c) => ({
        id: c.id,
        name: c.name,
        viewCount: c.viewCount,
        likeCount: c.likeCount,
        coverImageUrl: c.coverImageUrl,
        itemCount: c._count?.items || 0,
        previewItems: c.items || [],
      })),
      products: await Promise.all(
        products.map(async (p) => ({
          id: p.id,
          title: p.title,
          price: Number(p.price),
          viewCount: p.viewCount,
          likeCount: p.likeCount,
          image: this.common.resolveProductImageUrl(p.images[0]?.cardKey),
        })),
      ),
    };
  }

  /**
   * Haftanın koleksiyoneri ve şirketi snapshot'larını yeniden hesaplar.
   * Cron job (FeaturedSchedulerService) ve admin değişiklikleri tarafından
   * çağrılır; ardından okuma cache'lerini düşürerek yeni kazananın anında
   * yansımasını sağlar. Hesaplama hatası diğer tipi etkilemez (best-effort).
   */
  async refreshFeaturedSnapshots(): Promise<void> {
    try {
      const collector = await this.selectFeaturedCollector();
      if (collector) {
        await this.upsertFeaturedSnapshot(
          "collector",
          collector.id,
          collector.score,
        );
      }
    } catch (e: any) {
      this.logger.warn(
        `refreshFeaturedSnapshots(collector) failed: ${e.message}`,
      );
    }

    try {
      const business = await this.selectFeaturedBusiness();
      if (business) {
        await this.upsertFeaturedSnapshot(
          "business",
          business.id,
          business.score,
        );
      }
    } catch (e: any) {
      this.logger.warn(
        `refreshFeaturedSnapshots(business) failed: ${e.message}`,
      );
    }

    if (this.cache) {
      await this.cache.del("featured:collector").catch(() => {});
      await this.cache.del("featured:business").catch(() => {});
    }
  }

  /**
   * Get top sellers (for homepage)
   */
  async getTopSellers(limit: number = 5) {
    // Get sellers with most sales and good ratings
    const sellers = await this.prisma.user.findMany({
      where: {
        ...saleCapableSellerWhere(),
        isSeller: true,
        products: {
          some: { ...catalogProductWhere(), status: "active" },
        },
      },
      take: limit * 2, // Get more to filter
      include: {
        _count: {
          select: {
            products: {
              where: { ...catalogProductWhere(), status: "active" },
            },
          },
        },
      },
    });

    // Calculate scores and sort
    const sellerScores = await Promise.all(
      sellers.map(async (seller) => {
        const [salesCount, ratings] = await Promise.all([
          this.prisma.order.count({
            where: { sellerId: seller.id, status: "completed" },
          }),
          this.prisma.rating.aggregate({
            where: publicUserRatingWhere({ receiverId: seller.id }),
            _avg: { score: true },
            _count: true,
          }),
        ]);

        const score =
          salesCount * 10 +
          (ratings._avg?.score || 0) * 20 +
          seller._count.products * 2;

        const resolvedAvatar = await this.common.resolveAvatarUrl(
          seller.avatarUrl,
        );

        return {
          id: seller.id,
          displayName: seller.displayName,
          avatarUrl: resolvedAvatar,
          bio: seller.bio,
          isVerified: seller.isVerified,
          rating: ratings._avg?.score || 0,
          totalRatings: ratings._count,
          totalListings: seller._count.products,
          totalSales: salesCount,
          score,
        };
      }),
    );

    // Sort by score and return top sellers
    sellerScores.sort((a, b) => b.score - a.score);
    return sellerScores.slice(0, limit).map(({ score, ...seller }) => seller);
  }

  /**
   * İsimle satıcı arama (autocomplete). Yalnızca aktif ürünü olan, banlı/silinmemiş
   * satıcıları döndürür — profili herkese açık olmayanları sızdırmaz.
   */
  async searchSellers(query: string, limit: number = 8) {
    const q = (query || "").trim();
    if (q.length < 2) {
      return [];
    }

    const sellers = await this.prisma.user.findMany({
      where: {
        ...saleCapableSellerWhere(),
        isSeller: true,
        isBanned: false,
        deletedAt: null,
        products: {
          some: { ...catalogProductWhere(), status: "active" },
        },
        displayName: { contains: q, mode: "insensitive" },
      },
      take: Math.min(20, Math.max(1, Number(limit) || 8)),
      orderBy: { products: { _count: "desc" } },
      select: {
        id: true,
        displayName: true,
        avatarUrl: true,
        isVerified: true,
        _count: {
          select: {
            products: {
              where: { ...catalogProductWhere(), status: "active" },
            },
          },
        },
      },
    });

    return Promise.all(
      sellers.map(async (s) => ({
        id: s.id,
        displayName: s.displayName,
        avatarUrl: await this.common.resolveAvatarUrl(s.avatarUrl),
        isVerified: s.isVerified,
        totalListings: s._count.products,
      })),
    );
  }
}
