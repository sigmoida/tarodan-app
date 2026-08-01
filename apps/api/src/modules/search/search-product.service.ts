import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { ProductStatus } from "@prisma/client";
import { StorageService } from "../storage/storage.service";
import { buildProductWhere } from "../product/helpers/build-product-where";
import { fulltextProductSearch } from "../product/helpers/fulltext-search";
import {
  canTradeFromMembership,
  tradeCapableSellerWhere,
} from "../membership/membership.util";
import { getFreeTierCanTrade } from "../membership/free-tier-trade.helper";
import {
  SearchCommonService,
  SearchOptions,
  SearchResponse,
} from "./search-common.service";

/**
 * Ürün arama + indeksleme alt servisi (search.service.ts'ten birebir taşındı):
 * searchProducts, searchProductIds, fallbackSearch, buildProductDocument,
 * indexProduct, removeProduct, syncProduct, forceRecreateIndex, reindexAll,
 * syncIndexIfEmpty. Paylaşılan ES client'ı + bayraklar + where-builder'lar için
 * SearchCommonService'e delege eder.
 */
@Injectable()
export class SearchProductService {
  private readonly logger = new Logger(SearchProductService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly common: SearchCommonService,
  ) {}

  /** ES bağlı ama index boş, DB'de ürün varsa reindex çalıştır (db:reset senaryosu) */
  async syncIndexIfEmpty(): Promise<void> {
    if (!this.common.isAvailable()) return;
    try {
      const [esRes, dbCount] = await Promise.all([
        this.common.client
          .count({ index: this.common.productsIndex })
          .catch(() => ({ count: 0 })),
        this.prisma.product.count({
          where: this.common.indexableProductWhere(),
        }),
      ]);
      const esCount = esRes?.count ?? 0;
      if (esCount === 0 && dbCount > 0) {
        this.logger.log(
          `Elasticsearch index boş, DB'de ${dbCount} listelenebilir ürün var – reindex başlatılıyor...`,
        );
        const indexed = await this.reindexAll();
        this.logger.log(
          `Elasticsearch reindex tamamlandı: ${indexed} ürün index'lendi.`,
        );
      }
    } catch (err) {
      this.logger.warn(
        "syncIndexIfEmpty failed",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // ──────────────────────────── Search ────────────────────────────

  async searchProducts(options: SearchOptions): Promise<SearchResponse> {
    if (!this.common.isAvailable()) {
      return this.fallbackSearch(options);
    }

    const {
      query,
      categoryId,
      brandId,
      manufacturerId,
      carModelId,
      minPrice,
      maxPrice,
      condition,
      brand,
      scale,
      material,
      manufacturer,
      tradeOnly,
      discountOnly,
      preOrder,
      limited,
      set: setFilter,
      sellerId,
      status,
      sortBy = "relevance",
    } = options;

    // Sayfalama parametrelerini güvenli tamsayıya indirge: geçersiz/NaN/≤0 girişlerde
    // (örn. ?page=abc → parseInt→NaN) `from = (page-1)*pageSize` NaN olur ve ES/Prisma
    // çöker. Varsayılan: page=1, pageSize=20.
    const page =
      Number.isFinite(options.page) && (options.page as number) >= 1
        ? Math.floor(options.page as number)
        : 1;
    const pageSize =
      Number.isFinite(options.pageSize) && (options.pageSize as number) >= 1
        ? Math.floor(options.pageSize as number)
        : 20;

    const must: any[] = [];
    const filter: any[] = [];

    // Text search
    if (query) {
      must.push({
        bool: {
          should: [
            { match: { title: { query, boost: 5 } } },
            { match: { "title.edge_ngram": { query, boost: 3 } } },
            { match: { "title.ngram": { query, boost: 2 } } },
            { match: { description: { query, boost: 1 } } },
            { match: { "description.edge_ngram": { query, boost: 0.5 } } },
            { match: { categoryName: { query, boost: 2 } } },
            { match: { "categoryName.edge_ngram": { query, boost: 1 } } },
            { match: { brandName: { query, boost: 2 } } },
            { match: { "brandName.edge_ngram": { query, boost: 1 } } },
            { match: { manufacturerName: { query, boost: 2 } } },
            { match: { "manufacturerName.edge_ngram": { query, boost: 1 } } },
            { match: { carModelName: { query, boost: 2 } } },
            { match: { "carModelName.edge_ngram": { query, boost: 1 } } },
            { match: { "carModelName.ngram": { query, boost: 2 } } },
            {
              multi_match: {
                query,
                fields: [
                  "title^3",
                  "description",
                  "categoryName^2",
                  "brandName^2",
                  "manufacturerName^2",
                  "carModelName^2",
                ],
                fuzziness: 2,
                prefix_length: 1,
                boost: 1.5,
              },
            },
            {
              fuzzy: {
                title: {
                  value: query.toLowerCase(),
                  fuzziness: "AUTO",
                  prefix_length: 1,
                  boost: 1,
                },
              },
            },
          ],
          minimum_should_match: 1,
        },
      });
    }

    // Görünürlük (status / stok)
    if (status) {
      // Açık statü istendi: tam eşitle (örn. discount carousel'i status=active → stok-içi).
      filter.push({ term: { status } });
    } else {
      // Statü verilmedi: aktif (stoklu) + otomatik tükenen (inactive+qty0) + satıldı.
      filter.push({
        bool: {
          should: [
            { term: { status: ProductStatus.active } },
            {
              bool: {
                must: [
                  { term: { status: ProductStatus.inactive } },
                  { term: { quantity: 0 } },
                ],
              },
            },
            { term: { status: ProductStatus.sold } },
          ],
          minimum_should_match: 1,
        },
      });
    }
    filter.push({ bool: { must_not: this.common.virtualProductEsMustNot() } });

    // ID-based filters (keyword exact match)
    if (categoryId) filter.push({ term: { categoryId } });
    if (brandId) filter.push({ term: { brandId } });
    if (manufacturerId) filter.push({ term: { manufacturerId } });
    if (carModelId) filter.push({ term: { carModelId } });
    if (sellerId) filter.push({ term: { sellerId } });
    if (condition) filter.push({ term: { condition } });

    // Scale filter – exact keyword match (e.g. "1:18")
    // Support value ("1:18"), slug with hyphen ("1-18"), and slug normalized ("118")
    if (scale) {
      const scaleTrim = scale.trim();
      const scaleSlugHyphen = scaleTrim.replace(":", "-");
      const scaleSlugNorm = scaleTrim.replace(/\s/g, "").replace(/[:\/]/g, "");
      filter.push({
        bool: {
          should: [
            { term: { scale: scaleTrim } },
            { term: { scale: scaleSlugHyphen } },
            { term: { scale: scaleSlugNorm } },
          ],
          minimum_should_match: 1,
        },
      });
    }

    // Material filter – exact keyword match (e.g. "diecast")
    if (material) filter.push({ term: { material } });

    // Price range
    if (minPrice !== undefined || maxPrice !== undefined) {
      const range: any = {};
      if (minPrice !== undefined) range.gte = minPrice;
      if (maxPrice !== undefined) range.lte = maxPrice;
      filter.push({ range: { price: range } });
    }

    // Boolean filters
    if (tradeOnly) {
      // Bayrak niyet, yetki üyelikten: Postgres yolundaki kuralın ES karşılığı.
      filter.push({ term: { isTradeEnabled: true } });
      if (!(await getFreeTierCanTrade(this.prisma))) {
        filter.push({ term: { sellerCanTrade: true } });
      }
    }
    if (preOrder) filter.push({ term: { isPreorder: true } });
    if (limited) filter.push({ term: { isLimited: true } });
    if (setFilter) filter.push({ term: { isSet: true } });
    if (discountOnly) filter.push({ exists: { field: "oldPrice" } });

    // Text-based fallback filters (when ID is not available)
    if (brand && !brandId) {
      filter.push({ term: { "brandName.keyword": brand } });
    }
    if (manufacturer && !manufacturerId) {
      filter.push({ term: { "manufacturerName.keyword": manufacturer } });
    }

    // Sorting
    let sort: any[] = [];
    switch (sortBy) {
      case "price_asc":
        sort = [{ price: "asc" }];
        break;
      case "price_desc":
        sort = [{ price: "desc" }];
        break;
      case "newest":
      case "created_desc":
        sort = [{ createdAt: "desc" }];
        break;
      case "created_asc":
        sort = [{ createdAt: "asc" }];
        break;
      case "view_count_desc":
        sort = [{ viewCount: "desc" }];
        break;
      case "view_count_asc":
        sort = [{ viewCount: "asc" }];
        break;
      case "title_asc":
        sort = [{ "title.keyword": "asc" }];
        break;
      case "title_desc":
        sort = [{ "title.keyword": "desc" }];
        break;
      case "rating_desc":
        sort = [{ ratingAverage: "desc" }, { ratingCount: "desc" }];
        break;
      default:
        // Alaka sıralaması: metin aramasında _score birincil kalır (relevance korunur),
        // boost/kalite eşitlik bozucu olur; gezinmede (query yok) sponsorlu kademe öne geçer.
        sort = query
          ? [
              { _score: "desc" },
              // Eşit alaka içinde aktif boost'lular önde (LIFO — en son alan üstte).
              // Eski/boş boostedAt en sona düşer.
              { boostedAt: { order: "desc", missing: "_last" } },
              { relevanceScore: "desc" },
              { viewCount: "desc" },
            ]
          : [
              { relevanceScore: "desc" },
              { viewCount: "desc" },
              { createdAt: "desc" },
            ];
    }

    // Stoktakiler her zaman önce: stoğu biten (tükenen/satıldı/aktif-ama-stoksuz)
    // ürünler hangi sıralama seçilirse seçilsin en alta iner. Tek-statülü
    // sorgularda (örn. status=active) zaten çoğunlukla no-op'tur. Eski indeks
    // dokümanlarında alan bulunmayabilir → missing '_first' ile stok-içi sayılır.
    sort = [{ inStock: { order: "desc", missing: "_first" } }, ...sort];

    try {
      const searchBody: any = {
        query: {
          // Aktif boost'lu ürünleri (Ekonomik + Vitrin) alaka sıralamasında HAFİF
          // öne al: boostedUntil > now olanların _score'unu ×1.5. Alaka birincil
          // kalır (alakasız boosted ürünler tepeye yığılmaz); süre bitince range
          // eşleşmez → expiry-safe, reindex gerektirmez.
          function_score: {
            query: {
              bool: {
                must: must.length > 0 ? must : [{ match_all: {} }],
                filter,
              },
            },
            functions: [
              {
                filter: { range: { boostedUntil: { gt: "now" } } },
                weight: 1.5,
              },
            ],
            boost_mode: "multiply",
            score_mode: "sum",
          },
        },
        sort,
        from: (page - 1) * pageSize,
        size: pageSize,
      };
      if (query) {
        searchBody.highlight = {
          fields: {
            title: { fragment_size: 120, number_of_fragments: 1 },
            description: { fragment_size: 200, number_of_fragments: 2 },
          },
          pre_tags: ["<em>"],
          post_tags: ["</em>"],
        };
      }
      searchBody.aggs = {
        categories: { terms: { field: "categoryId", size: 50 } },
        brands: { terms: { field: "brandId", size: 50 } },
        conditions: { terms: { field: "condition", size: 10 } },
        price_range: { stats: { field: "price" } },
      };

      const response = await this.common.client.search({
        index: this.common.productsIndex,
        ...searchBody,
      });

      const hits = response.hits.hits;
      const total =
        typeof response.hits.total === "number"
          ? response.hits.total
          : (response.hits.total as any)?.value || 0;
      const aggs = (response as any).aggregations;

      if (hits.length === 0 && query) {
        this.logger.debug("ES returned 0 results, falling back to database");
        return this.fallbackSearch(options);
      }

      return {
        results: hits.map((hit: any) => ({
          id: hit._source.id,
          title: hit._source.title,
          description: hit._source.description,
          price: hit._source.price,
          condition: hit._source.condition,
          status: hit._source.status,
          categoryId: hit._source.categoryId,
          categoryName: hit._source.categoryName,
          brandId: hit._source.brandId,
          brandName: hit._source.brandName,
          manufacturerId: hit._source.manufacturerId,
          manufacturerName: hit._source.manufacturerName,
          sellerName: hit._source.sellerName,
          imageUrl: hit._source.imageUrl,
          score: hit._score || 0,
          highlight: hit.highlight
            ? {
                title: hit.highlight.title,
                description: hit.highlight.description,
              }
            : undefined,
        })),
        total,
        page,
        pageSize,
        took: response.took || 0,
        aggregations: aggs
          ? {
              categories: aggs.categories,
              brands: aggs.brands,
              conditions: aggs.conditions,
              price_range: aggs.price_range,
            }
          : undefined,
      };
    } catch (error) {
      this.logger.debug("Elasticsearch search error, falling back to database");
      return this.fallbackSearch(options);
    }
  }

  /**
   * Search and return only product IDs (used by product.service for full-data hydration)
   */
  async searchProductIds(
    options: SearchOptions,
  ): Promise<{ ids: string[]; total: number }> {
    if (!this.common.isAvailable()) {
      return { ids: [], total: 0 };
    }

    const result = await this.searchProducts(options);
    return {
      ids: result.results.map((r) => r.id),
      total: result.total,
    };
  }

  // ──────────────────────────── Indexing ────────────────────────────

  private buildProductDocument(
    product: any,
    freeTierCanTrade: boolean,
  ): Record<string, any> {
    const scaleAttr = product.productAttributes?.find(
      (pa: any) => pa.attribute?.group?.slug === "scale",
    );
    const materialAttr = product.productAttributes?.find(
      (pa: any) => pa.attribute?.group?.slug === "material",
    );
    const vehicleTypeAttr = product.productAttributes?.find(
      (pa: any) => pa.attribute?.group?.slug === "vehicle_type",
    );

    return {
      id: product.id,
      title: product.title,
      description: product.description,
      price: parseFloat(product.price.toString()),
      oldPrice:
        product.oldPrice != null
          ? parseFloat(product.oldPrice.toString())
          : undefined,
      condition: product.condition,
      status: product.status,
      categoryId: product.categoryId,
      categoryName: product.category?.name,
      brandId: product.brandId || undefined,
      brandName: product.brand?.name || undefined,
      manufacturerId: product.manufacturerId || undefined,
      manufacturerName: product.manufacturer?.name || undefined,
      carModelId: product.carModelId || undefined,
      carModelName: product.carModel?.name || undefined,
      sellerId: product.sellerId,
      sellerName: product.seller?.displayName,
      imageUrl: product.images?.[0]?.cardKey
        ? this.storageService.getPublicAssetUrl(product.images[0].cardKey)
        : undefined,
      scale:
        scaleAttr?.attribute?.value || scaleAttr?.attribute?.slug || undefined,
      viewCount: product.viewCount || 0,
      ratingAverage:
        product.averageRating != null
          ? parseFloat(product.averageRating.toString())
          : 0,
      ratingCount: product.ratingCount ?? 0,
      rankTier: product.rankTier ?? 0,
      qualityScore: product.qualityScore ?? 0,
      popularityScore: product.popularityScore ?? 0,
      relevanceScore: product.relevanceScore ?? 0,
      material: materialAttr?.attribute?.slug || undefined,
      vehicleType: vehicleTypeAttr?.attribute?.slug || undefined,
      isTradeEnabled: product.isTradeEnabled,
      isPreorder: product.isPreorder,
      isLimited: product.isLimited,
      isSet: product.isSet,
      // Stok-içi sıralama için denormalize bayrak: aktif VE müsait adet
      // (quantity − reserved) > 0; quantity=null sınırsız sayılır. Sadece
      // status'a güvenme — tamamen rezerve edilmiş ürün de UI'da "STOKTA YOK".
      inStock:
        product.status === ProductStatus.active &&
        (product.quantity == null ||
          product.quantity - (product.reservedQuantity ?? 0) > 0),
      quantity: product.quantity,
      // Boost pencereleri: aramada aktif-boost lift'i (`boostedUntil > now`) + LIFO
      // eşitlik bozucu (`boostedAt` desc). Süre bitince range eşleşmez → reindex
      // gerekmeden düşer (expiry-safe).
      boostedUntil: product.boostedUntil ?? undefined,
      boostedAt: product.boostedAt ?? undefined,
      // Satıcının EFEKTİF takas yetkisi — ES üyelik tablosunu göremediği için
      // dokümana denormalize edilir. Üyelik değişimi ürün düzenlemesi olmadığı
      // için üyelik yolları etkilenen satıcının ürünlerini yeniden indeksler.
      sellerCanTrade: canTradeFromMembership(
        product.seller?.membership ?? null,
        product.seller ?? null,
        freeTierCanTrade,
      ),
      // Önyüzün okuduğu tek alan: niyet VE yetki. REST DTO'su ile aynı ad.
      tradeAvailable:
        product.isTradeEnabled === true &&
        canTradeFromMembership(
          product.seller?.membership ?? null,
          product.seller ?? null,
          freeTierCanTrade,
        ),
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }

  private readonly productInclude = {
    category: { select: { id: true, name: true } },
    brand: { select: { id: true, name: true } },
    manufacturer: { select: { id: true, name: true } },
    carModel: { select: { id: true, name: true } },
    seller: {
      select: {
        id: true,
        displayName: true,
        // Takas yetkisi ÜYELİKTEN gelir; ürünün bayrağı yalnız niyettir.
        // Dokümana denormalize edilir çünkü ES üyelik tablosunu göremez.
        businessStatus: true,
        companyName: true,
        taxId: true,
        membership: {
          select: {
            status: true,
            currentPeriodEnd: true,
            tier: { select: { type: true, isActive: true, canTrade: true } },
          },
        },
      },
    },
    images: {
      take: 1,
      orderBy: { sortOrder: "asc" as const },
      select: { cardKey: true },
    },
    productAttributes: {
      include: {
        attribute: { include: { group: { select: { slug: true } } } },
      },
    },
  };

  async indexProduct(productId: string): Promise<void> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: this.productInclude,
    });

    if (!product) return;

    try {
      await this.common.client.index({
        index: this.common.productsIndex,
        id: product.id,
        document: this.buildProductDocument(
          product,
          await getFreeTierCanTrade(this.prisma),
        ),
      });
      await this.common.updateIndexStats();
    } catch (error) {
      this.logger.warn(`Elasticsearch indexing error for product ${productId}`);
    }
  }

  async removeProduct(productId: string): Promise<void> {
    try {
      await this.common.client.delete({
        index: this.common.productsIndex,
        id: productId,
      });
      await this.common.updateIndexStats();
    } catch (error) {
      this.logger.warn(`Elasticsearch delete error for product ${productId}`);
    }
  }

  /**
   * Bir ürünü güncel durumuna göre ES index'i ile senkronla:
   * listelenebilir kümede ise (aktif/tükenen/satıldı) indexle, aksi halde
   * (kaldırıldı/pasif-stoklu/draft/pending/reserved/rejected veya silinmiş)
   * index'ten kaldır. Durum değiştiren her mutasyondan sonra çağrılmalı —
   * aksi halde örn. kaldırılan ürün ES'te `status: active` ile kalıp aramada
   * görünmeye devam eder ama detay sayfası "İlan bulunamadı" döner.
   */
  async syncProduct(productId: string): Promise<void> {
    if (!this.common.isAvailable()) return;
    try {
      const indexable = await this.prisma.product.count({
        where: {
          AND: [{ id: productId }, this.common.indexableProductWhere()],
        },
      });
      if (indexable > 0) {
        await this.indexProduct(productId);
      } else {
        await this.removeProduct(productId);
      }
    } catch (error) {
      this.logger.warn(
        `syncProduct failed for ${productId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async forceRecreateIndex(): Promise<void> {
    this.logger.log("Force recreating Elasticsearch index");
    try {
      const exists = await this.common.client.indices.exists({
        index: this.common.productsIndex,
      });
      if (exists) {
        await this.common.client.indices.delete({
          index: this.common.productsIndex,
        });
        this.logger.log("Deleted old index");
      }
      await this.common.ensureIndexExists();
      this.logger.log("Index recreated with updated settings");
    } catch (error) {
      this.logger.error("Failed to recreate index");
      throw error;
    }
  }

  async reindexAll(): Promise<number> {
    await this.prisma.searchIndex.upsert({
      where: { indexName: this.common.productsIndex },
      update: { status: "rebuilding" },
      create: {
        indexName: this.common.productsIndex,
        status: "rebuilding",
        settings: {},
      },
    });

    try {
      const products = await this.prisma.product.findMany({
        where: this.common.indexableProductWhere(),
        include: this.productInclude,
      });

      await this.forceRecreateIndex();

      if (products.length > 0) {
        const freeTierCanTrade = await getFreeTierCanTrade(this.prisma);
        const operations = products.flatMap((product) => [
          { index: { _index: this.common.productsIndex, _id: product.id } },
          this.buildProductDocument(product, freeTierCanTrade),
        ]);

        await this.common.client.bulk({ refresh: true, operations });
      }

      await this.prisma.searchIndex.update({
        where: { indexName: this.common.productsIndex },
        data: {
          status: "active",
          documentCount: products.length,
          lastSyncedAt: new Date(),
        },
      });

      this.logger.log(`Reindexed ${products.length} products`);
      return products.length;
    } catch (error) {
      this.logger.error("Elasticsearch reindex error");
      await this.prisma.searchIndex.update({
        where: { indexName: this.common.productsIndex },
        data: { status: "error" },
      });
      throw new InternalServerErrorException("Reindex başarısız");
    }
  }

  // ──────────────────────────── Fallback Search ────────────────────────────

  /**
   * Postgres fallback when Elasticsearch is unavailable.
   * Uses the shared buildProductWhere helper for index-friendly filters.
   * Full-text search uses tsvector/tsquery with GIN index (replaces ILIKE contains).
   */
  private async fallbackSearch(
    options: SearchOptions,
  ): Promise<SearchResponse> {
    const { query, discountOnly, sortBy = "relevance" } = options;

    // Sayfalama parametrelerini güvenli tamsayıya indirge: geçersiz/NaN/≤0 girişlerde
    // `skip = (page-1)*pageSize` NaN olur ve Prisma "Argument skip is missing" ile çöker.
    // Varsayılan: page=1, pageSize=20.
    const page =
      Number.isFinite(options.page) && (options.page as number) >= 1
        ? Math.floor(options.page as number)
        : 1;
    const pageSize =
      Number.isFinite(options.pageSize) && (options.pageSize as number) >= 1
        ? Math.floor(options.pageSize as number)
        : 20;

    let fulltextIds: string[] | undefined;
    if (query) {
      fulltextIds = await fulltextProductSearch(this.prisma, query);
    }

    const where = buildProductWhere(
      {
        search: query,
        categoryId: options.categoryId,
        brandId: options.brandId,
        manufacturerId: options.manufacturerId,
        carModelId: options.carModelId,
        sellerId: options.sellerId,
        condition: options.condition,
        brand: options.brand,
        scale: options.scale,
        material: options.material,
        manufacturer: options.manufacturer,
        tradeOnly: options.tradeOnly,
        // ES yolu ile aynı kural: satıcının GÜNCEL takas yetkisi de aranır,
        // yoksa aynı sorgu hangi motorun servis ettiğine göre farklı sonuç verir.
        ...(options.tradeOnly
          ? {
              tradeCapableSeller: tradeCapableSellerWhere(
                await getFreeTierCanTrade(this.prisma),
              ),
            }
          : {}),
        preOrder: options.preOrder,
        limited: options.limited,
        set: options.set,
        minPrice: options.minPrice,
        maxPrice: options.maxPrice,
      },
      { fulltextIds },
    );

    if (discountOnly) {
      (where.AND as any[]).push({ oldPrice: { not: null } });
    }

    let orderBy: any;
    switch (sortBy) {
      case "price_asc":
        orderBy = { price: "asc" };
        break;
      case "price_desc":
        orderBy = { price: "desc" };
        break;
      case "newest":
      case "created_desc":
        orderBy = { createdAt: "desc" };
        break;
      case "created_asc":
        orderBy = { createdAt: "asc" };
        break;
      default:
        orderBy = { createdAt: "desc" };
    }

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: {
          category: { select: { name: true } },
          brand: { select: { name: true } },
          manufacturer: { select: { name: true } },
          seller: { select: { displayName: true } },
          images: { take: 1, select: { cardKey: true } },
        },
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      results: products.map((p) => {
        const priceA = parseFloat(p.price.toString());
        return {
          id: p.id,
          title: p.title,
          description: p.description || undefined,
          price: priceA,
          condition: p.condition,
          status: p.status,
          categoryId: p.categoryId,
          categoryName: p.category.name,
          brandId: p.brandId || undefined,
          brandName: (p as any).brand?.name || undefined,
          manufacturerId: p.manufacturerId || undefined,
          manufacturerName: (p as any).manufacturer?.name || undefined,
          sellerName: p.seller.displayName,
          imageUrl: p.images[0]?.cardKey
            ? this.storageService.getPublicAssetUrl(p.images[0].cardKey)
            : undefined,
          score: 0,
        };
      }),
      total,
      page,
      pageSize,
      took: 0,
    };
  }
}
