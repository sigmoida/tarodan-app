import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { i18nMessage } from "../i18n";
import { CacheService } from "../cache/cache.service";
import { SearchService } from "../search/search.service";
import { DiscountService } from "../discount/discount.service";
import { ProductQueryDto } from "./dto";
import { ProductStatus, Prisma } from "@prisma/client";
import { buildProductWhere } from "./helpers/build-product-where";
import { catalogProductWhere } from "./helpers/catalog-product-where";
import { fulltextProductSearch } from "./helpers/fulltext-search";
import { ACTIVE_TRADE_STATUSES } from "../trade/trade.constants";
import {
  saleCapableSellerWhere,
  tradeCapableSellerWhere,
} from "../membership/membership.util";
import { getFreeTierCanTrade } from "../membership/free-tier-trade.helper";
import { ProductCommonService } from "./product-common.service";
import { buildProductEditProjection } from "./product-edit-projection";

/**
 * ProductQueryService — ürün okuma/listeleme (findAll ES/PG akışı, popüler, tekil
 * detay, satıcının kendi ilanları, benzer ürünler). Paylaşılan yanıt DTO'su için
 * ProductCommonService'e delege eder (this.common.formatProductResponse). ES/PG
 * fallback, cache okuma (products:detail/list) ve stok-duyarlı sıralama birebir korunur.
 */
