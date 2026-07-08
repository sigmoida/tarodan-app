import {
  Injectable,
  OnModuleInit,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { TrackedCron } from '../../monitoring/tracked-cron.decorator';
import { cronsViaBull, registerRepeatableCron } from '../../monitoring/bull-cron.helper';
import { QUEUE_NAMES } from '../../workers/constants';
import { PrismaService } from '../../prisma';
import { Client } from '@elastic/elasticsearch';
import { Prisma, ProductStatus } from '@prisma/client';
import { StorageService } from '../storage/storage.service';
import { buildProductWhere } from '../product/helpers/build-product-where';
import { fulltextProductSearch } from '../product/helpers/fulltext-search';
import {
  fulltextBrandSearch,
  fulltextCategorySearch,
  fulltextCarModelSearch,
  fulltextManufacturerSearch,
  fulltextAttributeSearch,
} from '../../common/helpers/fulltext-search';

export interface ProductSearchResult {
  id: string;
  title: string;
  description?: string;
  price: number;
  condition: string;
  status: string;
  categoryId?: string;
  categoryName: string;
  brandId?: string;
  brandName?: string;
  manufacturerId?: string;
  manufacturerName?: string;
  sellerName: string;
  imageUrl?: string;
  score: number;
  highlight?: { title?: string[]; description?: string[] };
}

export interface SearchOptions {
  query?: string;
  categoryId?: string;
  brandId?: string;
  manufacturerId?: string;
  carModelId?: string;
  minPrice?: number;
  maxPrice?: number;
  condition?: string;
  brand?: string;
  scale?: string;
  material?: string;
  manufacturer?: string;
  tradeOnly?: boolean;
  discountOnly?: boolean;
  preOrder?: boolean;
  limited?: boolean;
  set?: boolean;
  sellerId?: string;
  /**
   * Açık statü filtresi. Verilirse yalnızca o statü (örn. 'active' → stok-içi).
   * Verilmezse kapsayıcı küme: aktif + otomatik tükenen (inactive+qty0) + satıldı.
   */
  status?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
}

export interface SearchResponse {
  results: ProductSearchResult[];
  total: number;
  page: number;
  pageSize: number;
  took: number;
  aggregations?: Record<string, { buckets: Array<{ key: string; doc_count: number }> }>;
}

export interface RichAutocompleteResult {
  products: Array<{ id: string; title: string; imageUrl?: string; price: number; brandName?: string }>;
  brands: Array<{ id: string; name: string; slug: string; logo?: string | null }>;
  categories: Array<{ id: string; name: string; slug: string }>;
  manufacturers: Array<{ id: string; name: string; slug: string }>;
  suggestions: string[];
}

// Sanal/platform sözde-ürünleri (üyelik + öne-çıkarma) aramadan/indeksten hariç tut.
// Tek kaynak — drift olmasın diye tüm exclusion noktaları bunu kullanır.
const VIRTUAL_PRODUCT_ID_PREFIXES = ['membership-', 'boost-'] as const;

@Injectable()
export class SearchService implements OnModuleInit {
  private readonly logger = new Logger(SearchService.name);
  private client: Client;
  private readonly PRODUCTS_INDEX = 'products';
  private readonly COLLECTIONS_INDEX = 'collections';
  private esAvailable = false;
  private reindexingCollections = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    @InjectQueue(QUEUE_NAMES.SCHEDULED) private readonly scheduledQueue: Queue,
  ) {}

  async onModuleInit() {
    const node =
      this.configService.get('ELASTICSEARCH_URL') ||
      this.configService.get('ELASTICSEARCH_NODE', 'http://localhost:9200');

    this.client = new Client({
      node,
      auth: {
        username: this.configService.get('ELASTICSEARCH_USERNAME', 'elastic'),
        password: this.configService.get('ELASTICSEARCH_PASSWORD', 'changeme'),
      },
    });

    await this.ensureIndexExists();
    await this.ensureCollectionsIndexExists();

    setImmediate(() => {
      this.syncIndexIfEmpty();
      this.syncCollectionsIndexIfEmpty();
    });

    // Cron'u Bull repeatable'a senkronla (flag açıksa kaydet, kapalıysa temizle).
    await registerRepeatableCron(
      this.scheduledQueue,
      'search-periodic-sync',
      '0 */5 * * * *',
      cronsViaBull(),
      this.logger,
    );
  }

  /** ES bağlı ama index boş, DB'de ürün varsa reindex çalıştır (db:reset senaryosu) */
  private async syncIndexIfEmpty(): Promise<void> {
    if (!this.esAvailable) return;
    try {
      const [esRes, dbCount] = await Promise.all([
        this.client.count({ index: this.PRODUCTS_INDEX }).catch(() => ({ count: 0 })),
        this.prisma.product.count({ where: this.indexableProductWhere() }),
      ]);
      const esCount = esRes?.count ?? 0;
      if (esCount === 0 && dbCount > 0) {
        this.logger.log(`Elasticsearch index boş, DB'de ${dbCount} listelenebilir ürün var – reindex başlatılıyor...`);
        const indexed = await this.reindexAll();
        this.logger.log(`Elasticsearch reindex tamamlandı: ${indexed} ürün index'lendi.`);
      }
    } catch (err) {
      this.logger.warn('syncIndexIfEmpty failed', err instanceof Error ? err.message : String(err));
    }
  }

  isAvailable(): boolean {
    return this.esAvailable;
  }

  /** Prisma: sanal sözde-ürünleri (membership-/boost-) hariç tutan NOT koşulu. */
  private virtualProductPrismaNot(): Prisma.ProductWhereInput[] {
    return VIRTUAL_PRODUCT_ID_PREFIXES.map((p) => ({ id: { startsWith: p } }));
  }

  /** ElasticSearch: sanal sözde-ürünleri hariç tutan must_not prefix koşulları. */
  private virtualProductEsMustNot(): Array<{ prefix: { id: string } }> {
    return VIRTUAL_PRODUCT_ID_PREFIXES.map((p) => ({ prefix: { id: p } }));
  }

  /**
   * ES'e indekslenecek ürün kümesi: listelerde görünebilenler.
   * = aktif (stoklu) + otomatik tükenen (inactive + quantity=0) + satıldı.
   * Hariç: elle pasife alınan (inactive + quantity>0), draft/pending/reserved/rejected
   * ve sanal (membership-/boost-) ürünler. Bu küme build-product-where.ts'teki kapsayıcı
   * listeleme filtresiyle hizalıdır.
   */
  private indexableProductWhere(): Prisma.ProductWhereInput {
    return {
      OR: [
        { status: ProductStatus.active },
        { AND: [{ status: ProductStatus.inactive }, { quantity: 0 }] },
        { status: ProductStatus.sold },
      ],
      NOT: this.virtualProductPrismaNot(),
    };
  }

  private async ensureIndexExists(): Promise<void> {
    try {
      const indexExists = await this.client.indices.exists({
        index: this.PRODUCTS_INDEX,
      });

      if (!indexExists) {
        await this.client.indices.create({
          index: this.PRODUCTS_INDEX,
          settings: {
            number_of_shards: 1,
            number_of_replicas: 0,
            max_ngram_diff: 13,
            analysis: {
              analyzer: {
                turkish: {
                  type: 'custom',
                  tokenizer: 'standard',
                  filter: ['lowercase', 'turkish_stop', 'turkish_stemmer'],
                },
                turkish_edge_ngram: {
                  type: 'custom',
                  tokenizer: 'edge_ngram_tokenizer',
                  filter: ['lowercase', 'asciifolding'],
                },
                turkish_ngram: {
                  type: 'custom',
                  tokenizer: 'ngram_tokenizer',
                  filter: ['lowercase', 'asciifolding'],
                },
                turkish_search: {
                  type: 'custom',
                  tokenizer: 'standard',
                  filter: ['lowercase', 'asciifolding'],
                },
              },
              tokenizer: {
                edge_ngram_tokenizer: {
                  type: 'edge_ngram',
                  min_gram: 2,
                  max_gram: 15,
                  token_chars: ['letter', 'digit'],
                },
                ngram_tokenizer: {
                  type: 'ngram',
                  min_gram: 2,
                  max_gram: 4,
                  token_chars: ['letter', 'digit'],
                },
              },
              filter: {
                turkish_stop: { type: 'stop', stopwords: '_turkish_' },
                turkish_stemmer: { type: 'stemmer', language: 'turkish' },
                asciifolding: { type: 'asciifolding', preserve_original: true },
              },
            },
          },
          mappings: {
            properties: {
              id: { type: 'keyword' },
              title: {
                type: 'text',
                analyzer: 'turkish',
                search_analyzer: 'turkish_search',
                fields: {
                  keyword: { type: 'keyword' },
                  edge_ngram: {
                    type: 'text',
                    analyzer: 'turkish_edge_ngram',
                    search_analyzer: 'turkish_search',
                  },
                  ngram: {
                    type: 'text',
                    analyzer: 'turkish_ngram',
                    search_analyzer: 'turkish_search',
                  },
                },
              },
              description: {
                type: 'text',
                analyzer: 'turkish',
                fields: {
                  edge_ngram: {
                    type: 'text',
                    analyzer: 'turkish_edge_ngram',
                    search_analyzer: 'turkish_search',
                  },
                },
              },
              price: { type: 'float' },
              oldPrice: { type: 'float' },
              condition: { type: 'keyword' },
              status: { type: 'keyword' },
              categoryId: { type: 'keyword' },
              categoryName: {
                type: 'text',
                analyzer: 'turkish',
                fields: {
                  keyword: { type: 'keyword' },
                  edge_ngram: {
                    type: 'text',
                    analyzer: 'turkish_edge_ngram',
                    search_analyzer: 'turkish_search',
                  },
                },
              },
              brandId: { type: 'keyword' },
              brandName: {
                type: 'text',
                analyzer: 'turkish',
                fields: {
                  keyword: { type: 'keyword' },
                  edge_ngram: {
                    type: 'text',
                    analyzer: 'turkish_edge_ngram',
                    search_analyzer: 'turkish_search',
                  },
                },
              },
              manufacturerId: { type: 'keyword' },
              manufacturerName: {
                type: 'text',
                analyzer: 'turkish',
                fields: {
                  keyword: { type: 'keyword' },
                  edge_ngram: {
                    type: 'text',
                    analyzer: 'turkish_edge_ngram',
                    search_analyzer: 'turkish_search',
                  },
                },
              },
              carModelId: { type: 'keyword' },
              carModelName: {
                type: 'text',
                analyzer: 'turkish',
                search_analyzer: 'turkish_search',
                fields: {
                  keyword: { type: 'keyword' },
                  edge_ngram: {
                    type: 'text',
                    analyzer: 'turkish_edge_ngram',
                    search_analyzer: 'turkish_search',
                  },
                  ngram: {
                    type: 'text',
                    analyzer: 'turkish_ngram',
                    search_analyzer: 'turkish_search',
                  },
                },
              },
              sellerId: { type: 'keyword' },
              sellerName: { type: 'keyword' },
              imageUrl: { type: 'keyword' },
              scale: { type: 'keyword' },
              material: { type: 'keyword' },
              vehicleType: { type: 'keyword' },
              isTradeEnabled: { type: 'boolean' },
              isPreorder: { type: 'boolean' },
              isLimited: { type: 'boolean' },
              isSet: { type: 'boolean' },
              inStock: { type: 'boolean' },
              quantity: { type: 'integer' },
              viewCount: { type: 'integer' },
              ratingAverage: { type: 'float' },
              ratingCount: { type: 'integer' },
              rankTier: { type: 'integer' },
              qualityScore: { type: 'integer' },
              popularityScore: { type: 'integer' },
              relevanceScore: { type: 'integer' },
              createdAt: { type: 'date' },
              updatedAt: { type: 'date' },
            },
          },
        });
        this.logger.log('Created Elasticsearch index with extended mappings');
      }

      this.esAvailable = true;

      await this.prisma.searchIndex.upsert({
        where: { indexName: this.PRODUCTS_INDEX },
        update: { status: 'active' },
        create: {
          indexName: this.PRODUCTS_INDEX,
          status: 'active',
          settings: {},
        },
      });
    } catch (error) {
      this.esAvailable = false;
      this.logger.warn(
        `Elasticsearch index creation failed – app will use PostgreSQL fallback. Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // ──────────────────────────── Search ────────────────────────────

  async searchProducts(options: SearchOptions): Promise<SearchResponse> {
    if (!this.esAvailable) {
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
      sortBy = 'relevance',
    } = options;

    // Sayfalama parametrelerini güvenli tamsayıya indirge: geçersiz/NaN/≤0 girişlerde
    // (örn. ?page=abc → parseInt→NaN) `from = (page-1)*pageSize` NaN olur ve ES/Prisma
    // çöker. Varsayılan: page=1, pageSize=20.
    const page = Number.isFinite(options.page) && (options.page as number) >= 1 ? Math.floor(options.page as number) : 1;
    const pageSize = Number.isFinite(options.pageSize) && (options.pageSize as number) >= 1 ? Math.floor(options.pageSize as number) : 20;

    const must: any[] = [];
    const filter: any[] = [];

    // Text search
    if (query) {
      must.push({
        bool: {
          should: [
            { match: { title: { query, boost: 5 } } },
            { match: { 'title.edge_ngram': { query, boost: 3 } } },
            { match: { 'title.ngram': { query, boost: 2 } } },
            { match: { description: { query, boost: 1 } } },
            { match: { 'description.edge_ngram': { query, boost: 0.5 } } },
            { match: { categoryName: { query, boost: 2 } } },
            { match: { 'categoryName.edge_ngram': { query, boost: 1 } } },
            { match: { brandName: { query, boost: 2 } } },
            { match: { 'brandName.edge_ngram': { query, boost: 1 } } },
            { match: { manufacturerName: { query, boost: 2 } } },
            { match: { 'manufacturerName.edge_ngram': { query, boost: 1 } } },
            { match: { carModelName: { query, boost: 2 } } },
            { match: { 'carModelName.edge_ngram': { query, boost: 1 } } },
            { match: { 'carModelName.ngram': { query, boost: 2 } } },
            {
              multi_match: {
                query,
                fields: ['title^3', 'description', 'categoryName^2', 'brandName^2', 'manufacturerName^2', 'carModelName^2'],
                fuzziness: 2,
                prefix_length: 1,
                boost: 1.5,
              },
            },
            {
              fuzzy: {
                title: { value: query.toLowerCase(), fuzziness: 'AUTO', prefix_length: 1, boost: 1 },
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
    filter.push({ bool: { must_not: this.virtualProductEsMustNot() } });

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
      const scaleSlugHyphen = scaleTrim.replace(':', '-');
      const scaleSlugNorm = scaleTrim.replace(/\s/g, '').replace(/[:\/]/g, '');
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
    if (tradeOnly) filter.push({ term: { isTradeEnabled: true } });
    if (preOrder) filter.push({ term: { isPreorder: true } });
    if (limited) filter.push({ term: { isLimited: true } });
    if (setFilter) filter.push({ term: { isSet: true } });
    if (discountOnly) filter.push({ exists: { field: 'oldPrice' } });

    // Text-based fallback filters (when ID is not available)
    if (brand && !brandId) {
      filter.push({ term: { 'brandName.keyword': brand } });
    }
    if (manufacturer && !manufacturerId) {
      filter.push({ term: { 'manufacturerName.keyword': manufacturer } });
    }

    // Sorting
    let sort: any[] = [];
    switch (sortBy) {
      case 'price_asc': sort = [{ price: 'asc' }]; break;
      case 'price_desc': sort = [{ price: 'desc' }]; break;
      case 'newest':
      case 'created_desc': sort = [{ createdAt: 'desc' }]; break;
      case 'created_asc': sort = [{ createdAt: 'asc' }]; break;
      case 'view_count_desc': sort = [{ viewCount: 'desc' }]; break;
      case 'view_count_asc': sort = [{ viewCount: 'asc' }]; break;
      case 'title_asc': sort = [{ 'title.keyword': 'asc' }]; break;
      case 'title_desc': sort = [{ 'title.keyword': 'desc' }]; break;
      case 'rating_desc': sort = [{ ratingAverage: 'desc' }, { ratingCount: 'desc' }]; break;
      default:
        // Alaka sıralaması: metin aramasında _score birincil kalır (relevance korunur),
        // boost/kalite eşitlik bozucu olur; gezinmede (query yok) sponsorlu kademe öne geçer.
        sort = query
          ? [{ _score: 'desc' }, { relevanceScore: 'desc' }, { viewCount: 'desc' }]
          : [{ relevanceScore: 'desc' }, { viewCount: 'desc' }, { createdAt: 'desc' }];
    }

    // Stoktakiler her zaman önce: stoğu biten (tükenen/satıldı/aktif-ama-stoksuz)
    // ürünler hangi sıralama seçilirse seçilsin en alta iner. Tek-statülü
    // sorgularda (örn. status=active) zaten çoğunlukla no-op'tur. Eski indeks
    // dokümanlarında alan bulunmayabilir → missing '_first' ile stok-içi sayılır.
    sort = [{ inStock: { order: 'desc', missing: '_first' } }, ...sort];

    try {
      const searchBody: any = {
        query: {
          bool: {
            must: must.length > 0 ? must : [{ match_all: {} }],
            filter,
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
          pre_tags: ['<em>'],
          post_tags: ['</em>'],
        };
      }
      searchBody.aggs = {
        categories: { terms: { field: 'categoryId', size: 50 } },
        brands: { terms: { field: 'brandId', size: 50 } },
        conditions: { terms: { field: 'condition', size: 10 } },
        price_range: { stats: { field: 'price' } },
      };

      const response = await this.client.search({
        index: this.PRODUCTS_INDEX,
        ...searchBody,
      });

      const hits = response.hits.hits;
      const total =
        typeof response.hits.total === 'number'
          ? response.hits.total
          : (response.hits.total as any)?.value || 0;
      const aggs = (response as any).aggregations;

      if (hits.length === 0 && query) {
        this.logger.debug('ES returned 0 results, falling back to database');
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
            ? { title: hit.highlight.title, description: hit.highlight.description }
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
      this.logger.debug('Elasticsearch search error, falling back to database');
      return this.fallbackSearch(options);
    }
  }

  /**
   * Search and return only product IDs (used by product.service for full-data hydration)
   */
  async searchProductIds(options: SearchOptions): Promise<{ ids: string[]; total: number }> {
    if (!this.esAvailable) {
      return { ids: [], total: 0 };
    }

    const result = await this.searchProducts(options);
    return {
      ids: result.results.map((r) => r.id),
      total: result.total,
    };
  }

  // ──────────────────────────── Indexing ────────────────────────────

  private buildProductDocument(product: any): Record<string, any> {
    const scaleAttr = product.productAttributes?.find(
      (pa: any) => pa.attribute?.group?.slug === 'scale',
    );
    const materialAttr = product.productAttributes?.find(
      (pa: any) => pa.attribute?.group?.slug === 'material',
    );
    const vehicleTypeAttr = product.productAttributes?.find(
      (pa: any) => pa.attribute?.group?.slug === 'vehicle_type',
    );

    return {
      id: product.id,
      title: product.title,
      description: product.description,
      price: parseFloat(product.price.toString()),
      oldPrice: product.oldPrice != null ? parseFloat(product.oldPrice.toString()) : undefined,
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
      imageUrl: product.images?.[0]?.cardKey ? this.storageService.getPublicAssetUrl(product.images[0].cardKey) : undefined,
      scale: scaleAttr?.attribute?.value || scaleAttr?.attribute?.slug || undefined,
      viewCount: product.viewCount || 0,
      ratingAverage: product.averageRating != null ? parseFloat(product.averageRating.toString()) : 0,
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
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }

  private readonly productInclude = {
    category: { select: { id: true, name: true } },
    brand: { select: { id: true, name: true } },
    manufacturer: { select: { id: true, name: true } },
    carModel: { select: { id: true, name: true } },
    seller: { select: { id: true, displayName: true } },
    images: { take: 1, orderBy: { sortOrder: 'asc' as const }, select: { cardKey: true } },
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
      await this.client.index({
        index: this.PRODUCTS_INDEX,
        id: product.id,
        document: this.buildProductDocument(product),
      });
      await this.updateIndexStats();
    } catch (error) {
      this.logger.warn(`Elasticsearch indexing error for product ${productId}`);
    }
  }

  async removeProduct(productId: string): Promise<void> {
    try {
      await this.client.delete({
        index: this.PRODUCTS_INDEX,
        id: productId,
      });
      await this.updateIndexStats();
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
    if (!this.esAvailable) return;
    try {
      const indexable = await this.prisma.product.count({
        where: { AND: [{ id: productId }, this.indexableProductWhere()] },
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
    this.logger.log('Force recreating Elasticsearch index');
    try {
      const exists = await this.client.indices.exists({ index: this.PRODUCTS_INDEX });
      if (exists) {
        await this.client.indices.delete({ index: this.PRODUCTS_INDEX });
        this.logger.log('Deleted old index');
      }
      await this.ensureIndexExists();
      this.logger.log('Index recreated with updated settings');
    } catch (error) {
      this.logger.error('Failed to recreate index');
      throw error;
    }
  }

  async reindexAll(): Promise<number> {
    await this.prisma.searchIndex.upsert({
      where: { indexName: this.PRODUCTS_INDEX },
      update: { status: 'rebuilding' },
      create: { indexName: this.PRODUCTS_INDEX, status: 'rebuilding', settings: {} },
    });

    try {
      const products = await this.prisma.product.findMany({
        where: this.indexableProductWhere(),
        include: this.productInclude,
      });

      await this.forceRecreateIndex();

      if (products.length > 0) {
        const operations = products.flatMap((product) => [
          { index: { _index: this.PRODUCTS_INDEX, _id: product.id } },
          this.buildProductDocument(product),
        ]);

        await this.client.bulk({ refresh: true, operations });
      }

      await this.prisma.searchIndex.update({
        where: { indexName: this.PRODUCTS_INDEX },
        data: {
          status: 'active',
          documentCount: products.length,
          lastSyncedAt: new Date(),
        },
      });

      this.logger.log(`Reindexed ${products.length} products`);
      return products.length;
    } catch (error) {
      this.logger.error('Elasticsearch reindex error');
      await this.prisma.searchIndex.update({
        where: { indexName: this.PRODUCTS_INDEX },
        data: { status: 'error' },
      });
      throw new InternalServerErrorException('Reindex başarısız');
    }
  }

  // ──────────────────────────── Autocomplete ────────────────────────────

  async autocomplete(query: string, limit = 10): Promise<string[]> {
    if (!this.esAvailable) return this.fallbackAutocomplete(query, limit);

    try {
      const response = await this.client.search({
        index: this.PRODUCTS_INDEX,
        query: {
          bool: {
            should: [
              { match: { 'title.edge_ngram': { query, boost: 4 } } },
              { match: { 'title.ngram': { query, boost: 2 } } },
              {
                multi_match: {
                  query,
                  type: 'phrase_prefix',
                  fields: ['title^2', 'categoryName', 'manufacturerName', 'brandName'],
                  boost: 3,
                },
              },
              { fuzzy: { title: { value: query.toLowerCase(), fuzziness: 'AUTO', prefix_length: 1, boost: 1.5 } } },
              {
                multi_match: {
                  query,
                  fields: ['title^2', 'categoryName', 'manufacturerName'],
                  fuzziness: 2,
                  prefix_length: 1,
                  boost: 1,
                },
              },
            ],
            minimum_should_match: 1,
            filter: [
              { term: { status: ProductStatus.active } },
              { bool: { must_not: this.virtualProductEsMustNot() } },
            ],
          },
        },
        _source: ['title'],
        size: limit * 2,
        collapse: { field: 'title.keyword' },
      });

      return response.hits.hits
        .map((hit: any) => hit._source.title)
        .slice(0, limit);
    } catch (error) {
      this.logger.warn('Elasticsearch autocomplete error, using fallback');
      return this.fallbackAutocomplete(query, limit);
    }
  }

  private async fallbackAutocomplete(query: string, limit: number): Promise<string[]> {
    const productIds = await fulltextProductSearch(this.prisma, query, limit);
    if (productIds.length === 0) return [];

    const products = await this.prisma.product.findMany({
      where: {
        id: { in: productIds },
        status: ProductStatus.active,
        NOT: this.virtualProductPrismaNot(),
      },
      select: { title: true },
      take: limit,
      distinct: ['title'],
    });
    return products.map((p) => p.title);
  }

  // ──────────────────────────── Rich Autocomplete ────────────────────────────

  async autocompleteRich(query: string): Promise<{
    products: Array<{ id: string; title: string; imageUrl?: string; price: number; brandName?: string }>;
    brands: Array<{ id: string; name: string; slug: string; logo?: string | null }>;
    categories: Array<{ id: string; name: string; slug: string }>;
    manufacturers: Array<{ id: string; name: string; slug: string; logo?: string | null }>;
    carModels: Array<{ id: string; name: string; slug: string; brandId: string }>;
    scales: string[];
    materials: Array<{ slug: string; label: string }>;
    conditions: Array<{ value: string; label: string }>;
    suggestions: string[];
  }> {
    const trimmed = query.trim();
    if (!trimmed) {
      return { products: [], brands: [], categories: [], manufacturers: [], carModels: [], scales: [], materials: [], conditions: [], suggestions: [] };
    }

    // Same pattern as brands/categories/manufacturers: direct search per entity type
    const [products, brands, categories, manufacturers, carModels, scales, materials, conditions, suggestions] = await Promise.all([
      this.richAutocompleteProducts(trimmed, 5),
      this.richAutocompleteBrands(trimmed, 3),
      this.richAutocompleteCategories(trimmed, 3),
      this.richAutocompleteManufacturers(trimmed, 3),
      this.richAutocompleteCarModels(trimmed, 5),
      this.richAutocompleteScales(trimmed, 5),
      this.richAutocompleteMaterials(trimmed, 5),
      this.richAutocompleteConditions(trimmed, 5),
      this.autocomplete(trimmed, 5),
    ]);

    return { products, brands, categories, manufacturers, carModels, scales, materials, conditions, suggestions };
  }

  private async richAutocompleteProducts(
    query: string,
    limit: number,
  ): Promise<Array<{ id: string; title: string; imageUrl?: string; price: number; brandName?: string }>> {
    if (this.esAvailable) {
      try {
        const response = await this.client.search({
          index: this.PRODUCTS_INDEX,
          query: {
            bool: {
              should: [
                { match: { 'title.edge_ngram': { query, boost: 4 } } },
                { match: { 'title.ngram': { query, boost: 2 } } },
                { match: { carModelName: { query, boost: 2 } } },
                { match: { 'carModelName.edge_ngram': { query, boost: 1 } } },
                { match: { 'carModelName.ngram': { query, boost: 2 } } },
                { match_phrase_prefix: { carModelName: { query, boost: 2, max_expansions: 20 } } },
                {
                  multi_match: {
                    query,
                    type: 'phrase_prefix',
                    fields: ['title^2', 'categoryName', 'manufacturerName', 'brandName', 'carModelName^2'],
                    boost: 3,
                  },
                },
                { fuzzy: { title: { value: query.toLowerCase(), fuzziness: 'AUTO', prefix_length: 1, boost: 1.5 } } },
              ],
              minimum_should_match: 1,
              filter: [
                { term: { status: ProductStatus.active } },
                { bool: { must_not: this.virtualProductEsMustNot() } },
              ],
            },
          },
          _source: ['id', 'title', 'imageUrl', 'price', 'brandName'],
          size: limit,
        });

        return response.hits.hits.map((hit: any) => ({
          id: hit._source.id,
          title: hit._source.title,
          imageUrl: hit._source.imageUrl,
          price: hit._source.price,
          brandName: hit._source.brandName,
        }));
      } catch (err) {
        this.logger.warn(
          `Autocomplete products ES failed, using Prisma fallback: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Prisma fallback – tsvector search for product IDs, then hydrate (only title+description)
    const productIds = await fulltextProductSearch(this.prisma, query, limit);
    const products = productIds.length > 0
      ? await this.prisma.product.findMany({
          where: {
            id: { in: productIds },
            status: ProductStatus.active,
            NOT: this.virtualProductPrismaNot(),
          },
          select: {
            id: true,
            title: true,
            price: true,
            images: { take: 1, orderBy: { sortOrder: 'asc' as const }, select: { cardKey: true } },
            brand: { select: { name: true } },
          },
          take: limit,
        })
      : [];

    return products.map((p) => ({
      id: p.id,
      title: p.title,
      imageUrl: p.images[0]?.cardKey ? this.storageService.getPublicAssetUrl(p.images[0].cardKey) : undefined,
      price: parseFloat(p.price.toString()),
      brandName: (p as any).brand?.name,
    }));
  }

  // Known car brands for autocomplete (matched against product titles / brand relation)
  private static readonly KNOWN_CAR_BRANDS = [
    'Audi', 'Alfa Romeo', 'BMW', 'Chevrolet', 'Dodge', 'Ferrari', 'Ford',
    'Honda', 'Jaguar', 'Lamborghini', 'Land Rover', 'Maserati', 'McLaren',
    'Mercedes-Benz', 'Nissan', 'Porsche', 'Subaru', 'Tesla', 'Toyota', 'Volkswagen',
    'Aston Martin', 'Bentley', 'Bugatti', 'Cadillac', 'Citroën', 'Fiat',
    'Hyundai', 'Jeep', 'Kia', 'Lexus', 'Mazda', 'Mini', 'Mitsubishi',
    'Opel', 'Peugeot', 'Renault', 'Rolls-Royce', 'Seat', 'Škoda', 'Volvo',
  ];

  private async richAutocompleteBrands(
    query: string,
    limit: number,
  ): Promise<Array<{ id: string; name: string; slug: string; logo?: string | null }>> {
    const brandIds = await fulltextBrandSearch(this.prisma, query, limit);

    if (brandIds.length > 0) {
      return this.prisma.brand.findMany({
        where: { id: { in: brandIds }, isActive: true },
        select: { id: true, name: true, slug: true, logo: true },
        take: limit,
        orderBy: { name: 'asc' },
      });
    }

    // Fallback: match against known car brands (static list)
    const lowerQ = query.toLowerCase();
    const matched = SearchService.KNOWN_CAR_BRANDS
      .filter(b => b.toLowerCase().includes(lowerQ))
      .slice(0, limit)
      .map(name => ({
        id: `brand-${name.toLowerCase().replace(/\s+/g, '-')}`,
        name,
        slug: name.toLowerCase().replace(/\s+/g, '-'),
        logo: null,
      }));
    return matched;
  }

  private async richAutocompleteCategories(
    query: string,
    limit: number,
  ): Promise<Array<{ id: string; name: string; slug: string }>> {
    const categoryIds = await fulltextCategorySearch(this.prisma, query, limit);
    if (categoryIds.length === 0) return [];

    return this.prisma.category.findMany({
      where: { id: { in: categoryIds }, isActive: true },
      select: { id: true, name: true, slug: true },
      take: limit,
      orderBy: { name: 'asc' },
    });
  }

  private async richAutocompleteManufacturers(
    query: string,
    limit: number,
  ): Promise<Array<{ id: string; name: string; slug: string; logo?: string | null }>> {
    const manufacturerIds = await fulltextManufacturerSearch(this.prisma, query, limit);
    if (manufacturerIds.length === 0) return [];

    return this.prisma.manufacturer.findMany({
      where: { id: { in: manufacturerIds } },
      select: { id: true, name: true, slug: true, logo: true },
      take: limit,
      orderBy: { name: 'asc' },
    });
  }

  private async richAutocompleteCarModels(
    query: string,
    limit: number,
  ): Promise<Array<{ id: string; name: string; slug: string; brandId: string }>> {
    const ids = await fulltextCarModelSearch(this.prisma, query, limit);
    if (ids.length === 0) return [];

    return this.prisma.carModel.findMany({
      where: { id: { in: ids }, isActive: true },
      select: { id: true, name: true, slug: true, brandId: true },
      take: limit,
      orderBy: { name: 'asc' },
    });
  }

  private async richAutocompleteScales(query: string, limit: number): Promise<string[]> {
    const ids = await fulltextAttributeSearch(this.prisma, query, 50);
    if (ids.length === 0) return [];

    const attrs = await this.prisma.attribute.findMany({
      where: { id: { in: ids }, isActive: true, group: { slug: 'scale', isActive: true } },
      select: { value: true, displayValue: true },
    });
    const scaleSet = new Set<string>();
    for (const a of attrs) {
      scaleSet.add(a.displayValue || a.value);
    }
    return Array.from(scaleSet).sort().slice(0, limit);
  }

  private async richAutocompleteMaterials(
    query: string,
    limit: number,
  ): Promise<Array<{ slug: string; label: string }>> {
    const ids = await fulltextAttributeSearch(this.prisma, query, 50);
    if (ids.length === 0) return [];

    const attrs = await this.prisma.attribute.findMany({
      where: { id: { in: ids }, isActive: true, group: { slug: 'material', isActive: true } },
      select: { slug: true, value: true, displayValue: true },
    });
    const map = new Map<string, string>();
    for (const a of attrs) {
      map.set(a.slug, a.displayValue || a.value);
    }
    return Array.from(map.entries()).map(([slug, label]) => ({ slug, label })).slice(0, limit);
  }

  private async richAutocompleteConditions(
    query: string,
    limit: number,
  ): Promise<Array<{ value: string; label: string }>> {
    const conditionLabels: Record<string, string> = {
      new: 'Yeni',
      very_good: 'Mükemmel',
      good: 'İyi',
      fair: 'Orta',
    };
    const list = Object.entries(conditionLabels).map(([value, label]) => ({ value, label }));
    const q = query.toLowerCase();
    return list.filter((c) => c.value.toLowerCase().includes(q) || c.label.toLowerCase().includes(q)).slice(0, limit);
  }

  // ──────────────────────────── Fallback Search ────────────────────────────

  /**
   * Postgres fallback when Elasticsearch is unavailable.
   * Uses the shared buildProductWhere helper for index-friendly filters.
   * Full-text search uses tsvector/tsquery with GIN index (replaces ILIKE contains).
   */
  private async fallbackSearch(options: SearchOptions): Promise<SearchResponse> {
    const {
      query, discountOnly,
      sortBy = 'relevance',
    } = options;

    // Sayfalama parametrelerini güvenli tamsayıya indirge: geçersiz/NaN/≤0 girişlerde
    // `skip = (page-1)*pageSize` NaN olur ve Prisma "Argument skip is missing" ile çöker.
    // Varsayılan: page=1, pageSize=20.
    const page = Number.isFinite(options.page) && (options.page as number) >= 1 ? Math.floor(options.page as number) : 1;
    const pageSize = Number.isFinite(options.pageSize) && (options.pageSize as number) >= 1 ? Math.floor(options.pageSize as number) : 20;

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
      case 'price_asc': orderBy = { price: 'asc' }; break;
      case 'price_desc': orderBy = { price: 'desc' }; break;
      case 'newest':
      case 'created_desc': orderBy = { createdAt: 'desc' }; break;
      case 'created_asc': orderBy = { createdAt: 'asc' }; break;
      default: orderBy = { createdAt: 'desc' };
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
          imageUrl: p.images[0]?.cardKey ? this.storageService.getPublicAssetUrl(p.images[0].cardKey) : undefined,
          score: 0,
        };
      }),
      total,
      page,
      pageSize,
      took: 0,
    };
  }

  // ──────────────────────────── Periodic Sync ────────────────────────────

  @TrackedCron(CronExpression.EVERY_5_MINUTES)
  async handlePeriodicSync() {
    if (cronsViaBull()) {
      return;
    }
    return this.runHandlePeriodicSync();
  }

  /** Gerçek iş — in-process cron ve Bull processor buradan çağırır. */
  async runHandlePeriodicSync(log: (msg: string) => void = () => {}) {
    if (!this.esAvailable) {
      log('Elasticsearch erişilemez, atlandı');
      return { summary: 'ES erişilemez, atlandı', stats: { skipped: 1 } };
    }

    try {
      const dbCount = await this.prisma.product.count({
        where: this.indexableProductWhere(),
      });

      const esResponse = await this.client.count({ index: this.PRODUCTS_INDEX });
      const esCount = esResponse.count;
      const drift = Math.abs(dbCount - esCount);
      log(`DB=${dbCount}, ES=${esCount}, fark=${drift}`);

      if (drift > 2) {
        this.logger.warn(
          `ES/DB count mismatch: DB=${dbCount}, ES=${esCount}. Running delta sync...`,
        );
        log('Fark > 2 → delta sync çalıştırılıyor');
        await this.deltaSync();
        return {
          summary: `Senkron yapıldı (DB=${dbCount}, ES=${esCount})`,
          stats: { dbCount, esCount, drift, synced: 1 },
        };
      }
      return {
        summary: `Senkron OK (DB=${dbCount}, ES=${esCount})`,
        stats: { dbCount, esCount, drift, synced: 0 },
      };
    } catch (error: any) {
      this.logger.warn('Periodic sync check failed');
      log(`HATA: ${error?.message ?? error}`);
      return { summary: `Hata: ${error?.message ?? error}`, stats: { errors: 1 } };
    }
  }

  /**
   * Sayı bazlı 5-dk kontrol yalnızca |DB-ES| > 2 olunca deltaSync çağırıyor; ama
   * eşit sayıda eksik + yetim doküman olduğunda sayılar tutar (delta=0) ve ID
   * bazlı drift hiç yakalanmaz. Bu yüzden sayıdan bağımsız, saatlik tam reconcile
   * çalıştırıp yetim/eksik dokümanları her durumda eşitliyoruz.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleHourlyReconcile() {
    if (!this.esAvailable) return;
    await this.deltaSync();
  }

  private async deltaSync(): Promise<void> {
    try {
      const indexableProducts = await this.prisma.product.findMany({
        where: this.indexableProductWhere(),
        select: { id: true, updatedAt: true },
      });

      const dbIds = new Set(indexableProducts.map((p) => p.id));

      // Get all ES document IDs
      const esIds = new Set<string>();
      let searchAfter: any[] | undefined;
      while (true) {
        const params: any = {
          index: this.PRODUCTS_INDEX,
          size: 1000,
          _source: false,
          sort: [{ _doc: 'asc' }],
        };
        if (searchAfter) params.search_after = searchAfter;
        const resp = await this.client.search(params);
        const hits = resp.hits.hits;
        if (hits.length === 0) break;
        hits.forEach((h: any) => esIds.add(h._id));
        searchAfter = hits[hits.length - 1].sort;
      }

      // Index missing products
      const missingIds = [...dbIds].filter((id) => !esIds.has(id));
      for (const id of missingIds) {
        await this.indexProduct(id);
      }

      // Remove stale documents
      const staleIds = [...esIds].filter((id) => !dbIds.has(id));
      for (const id of staleIds) {
        await this.removeProduct(id);
      }

      if (missingIds.length > 0 || staleIds.length > 0) {
        this.logger.log(
          `Delta sync: indexed ${missingIds.length}, removed ${staleIds.length}`,
        );
      }
    } catch (error) {
      this.logger.error('Delta sync failed');
    }
  }

  // ──────────────────────────── Collections Index ────────────────────────────

  private async ensureCollectionsIndexExists(): Promise<void> {
    if (!this.esAvailable) return;
    try {
      const exists = await this.client.indices.exists({ index: this.COLLECTIONS_INDEX });
      if (!exists) {
        await this.client.indices.create({
          index: this.COLLECTIONS_INDEX,
          settings: {
            number_of_shards: 1,
            number_of_replicas: 0,
            max_ngram_diff: 13,
            analysis: {
              analyzer: {
                turkish: {
                  type: 'custom',
                  tokenizer: 'standard',
                  filter: ['lowercase', 'turkish_stop', 'turkish_stemmer'],
                },
                turkish_edge_ngram: {
                  type: 'custom',
                  tokenizer: 'edge_ngram_tokenizer',
                  filter: ['lowercase', 'asciifolding'],
                },
                turkish_search: {
                  type: 'custom',
                  tokenizer: 'standard',
                  filter: ['lowercase', 'asciifolding'],
                },
              },
              tokenizer: {
                edge_ngram_tokenizer: {
                  type: 'edge_ngram',
                  min_gram: 2,
                  max_gram: 15,
                  token_chars: ['letter', 'digit'],
                },
              },
              filter: {
                turkish_stop: { type: 'stop', stopwords: '_turkish_' },
                turkish_stemmer: { type: 'stemmer', language: 'turkish' },
                asciifolding: { type: 'asciifolding', preserve_original: true },
              },
            },
          },
          mappings: {
            properties: {
              id: { type: 'keyword' },
              name: {
                type: 'text',
                analyzer: 'turkish',
                search_analyzer: 'turkish_search',
                fields: {
                  keyword: { type: 'keyword' },
                  edge_ngram: {
                    type: 'text',
                    analyzer: 'turkish_edge_ngram',
                    search_analyzer: 'turkish_search',
                  },
                },
              },
              slug: { type: 'keyword' },
              description: {
                type: 'text',
                analyzer: 'turkish',
                search_analyzer: 'turkish_search',
                fields: {
                  edge_ngram: {
                    type: 'text',
                    analyzer: 'turkish_edge_ngram',
                    search_analyzer: 'turkish_search',
                  },
                },
              },
              userId: { type: 'keyword' },
              userName: {
                type: 'text',
                analyzer: 'turkish',
                search_analyzer: 'turkish_search',
                fields: {
                  keyword: { type: 'keyword' },
                  edge_ngram: {
                    type: 'text',
                    analyzer: 'turkish_edge_ngram',
                    search_analyzer: 'turkish_search',
                  },
                },
              },
              categoryId: { type: 'keyword' },
              categoryName: {
                type: 'text',
                analyzer: 'turkish',
                search_analyzer: 'turkish_search',
                fields: { keyword: { type: 'keyword' } },
              },
              isPublic: { type: 'boolean' },
              isFeatured: { type: 'boolean' },
              viewCount: { type: 'integer' },
              likeCount: { type: 'integer' },
              itemCount: { type: 'integer' },
              coverImageUrl: { type: 'keyword' },
              createdAt: { type: 'date' },
              updatedAt: { type: 'date' },
            },
          },
        });
        this.logger.log('Created Elasticsearch collections index');
      }
      await this.prisma.searchIndex.upsert({
        where: { indexName: this.COLLECTIONS_INDEX },
        update: { status: 'active' },
        create: { indexName: this.COLLECTIONS_INDEX, status: 'active', settings: {} },
      });
    } catch (error) {
      this.logger.warn(
        `Collections index creation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async syncCollectionsIndexIfEmpty(): Promise<void> {
    if (!this.esAvailable) return;
    try {
      const [esRes, dbCount] = await Promise.all([
        this.client.count({ index: this.COLLECTIONS_INDEX }).catch(() => ({ count: 0 })),
        this.prisma.collection.count({ where: { isPublic: true } }),
      ]);
      const esCount = esRes?.count ?? 0;
      if (dbCount > 0 && (esCount === 0 || esCount < dbCount * 0.5)) {
        this.logger.log(`Collections index out of sync: ES=${esCount}, DB=${dbCount} – reindexing...`);
        const indexed = await this.reindexAllCollections();
        this.logger.log(`Collections reindex complete: ${indexed} indexed.`);
      } else if (dbCount > 0 && esCount > 0) {
        const sample = await this.client.search({
          index: this.COLLECTIONS_INDEX,
          size: 5,
          _source: ['id'],
        });
        const sampleIds = sample.hits.hits
          .map((h: any) => h._source?.id as string)
          .filter(Boolean);
        if (sampleIds.length > 0) {
          const found = await this.prisma.collection.count({
            where: { id: { in: sampleIds } },
          });
          if (found < sampleIds.length * 0.5) {
            this.logger.log(
              `Collections index has stale IDs (${found}/${sampleIds.length} valid) – reindexing...`,
            );
            const indexed = await this.reindexAllCollections();
            this.logger.log(`Collections reindex complete: ${indexed} indexed.`);
          }
        }
      }
    } catch (err) {
      this.logger.warn('syncCollectionsIndexIfEmpty failed', err instanceof Error ? err.message : String(err));
    }
  }

  private buildCollectionDocument(collection: any): Record<string, any> {
    return {
      id: collection.id,
      name: collection.name,
      slug: collection.slug,
      description: collection.description || '',
      userId: collection.userId,
      userName: collection.user?.displayName || '',
      categoryId: collection.categoryId || undefined,
      categoryName: collection.category?.name || undefined,
      isPublic: collection.isPublic,
      isFeatured: collection.isFeatured || false,
      viewCount: collection.viewCount || 0,
      likeCount: collection.likeCount || 0,
      itemCount: collection._count?.items ?? 0,
      coverImageUrl: collection.coverImageKey ? this.storageService.getPublicAssetUrl(collection.coverImageKey) : undefined,
      createdAt: collection.createdAt,
      updatedAt: collection.updatedAt,
    };
  }

  private readonly collectionInclude = {
    user: { select: { id: true, displayName: true } },
    category: { select: { id: true, name: true, slug: true } },
    _count: { select: { items: true } },
  };

  async indexCollection(collectionId: string): Promise<void> {
    if (!this.esAvailable) return;
    const collection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
      include: this.collectionInclude,
    });
    if (!collection) return;
    try {
      await this.client.index({
        index: this.COLLECTIONS_INDEX,
        id: collection.id,
        document: this.buildCollectionDocument(collection),
      });
    } catch (error) {
      this.logger.warn(`ES indexing error for collection ${collectionId}`);
    }
  }

  async removeCollection(collectionId: string): Promise<void> {
    if (!this.esAvailable) return;
    try {
      await this.client.delete({ index: this.COLLECTIONS_INDEX, id: collectionId });
    } catch (error) {
      this.logger.warn(`ES delete error for collection ${collectionId}`);
    }
  }

  async reindexAllCollections(): Promise<number> {
    if (!this.esAvailable) return 0;
    if (this.reindexingCollections) {
      this.logger.warn('Collections reindex already in progress, skipping');
      return 0;
    }
    this.reindexingCollections = true;
    try {
      await this.prisma.searchIndex.upsert({
        where: { indexName: this.COLLECTIONS_INDEX },
        update: { status: 'rebuilding' },
        create: { indexName: this.COLLECTIONS_INDEX, status: 'rebuilding', settings: {} },
      });

      const collections = await this.prisma.collection.findMany({
        include: this.collectionInclude,
      });

      await this.ensureCollectionsIndexExists();

      let indexed = 0;
      if (collections.length > 0) {
        const operations = collections.flatMap((c) => [
          { index: { _index: this.COLLECTIONS_INDEX, _id: c.id } },
          this.buildCollectionDocument(c),
        ]);
        const bulkResp = await this.client.bulk({ refresh: true, operations });

        if (bulkResp.errors) {
          const failed = (bulkResp.items ?? []).filter((item: any) => item.index?.error);
          this.logger.error(`Collections bulk indexing had ${failed.length} failures`);
          for (const f of failed.slice(0, 5)) {
            this.logger.error(`  Failed doc ${(f as any).index?._id}: ${JSON.stringify((f as any).index?.error)}`);
          }
          indexed = collections.length - failed.length;
        } else {
          indexed = collections.length;
        }
      }

      // Remove orphaned ES documents that no longer exist in the DB
      const collectionIds = new Set(collections.map((c) => c.id));
      try {
        const allEsDocs = await this.client.search({
          index: this.COLLECTIONS_INDEX,
          size: 10000,
          _source: false,
        });
        const orphanIds = allEsDocs.hits.hits
          .map((h: any) => h._id as string)
          .filter((id) => !collectionIds.has(id));
        if (orphanIds.length > 0) {
          const deleteOps = orphanIds.flatMap((id) => [
            { delete: { _index: this.COLLECTIONS_INDEX, _id: id } },
          ]);
          await this.client.bulk({ refresh: true, operations: deleteOps });
          this.logger.log(`Removed ${orphanIds.length} orphaned docs from collections index`);
        }
      } catch (orphanErr) {
        this.logger.warn('Failed to clean orphaned collection docs from ES');
      }

      await this.prisma.searchIndex.update({
        where: { indexName: this.COLLECTIONS_INDEX },
        data: { status: 'active', documentCount: indexed, lastSyncedAt: new Date() },
      });
      this.logger.log(`Reindexed ${indexed} collections (non-destructive)`);
      return indexed;
    } catch (error) {
      this.logger.error('Collections reindex error');
      await this.prisma.searchIndex.update({
        where: { indexName: this.COLLECTIONS_INDEX },
        data: { status: 'error' },
      }).catch(() => {});
      throw new InternalServerErrorException('Collections reindex failed');
    } finally {
      this.reindexingCollections = false;
    }
  }

  // ──────────────────────────── Collections Search ────────────────────────────

  async searchCollections(options: {
    query?: string;
    categoryId?: string;
    isPublic?: boolean;
    isFeatured?: boolean;
    userId?: string;
    sortBy?: 'popular' | 'recent' | 'name' | 'items' | 'items_asc' | 'items_desc';
    page?: number;
    pageSize?: number;
  }): Promise<{ ids: string[]; total: number } | null> {
    if (!this.esAvailable) return null;

    const { query, categoryId, isPublic, isFeatured, userId, sortBy = 'popular', page = 1, pageSize = 20 } = options;

    const must: any[] = [];
    const filter: any[] = [];

    if (query && query.trim()) {
      must.push({
        bool: {
          should: [
            { match: { name: { query, boost: 5 } } },
            { match: { 'name.edge_ngram': { query, boost: 3 } } },
            { match: { description: { query, boost: 1.5 } } },
            { match: { 'description.edge_ngram': { query, boost: 1 } } },
            { match: { userName: { query, boost: 2 } } },
            { match: { 'userName.edge_ngram': { query, boost: 1 } } },
            { match: { categoryName: { query, boost: 2 } } },
            {
              multi_match: {
                query,
                fields: ['name^3', 'description', 'userName^2', 'categoryName^2'],
                fuzziness: 'AUTO',
                prefix_length: 1,
                boost: 1.5,
              },
            },
          ],
          minimum_should_match: 1,
        },
      });
    }

    if (isPublic !== undefined) filter.push({ term: { isPublic } });
    if (isFeatured !== undefined) filter.push({ term: { isFeatured } });
    if (categoryId) filter.push({ term: { categoryId } });
    if (userId) filter.push({ term: { userId } });

    let sort: any[];
    switch (sortBy) {
      case 'popular': sort = [{ viewCount: 'desc' }, { likeCount: 'desc' }]; break;
      case 'recent': sort = [{ createdAt: 'desc' }]; break;
      case 'name': sort = [{ 'name.keyword': 'asc' }]; break;
      case 'items': case 'items_desc': sort = [{ itemCount: 'desc' }]; break;
      case 'items_asc': sort = [{ itemCount: 'asc' }]; break;
      default: sort = query ? [{ _score: 'desc' }] : [{ viewCount: 'desc' }];
    }

    try {
      const response = await this.client.search({
        index: this.COLLECTIONS_INDEX,
        query: {
          bool: {
            must: must.length > 0 ? must : [{ match_all: {} }],
            filter,
          },
        },
        sort,
        from: (page - 1) * pageSize,
        size: pageSize,
        _source: ['id'],
      });

      const total =
        typeof response.hits.total === 'number'
          ? response.hits.total
          : (response.hits.total as any)?.value || 0;

      return {
        ids: response.hits.hits.map((hit: any) => hit._source.id),
        total,
      };
    } catch (error) {
      this.logger.warn('Collections search error, falling back to Prisma');
      return null;
    }
  }

  // ──────────────────────────── Stats ────────────────────────────

  private async updateIndexStats(): Promise<void> {
    try {
      const response = await this.client.count({ index: this.PRODUCTS_INDEX });
      await this.prisma.searchIndex.update({
        where: { indexName: this.PRODUCTS_INDEX },
        data: {
          documentCount: response.count,
          lastSyncedAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.warn('Failed to update index stats');
    }
  }

  async getStatus(): Promise<{
    elasticsearch: boolean;
    indexExists: boolean;
    documentCount: number;
    dbCount: number;
    inSync: boolean;
    message: string;
  }> {
    try {
      const esResponse = await this.client.count({ index: this.PRODUCTS_INDEX });
      const dbCount = await this.prisma.product.count({
        where: {
          status: ProductStatus.active,
          NOT: this.virtualProductPrismaNot(),
        },
      });

      const inSync = Math.abs(dbCount - esResponse.count) <= 2;
      return {
        elasticsearch: true,
        indexExists: true,
        documentCount: esResponse.count,
        dbCount,
        inSync,
        message: esResponse.count > 0
          ? `ES çalışıyor: ${esResponse.count} ES / ${dbCount} DB doküman${inSync ? ' (senkron)' : ' (SENKRON DEĞİL)'}`
          : 'ES çalışıyor ama index boş. /search/dev/reindex çağırın.',
      };
    } catch {
      return {
        elasticsearch: false,
        indexExists: false,
        documentCount: 0,
        dbCount: 0,
        inSync: false,
        message: 'Elasticsearch bağlantı hatası',
      };
    }
  }
}
