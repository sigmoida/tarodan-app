import { Injectable, OnModuleInit, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import {
  cronsViaBull,
  registerRepeatableCron,
} from "../../monitoring/bull-cron.helper";
import { QUEUE_NAMES } from "../../workers/constants";
import { PrismaService } from "../../prisma";
import { Client } from "@elastic/elasticsearch";
import { Prisma, ProductStatus } from "@prisma/client";

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
  aggregations?: Record<
    string,
    { buckets: Array<{ key: string; doc_count: number }> }
  >;
}

export interface RichAutocompleteResult {
  products: Array<{
    id: string;
    title: string;
    imageUrl?: string;
    price: number;
    brandName?: string;
  }>;
  brands: Array<{
    id: string;
    name: string;
    slug: string;
    logo?: string | null;
  }>;
  categories: Array<{ id: string; name: string; slug: string }>;
  manufacturers: Array<{ id: string; name: string; slug: string }>;
  suggestions: string[];
}

// Sanal/platform sözde-ürünleri (üyelik + öne-çıkarma) aramadan/indeksten hariç tut.
// Tek kaynak — drift olmasın diye tüm exclusion noktaları bunu kullanır.
const VIRTUAL_PRODUCT_ID_PREFIXES = ["membership-", "boost-"] as const;

/**
 * Search modülü ortak servisi: paylaşılan Elasticsearch client'ı + bağlantı
 * lifecycle'ı (onModuleInit), index-adı sabitleri, esAvailable/reindexingCollections
 * bayrakları ve where-builder / ensure-index / stats yardımcıları. Alt servisler
 * (search-product / search-autocomplete / search-collection / search-sync) ve
 * facade buraya delege eder; hiçbir alt servis kendi ES client'ını KURMAZ
 * (paylaşılan bağlantı + esAvailable geçidi bozulmasın). Trade split'teki
 * TradeCommonService deseniyle aynı.
 */