@Injectable()
export class ProductQueryService {
  private readonly logger = new Logger(ProductQueryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly searchService: SearchService,
    private readonly discountService: DiscountService,
    private readonly common: ProductCommonService,
  ) {}

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
      search,
      categoryId,
      sellerId,
      // Ham status: undefined (kapsayıcı: aktif + tükenen + satıldı) ile 'active'
      // (yalnızca stok-içi) farklı sonuç verir → ayrı cache anahtarları olmalı.
      status: status ?? null,
      condition,
      brand,
      brandId,
      manufacturerId,
      scale,
      material: materialSlug,
      tradeOnly,
      discountOnly,
      // Boost filters change the result set (home Vitrin rail vs a plain browse)
      // yet share page/limit/status — must be part of the key or they'd collide.
      homeShowcase: query.homeShowcase,
      boostedOnly: query.boostedOnly,
      preOrder,
      limited,
      set: query.set,
      minPrice,
      maxPrice,
      sortBy,
      page,
      limit,
      carModelId,
      attributeSlugs: query.attributeSlugs,
      attrGroups: query.attrGroups,
    })}`;

    const hasSearch = !!(search && String(search).trim());
    const isListAllOrPopular = !hasSearch && !discountOnly;
    if (isListAllOrPopular) {
      // The plain browse / popular grid is the hottest surface and was the ONLY
      // list path bypassing the cache — so every request re-ran the per-product
      // fan-out in formatProductResponse (seller aggregates, campaign price, …).
      // Cache it with a SHORT ttl: absorbs bursts without each recomputing, while
      // new/changed listings still appear within the window. Keyed identically to
      // the search path (page/filters included), so pages don't cross-contaminate.
      return this.cache.getOrSet(
        cacheKey,
        () => this.findAllViaPostgres(query),
        { ttl: 120 },
      );
    }

    const runListQuery = async () => {
      if (this.searchService.isAvailable()) {
        try {
          const esResult = await this.findAllViaElasticsearch(query);
          if (esResult) return esResult;
        } catch (err) {
          this.logger.warn("ES findAll failed, falling back to PostgreSQL");
        }
      }
      return this.findAllViaPostgres(query);
    };
    return this.cache.getOrSet(cacheKey, runListQuery, { ttl: 300 });
  }

  /**
   * Bulgu A: rezerv-duyarlı "stokta" koşulu. findAllViaPostgres'teki kanonik
   * inStockCondition ile birebir aynı — tamamen rezerve edilmiş ürün
   * (quantity=1, reserved=1, available=0) listeden çıkar. Tek `quantity > 0`
   * filtresi reserved'ı yok sayıp sold-out ürünü "stokta" gibi sızdırıyordu.
   */
  private inStockOrConditions(): Prisma.ProductWhereInput[] {
    return [
      { quantity: null },
      { reservedQuantity: null, quantity: { gt: 0 } },
      { quantity: { gt: this.prisma.product.fields.reservedQuantity } },
    ];
  }

  /**
   * Popüler ilanlar – sadece view count'a göre, indirim filtresi yok (cache yok)
   * GET /products/popular
   */
  async findPopular(limit: number, page: number) {
    const where: Prisma.ProductWhereInput = {
      ...catalogProductWhere(),
      status: ProductStatus.active,
      AND: [{ OR: this.inStockOrConditions() }],
      seller: saleCapableSellerWhere(),
    };
    const total = await this.prisma.product.count({ where });
    const products = await this.prisma.product.findMany({
      where,
      // Aktif boost'lar EN SON alınan önde (LIFO: boostedAt desc); boost bitince
      // boostedAt temizlenir (scheduler) → null'lar relevanceScore'a düşer.
      orderBy: [
        { boostedAt: { sort: "desc", nulls: "last" } },
        { relevanceScore: { sort: "desc", nulls: "last" } },
        { viewCount: "desc" },
        { likeCount: "desc" },
        { createdAt: "desc" },
        { id: "asc" },
      ],
      skip: (page - 1) * limit,
      take: limit,
      include: {
        images: { orderBy: { sortOrder: "asc" }, take: 1 },
        seller: {
          select: {
            id: true,
            displayName: true,
            isVerified: true,
            sellerType: true,
            avatarUrl: true,
          },
        },
        category: { select: { id: true, name: true, slug: true } },
        brand: { select: { id: true, name: true, slug: true, logo: true } },
        manufacturer: { select: { id: true, name: true, slug: true } },
        carModel: { include: { brand: { select: { slug: true } } } },
        productAttributes: {
          include: { attribute: { include: { group: true } } },
        },
      },
    });
    const formattedProducts =
      await this.common.formatProductResponseMany(products);
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
      brandId,
      manufacturerId,
      carModelId,
    } = query;

    const esOptions = {
      query: search || undefined,
      categoryId,
      brandId,
      manufacturerId,
      carModelId,
      sellerId,
      // status verilmezse undefined geçer → ES kapsayıcı küme (aktif + tükenen + satıldı)
      status,
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
      sortBy: sortBy || "relevance",
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
        images: { orderBy: { sortOrder: "asc" }, take: 1 },
        seller: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            isVerified: true,
            sellerType: true,
          },
        },
        category: { select: { id: true, name: true, slug: true } },
        brand: { select: { id: true, name: true, slug: true, logo: true } },
        manufacturer: { select: { id: true, name: true, slug: true } },
        carModel: { include: { brand: { select: { slug: true } } } },
        productAttributes: {
          include: { attribute: { include: { group: true } } },
        },
      },
    });

    // ES index can be stale (e.g. after DB seed): ids exist in ES but not in DB → fallback to Postgres
    if (products.length === 0) return null;

    // Preserve ES ordering
    const idOrder = new Map(esResult.ids.map((id, i) => [id, i]));
    products.sort(
      (a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0),
    );

    // Stok bitenler sayfa sonunda: ES'teki inStock bayrağı rezervasyon
    // değişiminde yeniden indekslenmez; canlı DB verisiyle (quantity − reserved)
    // UI "STOKTA YOK" tanımına göre sayfa içinde stoktakileri öne al.
    const isInStock = (p: {
      status: ProductStatus;
      quantity: number | null;
      reservedQuantity: number | null;
    }) =>
      p.status === ProductStatus.active &&
      (p.quantity == null || p.quantity - (p.reservedQuantity ?? 0) > 0);
    const pageOrdered = [
      ...products.filter((p) => isInStock(p)),
      ...products.filter((p) => !isInStock(p)),
    ];

    const formattedProducts =
      await this.common.formatProductResponseMany(pageOrdered);

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
      {
        ...query,
        material: query.material,
        // Takas filtresinde satıcının GÜNCEL yetkisi de aranır (bayrak yalnız
        // niyettir; üyelik bitince üründe kalır).
        ...(query.tradeOnly
          ? {
              tradeCapableSeller: tradeCapableSellerWhere(
                await getFreeTierCanTrade(this.prisma),
              ),
            }
          : {}),
      },
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
        if (criteria.sellerIds.length > 0)
          campaignConditions.push({ sellerId: { in: criteria.sellerIds } });
        if (criteria.categoryIds.length > 0)
          campaignConditions.push({ categoryId: { in: criteria.categoryIds } });
        if (criteria.productIds.length > 0)
          campaignConditions.push({ id: { in: criteria.productIds } });
        const combinedCondition = {
          OR: [manualDiscountCondition, ...campaignConditions],
        };
        (where.AND as any[]).push(combinedCondition);
      }
    }

    // DB-level sorting (replaces old in-memory scoring)
    let orderBy: Prisma.ProductOrderByWithRelationInput[];
    switch (sortBy) {
      case "price_asc":
        orderBy = [{ price: "asc" }];
        break;
      case "price_desc":
        orderBy = [{ price: "desc" }];
        break;
      case "created_asc":
        orderBy = [{ createdAt: "asc" }];
        break;
      case "created_desc":
        orderBy = [{ createdAt: "desc" }];
        break;
      case "title_asc":
        orderBy = [{ title: "asc" }];
        break;
      case "title_desc":
        orderBy = [{ title: "desc" }];
        break;
      case "view_count_asc":
        orderBy = [{ viewCount: "asc" }];
        break;
      case "view_count_desc":
        orderBy = [{ viewCount: "desc" }];
        break;
      case "rating_desc":
        orderBy = [
          { averageRating: { sort: "desc", nulls: "last" } },
          { ratingCount: "desc" },
          { viewCount: "desc" },
          { createdAt: "desc" },
        ];
        break;
      default:
        // Varsayılan/alaka sıralaması: Sponsorlu (rankTier=2) → Premium satıcı (1) → Standart (0).
        // Kademe içinde İlan Kalite Skoru, ardından etkileşim (favori/görüntülenme) ve yenilik.
        // Açık sortBy seçildiğinde (price/created/title/view/rating) bu öncelik uygulanmaz.
        // Harmanlanmış relevance skoru: boost/premium bonusu + kalite + etkileşim tek skorda.
        // Öne çıkanlar normalde önde; çok popüler ürün de geri kalmaz (viral geçebilir).
        // Aktif boost'lar EN SON alınan önde (LIFO). boostedAt yalnız aktif boost'ta
        // dolu (bitince scheduler null'lar) → boostsuz ürünler relevanceScore'a düşer.
        orderBy = [
          { boostedAt: { sort: "desc", nulls: "last" } },
          { relevanceScore: { sort: "desc", nulls: "last" } },
          { viewCount: "desc" }, // relevance eşitse: çok görüntülenen önde (canlı)
          { likeCount: "desc" },
          { createdAt: "desc" },
          { id: "asc" },
        ];
    }

    // Stok bitenler her zaman en altta — UI'daki "STOKTA YOK" rozetiyle birebir
    // aynı tanım: stokta = aktif VE müsait adet (quantity − reserved) > 0.
    // Sadece status'a bakmak yetmez: tamamen rezerve edilmiş ürün (quantity=1,
    // reserved=1) aktif kalır ama UI "STOKTA YOK" gösterir. Prisma computed
    // kolonla sıralayamadığı için liste iki kovada sayfalanır: önce stoktakiler,
    // bittiğinde stok bitenler — seçilen sortBy her kova içinde korunur.
    const inStockCondition: Prisma.ProductWhereInput = {
      status: ProductStatus.active,
      OR: [
        { quantity: null },
        { reservedQuantity: null, quantity: { gt: 0 } },
        { quantity: { gt: this.prisma.product.fields.reservedQuantity } },
      ],
    };
    const whereInStock: Prisma.ProductWhereInput = {
      AND: [where, inStockCondition],
    };
    const whereOutOfStock: Prisma.ProductWhereInput = {
      AND: [where, { NOT: inStockCondition }],
    };
    // Stok bitenler kovasında satılan, tükenenden önce gelsin (enum: sold < inactive)
    const outOfStockOrderBy: Prisma.ProductOrderByWithRelationInput[] = [
      { status: "asc" },
      ...orderBy,
    ];

    const productInclude = {
      images: { orderBy: { sortOrder: "asc" as const }, take: 1 },
      seller: {
        select: {
          id: true,
          displayName: true,
          isVerified: true,
          sellerType: true,
          avatarUrl: true,
        },
      },
      category: { select: { id: true, name: true, slug: true } },
      brand: { select: { id: true, name: true, slug: true, logo: true } },
      manufacturer: { select: { id: true, name: true, slug: true } },
      carModel: { include: { brand: { select: { slug: true } } } },
      productAttributes: {
        include: { attribute: { include: { group: true } } },
      },
    } satisfies Prisma.ProductInclude;

    const [totalInStock, totalOutOfStock] = await Promise.all([
      this.prisma.product.count({ where: whereInStock }),
      this.prisma.product.count({ where: whereOutOfStock }),
    ]);
    const total = totalInStock + totalOutOfStock;

    const skip = (page - 1) * limit;
    const inStockTake = Math.max(0, Math.min(limit, totalInStock - skip));
    const inStockRows =
      inStockTake > 0
        ? await this.prisma.product.findMany({
            where: whereInStock,
            orderBy,
            skip,
            take: inStockTake,
            include: productInclude,
          })
        : [];
    const outOfStockTake = limit - inStockRows.length;
    const outOfStockRows =
      outOfStockTake > 0
        ? await this.prisma.product.findMany({
            where: whereOutOfStock,
            orderBy: outOfStockOrderBy,
            skip: Math.max(0, skip - totalInStock),
            take: outOfStockTake,
            include: productInclude,
          })
        : [];
    const products = [...inStockRows, ...outOfStockRows];

    const formattedProducts =
      await this.common.formatProductResponseMany(products);

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

    // Seller entitlement is evaluated outside the cached projection. Otherwise
    // a detail cached just before BUSINESS expiry remains purchasable-looking
    // for the full cache TTL.
    const publiclyViewable = await this.prisma.product.count({
      where: {
        ...catalogProductWhere(),
        id,
        seller: saleCapableSellerWhere(),
        OR: [
          { status: ProductStatus.active },
          { status: ProductStatus.sold },
          { status: ProductStatus.inactive, quantity: 0 },
        ],
      },
    });
    if (publiclyViewable !== 1) {
      throw new NotFoundException(i18nMessage("server.product.notFound"));
    }

    // Use cache with 10 minute TTL for product details
    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const product = await this.prisma.product.findUnique({
          where: { id },
          include: {
            images: { orderBy: { sortOrder: "asc" } },
            seller: {
              select: {
                id: true,
                displayName: true,
                avatarUrl: true,
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
          throw new NotFoundException(i18nMessage("server.product.notFound"));
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
          throw new NotFoundException(i18nMessage("server.product.notFound"));
        }

        return await this.common.formatProductResponse(product);
      },
      { ttl: 600 }, // 10 minutes cache
    );
  }

  /**
   * Get seller's own product by ID (all statuses) – for edit page
   * GET /products/my/:id
   */
  async findMyProductById(id: string, userId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, ...catalogProductWhere() },
      include: {
        images: { orderBy: { sortOrder: "asc" } },
        seller: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
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
      throw new NotFoundException(i18nMessage("server.product.notFound"));
    }

    if (product.sellerId !== userId) {
      throw new ForbiddenException(i18nMessage("server.product.viewForbidden"));
    }

    const formatted = await this.common.formatProductResponse(product);
    // Üst seviye GÖSTERİM projeksiyonudur (ilan detayında sahibin görünümü onu
    // kullanır); `edit` ise kaydın ham hâlidir ve düzenleme formunu tek başına
    // doldurur. İkisi ayrı olmazsa form, kampanya uygulanmış fiyatı ürünün
    // fiyatı sanıyor ve kargo boyutu gibi hiç dönmeyen alanları varsayılana
    // düşürüyordu. Bkz. `product-edit-projection.ts`.
    return {
      ...formatted,
      edit: buildProductEditProjection(product, {
        imageUrl: (key: string) => this.common.publicAssetUrl(key),
      }),
    };
  }

  /**
   * Aynı kategorideki, aktif ve stoklu, kendisi olmayan en yeni ürünleri
   * döner. Stockout cancel sayfası "alternatif ürünler" carousel'inde kullanır.
   */
  async findSimilarProducts(productId: string, limit = 12) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, ...catalogProductWhere() },
      select: { categoryId: true },
    });
    if (!product?.categoryId) return [];

    const products = await this.prisma.product.findMany({
      where: {
        ...catalogProductWhere(),
        categoryId: product.categoryId,
        id: { not: productId },
        status: ProductStatus.active,
        seller: saleCapableSellerWhere(),
        // Bulgu A: rezerv-duyarlı stok filtresi (kanonik inStockCondition ile aynı).
        // quantity = null → sınırsız stok (dijital/preorder) dahil; tamamen rezerve
        // ürün (available=0) "alternatif ürünler"de gösterilmez.
        OR: this.inStockOrConditions(),
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 24),
      include: {
        images: { orderBy: { sortOrder: "asc" }, take: 1 },
        seller: {
          select: {
            id: true,
            displayName: true,
            isVerified: true,
            sellerType: true,
          },
        },
        category: { select: { id: true, name: true, slug: true } },
        brand: { select: { id: true, name: true, slug: true, logo: true } },
        carModel: {
          include: { brand: { select: { slug: true } } },
        },
        productAttributes: {
          include: { attribute: { include: { group: true } } },
        },
      },
    });

    return this.common.formatProductResponseMany(products);
  }

  /**
   * Get seller's own single product (any status)
   */
  async findSellerProductById(sellerId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        id: productId,
        ...catalogProductWhere(),
      },
      include: {
        images: { orderBy: { sortOrder: "asc" } },
        seller: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
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
      throw new NotFoundException(i18nMessage("server.product.notFound"));
    }

    // Only the owner can see their own non-active products
    if (product.sellerId !== sellerId) {
      throw new ForbiddenException(i18nMessage("server.product.viewForbidden"));
    }

    return await this.common.formatProductResponse(product);
  }

  /**
   * Get seller's own products (all statuses)
   */
  async findSellerProducts(sellerId: string, query: ProductQueryDto) {
    const { status, tradeEligible, page = 1, limit = 20 } = query;

    const where: Prisma.ProductWhereInput = {
      ...catalogProductWhere(),
      sellerId,
      ...(status && status.trim() !== ""
        ? { status: status as ProductStatus }
        : {
            // "Tümü": deleted hariç hepsi (sold, inactive, reserved, active,
            // pending, rejected görünür). Kaldırılan ürünler ayrı 'deleted' filtresinde.
            status: { notIn: [ProductStatus.deleted] },
          }),
      // Takas teklifine eklenebilir ürünler: aktif + aktif takasta değil + müsait stoğu var
      // (createTrade'in initiator validasyonuyla birebir — trade.service.ts)
      ...(tradeEligible
        ? {
            status: ProductStatus.active,
            NOT: {
              tradeItemsOffered: {
                some: {
                  side: "initiator",
                  trade: { status: { in: ACTIVE_TRADE_STATUSES } },
                },
              },
            },
            OR: [
              { quantity: null },
              { reservedQuantity: null, quantity: { gt: 0 } },
              { quantity: { gt: this.prisma.product.fields.reservedQuantity } },
            ],
          }
        : {}),
    };

    const total = await this.prisma.product.count({ where });

    const products = await this.prisma.product.findMany({
      where,
      // Birincil sıralama: en yeni ilan en üstte (createdAt DESC). Satılabilir
      // ilanların durumuna göre değil tarihe göre sıralanması istenir; satılan/
      // pasif/reddedilen ilanlar aşağıdaki adımda en alta taşınır (yine en yeni
      // önce). Öne çıkarma (boost) bu sorguya dahil değildir, dokunulmaz.
      orderBy: [{ createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
      include: {
        images: { orderBy: { sortOrder: "asc" }, take: 1 },
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    // Satılabilir ilanlar üstte, terminal durumdakiler (sold/inactive/rejected)
    // en altta — her iki grup da kendi içinde en yeni önce (kararlı sıralama,
    // createdAt DESC zaten uygulandı).
    const TERMINAL_STATUSES: ProductStatus[] = [
      ProductStatus.sold,
      ProductStatus.inactive,
      ProductStatus.rejected,
      ProductStatus.suspended,
    ];
    const isTerminal = (p: { status: ProductStatus }) =>
      TERMINAL_STATUSES.includes(p.status);
    products.sort((a, b) => Number(isTerminal(a)) - Number(isTerminal(b)));

    const formattedProducts =
      await this.common.formatProductResponseMany(products);

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
}
