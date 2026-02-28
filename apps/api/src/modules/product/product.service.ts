import {
  Injectable,
  OnModuleInit,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Inject,
  forwardRef,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { CacheService } from '../cache/cache.service';
import { MembershipService } from '../membership/membership.service';
import { SearchService } from '../search/search.service';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/dto';
import { SmtpProvider } from '../notification/providers/smtp.provider';
import { CreateProductDto, UpdateProductDto, ProductQueryDto } from './dto';
import { ProductStatus, Prisma, MembershipTierType, Brand } from '@prisma/client';
import { DiscountService } from '../discount/discount.service';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class ProductService implements OnModuleInit {
  private readonly logger = new Logger(ProductService.name);

  onModuleInit() {
    this.cache.delPattern('products:list:*').then((n) => {
      if (n > 0) this.logger.log(`Cleared ${n} product list cache key(s)`);
    }).catch(() => {});
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    @Inject(forwardRef(() => MembershipService))
    private readonly membershipService: MembershipService,
    private readonly searchService: SearchService,
    @Inject(forwardRef(() => NotificationService))
    private readonly notificationService: NotificationService,
    private readonly smtpProvider: SmtpProvider,
    private readonly discountService: DiscountService,
    private readonly storageService: StorageService,
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
      throw new ForbiddenException('Kullanıcı bulunamadı');
    }

    // Check if user is banned
    if (seller.isBanned) {
      throw new ForbiddenException('Hesabınız banlanmış. Yeni ürün ekleyemezsiniz.');
    }

    // ========================================================================
    // MEMBERSHIP LISTING LIMIT CHECK
    // ========================================================================
    const canCreate = await this.membershipService.canCreateListing(sellerId);
    if (!canCreate.allowed) {
      // Get detailed limits for error message
      const limits = await this.membershipService.getUserLimits(sellerId);
      throw new ForbiddenException(
        `İlan limitinize ulaştınız. Mevcut üyeliğiniz (${limits.tierName}) ile maksimum ${limits.remainingTotalListings + await this.getActiveListingCount(sellerId)} ilan oluşturabilirsiniz. ` +
        `Daha fazla ilan eklemek için üyeliğinizi yükseltin.`
      );
    }

    // Check image limit based on membership tier
    const limits = await this.membershipService.getUserLimits(sellerId);
    if (dto.imageUrls && dto.imageUrls.length > limits.maxImages) {
      throw new BadRequestException(
        `Üyeliğiniz (${limits.tierName}) ile ilan başına maksimum ${limits.maxImages} görsel yükleyebilirsiniz. ` +
        `${dto.imageUrls.length} görsel gönderdiniz.`
      );
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
      throw new BadRequestException('Geçersiz kategori');
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
        `Ürün fiyatı minimum ${minPrice} TL olmalıdır.`
      );
    }

    if (maxPrice != null && !isNaN(maxPrice) && dto.price > maxPrice) {
      throw new BadRequestException(
        `Ürün fiyatı maksimum ${maxPrice} TL olabilir.`
      );
    }

    // Create product with images
    const releaseDate = dto.year != null && dto.year >= 1900 && dto.year <= 2100
      ? new Date(dto.year, 0, 1)
      : undefined;

    // Process imageUrls: extract S3 keys from presigned URLs or use keys directly
    const processedImageUrls = dto.imageUrls?.map((urlOrKey) => {
      // If already a key format (starts with dev/ or prod/), use it directly
      if (urlOrKey.includes('dev/') || urlOrKey.includes('prod/')) {
        // Remove query string if present
        try {
          const urlObj = new URL(urlOrKey, 'http://dummy.com');
          return urlObj.pathname.startsWith('/') ? urlObj.pathname.substring(1) : urlObj.pathname;
        } catch {
          return urlOrKey; // If URL parse fails, use as-is
        }
      }
      // If presigned URL, extract key
      const extractedKey = this.extractKeyFromUrl(urlOrKey);
      if (extractedKey) {
        return extractedKey;
      }
      // Fallback: use original (for backward compatibility with old data)
      return urlOrKey;
    });

    const product = await this.prisma.product.create({
      data: {
        sellerId,
        categoryId: dto.categoryId,
        title: dto.title,
        description: dto.description,
        price: dto.price,
        condition: dto.condition,
        status: ProductStatus.pending, // Needs admin approval
        quantity: dto.quantity !== undefined ? dto.quantity : null, // null = unlimited stock
        isTradeEnabled: dto.isTradeEnabled || false,
        isPreorder: dto.isPreorder ?? false,
        isSet: dto.isSet ?? false,
        brandId: dto.brandId,
        carModelId: dto.carModelId,
        releaseDate,
        images: processedImageUrls?.length
          ? {
            create: processedImageUrls.map((key, index) => ({
              url: key, // Store S3 key instead of presigned URL
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
    await this.linkProductAttributes(product.id, dto.scale, dto.attributeIds, dto.material);

    // Invalidate product list cache
    await this.cache.delPattern('products:list:*');

    // Index to Elasticsearch (only if status is active)
    if (product.status === ProductStatus.active) {
      try {
        await this.searchService.indexProduct(product.id);
      } catch (error) {
        this.logger.warn('Failed to index product to Elasticsearch');
        // Don't fail the request if indexing fails
      }
    }

    const productWithAttrs = await this.prisma.product.findUnique({
      where: { id: product.id },
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
        seller: { select: { id: true, displayName: true, isVerified: true, sellerType: true } },
        category: { select: { id: true, name: true, slug: true } },
        brand: { select: { id: true, name: true, slug: true } },
        carModel: { select: { id: true, name: true, slug: true } },
        productAttributes: { include: { attribute: { include: { group: true } } } },
      },
    });
    return await this.formatProductResponse(productWithAttrs);
  }

  /**
   * Link scale (1:64), material (slug), and attributeIds to product via ProductAttribute.
   */
  private async linkProductAttributes(
    productId: string,
    scale?: string,
    attributeIds?: string[],
    materialSlug?: string,
  ) {
    const toLink: string[] = [];

    if (scale?.trim()) {
      const scaleNorm = scale.replace(/\s/g, '').replace(/[:\/]/g, ''); // "1:64" or "1/64" -> "164"
      const scaleAttr = await this.prisma.attribute.findFirst({
        where: { group: { slug: 'scale' }, slug: scaleNorm, isActive: true },
        select: { id: true },
      });
      if (scaleAttr) toLink.push(scaleAttr.id);
    }
    if (materialSlug?.trim()) {
      const materialAttr = await this.prisma.attribute.findFirst({
        where: { group: { slug: 'material' }, slug: materialSlug.trim(), isActive: true },
        select: { id: true },
      });
      if (materialAttr) toLink.push(materialAttr.id);
    }
    if (attributeIds?.length) toLink.push(...attributeIds);

    for (const attributeId of toLink) {
      await this.prisma.productAttribute.upsert({
        where: { productId_attributeId: { productId, attributeId } },
        create: { productId, attributeId },
        update: {},
      });
    }
  }

  /**
   * Get paginated products with filters
   * GET /products
   *
   * Primary path: Elasticsearch (fast filtering + sorting)
   * Fallback: PostgreSQL via Prisma (when ES unavailable)
   */
  async findAll(query: ProductQueryDto) {
    const {
      search,
      categoryId,
      sellerId,
      status,
      condition,
      brand,
      scale,
      material: materialSlug,
      tradeOnly,
      discountOnly,
      preOrder,
      limited,
      set: setFilter,
      minPrice,
      maxPrice,
      sortBy,
      page = 1,
      limit = 20,
      carModelId,
      brandId,
      manufacturerId,
    } = query;

    const cacheKey = `products:list:${JSON.stringify({
      search, categoryId, sellerId,
      status: status || ProductStatus.active,
      condition, brand, brandId, manufacturerId,
      scale, material: materialSlug,
      tradeOnly, discountOnly, preOrder, limited,
      set: query.set, vehicleType: query.vehicleType,
      minPrice, maxPrice, sortBy, page, limit, carModelId,
    })}`;

    const runListQuery = async () => {
      // ── Try Elasticsearch first ──
      if (this.searchService.isAvailable()) {
        try {
          const esResult = await this.findAllViaElasticsearch(query);
          if (esResult) return esResult;
        } catch (err) {
          this.logger.warn('ES findAll failed, falling back to PostgreSQL');
        }
      }

      // ── PostgreSQL fallback ──
      return this.findAllViaPostgres(query);
    };

    return this.cache.getOrSet(cacheKey, runListQuery, { ttl: 300 });
  }

  /**
   * ES-based product listing: query ES for IDs + total, then hydrate via Prisma
   */
  private async findAllViaElasticsearch(query: ProductQueryDto) {
    const {
      search, categoryId, sellerId, condition, brand, scale,
      material: materialSlug, tradeOnly, discountOnly, preOrder,
      limited, set: setFilter, minPrice, maxPrice, sortBy,
      page = 1, limit = 20, brandId, manufacturerId,
    } = query;

    const esOptions = {
      query: search || undefined,
      categoryId,
      brandId,
      manufacturerId,
      sellerId,
      condition,
      brand,
      scale,
      material: materialSlug,
      manufacturer: query.manufacturer,
      tradeOnly,
      discountOnly,
      preOrder,
      limited,
      set: setFilter,
      vehicleType: query.vehicleType,
      minPrice,
      maxPrice,
      page,
      pageSize: limit,
      sortBy: sortBy || 'relevance',
    };

    const esResult = await this.searchService.searchProductIds(esOptions);
    if (esResult.ids.length === 0 && !search) {
      return { data: [], meta: { total: 0, page, limit, totalPages: 0 } };
    }
    if (esResult.ids.length === 0) return null; // let fallback handle text search

    const products = await this.prisma.product.findMany({
      where: { id: { in: esResult.ids } },
      include: {
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        seller: {
          select: { id: true, displayName: true, isVerified: true, sellerType: true },
        },
        category: { select: { id: true, name: true, slug: true } },
        brand: { select: { id: true, name: true, slug: true, logo: true } },
        manufacturer: { select: { id: true, name: true, slug: true } },
        carModel: { include: { brand: { select: { slug: true } } } },
        productAttributes: { include: { attribute: { include: { group: true } } } },
      },
    });

    // Preserve ES ordering
    const idOrder = new Map(esResult.ids.map((id, i) => [id, i]));
    products.sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0));

    const formattedProducts = await Promise.all(
      products.map((p) => this.formatProductResponse(p)),
    );

    return {
      data: formattedProducts,
      meta: {
        total: esResult.total,
        page,
        limit,
        totalPages: Math.ceil(esResult.total / limit),
      },
    };
  }

  /**
   * Original PostgreSQL-based listing (fallback)
   */
  private async findAllViaPostgres(query: ProductQueryDto) {
    const {
      search, categoryId, sellerId, condition, brand, scale,
      material: materialSlug, tradeOnly, discountOnly, preOrder,
      limited, set: setFilter, minPrice, maxPrice, sortBy,
      page = 1, limit = 20, carModelId, brandId, manufacturerId,
    } = query;

    const where: Prisma.ProductWhereInput = {
      status: ProductStatus.active,
      NOT: { id: { startsWith: 'membership-' } },
      AND: [{ OR: [{ quantity: { gt: 0 } }, { quantity: null }] }],
    };

    if (search) {
      const searchCondition = {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      };
      where.AND = where.AND ? [...(where.AND as any[]), searchCondition] : [searchCondition];
    }

    if (brandId) {
      where.brandId = brandId;
    } else if (brand) {
      where.title = { contains: brand, mode: 'insensitive' };
    }

    if (manufacturerId) {
      where.manufacturerId = manufacturerId;
    }

    if (carModelId) where.carModelId = carModelId;

    if (scale) {
      const scaleCondition = {
        OR: [
          { title: { contains: scale, mode: 'insensitive' } },
          { description: { contains: scale, mode: 'insensitive' } },
        ],
      };
      where.AND = where.AND ? [...(where.AND as any[]), scaleCondition] : [scaleCondition];
    }

    if (materialSlug) {
      where.productAttributes = {
        some: {
          attribute: {
            isActive: true,
            group: { slug: 'material', isActive: true },
            slug: materialSlug,
          },
        },
      };
    }

    if (query.vehicleType) {
      const vehicleTypeSearchTerms: Record<string, string[]> = {
        'araba': ['araba', 'car', 'sedan', 'coupe', 'suv', 'hatchback'],
        'motosiklet': ['motosiklet', 'motorcycle', 'motor', 'bike'],
        'motorsports': ['motorsports', 'yarış', 'racing', 'f1', 'formula', 'nascar', 'rally'],
        'acil-durum': ['ambulans', 'ambulance', 'polis', 'police', 'itfaiye', 'fire', 'acil'],
        'ticari': ['kamyon', 'truck', 'tır', 'van', 'minibus', 'ticari'],
        'insaat': ['inşaat', 'construction', 'excavator', 'dozer', 'kepçe', 'vinç', 'crane'],
        'tarim': ['tarım', 'agriculture', 'traktör', 'tractor', 'biçerdöver'],
        'askeri': ['askeri', 'military', 'tank', 'zırhlı', 'armored'],
        'gemi': ['gemi', 'ship', 'tekne', 'boat', 'yat', 'yacht'],
        'tren': ['tren', 'train', 'lokomotif', 'locomotive', 'vagon'],
        'ucak': ['uçak', 'aircraft', 'plane', 'helikopter', 'helicopter', 'jet'],
        'set': ['set', 'koleksiyon', 'collection', 'paket', 'bundle'],
      };
      const searchTerms = vehicleTypeSearchTerms[query.vehicleType] || [query.vehicleType];
      const vehicleTypeCondition = {
        OR: searchTerms.map((term) => ({
          OR: [
            { title: { contains: term, mode: 'insensitive' } },
            { description: { contains: term, mode: 'insensitive' } },
          ],
        })),
      };
      where.AND = where.AND ? [...(where.AND as any[]), vehicleTypeCondition] : [vehicleTypeCondition];
    }

    if (tradeOnly) where.isTradeEnabled = true;
    if (preOrder) where.isPreorder = true;
    if (limited) where.isLimited = true;
    if (setFilter) where.isSet = true;

    if (discountOnly) {
      const now = new Date();
      const manualDiscountCondition = {
        AND: [
          { oldPrice: { not: null } },
          { OR: [{ saleStartDate: null }, { saleStartDate: { lte: now } }] },
          { OR: [{ saleEndDate: null }, { saleEndDate: { gte: now } }] },
        ],
      };
      const criteria = await this.discountService.getActiveDiscountCriteria();
      if (!criteria.hasGlobal) {
        const campaignConditions: any[] = [];
        if (criteria.sellerIds.length > 0) campaignConditions.push({ sellerId: { in: criteria.sellerIds } });
        if (criteria.categoryIds.length > 0) campaignConditions.push({ categoryId: { in: criteria.categoryIds } });
        if (criteria.productIds.length > 0) campaignConditions.push({ id: { in: criteria.productIds } });
        const combinedCondition = { OR: [manualDiscountCondition, ...campaignConditions] };
        where.AND = where.AND ? [...(where.AND as any[]), combinedCondition] : [combinedCondition];
      }
    }

    if (categoryId) where.categoryId = categoryId;
    if (sellerId) where.sellerId = sellerId;
    if (condition) where.condition = condition as any;

    if (minPrice !== undefined || maxPrice !== undefined) {
      where.price = {};
      if (minPrice !== undefined) where.price.gte = minPrice;
      if (maxPrice !== undefined) where.price.lte = maxPrice;
    }

    let orderBy: Prisma.ProductOrderByWithRelationInput = { createdAt: 'desc' };
    const useScoring = !sortBy;
    switch (sortBy) {
      case 'price_asc': orderBy = { price: 'asc' }; break;
      case 'price_desc': orderBy = { price: 'desc' }; break;
      case 'created_asc': orderBy = { createdAt: 'asc' }; break;
      case 'created_desc': orderBy = { createdAt: 'desc' }; break;
      case 'title_asc': orderBy = { title: 'asc' }; break;
      case 'title_desc': orderBy = { title: 'desc' }; break;
      case 'view_count_asc': orderBy = { viewCount: 'asc' }; break;
      case 'view_count_desc': orderBy = { viewCount: 'desc' }; break;
    }

    const total = await this.prisma.product.count({ where });
    const products = await this.prisma.product.findMany({
      where,
      orderBy: useScoring ? undefined : orderBy,
      skip: useScoring ? 0 : (page - 1) * limit,
      take: useScoring ? undefined : limit,
      include: {
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        seller: useScoring
          ? { include: { membership: { include: { tier: { select: { type: true } } } } } }
          : { select: { id: true, displayName: true, isVerified: true, sellerType: true } },
        category: { select: { id: true, name: true, slug: true } },
        brand: { select: { id: true, name: true, slug: true, logo: true } },
        manufacturer: { select: { id: true, name: true, slug: true } },
        carModel: { include: { brand: { select: { slug: true } } } },
        productAttributes: { include: { attribute: { include: { group: true } } } },
      },
    });

    let productsToReturn = products;
    if (useScoring) {
      productsToReturn = products
        .map((product) => {
          let membershipScore = 1;
          const seller = product.seller as any;
          const membership = seller?.membership;
          if (membership && membership.status === 'active' && membership.tier?.type) {
            const tierType = membership.tier.type;
            if (tierType === 'premium' || tierType === 'business') membershipScore = 3;
          }
          const viewCount = product.viewCount || 0;
          let viewScore = viewCount >= 10000 ? 3 : viewCount >= 1000 ? 2 : 1;
          const likeCount = product.likeCount || 0;
          let likeScore = likeCount >= 100 ? 3 : likeCount >= 50 ? 2 : 1;
          return { ...product, _score: membershipScore + viewScore + likeScore, _random: Math.random() };
        })
        .sort((a, b) => b._score !== a._score ? b._score - a._score : b._random - a._random)
        .slice((page - 1) * limit, page * limit)
        .map(({ _score, _random, ...product }) => {
          const cleanedProduct = { ...product };
          if ((cleanedProduct.seller as any).membership) {
            cleanedProduct.seller = {
              id: cleanedProduct.seller.id,
              displayName: (cleanedProduct.seller as any).displayName,
              isVerified: (cleanedProduct.seller as any).isVerified,
              sellerType: (cleanedProduct.seller as any).sellerType,
            };
          }
          return cleanedProduct;
        });
    }

    const formattedProducts = await Promise.all(
      productsToReturn.map((p) => this.formatProductResponse(p)),
    );

    return {
      data: formattedProducts,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Get single product by ID
   * GET /products/:id
   */
  async findOne(id: string) {
    const cacheKey = `products:detail:${id}`;

    // Use cache with 10 minute TTL for product details
    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const product = await this.prisma.product.findUnique({
          where: { id },
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
            brand: {
              select: {
                id: true,
                name: true,
                slug: true,
                logo: true,
              },
            },
            manufacturer: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
            productAttributes: {
              include: {
                attribute: {
                  include: {
                    group: true,
                  },
                },
              },
            },
            carModel: {
              include: {
                brand: true,
              },
            },
          },
        });

        if (!product) {
          throw new NotFoundException('Ürün bulunamadı');
        }

        // Allow active and sold products to be viewable
        // Sold products will show "Out of Stock" on the frontend
        // Pending, rejected, inactive products are NOT visible publicly
        const viewableStatuses: ProductStatus[] = [ProductStatus.active, ProductStatus.sold];
        if (!viewableStatuses.includes(product.status)) {
          throw new NotFoundException('Ürün bulunamadı');
        }

        return await this.formatProductResponse(product);
      },
      { ttl: 600 }, // 10 minutes cache
    );
  }

  /**
   * Update product
   * PATCH /products/:id
   */
  async update(id: string, sellerId: string, dto: UpdateProductDto) {
    // Find product with optimistic locking
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException('Ürün bulunamadı');
    }

    // Verify ownership
    if (product.sellerId !== sellerId) {
      throw new ForbiddenException('Bu ürünü düzenleme yetkiniz yok');
    }

    // Check if user is banned
    const seller = await this.prisma.user.findUnique({
      where: { id: sellerId },
      select: { isBanned: true },
    });

    if (seller?.isBanned) {
      throw new ForbiddenException('Hesabınız banlanmış. Ürün düzenleyemezsiniz.');
    }

    // Cannot update sold or reserved products
    if (product.status === ProductStatus.sold || product.status === ProductStatus.reserved) {
      throw new BadRequestException('Satılmış veya rezerve edilmiş ürünler güncellenemez');
    }

    // Verify category if being updated
    if (dto.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
      });

      if (!category || !category.isActive) {
        throw new BadRequestException('Geçersiz kategori');
      }
    }

    // Sellers can only set status to active or inactive
    if (dto.status && dto.status !== ProductStatus.active && dto.status !== ProductStatus.inactive) {
      throw new ForbiddenException('Sadece aktif veya pasif duruma geçirebilirsiniz');
    }

    // Check membership for trade feature
    let canEnableTrade = false;
    if (dto.isTradeEnabled === true) {
      const seller = await this.prisma.user.findUnique({
        where: { id: sellerId },
        include: { membership: { include: { tier: true } } },
      });

      if (!seller?.membership?.tier?.canTrade) {
        throw new BadRequestException('Takas özelliği için Premium üyelik gereklidir. Üyeliğinizi yükseltin.');
      }
      canEnableTrade = true;
    }

    // A + oldPrice: price (A) = her zaman güncel satış fiyatı; indirim uygulanınca price = indirimli, oldPrice = önceki; indirim bitince price = oldPrice
    const currentPrice = Number(product.price);
    const currentOldPrice = product.oldPrice != null ? Number(product.oldPrice) : null;
    const isSettingSale = dto.salePrice != null && Number(dto.salePrice) > 0;
    const isClearingSale = dto.salePrice === null || dto.salePrice === undefined; // Açık null = indirimi kaldır

    let priceUpdate: number | undefined;
    let oldPriceUpdate: number | null | undefined;
    let saleStartDateUpdate: Date | null | undefined;
    let saleEndDateUpdate: Date | null | undefined;
    let legacyOriginalPrice: number | null | undefined;
    let legacySalePrice: number | null | undefined;

    if (isSettingSale) {
      const salePriceNum = Number(dto.salePrice);
      const originalNum = dto.originalPrice != null ? Number(dto.originalPrice) : currentPrice;
      priceUpdate = salePriceNum;
      oldPriceUpdate = originalNum;
      saleStartDateUpdate = dto.saleStartDate != null && dto.saleStartDate !== '' ? new Date(dto.saleStartDate as string) : undefined;
      saleEndDateUpdate = dto.saleEndDate != null && dto.saleEndDate !== '' ? new Date(dto.saleEndDate as string) : undefined;
      legacyOriginalPrice = originalNum;
      legacySalePrice = salePriceNum;
    } else if (isClearingSale && (dto.salePrice === null || dto.originalPrice === null)) {
      priceUpdate = currentOldPrice ?? currentPrice;
      oldPriceUpdate = null;
      saleStartDateUpdate = null;
      saleEndDateUpdate = null;
      legacyOriginalPrice = null;
      legacySalePrice = null;
    } else {
      if (dto.price !== undefined) priceUpdate = Number(dto.price);
      if (dto.saleStartDate !== undefined) saleStartDateUpdate = dto.saleStartDate == null ? null : new Date(dto.saleStartDate);
      if (dto.saleEndDate !== undefined) saleEndDateUpdate = dto.saleEndDate == null ? null : new Date(dto.saleEndDate);
    }

    const releaseDateUpdate =
      dto.year !== undefined && dto.year !== null
        ? (dto.year >= 1900 && dto.year <= 2100 ? new Date(dto.year, 0, 1) : null)
        : undefined;

    const updateData: Prisma.ProductUpdateInput = {
      title: dto.title,
      description: dto.description,
      ...(priceUpdate !== undefined ? { price: priceUpdate } : { price: dto.price }),
      condition: dto.condition,
      status: dto.status,
      isTradeEnabled: dto.isTradeEnabled !== undefined ? dto.isTradeEnabled : undefined,
      isPreorder: dto.isPreorder !== undefined ? dto.isPreorder : undefined,
      isSet: dto.isSet !== undefined ? dto.isSet : undefined,
      quantity: dto.quantity !== undefined ? (dto.quantity === null ? null : Number(dto.quantity)) : undefined,
      category: dto.categoryId ? { connect: { id: dto.categoryId } } : undefined,
      brand: dto.brandId ? { connect: { id: dto.brandId } } : (dto.brandId === null ? { disconnect: true } : undefined),
      carModel: dto.carModelId ? { connect: { id: dto.carModelId } } : (dto.carModelId === null ? { disconnect: true } : undefined),
      version: { increment: 1 },
      ...(releaseDateUpdate !== undefined ? { releaseDate: releaseDateUpdate } : {}),
      ...(oldPriceUpdate !== undefined ? { oldPrice: oldPriceUpdate } : {}),
      ...(saleStartDateUpdate !== undefined ? { saleStartDate: saleStartDateUpdate } : (dto.saleStartDate !== undefined ? { saleStartDate: dto.saleStartDate == null ? null : new Date(dto.saleStartDate) } : {})),
      ...(saleEndDateUpdate !== undefined ? { saleEndDate: saleEndDateUpdate } : (dto.saleEndDate !== undefined ? { saleEndDate: dto.saleEndDate == null ? null : new Date(dto.saleEndDate) } : {})),
      ...(legacyOriginalPrice !== undefined ? { originalPrice: legacyOriginalPrice } : {}),
      ...(legacySalePrice !== undefined ? { salePrice: legacySalePrice } : {}),
    };

    // Handle image updates if provided
    if (dto.imageUrls !== undefined) {
      // Delete existing images and create new ones
      await this.prisma.productImage.deleteMany({
        where: { productId: id },
      });

      if (dto.imageUrls.length > 0) {
        // Process imageUrls: extract S3 keys from presigned URLs or use keys directly
        const processedImageUrls = dto.imageUrls.map((urlOrKey) => {
          // If already a key format (starts with dev/ or prod/), use it directly
          if (urlOrKey.includes('dev/') || urlOrKey.includes('prod/')) {
            // Remove query string if present
            try {
              const urlObj = new URL(urlOrKey, 'http://dummy.com');
              return urlObj.pathname.startsWith('/') ? urlObj.pathname.substring(1) : urlObj.pathname;
            } catch {
              return urlOrKey; // If URL parse fails, use as-is
            }
          }
          // If presigned URL, extract key
          const extractedKey = this.extractKeyFromUrl(urlOrKey);
          if (extractedKey) {
            return extractedKey;
          }
          // Fallback: use original (for backward compatibility with old data)
          return urlOrKey;
        });

        await this.prisma.productImage.createMany({
          data: processedImageUrls.map((key, index) => ({
            productId: id,
            url: key, // Store S3 key instead of presigned URL
            sortOrder: index,
          })),
        });
      }
    }

    // Check if price changed (for wishlist notifications) – compare previous selling price with new one
    const prevSellingPrice = Number(product.price);
    const newSellingPrice = priceUpdate !== undefined ? priceUpdate : (dto.price !== undefined ? Number(dto.price) : prevSellingPrice);
    const priceChanged = prevSellingPrice !== newSellingPrice;

    // Update with optimistic locking
    try {
      const updated = await this.prisma.product.update({
        where: {
          id,
          version: product.version, // Optimistic lock check
        },
        data: updateData,
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
          brand: {
            select: {
              id: true,
              name: true,
              slug: true,
              logo: true,
            },
          },
          carModel: {
            select: {
              id: true,
              name: true,
              slug: true,
              brand: {
                select: { slug: true }
              }
            },
          },
          productAttributes: { include: { attribute: { include: { group: true } } } },
        },
      });

      if (dto.scale !== undefined || dto.attributeIds !== undefined) {
        const scaleMaterialAttrIds = await this.prisma.attribute.findMany({
          where: { group: { slug: { in: ['scale', 'material'] } } },
          select: { id: true },
        }).then((a) => a.map((x) => x.id));
        if (scaleMaterialAttrIds.length > 0) {
          await this.prisma.productAttribute.deleteMany({
            where: { productId: id, attributeId: { in: scaleMaterialAttrIds } },
          });
        }
        await this.linkProductAttributes(id, dto.scale, dto.attributeIds, dto.material);
      }

      // Invalidate cache for this product and product lists
      await this.cache.del(`products:detail:${id}`);
      await this.cache.delPattern('products:list:*');

      // If price changed, notify users who have this product in their wishlist
      if (priceChanged && updated.status === ProductStatus.active) {
        try {
          await this.notifyWishlistUsersOfPriceChange(id, prevSellingPrice, newSellingPrice, updated.title);
        } catch (error) {
          // Don't fail the update if notification fails
          this.logger.error(`Failed to notify wishlist users of price change for product ${id}:`, error);
        }
      }

      // Update Elasticsearch index (only if status is active)
      if (updated.status === ProductStatus.active) {
        try {
          await this.searchService.indexProduct(updated.id);
        } catch (error) {
          this.logger.warn('Failed to update product in Elasticsearch');
          // Don't fail the request if indexing fails
        }
      } else {
        // Remove from index if status changed to non-active
        try {
          await this.searchService.removeProduct(updated.id);
        } catch (error) {
          this.logger.warn('Failed to remove product from Elasticsearch');
          // Don't fail the request if indexing fails
        }
      }

      return await this.formatProductResponse(updated);
    } catch (error) {
      if (error.code === 'P2025') {
        throw new ConflictException('Ürün başka bir işlem tarafından güncellendi. Lütfen yenileyin.');
      }
      throw error;
    }
  }

  /**
   * Notify users who have this product in their wishlist about price change
   * Sends both in-app notifications and emails
   */
  private async notifyWishlistUsersOfPriceChange(
    productId: string,
    oldPrice: number,
    newPrice: number,
    productTitle: string,
  ): Promise<void> {
    // Get all wishlist items for this product with user info
    const wishlistItems = await this.prisma.wishlistItem.findMany({
      where: { productId },
      include: {
        wishlist: {
          include: {
            user: true, // Get full user object to check acceptsMarketingEmails
          },
        },
      },
    });

    // Filter users who accept marketing emails for email notifications
    const usersToNotify = wishlistItems
      .map((item) => (item as any).wishlist?.user)
      .filter((user: any) => user !== null && user !== undefined);

    if (usersToNotify.length === 0) {
      return;
    }

    // Determine if price increased or decreased
    const priceChange = newPrice - oldPrice;
    const isPriceDrop = priceChange < 0;
    const priceChangePercent = ((priceChange / oldPrice) * 100).toFixed(1);

    // Send both in-app notifications and emails to each user
    for (const user of usersToNotify) {
      try {
        // 1. Send in-app notification (only for price drops)
        if (isPriceDrop) {
          await this.notificationService.createInAppNotification(
            user.id,
            NotificationType.PRICE_DROP,
            {
              productId,
              productTitle,
              newPrice,
            },
          );
        }

        // 2. Send email (only for users who accept marketing emails)
        try {
          const acceptsMarketingEmails = user.acceptsMarketingEmails === true;
          if (acceptsMarketingEmails) {
            const htmlContent = this.generatePriceChangeEmailHtml(
              user.displayName,
              productTitle,
              oldPrice,
              newPrice,
              priceChange,
              priceChangePercent,
              isPriceDrop,
              productId,
            );
            const textContent = this.generatePriceChangeEmailText(
              user.displayName,
              productTitle,
              oldPrice,
              newPrice,
              priceChange,
              priceChangePercent,
              isPriceDrop,
              productId,
            );

            await this.smtpProvider.sendEmail({
              to: user.email,
              subject: isPriceDrop
                ? `🎉 Fiyat Düştü: ${productTitle}`
                : `📈 Fiyat Değişti: ${productTitle}`,
              html: htmlContent,
              text: textContent,
            });
          }
        } catch (emailError: any) {
          // Email failure shouldn't stop in-app notification
          this.logger.warn(`Failed to send price change email for user ${user.id}:`, emailError);
        }
      } catch (error: any) {
        this.logger.error(`Failed to send price change notification for user ${user.id}:`, error);
      }
    }

    this.logger.log(`Sent price change notifications to ${usersToNotify.length} users for product ${productId}`);
  }

  /**
   * Generate HTML content for price change email
   */
  private generatePriceChangeEmailHtml(
    userName: string,
    productTitle: string,
    oldPrice: number,
    newPrice: number,
    priceChange: number,
    priceChangePercent: string,
    isPriceDrop: boolean,
    productId: string,
  ): string {
    const baseStyle = `
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      max-width: 600px;
      margin: 0 auto;
      background: #ffffff;
      padding: 32px;
    `;
    const headerStyle = `color: #1a1a2e; margin-bottom: 24px;`;
    const buttonStyle = `
      display: inline-block;
      padding: 14px 28px;
      background-color: #4f46e5;
      color: white;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
    `;
    const boxStyle = `
      background: #f8fafc;
      padding: 20px;
      border-radius: 12px;
      margin: 20px 0;
      border: 1px solid #e2e8f0;
    `;

    return `
      <div style="${baseStyle}">
        <h1 style="${headerStyle}">${isPriceDrop ? '🎉 Fiyat Düştü!' : '📈 Fiyat Değişti!'}</h1>
        <p>Merhaba ${userName},</p>
        <p>İstek listenizdeki bir ürünün fiyatı değişti:</p>
        <div style="${boxStyle}">
          <p style="margin: 8px 0; font-size: 18px; font-weight: 600;"><strong>${productTitle}</strong></p>
          <p style="margin: 8px 0;"><strong>Eski Fiyat:</strong> <span style="text-decoration: line-through; color: #64748b;">${oldPrice.toFixed(2)} TL</span></p>
          <p style="margin: 8px 0; font-size: 20px; color: ${isPriceDrop ? '#059669' : '#dc2626'}; font-weight: 600;">
            <strong>Yeni Fiyat:</strong> ${newPrice.toFixed(2)} TL
          </p>
          <p style="margin: 8px 0; color: ${isPriceDrop ? '#059669' : '#dc2626'};">
            <strong>${isPriceDrop ? 'İndirim:' : 'Artış:'}</strong> ${Math.abs(priceChange).toFixed(2)} TL (${Math.abs(Number(priceChangePercent))}%)
          </p>
        </div>
        ${isPriceDrop ? `
        <p style="color: #059669; font-weight: 500; margin: 20px 0;">
          🎉 Bu ürünün fiyatı düştü! Hemen almak için aşağıdaki butona tıklayın.
        </p>
        ` : `
        <p style="color: #dc2626; font-weight: 500; margin: 20px 0;">
          ⚠️ Bu ürünün fiyatı arttı. Hala ilginizi çekiyorsa hemen alabilirsiniz.
        </p>
        `}
        <a href="${process.env.FRONTEND_URL || 'https://tarodan.com'}/products/${productId}" style="${buttonStyle}">Ürünü Görüntüle</a>
        <p style="margin-top: 24px; color: #64748b; font-size: 14px;">
          Bu ürünü istek listenizden kaldırmak için ürün sayfasına gidip "İstek Listesinden Çıkar" butonuna tıklayabilirsiniz.
        </p>
      </div>
    `;
  }

  /**
   * Generate text content for price change email
   */
  private generatePriceChangeEmailText(
    userName: string,
    productTitle: string,
    oldPrice: number,
    newPrice: number,
    priceChange: number,
    priceChangePercent: string,
    isPriceDrop: boolean,
    productId: string,
  ): string {
    return `
${isPriceDrop ? '🎉 Fiyat Düştü!' : '📈 Fiyat Değişti!'}

Merhaba ${userName},

İstek listenizdeki bir ürünün fiyatı değişti:

Ürün: ${productTitle}
Eski Fiyat: ${oldPrice.toFixed(2)} TL
Yeni Fiyat: ${newPrice.toFixed(2)} TL
${isPriceDrop ? 'İndirim' : 'Artış'}: ${Math.abs(priceChange).toFixed(2)} TL (${Math.abs(Number(priceChangePercent))}%)

${isPriceDrop ? '🎉 Bu ürünün fiyatı düştü! Hemen almak için linke tıklayın.' : '⚠️ Bu ürünün fiyatı arttı. Hala ilginizi çekiyorsa hemen alabilirsiniz.'}

Ürünü görüntüle: ${process.env.FRONTEND_URL || 'https://tarodan.com'}/products/${productId}

Bu ürünü istek listenizden kaldırmak için ürün sayfasına gidip "İstek Listesinden Çıkar" butonuna tıklayabilirsiniz.
    `.trim();
  }

  /**
   * Delete product (soft delete by setting inactive)
   * DELETE /products/:id
   */
  async remove(id: string, sellerId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException('Ürün bulunamadı');
    }

    // Verify ownership
    if (product.sellerId !== sellerId) {
      throw new ForbiddenException('Bu ürünü silme yetkiniz yok');
    }

    // Cannot delete sold or reserved products
    if (product.status === ProductStatus.sold || product.status === ProductStatus.reserved) {
      throw new BadRequestException('Satılmış veya rezerve edilmiş ürünler silinemez');
    }

    // Soft delete: set status to inactive
    await this.prisma.product.update({
      where: { id },
      data: { status: ProductStatus.inactive },
    });

    // Invalidate cache
    await this.cache.del(`products:detail:${id}`);
    await this.cache.delPattern('products:list:*');
    // Invalidate user's membership limits cache to refresh listing counts
    await this.cache.del(`membership:limits:${sellerId}`);
    await this.cache.del(`membership:${sellerId}`);

    // Remove from Elasticsearch index
    try {
      await this.searchService.removeProduct(id);
    } catch (error) {
      this.logger.warn('Failed to remove product from Elasticsearch');
      // Don't fail the request if indexing fails
    }

    return { message: 'Ürün silindi' };
  }

  /**
   * Get seller's own single product (any status)
   */
  async findSellerProductById(sellerId: string, productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
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

    if (!product) {
      throw new NotFoundException('Ürün bulunamadı');
    }

    // Only the owner can see their own non-active products
    if (product.sellerId !== sellerId) {
      throw new ForbiddenException('Bu ürünü görüntüleme yetkiniz yok');
    }

    return await this.formatProductResponse(product);
  }

  /**
   * Get seller's own products (all statuses)
   */
  async findSellerProducts(sellerId: string, query: ProductQueryDto) {
    const { status, page = 1, limit = 20 } = query;

    const where: Prisma.ProductWhereInput = {
      sellerId,
      ...(status && status.trim() !== ''
        ? { status: status as ProductStatus }
        : {
          // Exclude inactive, draft, and deleted listings from default view
          status: {
            notIn: [ProductStatus.inactive, ProductStatus.draft]
          }
        }
      ),
    };

    const total = await this.prisma.product.count({ where });

    const products = await this.prisma.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        _count: {
          select: {
            offers: { where: { status: 'pending' } },
          },
        },
      },
    });

    const formattedProducts = await Promise.all(
      products.map(async (p) => ({
        ...(await this.formatProductResponse(p)),
        pendingOffersCount: p._count.offers,
      }))
    );

    return {
      data: formattedProducts,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get attribute display value by group slug (e.g. 'scale' -> '1/64', 'material' -> 'Diecast (Metal)')
   */
  private getAttributeValueByGroup(productAttributes: any[] | undefined, groupSlug: string): string | undefined {
    if (!productAttributes?.length) return undefined;
    const pa = productAttributes.find(
      (p: any) => p.attribute?.group?.slug === groupSlug,
    );
    return pa?.attribute?.displayValue ?? pa?.attribute?.value ?? undefined;
  }

  /**
   * Build attributes array and derived scale/material without throwing (defensive for list/detail).
   */
  private getAttributesAndDerived(productAttributes: any[] | undefined): {
    attributes: any[];
    scale: string | undefined;
    material: string | undefined;
  } {
    try {
      const attributes = (productAttributes ?? [])
        .filter((pa: any) => pa?.attribute?.group)
        .map((pa: any) => ({
          id: pa.attribute.id,
          name: pa.attribute.slug,
          label: pa.attribute.group.name,
          value: pa.attribute.displayValue || pa.attribute.value,
          group: pa.attribute.group.name,
        }));
      return {
        attributes,
        scale: this.getAttributeValueByGroup(productAttributes, 'scale'),
        material: this.getAttributeValueByGroup(productAttributes, 'material'),
      };
    } catch (e) {
      this.logger.warn('getAttributesAndDerived failed', e);
      return { attributes: [], scale: undefined, material: undefined };
    }
  }

  /**
   * Extract S3 key from presigned URL or return original if not a presigned URL
   * Example: https://amzn-tarodan.s3.eu-west-1.amazonaws.com/dev/products/...?X-Amz-Signature=...
   * Returns: dev/products/...
   */
  private extractKeyFromUrl(url: string): string | null {
    try {
      // Eğer presigned URL ise (X-Amz-Signature içeriyorsa)
      if (url.includes('X-Amz-Signature') || url.includes('amzn-tarodan.s3.eu-west-1.amazonaws.com')) {
        const urlObj = new URL(url);
        // Path'den key'i extract et: /dev/products/... -> dev/products/...
        const path = urlObj.pathname;
        if (path.startsWith('/')) {
          return path.substring(1); // İlk / karakterini kaldır
        }
        return path;
      }
      // Eğer zaten key formatındaysa (dev/ veya prod/ ile başlıyorsa)
      if (url.includes('dev/') || url.includes('prod/')) {
        // Query string varsa kaldır
        try {
          const urlObj = new URL(url, 'http://dummy.com'); // Relative URL için dummy base
          return urlObj.pathname.startsWith('/') ? urlObj.pathname.substring(1) : urlObj.pathname;
        } catch {
          return url; // URL parse edilemezse direkt kullan
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Find MediaFile key by productId as fallback
   */
  private async findMediaFileKeyByProductId(productId: string): Promise<string | null> {
    try {
      const mediaFile = await this.prisma.mediaFile.findFirst({
        where: {
          entityType: 'product',
          entityId: productId,
        },
        orderBy: { createdAt: 'asc' },
      });
      return mediaFile?.key || null;
    } catch {
      return null;
    }
  }

  /**
   * Format product response
   */
  private async formatProductResponse(product: any) {
    // Get seller's active listings count
    let sellerListingsCount = 0;
    let sellerRating = null;
    let sellerTotalRatings = 0;

    if (product.seller?.id) {
      sellerListingsCount = await this.prisma.product.count({
        where: {
          sellerId: product.seller.id,
          status: ProductStatus.active,
        },
      });

      // Get seller rating stats
      const sellerRatingStats = await this.prisma.rating.aggregate({
        where: { receiverId: product.seller.id },
        _avg: { score: true },
        _count: true,
      });

      if (sellerRatingStats._count > 0 && sellerRatingStats._avg?.score) {
        sellerRating = Number(sellerRatingStats._avg.score.toFixed(1));
        sellerTotalRatings = sellerRatingStats._count;
      }
    }

    // Get product rating stats
    const ratingStats = await this.prisma.productRating.aggregate({
      where: { productId: product.id },
      _avg: { score: true },
      _count: true,
    });

    // A + oldPrice: price (A) = her zaman güncel satış fiyatı; oldPrice = indirim öncesi (çizili)
    const now = new Date();
    const priceA = Number(product.price);
    const oldPriceDb = product.oldPrice != null ? Number(product.oldPrice) : null;
    const saleStartDate = product.saleStartDate ? new Date(product.saleStartDate) : null;
    const saleEndDate = product.saleEndDate ? new Date(product.saleEndDate) : null;
    const saleDatesValid =
      (saleStartDate == null || now >= saleStartDate) &&
      (saleEndDate == null || now <= saleEndDate);
    const isProductSale = oldPriceDb != null && saleDatesValid;

    // Kampanya indirimi (satıcı/ürün/kategori/global): ürün kartında gösterilecek fiyata yansıt
    const sellerId = product.sellerId ?? product.seller?.id;
    const categoryId = product.categoryId ?? product.category?.id;
    let displayPrice = priceA;
    let displayOldPrice: number | null = isProductSale ? oldPriceDb : null;
    let discountPercent: number | null = isProductSale && oldPriceDb && oldPriceDb > priceA
      ? Math.round(((oldPriceDb - priceA) / oldPriceDb) * 100)
      : null;

    if (sellerId && categoryId) {
      const campaignPrice = await this.discountService.getEffectiveDisplayPrice(
        product.id,
        sellerId,
        categoryId,
        priceA,
      );
      if (campaignPrice != null && campaignPrice < priceA) {
        displayPrice = campaignPrice;
        displayOldPrice = priceA;
        discountPercent = Math.round(((priceA - campaignPrice) / priceA) * 100);
      }
    }

    const isOnSale = displayOldPrice != null && displayOldPrice > displayPrice;

    return {
      id: product.id,
      title: product.title,
      description: product.description,
      price: displayPrice,
      oldPrice: displayOldPrice,
      saleStartDate: saleStartDate?.toISOString() || null,
      saleEndDate: saleEndDate?.toISOString() || null,
      isOnSale,
      discountPercent,
      // API uyumluluğu: eski alanlar (originalPrice/salePrice) = oldPrice/price
      originalPrice: displayOldPrice,
      salePrice: displayPrice,
      condition: product.condition,
      status: product.status,
      isTradeEnabled: product.isTradeEnabled || false,
      viewCount: product.viewCount || 0,
      likeCount: product.likeCount || 0,
      quantity: product.quantity !== null && product.quantity !== undefined ? Number(product.quantity) : null, // null = unlimited stock
      images: await Promise.all(
        product.images?.map(async (img: any) => {
          let s3Key: string | null = null;

          // 1. Eğer zaten S3 key formatındaysa (dev/ veya prod/ ile başlıyorsa ve presigned URL değilse)
          if (img.url && !img.url.includes('X-Amz-Signature')) {
            if (img.url.includes('dev/') || img.url.includes('prod/')) {
              // Query string varsa kaldır
              try {
                const urlObj = new URL(img.url, 'http://dummy.com');
                s3Key = urlObj.pathname.startsWith('/') ? urlObj.pathname.substring(1) : urlObj.pathname;
              } catch {
                s3Key = img.url; // URL parse edilemezse direkt kullan
              }
            }
          }

          // 2. Eğer presigned URL ise, key'i extract et
          if (!s3Key && img.url && (img.url.includes('X-Amz-Signature') || img.url.includes('amzn-tarodan.s3'))) {
            s3Key = this.extractKeyFromUrl(img.url);
          }

          // 3. Eğer hala key bulamadıysak, MediaFile'dan bul (fallback)
          if (!s3Key) {
            s3Key = await this.findMediaFileKeyByProductId(product.id);
          }

          // 4. Eğer key bulunduysa, presigned URL oluştur
          if (s3Key) {
            try {
              const presignedUrl = await this.storageService.getPresignedDownloadUrl(
                'products',
                s3Key,
                3600 // 1 saat
              );
              return {
                id: img.id,
                url: presignedUrl,
                sortOrder: img.sortOrder,
              };
            } catch (error) {
              // Presigned URL oluşturulamazsa, orijinal URL'yi döndür
              this.logger.warn(`Failed to generate presigned URL for ${s3Key}: ${error}`);
            }
          }

          // 5. Fallback: Only return the original URL if it's a valid HTTP(S) URL.
          //    Raw S3 keys (e.g. "dev/products/...") are NOT valid browser URLs and crash the frontend.
          const fallbackUrl = img.url && (img.url.startsWith('http://') || img.url.startsWith('https://'))
            ? img.url
            : null;
          return {
            id: img.id,
            url: fallbackUrl,
            sortOrder: img.sortOrder,
          };
        }) || []
      ),
      rating: {
        average: ratingStats._avg?.score ? Number(ratingStats._avg.score.toFixed(1)) : null,
        count: ratingStats._count || 0,
      },
      seller: product.seller
        ? {
          id: product.seller.id,
          displayName: product.seller.displayName,
          isVerified: product.seller.isVerified,
          sellerType: product.seller.sellerType,
          listings_count: sellerListingsCount,
          productsCount: sellerListingsCount,
          rating: sellerRating,
          totalRatings: sellerTotalRatings,
        }
        : undefined,
      category: product.category
        ? {
          id: product.category.id,
          name: product.category.name,
          slug: product.category.slug,
        }
        : undefined,
      brand: product.brand
        ? {
          id: product.brand.id,
          name: product.brand.name,
          slug: product.brand.slug,
        }
        : undefined,
      manufacturer: product.manufacturer
        ? {
          id: product.manufacturer.id,
          name: product.manufacturer.name,
          slug: product.manufacturer.slug,
        }
        : undefined,
      carModel: product.carModel
        ? {
          id: product.carModel.id,
          name: product.carModel.name,
          slug: product.carModel.slug,
          brandSlug: product.carModel.brand?.slug,
        }
        : undefined,
      ...(this.getAttributesAndDerived(product.productAttributes)),
      year: product.releaseDate ? new Date(product.releaseDate).getFullYear() : undefined,
      isPreorder: product.isPreorder || false,
      releaseDate: product.releaseDate,
      isLimited: product.isLimited || false,
      editionNumber: product.editionNumber,
      editionTotal: product.editionTotal,
      isSet: product.isSet || false,
      bundleSize: product.bundleSize,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }

  // ==========================================================================
  // LISTING STATISTICS & LIMITS
  // ==========================================================================

  /**
   * Get active listing count for a seller
   * Active listings include: pending, active, reserved statuses
   */
  async getActiveListingCount(sellerId: string): Promise<number> {
    return this.prisma.product.count({
      where: {
        sellerId,
        status: { in: [ProductStatus.active, ProductStatus.pending, ProductStatus.reserved] },
      },
    });
  }

  // ==========================================================================
  // PRODUCT LIKE & VIEW SYSTEM (Business Dashboard Feature)
  // ==========================================================================

  /**
   * Like a product
   * POST /products/:id/like
   */
  async likeProduct(productId: string, userId: string): Promise<{ liked: boolean; likeCount: number }> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException('Ürün bulunamadı');
    }

    // Cannot like own product
    if (product.sellerId === userId) {
      throw new BadRequestException('Kendi ürününüzü beğenemezsiniz');
    }

    // Check if already liked
    const existingLike = await this.prisma.productLike.findUnique({
      where: {
        productId_userId: {
          productId,
          userId,
        },
      },
    });

    if (existingLike) {
      throw new BadRequestException('Bu ürünü zaten beğendiniz');
    }

    // Create like and increment counter in transaction
    const [_, updatedProduct] = await this.prisma.$transaction([
      this.prisma.productLike.create({
        data: {
          productId,
          userId,
        },
      }),
      this.prisma.product.update({
        where: { id: productId },
        data: { likeCount: { increment: 1 } },
      }),
    ]);

    // Invalidate cache
    await this.cache.del(`products:detail:${productId}`);

    return { liked: true, likeCount: updatedProduct.likeCount };
  }

  /**
   * Unlike a product
   * DELETE /products/:id/unlike
   */
  async unlikeProduct(productId: string, userId: string): Promise<{ liked: boolean; likeCount: number }> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException('Ürün bulunamadı');
    }

    // Check if liked
    const existingLike = await this.prisma.productLike.findUnique({
      where: {
        productId_userId: {
          productId,
          userId,
        },
      },
    });

    if (!existingLike) {
      throw new BadRequestException('Bu ürünü beğenmemişsiniz');
    }

    // Delete like and decrement counter in transaction
    const [_, updatedProduct] = await this.prisma.$transaction([
      this.prisma.productLike.delete({
        where: {
          productId_userId: {
            productId,
            userId,
          },
        },
      }),
      this.prisma.product.update({
        where: { id: productId },
        data: { likeCount: { decrement: 1 } },
      }),
    ]);

    // Invalidate cache
    await this.cache.del(`products:detail:${productId}`);

    return { liked: false, likeCount: Math.max(0, updatedProduct.likeCount) };
  }

  /**
   * Check if user has liked a product
   */
  async isProductLikedByUser(productId: string, userId: string): Promise<boolean> {
    const like = await this.prisma.productLike.findUnique({
      where: {
        productId_userId: {
          productId,
          userId,
        },
      },
    });
    return !!like;
  }

  /**
   * Increment product view count
   * POST /products/:id/view
   * Uses Redis to prevent same user incrementing multiple times per day
   */
  /**
   * Check if user agent indicates a bot
   */
  private isBot(userAgent?: string): boolean {
    if (!userAgent) return true; // No user agent is suspicious

    const botPatterns = [
      'bot', 'crawler', 'spider', 'scraper', 'curl', 'wget',
      'python-requests', 'java/', 'go-http-client', 'libwww',
      'httpunit', 'nutch', 'linkwalker', 'archiver', 'fetch',
      'slurp', 'yandex', 'bingbot', 'googlebot', 'baiduspider'
    ];

    const ua = userAgent.toLowerCase();
    return botPatterns.some(pattern => ua.includes(pattern));
  }

  async incrementViewCount(
    productId: string,
    userId?: string,
    clientIp?: string,
    userAgent?: string
  ): Promise<{ viewCount: number }> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException('Ürün bulunamadı');
    }

    // Skip counting views from product owner (kendi ürününü görüntüleme sayılmaz)
    if (userId && product.sellerId === userId) {
      return { viewCount: product.viewCount };
    }

    // Bot protection: Skip counting for bots
    if (this.isBot(userAgent)) {
      return { viewCount: product.viewCount };
    }

    // Her görüntülemede sayacı artır
    const updatedProduct = await this.prisma.product.update({
      where: { id: productId },
      data: { viewCount: { increment: 1 } },
    });

    // Invalidate cache
    await this.cache.del(`products:detail:${productId}`);
    await this.cache.delPattern('products:list:*');

    return { viewCount: updatedProduct.viewCount };
  }

  /**
   * Get product stats (views, likes) for seller dashboard
   */
  async getProductStats(productId: string, sellerId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        _count: {
          select: {
            likes: true,
            offers: true,
            orders: true,
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Ürün bulunamadı');
    }

    if (product.sellerId !== sellerId) {
      throw new ForbiddenException('Bu ürünün istatistiklerini görme yetkiniz yok');
    }

    return {
      id: product.id,
      title: product.title,
      viewCount: product.viewCount,
      likeCount: product.likeCount,
      offersCount: product._count.offers,
      ordersCount: product._count.orders,
    };
  }

  /**
   * Get detailed listing statistics for a seller
   * Returns counts by status and membership limit info
   */
  async getSellerListingStats(sellerId: string) {
    try {
      if (!sellerId) {
        throw new BadRequestException('Satıcı kimliği bulunamadı');
      }

      // Get all listing counts by status (exclude inactive and draft)
      const [pending, active, reserved, sold, rejected, inactive, total] = await Promise.all([
        this.prisma.product.count({ where: { sellerId, status: ProductStatus.pending } }),
        this.prisma.product.count({ where: { sellerId, status: ProductStatus.active } }),
        this.prisma.product.count({ where: { sellerId, status: ProductStatus.reserved } }),
        this.prisma.product.count({ where: { sellerId, status: ProductStatus.sold } }),
        this.prisma.product.count({ where: { sellerId, status: ProductStatus.rejected } }),
        this.prisma.product.count({ where: { sellerId, status: ProductStatus.inactive } }),
        // Total should exclude inactive and draft listings
        this.prisma.product.count({
          where: {
            sellerId,
            status: { notIn: [ProductStatus.inactive, ProductStatus.draft] }
          }
        }),
      ]);

      // Active listings = pending + active + reserved (counts against limit)
      const activeListings = pending + active + reserved;

      // Get membership limits
      const limits = await this.membershipService.getUserLimits(sellerId);

      // For free tier, use maxFreeListings (which includes platform setting override)
      // For other tiers, use maxTotalListings
      const maxLimit = limits.tierType === MembershipTierType.free ? limits.maxFreeListings : limits.maxTotalListings;
      const remainingLimit = limits.tierType === MembershipTierType.free ? limits.remainingFreeListings : limits.remainingTotalListings;

      return {
        // Counts by status
        counts: {
          pending,
          active,
          reserved,
          sold,
          rejected,
          inactive,
          total, // Total excluding inactive and draft
          activeListings, // This counts against the limit
        },
        // Membership limits
        limits: {
          tierName: limits.tierName,
          tierType: limits.tierType,
          maxFreeListings: limits.maxFreeListings,       // Tier's total max free listings
          maxTotalListings: limits.maxTotalListings,     // Tier's total max listings
          remainingFreeListings: limits.remainingFreeListings,
          remainingTotalListings: limits.remainingTotalListings,
          maxImagesPerListing: limits.maxImages,
          canCreateListing: limits.canCreateListing,
          canUseFreeSlot: limits.canUseFreeSlot,
          canTrade: limits.canTrade,
          canCreateCollection: limits.canCreateCollection,
        },
        // Quick summary for UI
        summary: {
          used: activeListings,
          max: maxLimit,                  // Use maxFreeListings for free tier, maxTotalListings for others
          remaining: remainingLimit,
          canCreate: limits.canCreateListing,
          percentUsed: maxLimit > 0
            ? Math.round((activeListings / maxLimit) * 100)
            : 0,
        },
      };
    } catch (error) {
      this.logger.error(`Error in getSellerListingStats for sellerId ${sellerId}:`, error);
      if (error instanceof BadRequestException || error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      throw new BadRequestException(`İlan istatistikleri alınamadı: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
    }
  }

  /**
   * Get dynamic filters (categories, brands, etc.)
   */
  async getFilters() {
    // 1. Categories
    const categories = await this.prisma.category.findMany({
      where: { isActive: true },
      select: { id: true, name: true, slug: true, parentId: true },
      orderBy: { name: 'asc' },
    });

    // 2. Brands
    const brands = await this.prisma.brand.findMany({
      where: { isActive: true },
      select: { name: true },
      orderBy: { name: 'asc' },
    });

    // 3. Scales (static) & Manufacturers (from DB)
    const scales = [
      '1:2', '1:6', '1:8', '1:12', '1:18', '1:24', '1:32', '1:36',
      '1:43', '1:64', '1:72', '1:76', '1:87', '1:100', '1:144', '1:200'
    ];

    const manufacturerRecords = await this.prisma.manufacturer.findMany({
      where: { isActive: true },
      select: { id: true, name: true, slug: true },
      orderBy: { sortOrder: 'asc' },
    });
    const manufacturers = manufacturerRecords.map((m) => ({
      id: m.id,
      name: m.name,
      slug: m.slug,
    }));

    // 4. Materials (from Attribute group "material" - Malzeme)
    const materialAttrs = await this.prisma.attribute.findMany({
      where: {
        isActive: true,
        group: { slug: 'material', isActive: true },
      },
      select: { slug: true, displayValue: true, value: true },
      orderBy: { sortOrder: 'asc' },
    });
    const materials = materialAttrs.map((a) => ({
      slug: a.slug,
      label: a.displayValue || a.value,
    }));

    return {
      categories: categories.map(c => ({ value: c.id, label: c.name, slug: c.slug, parentId: c.parentId })),
      brands: brands.map((b: Pick<Brand, 'name'>) => b.name),
      scales,
      manufacturers,
      materials: materials.length > 0 ? materials : [
        { slug: 'diecast', label: 'Diecast (Metal)' },
        { slug: 'resin', label: 'Resin (Reçine)' },
        { slug: 'composite', label: 'Composite (Kompozit)' },
        { slug: 'plastic', label: 'Plastic (Plastik)' },
      ],
    };
  }
}