@Injectable()
export class SearchCommonService implements OnModuleInit {
  private readonly logger = new Logger(SearchCommonService.name);
  // Public: alt servisler this.common.client ile paylaşılan ES bağlantısına erişir.
  client: Client;
  private readonly PRODUCTS_INDEX = "products";
  private readonly COLLECTIONS_INDEX = "collections";
  private esAvailable = false;
  // Re-entrancy guard for collections reindex — TEK örnek Common'da tutulur ki
  // eşzamanlı reindex koruması alt servisler arasında paylaşılsın.
  reindexingCollections = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.SCHEDULED) private readonly scheduledQueue: Queue,
  ) {}

  get productsIndex(): string {
    return this.PRODUCTS_INDEX;
  }

  get collectionsIndex(): string {
    return this.COLLECTIONS_INDEX;
  }

  async onModuleInit() {
    const node =
      this.configService.get("ELASTICSEARCH_URL") ||
      this.configService.get("ELASTICSEARCH_NODE", "http://localhost:9200");

    this.client = new Client({
      node,
      auth: {
        username: this.configService.get("ELASTICSEARCH_USERNAME", "elastic"),
        password: this.configService.get("ELASTICSEARCH_PASSWORD", "changeme"),
      },
    });

    await this.ensureIndexExists();
    await this.ensureCollectionsIndexExists();

    // Cron'u Bull repeatable'a senkronla (flag açıksa kaydet, kapalıysa temizle).
    await registerRepeatableCron(
      this.scheduledQueue,
      "search-periodic-sync",
      "0 */5 * * * *",
      cronsViaBull(),
      this.logger,
    );
    // Faz 7.1: saatlik tam reconcile (ID-bazlı yetim/eksik doküman eşitleme).
    await registerRepeatableCron(
      this.scheduledQueue,
      "search-hourly-reconcile",
      "0 * * * *",
      cronsViaBull(),
      this.logger,
    );
  }

  isAvailable(): boolean {
    return this.esAvailable;
  }

  /** Prisma: sanal sözde-ürünleri (membership-/boost-) hariç tutan NOT koşulu. */
  virtualProductPrismaNot(): Prisma.ProductWhereInput[] {
    return VIRTUAL_PRODUCT_ID_PREFIXES.map((p) => ({ id: { startsWith: p } }));
  }

  /** ElasticSearch: sanal sözde-ürünleri hariç tutan must_not prefix koşulları. */
  virtualProductEsMustNot(): Array<{ prefix: { id: string } }> {
    return VIRTUAL_PRODUCT_ID_PREFIXES.map((p) => ({ prefix: { id: p } }));
  }

  /**
   * ES'e indekslenecek ürün kümesi: listelerde görünebilenler.
   * = aktif (stoklu) + otomatik tükenen (inactive + quantity=0) + satıldı.
   * Hariç: elle pasife alınan (inactive + quantity>0), draft/pending/reserved/rejected
   * ve sanal (membership-/boost-) ürünler. Bu küme build-product-where.ts'teki kapsayıcı
   * listeleme filtresiyle hizalıdır.
   */
  indexableProductWhere(): Prisma.ProductWhereInput {
    return {
      OR: [
        { status: ProductStatus.active },
        { AND: [{ status: ProductStatus.inactive }, { quantity: 0 }] },
        { status: ProductStatus.sold },
      ],
      NOT: this.virtualProductPrismaNot(),
    };
  }

  async ensureIndexExists(): Promise<void> {
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
                  type: "custom",
                  tokenizer: "standard",
                  filter: ["lowercase", "turkish_stop", "turkish_stemmer"],
                },
                turkish_edge_ngram: {
                  type: "custom",
                  tokenizer: "edge_ngram_tokenizer",
                  filter: ["lowercase", "asciifolding"],
                },
                turkish_ngram: {
                  type: "custom",
                  tokenizer: "ngram_tokenizer",
                  filter: ["lowercase", "asciifolding"],
                },
                turkish_search: {
                  type: "custom",
                  tokenizer: "standard",
                  filter: ["lowercase", "asciifolding"],
                },
              },
              tokenizer: {
                edge_ngram_tokenizer: {
                  type: "edge_ngram",
                  min_gram: 2,
                  max_gram: 15,
                  token_chars: ["letter", "digit"],
                },
                ngram_tokenizer: {
                  type: "ngram",
                  min_gram: 2,
                  max_gram: 4,
                  token_chars: ["letter", "digit"],
                },
              },
              filter: {
                turkish_stop: { type: "stop", stopwords: "_turkish_" },
                turkish_stemmer: { type: "stemmer", language: "turkish" },
                asciifolding: { type: "asciifolding", preserve_original: true },
              },
            },
          },
          mappings: {
            properties: {
              id: { type: "keyword" },
              title: {
                type: "text",
                analyzer: "turkish",
                search_analyzer: "turkish_search",
                fields: {
                  keyword: { type: "keyword" },
                  edge_ngram: {
                    type: "text",
                    analyzer: "turkish_edge_ngram",
                    search_analyzer: "turkish_search",
                  },
                  ngram: {
                    type: "text",
                    analyzer: "turkish_ngram",
                    search_analyzer: "turkish_search",
                  },
                },
              },
              description: {
                type: "text",
                analyzer: "turkish",
                fields: {
                  edge_ngram: {
                    type: "text",
                    analyzer: "turkish_edge_ngram",
                    search_analyzer: "turkish_search",
                  },
                },
              },
              price: { type: "float" },
              oldPrice: { type: "float" },
              condition: { type: "keyword" },
              status: { type: "keyword" },
              categoryId: { type: "keyword" },
              categoryName: {
                type: "text",
                analyzer: "turkish",
                fields: {
                  keyword: { type: "keyword" },
                  edge_ngram: {
                    type: "text",
                    analyzer: "turkish_edge_ngram",
                    search_analyzer: "turkish_search",
                  },
                },
              },
              brandId: { type: "keyword" },
              brandName: {
                type: "text",
                analyzer: "turkish",
                fields: {
                  keyword: { type: "keyword" },
                  edge_ngram: {
                    type: "text",
                    analyzer: "turkish_edge_ngram",
                    search_analyzer: "turkish_search",
                  },
                },
              },
              manufacturerId: { type: "keyword" },
              manufacturerName: {
                type: "text",
                analyzer: "turkish",
                fields: {
                  keyword: { type: "keyword" },
                  edge_ngram: {
                    type: "text",
                    analyzer: "turkish_edge_ngram",
                    search_analyzer: "turkish_search",
                  },
                },
              },
              carModelId: { type: "keyword" },
              carModelName: {
                type: "text",
                analyzer: "turkish",
                search_analyzer: "turkish_search",
                fields: {
                  keyword: { type: "keyword" },
                  edge_ngram: {
                    type: "text",
                    analyzer: "turkish_edge_ngram",
                    search_analyzer: "turkish_search",
                  },
                  ngram: {
                    type: "text",
                    analyzer: "turkish_ngram",
                    search_analyzer: "turkish_search",
                  },
                },
              },
              sellerId: { type: "keyword" },
              sellerName: { type: "keyword" },
              imageUrl: { type: "keyword" },
              scale: { type: "keyword" },
              material: { type: "keyword" },
              vehicleType: { type: "keyword" },
              isTradeEnabled: { type: "boolean" },
              isPreorder: { type: "boolean" },
              isLimited: { type: "boolean" },
              isSet: { type: "boolean" },
              inStock: { type: "boolean" },
              quantity: { type: "integer" },
              viewCount: { type: "integer" },
              ratingAverage: { type: "float" },
              ratingCount: { type: "integer" },
              rankTier: { type: "integer" },
              qualityScore: { type: "integer" },
              popularityScore: { type: "integer" },
              relevanceScore: { type: "integer" },
              createdAt: { type: "date" },
              updatedAt: { type: "date" },
            },
          },
        });
        this.logger.log("Created Elasticsearch index with extended mappings");
      }

      this.esAvailable = true;

      await this.prisma.searchIndex.upsert({
        where: { indexName: this.PRODUCTS_INDEX },
        update: { status: "active" },
        create: {
          indexName: this.PRODUCTS_INDEX,
          status: "active",
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

  async ensureCollectionsIndexExists(): Promise<void> {
    if (!this.esAvailable) return;
    try {
      const exists = await this.client.indices.exists({
        index: this.COLLECTIONS_INDEX,
      });
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
                  type: "custom",
                  tokenizer: "standard",
                  filter: ["lowercase", "turkish_stop", "turkish_stemmer"],
                },
                turkish_edge_ngram: {
                  type: "custom",
                  tokenizer: "edge_ngram_tokenizer",
                  filter: ["lowercase", "asciifolding"],
                },
                turkish_search: {
                  type: "custom",
                  tokenizer: "standard",
                  filter: ["lowercase", "asciifolding"],
                },
              },
              tokenizer: {
                edge_ngram_tokenizer: {
                  type: "edge_ngram",
                  min_gram: 2,
                  max_gram: 15,
                  token_chars: ["letter", "digit"],
                },
              },
              filter: {
                turkish_stop: { type: "stop", stopwords: "_turkish_" },
                turkish_stemmer: { type: "stemmer", language: "turkish" },
                asciifolding: { type: "asciifolding", preserve_original: true },
              },
            },
          },
          mappings: {
            properties: {
              id: { type: "keyword" },
              name: {
                type: "text",
                analyzer: "turkish",
                search_analyzer: "turkish_search",
                fields: {
                  keyword: { type: "keyword" },
                  edge_ngram: {
                    type: "text",
                    analyzer: "turkish_edge_ngram",
                    search_analyzer: "turkish_search",
                  },
                },
              },
              slug: { type: "keyword" },
              description: {
                type: "text",
                analyzer: "turkish",
                search_analyzer: "turkish_search",
                fields: {
                  edge_ngram: {
                    type: "text",
                    analyzer: "turkish_edge_ngram",
                    search_analyzer: "turkish_search",
                  },
                },
              },
              userId: { type: "keyword" },
              userName: {
                type: "text",
                analyzer: "turkish",
                search_analyzer: "turkish_search",
                fields: {
                  keyword: { type: "keyword" },
                  edge_ngram: {
                    type: "text",
                    analyzer: "turkish_edge_ngram",
                    search_analyzer: "turkish_search",
                  },
                },
              },
              categoryId: { type: "keyword" },
              categoryName: {
                type: "text",
                analyzer: "turkish",
                search_analyzer: "turkish_search",
                fields: { keyword: { type: "keyword" } },
              },
              isPublic: { type: "boolean" },
              isFeatured: { type: "boolean" },
              viewCount: { type: "integer" },
              likeCount: { type: "integer" },
              itemCount: { type: "integer" },
              coverImageUrl: { type: "keyword" },
              createdAt: { type: "date" },
              updatedAt: { type: "date" },
            },
          },
        });
        this.logger.log("Created Elasticsearch collections index");
      }
      await this.prisma.searchIndex.upsert({
        where: { indexName: this.COLLECTIONS_INDEX },
        update: { status: "active" },
        create: {
          indexName: this.COLLECTIONS_INDEX,
          status: "active",
          settings: {},
        },
      });
    } catch (error) {
      this.logger.warn(
        `Collections index creation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async updateIndexStats(): Promise<void> {
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
      this.logger.warn("Failed to update index stats");
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
      const esResponse = await this.client.count({
        index: this.PRODUCTS_INDEX,
      });
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
        message:
          esResponse.count > 0
            ? `ES çalışıyor: ${esResponse.count} ES / ${dbCount} DB doküman${inSync ? " (senkron)" : " (SENKRON DEĞİL)"}`
            : "ES çalışıyor ama index boş. /search/dev/reindex çağırın.",
      };
    } catch {
      return {
        elasticsearch: false,
        indexExists: false,
        documentCount: 0,
        dbCount: 0,
        inSync: false,
        message: "Elasticsearch bağlantı hatası",
      };
    }
  }
}
