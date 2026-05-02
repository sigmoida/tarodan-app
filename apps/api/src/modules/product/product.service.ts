import {
  Injectable,
  OnModuleInit,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
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
import { buildProductWhere } from './helpers/build-product-where';
import { fulltextProductSearch } from './helpers/fulltext-search';
import { getAvailableQuantity } from './helpers/product-availability.helper';
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
    if (dto.images && dto.images.length > limits.maxImages) {
      throw new BadRequestException(
        `Üyeliğiniz (${limits.tierName}) ile ilan başına maksimum ${limits.maxImages} görsel yükleyebilirsiniz. ` +
        `${dto.images.length} görsel gönderdiniz.`
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

    // Normalize optional UUIDs: empty string causes Prisma FK error → use undefined
    const brandId = dto.brandId?.trim() || undefined;
    const carModelId = dto.carModelId?.trim() || undefined;
    const manufacturerId = dto.manufacturerId?.trim() || undefined;

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
          quantity: dto.quantity !== undefined ? dto.quantity : null, // null = unlimited stock
          isTradeEnabled: dto.isTradeEnabled || false,
          isPreorder: dto.isPreorder ?? false,
          isSet: dto.isSet ?? false,
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
      await this.linkProductAttributes(product.id, dto.scale, dto.attributeIds, dto.material);

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
        throw new BadRequestException('Ürün oluşturuldu ancak yüklenemedi. Lütfen tekrar deneyin.');
      }
      return await this.formatProductResponse(productWithAttrs);
    } catch (err: any) {
      const code = err?.code;
      if (code === 'P2003') {
        throw new BadRequestException(
          'Seçilen marka, model veya üretici geçersiz. Lütfen listeden tekrar seçin.'
        );
      }
      if (code === 'P2002') {
        throw new BadRequestException('Bu ürün zaten mevcut veya benzersiz alan çakışması var.');
      }
      // Zaten HTTP exception ise (400, 403 vb.) aynen fırlat
      if (err?.status && err?.status >= 400 && err?.status < 500) {
        throw err;
      }
      // Diğer hataları logla ve 500 döndür (mesajda development'ta detay göster)
      this.logger.error('Product create failed', err?.stack || err?.message || err);
      const message =
        process.env.NODE_ENV === 'development' && err?.message
          ? `İlan oluşturulamadı: ${err.message}`
          : 'İlan oluşturulurken bir hata oluştu. Lütfen tekrar deneyin.';
      throw new InternalServerErrorException(message);
    }
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
      const scaleTrim = scale.trim();
      const scaleNorm = scaleTrim.replace(/\s/g, '').replace(/[:\/]/g, ''); // "1:64" or "1/64" -> "164"
      const scaleSlugAlt = scaleTrim.replace(':', '-'); // "1:64" -> "1-64" (seed format)
      const scaleAttr = await this.prisma.attribute.findFirst({
        where: {
          group: { slug: 'scale', isActive: true },
          isActive: true,
          OR: [
            { slug: scaleNorm },
            { slug: scaleSlugAlt },
            { value: scaleTrim },
            { displayValue: scaleTrim },
          ],
        },
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
      set: query.set,
      minPrice, maxPrice, sortBy, page, limit, carModelId,
    })}`;

    const hasSearch = !!(search && String(search).trim());
    const isListAllOrPopular = !hasSearch && !discountOnly;
    if (isListAllOrPopular) {
      return this.findAllViaPostgres(query);
    }

    const runListQuery = async () => {
      if (this.searchService.isAvailable()) {
        try {
          const esResult = await this.findAllViaElasticsearch(query);
          if (esResult) return esResult;
        } catch (err) {
          this.logger.warn('ES findAll failed, falling back to PostgreSQL');
        }
      }
      return this.findAllViaPostgres(query);
    };
    return this.cache.getOrSet(cacheKey, runListQuery, { ttl: 300 });
  }

  /**
   * Popüler ilanlar – sadece view count'a göre, indirim filtresi yok (cache yok)
   * GET /products/popular
   */
  async findPopular(limit: number, page: number) {
    const where: Prisma.ProductWhereInput = {
      status: ProductStatus.active,
      NOT: { id: { startsWith: 'membership-' } },
      AND: [{ OR: [{ quantity: { gt: 0 } }, { quantity: null }] }],
    };
    const total = await this.prisma.product.count({ where });
    const products = await this.prisma.product.findMany({
      where,
      orderBy: [{ viewCount: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
      include: {
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        seller: { select: { id: true, displayName: true, isVerified: true, sellerType: true, avatarUrl: true } },
        category: { select: { id: true, name: true, slug: true } },
        brand: { select: { id: true, name: true, slug: true, logo: true } },
        manufacturer: { select: { id: true, name: true, slug: true } },
        carModel: { include: { brand: { select: { slug: true } } } },
        productAttributes: { include: { attribute: { include: { group: true } } } },
      },
    });
    const formattedProducts = await Promise.all(
      products.map((p) => this.formatProductResponse(p)),
    );
    return {
      data: formattedProducts,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * ES-based product listing: query ES for IDs + total, then hydrate via Prisma
   */
  private async findAllViaElasticsearch(query: ProductQueryDto) {
    const {
      search, categoryId, sellerId, condition, brand, scale,
      material: materialSlug, tradeOnly, discountOnly, preOrder,
      limited, set: setFilter, minPrice, maxPrice, sortBy,
      page = 1, limit = 20, brandId, manufacturerId, carModelId,
    } = query;

    const esOptions = {
      query: search || undefined,
      categoryId,
      brandId,
      manufacturerId,
      carModelId,
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
      minPrice,
      maxPrice,
      page,
      pageSize: limit,
      sortBy: sortBy || 'relevance',
    };

    const esResult = await this.searchService.searchProductIds(esOptions);
    // ES index boş olabilir (örn. db reset sonrası); arama yoksa PostgreSQL fallback kullanılsın
    if (esResult.ids.length === 0) return null;
    // İndeks eksik olabilir (sadece güncellenen ürün indexlendi): arama yok, sayfa 1 ve total < limit ise Postgres kullan
    const hasSearch = !!(search && search.trim());
    if (!hasSearch && page === 1 && esResult.total < limit) return null;

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

    // ES index can be stale (e.g. after DB seed): ids exist in ES but not in DB → fallback to Postgres
    if (products.length === 0) return null;

    // Preserve ES ordering
    const idOrder = new Map(esResult.ids.map((id, i) => [id, i]));
    products.sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0));

    const formattedProducts = await Promise.all(
      products.map((p) => this.formatProductResponse(p)),
    );

    // Tutarlılık: Postgres path ile aynı şekilde, discountOnly=true iken sadece
    // gerçekten indirimli ürünleri döndür.
    if (discountOnly) {
      const onSale = formattedProducts.filter((p: any) => p.isOnSale === true);
      return {
        data: onSale,
        meta: {
          total: onSale.length,
          page,
          limit,
          totalPages: Math.max(1, Math.ceil(onSale.length / limit)),
        },
      };
    }

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
   * PostgreSQL-based listing (primary for non-search queries, fallback for search when ES is down).
   *
   * All filters use indexed columns, foreign keys, or attribute joins.
   * vehicleType is excluded (ES-only text heuristic).
   * Text search (when present) uses title/description contains as a fallback.
   * Sorting is always DB-level with skip/take pagination (no in-memory scoring).
   */
  private async findAllViaPostgres(query: ProductQueryDto) {
    const { discountOnly, sortBy, page = 1, limit = 20 } = query;

    // Full-text search via tsvector/tsquery (replaces ILIKE contains)
    let fulltextIds: string[] | undefined;
    if (query.search) {
      fulltextIds = await fulltextProductSearch(this.prisma, query.search);
    }

    const where = buildProductWhere(
      { ...query, material: query.material },
      { fulltextIds },
    );

    // discountOnly requires async DiscountService access, applied separately
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
        (where.AND as any[]).push(combinedCondition);
      }
    }

    // DB-level sorting (replaces old in-memory scoring)
    let orderBy: Prisma.ProductOrderByWithRelationInput[];
    switch (sortBy) {
      case 'price_asc': orderBy = [{ price: 'asc' }]; break;
      case 'price_desc': orderBy = [{ price: 'desc' }]; break;
      case 'created_asc': orderBy = [{ createdAt: 'asc' }]; break;
      case 'created_desc': orderBy = [{ createdAt: 'desc' }]; break;
      case 'title_asc': orderBy = [{ title: 'asc' }]; break;
      case 'title_desc': orderBy = [{ title: 'desc' }]; break;
      case 'view_count_asc': orderBy = [{ viewCount: 'asc' }]; break;
      case 'view_count_desc': orderBy = [{ viewCount: 'desc' }]; break;
      case 'rating_desc':
        orderBy = [
          { averageRating: { sort: 'desc', nulls: 'last' } },
          { ratingCount: 'desc' },
          { viewCount: 'desc' },
          { createdAt: 'desc' },
        ];
        break;
      default:
        orderBy = [{ viewCount: 'desc' }, { likeCount: 'desc' }, { createdAt: 'desc' }];
    }

    const total = await this.prisma.product.count({ where });
    const products = await this.prisma.product.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        seller: { select: { id: true, displayName: true, isVerified: true, sellerType: true, avatarUrl: true } },
        category: { select: { id: true, name: true, slug: true } },
        brand: { select: { id: true, name: true, slug: true, logo: true } },
        manufacturer: { select: { id: true, name: true, slug: true } },
        carModel: { include: { brand: { select: { slug: true } } } },
        productAttributes: { include: { attribute: { include: { group: true } } } },
      },
    });

    const formattedProducts = await Promise.all(
      products.map((p) => this.formatProductResponse(p)),
    );

    // discountOnly: WHERE kolayca "kampanya kapsamındaki" ürünleri geçirse de,
    // formatProductResponse kampanya fiyatını uygulayamayabilir (değer 0, tarih
    // dışı vs.). Kullanıcıya sadece gerçekten isOnSale=true olanları döndür.
    if (discountOnly) {
      const onSale = formattedProducts.filter((p: any) => p.isOnSale === true);
      return {
        data: onSale,
        meta: {
          total: onSale.length,
          page,
          limit,
          totalPages: Math.max(1, Math.ceil(onSale.length / limit)),
        },
      };
    }

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

        // Allow active, sold, and out-of-stock (inactive + quantity=0) products to be viewable
        // Sold/out-of-stock will show "Stok bitti" on the frontend
        // Pending, rejected, inactive with quantity > 0 are NOT visible publicly
        const isOutOfStock = product.quantity === 0;
        const canView =
          product.status === ProductStatus.active ||
          product.status === ProductStatus.sold ||
          (product.status === ProductStatus.inactive && isOutOfStock);
        if (!canView) {
          throw new NotFoundException('Ürün bulunamadı');
        }

        return await this.formatProductResponse(product);
      },
      { ttl: 600 }, // 10 minutes cache
    );
  }

  /**
   * Get seller's own product by ID (all statuses) – for edit page
   * GET /products/my/:id
   */
  async findMyProductById(id: string, userId: string) {
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

    if (product.sellerId !== userId) {
      throw new ForbiddenException('Bu ürünü görüntüleme yetkiniz yok');
    }

    return await this.formatProductResponse(product);
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

    // Reserved products cannot be updated at all
    if (product.status === ProductStatus.reserved) {
      throw new BadRequestException('Rezerve edilmiş ürünler güncellenemez');
    }

    // Sold or inactive (stok biten): only allow reactivation (status → active + quantity update)
    if (product.status === ProductStatus.sold || product.status === ProductStatus.inactive) {
      if (dto.status === ProductStatus.active && dto.quantity != null && Number(dto.quantity) > 0) {
        await this.prisma.product.update({
          where: { id },
          data: {
            status: ProductStatus.active,
            quantity: Number(dto.quantity),
          },
        });
        await this.cache.del(`products:detail:${id}`);
        await this.cache.delPattern('products:list:*');
        // Stok geri geldi — wishlist + son 7 gün stockout-cancelled alıcılara
        // back-in-stock bildirimi gönder. Hata atarsa kullanıcı reaktivasyonunu
        // yine de başarılı say.
        this.notificationService
          .broadcastBackInStock(id, product.title)
          .catch((err) =>
            this.logger.warn(`broadcastBackInStock failed for ${id}: ${err?.message}`),
          );
        const updated = await this.prisma.product.findUnique({
          where: { id },
          include: { images: true, category: true, brand: true, carModel: true },
        });
        return updated;
      }
      throw new BadRequestException('Yeniden satışa açmak için stok miktarı belirleyin');
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
    // class-transformer @Type(() => Number) converts null → 0, so treat 0 as "no sale" too
    const rawSalePrice = dto.salePrice;
    const isSettingSale = rawSalePrice != null && Number(rawSalePrice) > 0;
    const isClearingSale = rawSalePrice === null || rawSalePrice === undefined || Number(rawSalePrice) === 0;

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
    } else if (isClearingSale) {
      priceUpdate = dto.price !== undefined ? Number(dto.price) : (currentOldPrice ?? currentPrice);
      oldPriceUpdate = null;
      saleStartDateUpdate = null;
      saleEndDateUpdate = null;
      legacyOriginalPrice = null;
      legacySalePrice = null;
    } else {
      // Not setting a sale: update normal price and clear any previous sale so old price does not stick as "indirimli"
      if (dto.price !== undefined) priceUpdate = Number(dto.price);
      oldPriceUpdate = null;
      legacyOriginalPrice = null;
      legacySalePrice = null;
      saleStartDateUpdate = null;
      saleEndDateUpdate = null;
      if (dto.saleStartDate !== undefined) saleStartDateUpdate = dto.saleStartDate == null ? null : new Date(dto.saleStartDate);
      if (dto.saleEndDate !== undefined) saleEndDateUpdate = dto.saleEndDate == null ? null : new Date(dto.saleEndDate);
    }

    const releaseDateUpdate =
      dto.year !== undefined && dto.year !== null
        ? (dto.year >= 1900 && dto.year <= 2100 ? new Date(dto.year, 0, 1) : null)
        : undefined;

    // When client sends dto.price and we're not setting a sale, always apply it so price updates are never dropped
    const effectivePrice =
      dto.price !== undefined && !isSettingSale
        ? Number(dto.price)
        : (priceUpdate !== undefined ? priceUpdate : dto.price);

    const updateData: Prisma.ProductUpdateInput = {
      title: dto.title,
      description: dto.description,
      ...(effectivePrice !== undefined ? { price: effectivePrice } : {}),
      condition: dto.condition,
      status: dto.status,
      isTradeEnabled: dto.isTradeEnabled !== undefined ? dto.isTradeEnabled : undefined,
      isPreorder: dto.isPreorder !== undefined ? dto.isPreorder : undefined,
      isSet: dto.isSet !== undefined ? dto.isSet : undefined,
      quantity: dto.quantity !== undefined ? (dto.quantity === null ? null : Number(dto.quantity)) : undefined,
      category: dto.categoryId ? { connect: { id: dto.categoryId } } : undefined,
      brand: dto.brandId ? { connect: { id: dto.brandId } } : (dto.brandId === null ? { disconnect: true } : undefined),
      carModel: dto.carModelId ? { connect: { id: dto.carModelId } } : (dto.carModelId === null ? { disconnect: true } : undefined),
      manufacturer: dto.manufacturerId !== undefined
        ? (dto.manufacturerId ? { connect: { id: dto.manufacturerId } } : { disconnect: true })
        : undefined,
      version: { increment: 1 },
      ...(releaseDateUpdate !== undefined ? { releaseDate: releaseDateUpdate } : {}),
      ...(oldPriceUpdate !== undefined ? { oldPrice: oldPriceUpdate } : {}),
      ...(saleStartDateUpdate !== undefined ? { saleStartDate: saleStartDateUpdate } : (dto.saleStartDate !== undefined ? { saleStartDate: dto.saleStartDate == null ? null : new Date(dto.saleStartDate) } : {})),
      ...(saleEndDateUpdate !== undefined ? { saleEndDate: saleEndDateUpdate } : (dto.saleEndDate !== undefined ? { saleEndDate: dto.saleEndDate == null ? null : new Date(dto.saleEndDate) } : {})),
      ...(legacyOriginalPrice !== undefined ? { originalPrice: legacyOriginalPrice } : {}),
      ...(legacySalePrice !== undefined ? { salePrice: legacySalePrice } : {}),
    };

    // Handle image updates if provided
    if (dto.images !== undefined) {
      await this.prisma.productImage.deleteMany({
        where: { productId: id },
      });

      if (dto.images.length > 0) {
        await this.prisma.productImage.createMany({
          data: dto.images.map((img, index) => ({
            productId: id,
            cardKey: img.cardKey,
            detailKey: img.detailKey,
            sortOrder: index,
          })),
        });
      }
    }

    // Check if price changed (for wishlist notifications) – compare previous selling price with new one
    const prevSellingPrice = Number(product.price);
    const newSellingPrice = effectivePrice !== undefined ? effectivePrice : prevSellingPrice;
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

      if (dto.scale !== undefined || dto.attributeIds !== undefined || dto.material !== undefined) {
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
        // Reindex in ES so search/list shows updated scale/material
        if (this.searchService.isAvailable()) {
          this.searchService.indexProduct(id).catch((err) => this.logger.warn(`ES index update failed for ${id}:`, err));
        }
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

      // Stok geri geldi mi? available = quantity − reserved, 0→>0 transition'ı
      // wishlist + stockout-cancelled alıcılara haber verir.
      const beforeAvailable =
        (product.quantity ?? 0) - (product.reservedQuantity ?? 0);
      const afterAvailable =
        (updated.quantity ?? 0) - (updated.reservedQuantity ?? 0);
      if (
        beforeAvailable <= 0 &&
        afterAvailable > 0 &&
        updated.status === ProductStatus.active
      ) {
        this.notificationService
          .broadcastBackInStock(id, updated.title)
          .catch((err) =>
            this.logger.warn(`broadcastBackInStock failed for ${id}: ${err?.message}`),
          );
      }

      // Refetch product after attribute linking so response includes updated scale/material
      const toReturn =
        dto.scale !== undefined || dto.attributeIds !== undefined || dto.material !== undefined
          ? await this.prisma.product.findUnique({
              where: { id },
              include: {
                images: { orderBy: { sortOrder: 'asc' } },
                seller: { select: { id: true, displayName: true, isVerified: true, sellerType: true, avatarUrl: true } },
                category: { select: { id: true, name: true, slug: true } },
                brand: { select: { id: true, name: true, slug: true, logo: true } },
                manufacturer: { select: { id: true, name: true, slug: true } },
                carModel: { include: { brand: { select: { slug: true } } } },
                productAttributes: { include: { attribute: { include: { group: true } } } },
              },
            })
          : updated;

      return await this.formatProductResponse(toReturn ?? updated);
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
          // "Tümü": show all except draft (so sold, inactive, reserved, active, pending, rejected visible)
          status: { notIn: [ProductStatus.draft] }
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
   * Also matches by group name for robustness (e.g. 'Ölçek' for scale).
   */
  private getAttributeValueByGroup(productAttributes: any[] | undefined, groupSlug: string, groupNameFallback?: string): string | undefined {
    if (!productAttributes?.length) return undefined;
    const pa = productAttributes.find(
      (p: any) =>
        p.attribute?.group?.slug === groupSlug ||
        (groupNameFallback && p.attribute?.group?.name?.toLowerCase() === groupNameFallback.toLowerCase()),
    );
    const val = pa?.attribute?.displayValue ?? pa?.attribute?.value ?? undefined;
    if (val) return val;
    // Normalize scale slug to value format for dropdown match (e.g. "164" -> "1:64", "118" -> "1:18")
    if (groupSlug === 'scale' && pa?.attribute?.slug && /^\d+$/.test(pa.attribute.slug)) {
      const s = pa.attribute.slug;
      if (s.length >= 2) return `1:${s.slice(1)}`;
      if (s.length === 1) return `1:${s}`;
    }
    return undefined;
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
      const scaleFromGroup = this.getAttributeValueByGroup(productAttributes, 'scale', 'Ölçek');
      const scaleFromAttrs = attributes.find((a) => a.group === 'Ölçek' || a.label === 'Ölçek')?.value;
      return {
        attributes,
        scale: scaleFromGroup || scaleFromAttrs,
        material: this.getAttributeValueByGroup(productAttributes, 'material', 'Malzeme'),
      };
    } catch (e) {
      this.logger.warn('getAttributesAndDerived failed', e);
      return { attributes: [], scale: undefined, material: undefined };
    }
  }

  private async resolveAvatarUrl(avatarUrl: string | null | undefined): Promise<string | null> {
    if (!avatarUrl) return null;
    if (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://')) return avatarUrl;
    if (this.storageService) {
      try {
        return await this.storageService.getPresignedDownloadUrl('avatars', avatarUrl, 86400);
      } catch {
        return null;
      }
    }
    return null;
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

      // Get seller rating stats (only approved)
      const sellerRatingStats = await this.prisma.rating.aggregate({
        where: { receiverId: product.seller.id, status: 'approved' },
        _avg: { score: true },
        _count: true,
      });

      if (sellerRatingStats._count > 0 && sellerRatingStats._avg?.score) {
        sellerRating = Number(sellerRatingStats._avg.score.toFixed(1));
        sellerTotalRatings = sellerRatingStats._count;
      }
    }

    // Get product rating stats (use cached columns when available, else aggregate)
    let ratingAverage: number | null = null;
    let ratingCount = 0;
    if (product.averageRating != null && product.ratingCount != null) {
      ratingAverage = Number(product.averageRating.toFixed(1));
      ratingCount = product.ratingCount;
    } else {
      const ratingStats = await this.prisma.productRating.aggregate({
        where: { productId: product.id, status: 'approved' },
        _avg: { score: true },
        _count: true,
      });
      ratingAverage = ratingStats._avg?.score ? Number(ratingStats._avg.score.toFixed(1)) : null;
      ratingCount = ratingStats._count || 0;
    }

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
      quantity: product.quantity !== null && product.quantity !== undefined ? Number(product.quantity) : null,
      availableQuantity: getAvailableQuantity(product) ?? undefined, // müsait adet = quantity; null = sınırsız stok
      images: (product.images || []).map((img: { id: string; cardKey: string; detailKey: string; sortOrder: number }) => ({
        id: img.id,
        cardKey: img.cardKey,
        detailKey: img.detailKey,
        cardUrl: this.storageService.getPublicAssetUrl(img.cardKey),
        detailUrl: this.storageService.getPublicAssetUrl(img.detailKey),
        sortOrder: img.sortOrder,
      })),
      rating: {
        average: ratingAverage,
        count: ratingCount,
      },
      seller: product.seller
        ? {
          id: product.seller.id,
          displayName: product.seller.displayName,
          isVerified: product.seller.isVerified,
          sellerType: product.seller.sellerType,
          avatarUrl: await this.resolveAvatarUrl((product.seller as any).avatarUrl),
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

    if (userId && product.sellerId === userId) {
      return { viewCount: product.viewCount };
    }

    if (this.isBot(userAgent)) {
      return { viewCount: product.viewCount };
    }

    const identifier = userId || clientIp || 'unknown';
    const rateLimitKey = `viewCount:${productId}:${identifier}`;
    try {
      const { allowed } = await this.cache.checkRateLimit(rateLimitKey, 1, 1800);
      if (!allowed) {
        return { viewCount: product.viewCount };
      }
    } catch {
      // Redis down - fall through and count the view
    }

    const updatedProduct = await this.prisma.product.update({
      where: { id: productId },
      data: { viewCount: { increment: 1 } },
    });

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

    // 2. Brands (id, name, slug – same format as manufacturers)
    const brands = await this.prisma.brand.findMany({
      where: { isActive: true },
      select: { id: true, name: true, slug: true },
      orderBy: { name: 'asc' },
    });

    // 3. Scales (from Attribute group "scale") & Manufacturers (from DB)
    const scaleAttrs = await this.prisma.attribute.findMany({
      where: {
        isActive: true,
        group: { slug: 'scale', isActive: true },
      },
      select: { value: true, slug: true, displayValue: true },
      orderBy: { sortOrder: 'asc' },
    });
    const scales = scaleAttrs.length > 0
      ? scaleAttrs.map((a) => a.displayValue || a.value)
      : ['1:2', '1:6', '1:8', '1:12', '1:18', '1:24', '1:32', '1:36', '1:43', '1:64', '1:72', '1:76', '1:87', '1:100', '1:144', '1:200'];

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

    // 5. Car models (id, name, slug, brandId – for filter dropdown, brand-specific)
    const carModels = await this.prisma.carModel.findMany({
      where: { isActive: true },
      select: { id: true, name: true, slug: true, brandId: true },
      orderBy: [{ brandId: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });

    return {
      categories: categories.map(c => ({ value: c.id, label: c.name, slug: c.slug, parentId: c.parentId })),
      brands: brands.map((b) => ({ id: b.id, name: b.name, slug: b.slug })),
      carModels: carModels.map((m) => ({ id: m.id, name: m.name, slug: m.slug, brandId: m.brandId })),
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
