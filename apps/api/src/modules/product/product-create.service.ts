import { Injectable, Logger, ForbiddenException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { i18nMessage } from '../i18n';
import { PrismaService } from '../../prisma';
import { CacheService } from '../cache/cache.service';
import { MembershipService } from '../membership/membership.service';
import { isPremiumEntitled } from '../membership/membership.util';
import { StorageService } from '../storage/storage.service';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { QUEUE_NAMES } from '../../workers/constants';
import { ModerationAiClient } from '../moderation/moderation-ai.client';
import { CreateProductDto } from './dto';
import { ProductStatus } from '@prisma/client';
import { computeRelevanceScore } from './helpers/relevance-score';
import { ProductCommonService } from './product-common.service';
import { ProductRankingService } from './product-ranking.service';
import { ProductStatsService } from './product-stats.service';

/**
 * ProductCreateService — ilan oluşturma. Üyelik ilan/görsel limiti, AI görsel+metin
 * moderasyonu (senkron engelleme), fiyat validasyonu, attribute bağlama ve
 * moderation-queue'ya async görsel moderasyon işi (this.moderationQueue.add) birebir
 * korunur. getActiveListingCount->stats, linkProductAttributes/formatProductResponse->
 * common, recomputeProductRanking->ranking (sanctioned cross-service rewrites).
 */
@Injectable()
export class ProductCreateService {
  private readonly logger = new Logger(ProductCreateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly membershipService: MembershipService,
    private readonly storageService: StorageService,
    @InjectQueue(QUEUE_NAMES.MODERATION)
    private readonly moderationQueue: Queue,
    private readonly moderationAi: ModerationAiClient,
    private readonly common: ProductCommonService,
    private readonly ranking: ProductRankingService,
    private readonly stats: ProductStatsService,
  ) { }

  /**
   * Create a new product
   * POST /products
   * 
   * Membership Listing Limits:
   * - Free: 5 free listings, 10 total
   * - Basic: 15 free listings, 50 total
   * - Premium: 50 free listings, 200 total
   * - Business: 200 free listings, 1000 total
   */
  async create(sellerId: string, dto: CreateProductDto) {
    // Verify seller status - auto-enable if not already a seller
    const seller = await this.prisma.user.findUnique({
      where: { id: sellerId },
    });

    if (!seller) {
      throw new ForbiddenException(i18nMessage('server.product.userNotFound'));
    }

    // Check if user is banned
    if (seller.isBanned) {
      throw new ForbiddenException(i18nMessage('server.product.bannedCannotCreate'));
    }

    // ========================================================================
    // MEMBERSHIP LISTING LIMIT CHECK
    // ========================================================================
    const canCreate = await this.membershipService.canCreateListing(sellerId);
    if (!canCreate.allowed) {
      // Get detailed limits for error message
      const limits = await this.membershipService.getUserLimits(sellerId);
      const maxListings = limits.remainingTotalListings + await this.stats.getActiveListingCount(sellerId);
      throw new ForbiddenException(
        i18nMessage('server.product.listingLimitReached', { tierName: limits.tierName, maxListings }),
      );
    }

    // Check image limit based on membership tier
    const limits = await this.membershipService.getUserLimits(sellerId);
    if (dto.images && dto.images.length > limits.maxImages) {
      throw new BadRequestException(
        i18nMessage('server.product.imageLimitExceeded', {
          tierName: limits.tierName,
          maxImages: limits.maxImages,
          sentCount: dto.images.length,
        }),
      );
    }

    // AI görsel moderasyonu (senkron): uygunsuz/NSFW görselde ilanı ENGELLE + net mesaj.
    // Düşük ilgililik admin incelemesine kalabilir; burada sadece uygunsuzu durdururuz.
    if (dto.images?.length && this.moderationAi.isEnabled) {
      for (const img of dto.images) {
        const url = this.storageService.getPublicAssetUrl(img.detailKey || img.cardKey);
        if (!url) continue;
        const verdict = await this.moderationAi.moderateImage(url);
        if (verdict?.decision === 'flag') {
          throw new BadRequestException(
            i18nMessage('server.product.imageNotAppropriate'),
          );
        }
      }
    }

    // Başlık + açıklama küfür/uygunsuz dil kontrolü (senkron) — uygunsuzsa engelle + event yaz.
    await this.moderationAi.assertTextClean(dto.title, {
      entityType: 'product',
      userId: sellerId,
      field: 'title',
      label: 'ürün başlığı',
    });
    if (dto.description) {
      await this.moderationAi.assertTextClean(dto.description, {
        entityType: 'product',
        userId: sellerId,
        field: 'description',
        label: 'ürün açıklaması',
      });
    }

    // Auto-enable seller mode when user creates their first listing
    if (!seller.isSeller) {
      await this.prisma.user.update({
        where: { id: sellerId },
        data: {
          isSeller: true,
          sellerType: 'individual', // Default to individual seller
        },
      });
    }

    // Verify category exists
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
    });

    if (!category || !category.isActive) {
      throw new BadRequestException(i18nMessage('server.product.invalidCategory'));
    }

    // ========================================================================
    // PRICE VALIDATION FROM PLATFORM SETTINGS (Not retroactive - only new listings)
    // ========================================================================
    const minPriceSetting = await this.prisma.platformSetting.findUnique({
      where: { settingKey: 'min_product_price' },
    });
    const maxPriceSetting = await this.prisma.platformSetting.findUnique({
      where: { settingKey: 'max_product_price' },
    });

    const minPrice = minPriceSetting?.settingValue
      ? parseFloat(minPriceSetting.settingValue)
      : null;
    const maxPrice = maxPriceSetting?.settingValue
      ? parseFloat(maxPriceSetting.settingValue)
      : null;

    if (minPrice != null && !isNaN(minPrice) && dto.price < minPrice) {
      throw new BadRequestException(
        i18nMessage('server.product.priceBelowMinimum', { minPrice }),
      );
    }

    if (maxPrice != null && !isNaN(maxPrice) && dto.price > maxPrice) {
      throw new BadRequestException(
        i18nMessage('server.product.priceAboveMaximum', { maxPrice }),
      );
    }

    // Create product with images
    const releaseDate = dto.year != null && dto.year >= 1900 && dto.year <= 2100
      ? new Date(dto.year, 0, 1)
      : undefined;

    // Normalize optional UUIDs: empty string causes Prisma FK error → use undefined
    const brandId = dto.brandId?.trim() || undefined;
    const carModelId = dto.carModelId?.trim() || undefined;
    const manufacturerId = dto.manufacturerId?.trim() || undefined;

    // Yeni ilan: rankTier'ı (premium satıcı → 1) ve başlangıç popülerlik baseline'ını inline ver.
    // Böylece recompute (best-effort) başarısız olsa bile kademe doğru başlar; baseline ise
    // yeni ilana "ilk 24 saat" görünürlük sağlar (skor 0 değil, createdAt ile kademe üstünde).
    const sellerMembership = await this.prisma.userMembership.findUnique({
      where: { userId: sellerId },
      select: { status: true, currentPeriodEnd: true, tier: { select: { type: true } } },
    });
    const isPremiumSeller = isPremiumEntitled(sellerMembership);
    const FRESH_POPULARITY_BASELINE = 10;

    try {
      const product = await this.prisma.product.create({
        data: {
          sellerId,
          categoryId: dto.categoryId,
          title: dto.title,
          description: dto.description,
          price: dto.price,
          condition: dto.condition,
          status: ProductStatus.pending, // Needs admin approval
          quantity: dto.quantity !== undefined ? dto.quantity : 1, // default 1 adet; sınırsız (null) yalnızca açıkça istenince
          isTradeEnabled: dto.isTradeEnabled || false,
          isPreorder: dto.isPreorder ?? false,
          isSet: dto.isSet ?? false,
          bundleSize: dto.isSet ? (dto.bundleSize ?? null) : null,
          rankTier: isPremiumSeller ? 1 : 0,
          popularityScore: FRESH_POPULARITY_BASELINE,
          popularityUpdatedAt: new Date(),
          relevanceScore: computeRelevanceScore({
            rankTier: isPremiumSeller ? 1 : 0,
            qualityScore: 0,
            popularityScore: FRESH_POPULARITY_BASELINE,
          }),
          brandId,
          carModelId,
          manufacturerId,
          releaseDate,
          images: dto.images?.length
            ? {
              create: dto.images.map((img, index) => ({
                cardKey: img.cardKey,
                detailKey: img.detailKey,
                sortOrder: index,
              })),
            }
            : undefined,
        },
        include: {
          images: { orderBy: { sortOrder: 'asc' } },
          seller: {
            select: {
              id: true,
              displayName: true,
              isVerified: true,
              sellerType: true,
            },
          },
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      });

      // Link scale and material (attributes) so they show on detail and in filters
      await this.common.linkProductAttributes(
        product.id,
        dto.scale,
        dto.attributeIds,
        dto.material,
        dto.attributes,
      );

      // İlan Kalite Skoru + rankTier hesapla (best-effort; sıralama bozulmasın)
      await this.ranking.recomputeProductRanking(product.id).catch(() => {});

      // AI görsel moderasyonu (async, best-effort): temiz+ilgili -> oto-onay,
      // NSFW/şüpheli -> pending kalır (admin kuyruğu). Servis kapalıysa pending.
      if (product.images?.length) {
        this.moderationQueue
          .add('product-image', {
            productId: product.id,
            imageKeys: product.images.map((img) => img.detailKey || img.cardKey),
          })
          .catch((err) =>
            this.logger.warn(`Moderation job eklenemedi: ${err.message}`),
          );
      }

      // Invalidate product list cache
      await this.cache.delPattern('products:list:*');

      const productWithAttrs = await this.prisma.product.findUnique({
        where: { id: product.id },
        include: {
          images: { orderBy: { sortOrder: 'asc' } },
          seller: { select: { id: true, displayName: true, isVerified: true, sellerType: true, avatarUrl: true } },
          category: { select: { id: true, name: true, slug: true } },
          brand: { select: { id: true, name: true, slug: true } },
          carModel: { select: { id: true, name: true, slug: true } },
          productAttributes: { include: { attribute: { include: { group: true } } } },
        },
      });

      if (!productWithAttrs) {
        throw new BadRequestException(i18nMessage('server.product.createdButLoadFailed'));
      }
      return await this.common.formatProductResponse(productWithAttrs);
    } catch (err: any) {
      const code = err?.code;
      if (code === 'P2003') {
        throw new BadRequestException(
          i18nMessage('server.product.invalidBrandModelManufacturer'),
        );
      }
      if (code === 'P2002') {
        throw new BadRequestException(i18nMessage('server.product.duplicateProduct'));
      }
      // Zaten HTTP exception ise (400, 403 vb.) aynen fırlat
      if (err?.status && err?.status >= 400 && err?.status < 500) {
        throw err;
      }
      // Diğer hataları logla ve 500 döndür (development'ta ham hata mesajı debug için
      // korunur — kullanıcıya görünen katalog mesajı DEĞİLDİR, i18n dışı bırakıldı)
      this.logger.error('Product create failed', err?.stack || err?.message || err);
      if (process.env.NODE_ENV === 'development' && err?.message) {
        throw new InternalServerErrorException(`İlan oluşturulamadı: ${err.message}`);
      }
      throw new InternalServerErrorException(i18nMessage('server.product.createFailedGeneric'));
    }
  }
}
