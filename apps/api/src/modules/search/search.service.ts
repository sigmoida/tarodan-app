import {
  Injectable,
  OnModuleInit,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma';
import { Client } from '@elastic/elasticsearch';
import { ProductStatus } from '@prisma/client';

export interface ProductSearchResult {
  id: string;
  title: string;
  description?: string;
  price: number;
  condition: string;
  status: string;
  categoryName: string;
  sellerName: string;
  imageUrl?: string;
  score: number;
}

export interface SearchOptions {
  query: string;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  condition?: string;
  page?: number;
  pageSize?: number;
  sortBy?: 'relevance' | 'price_asc' | 'price_desc' | 'newest';
}

export interface SearchResponse {
  results: ProductSearchResult[];
  total: number;
  page: number;
  pageSize: number;
  took: number; // milliseconds
}

@Injectable()
export class SearchService implements OnModuleInit {
  private client: Client;
  private readonly PRODUCTS_INDEX = 'products';

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    // Initialize Elasticsearch client
    const node = this.configService.get(
      'ELASTICSEARCH_NODE',
      'http://localhost:9200',
    );

    this.client = new Client({
      node,
      auth: {
        username: this.configService.get('ELASTICSEARCH_USERNAME', 'elastic'),
        password: this.configService.get('ELASTICSEARCH_PASSWORD', 'changeme'),
      },
    });

    // Initialize index
    await this.ensureIndexExists();
  }

  /**
   * Ensure products index exists with proper mapping
   */
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
            analysis: {
              analyzer: {
                turkish: {
                  type: 'custom',
                  tokenizer: 'standard',
                  filter: ['lowercase', 'turkish_stop', 'turkish_stemmer'],
                },
              },
              filter: {
                turkish_stop: {
                  type: 'stop',
                  stopwords: '_turkish_',
                },
                turkish_stemmer: {
                  type: 'stemmer',
                  language: 'turkish',
                },
              },
            },
          },
          mappings: {
              properties: {
                id: { type: 'keyword' },
                title: {
                  type: 'text',
                  analyzer: 'turkish',
                  fields: {
                    keyword: { type: 'keyword' },
                  },
                },
                description: {
                  type: 'text',
                  analyzer: 'turkish',
                },
                price: { type: 'float' },
                condition: { type: 'keyword' },
                status: { type: 'keyword' },
                categoryId: { type: 'keyword' },
                categoryName: { type: 'keyword' },
                sellerId: { type: 'keyword' },
                sellerName: { type: 'keyword' },
                imageUrl: { type: 'keyword' },
                isTradeEnabled: { type: 'boolean' },
                createdAt: { type: 'date' },
                updatedAt: { type: 'date' },
              },
            },
        });
        console.log('✅ Created Elasticsearch index: products');
      }

      // Update index tracking in DB
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
      console.error('Elasticsearch index creation failed:', error);
      // Don't throw - allow app to start without ES
    }
  }

  /**
   * Search products
   */
  async searchProducts(options: SearchOptions): Promise<SearchResponse> {
    const {
      query,
      categoryId,
      minPrice,
      maxPrice,
      condition,
      page = 1,
      pageSize = 20,
      sortBy = 'relevance',
    } = options;

    const must: any[] = [];
    const filter: any[] = [];

    // Text search
    if (query) {
      must.push({
        multi_match: {
          query,
          fields: ['title^3', 'description', 'categoryName'],
          fuzziness: 'AUTO',
        },
      });
    }

    // Status filter - only active products
    filter.push({ term: { status: ProductStatus.active } });

    // Category filter
    if (categoryId) {
      filter.push({ term: { categoryId } });
    }

    // Price range filter
    if (minPrice !== undefined || maxPrice !== undefined) {
      const range: any = {};
      if (minPrice !== undefined) range.gte = minPrice;
      if (maxPrice !== undefined) range.lte = maxPrice;
      filter.push({ range: { price: range } });
    }

    // Condition filter
    if (condition) {
      filter.push({ term: { condition } });
    }

    // Sorting
    let sort: any[] = [];
    switch (sortBy) {
      case 'price_asc':
        sort = [{ price: 'asc' }];
        break;
      case 'price_desc':
        sort = [{ price: 'desc' }];
        break;
      case 'newest':
        sort = [{ createdAt: 'desc' }];
        break;
      default:
        sort = [{ _score: 'desc' }];
    }

    try {
      const response = await this.client.search({
        index: this.PRODUCTS_INDEX,
        query: {
          bool: {
            must: must.length > 0 ? must : [{ match_all: {} }],
            filter,
          },
        },
        sort,
        from: (page - 1) * pageSize,
        size: pageSize,
      });

      const hits = response.hits.hits;
      const total =
        typeof response.hits.total === 'number'
          ? response.hits.total
          : (response.hits.total as any)?.value || 0;

      return {
        results: hits.map((hit: any) => ({
          id: hit._source.id,
          title: hit._source.title,
          description: hit._source.description,
          price: hit._source.price,
          condition: hit._source.condition,
          status: hit._source.status,
          categoryName: hit._source.categoryName,
          sellerName: hit._source.sellerName,
          imageUrl: hit._source.imageUrl,
          score: hit._score || 0,
        })),
        total,
        page,
        pageSize,
        took: response.took,
      };
    } catch (error) {
      console.error('Elasticsearch search error:', error);
      // Fallback to database search
      return this.fallbackSearch(options);
    }
  }

  /**
   * Index a product
   */
  async indexProduct(productId: string): Promise<void> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        category: { select: { id: true, name: true } },
        seller: { select: { id: true, displayName: true } },
        images: { take: 1, select: { url: true } },
      },
    });

    if (!product) return;

    try {
      await this.client.index({
        index: this.PRODUCTS_INDEX,
        id: product.id,
        document: {
          id: product.id,
          title: product.title,
          description: product.description,
          price: parseFloat(product.price.toString()),
          condition: product.condition,
          status: product.status,
          categoryId: product.categoryId,
          categoryName: product.category.name,
          sellerId: product.sellerId,
          sellerName: product.seller.displayName,
          imageUrl: product.images[0]?.url,
          isTradeEnabled: product.isTradeEnabled,
          createdAt: product.createdAt,
          updatedAt: product.updatedAt,
        },
      });

      // Update document count
      await this.updateIndexStats();
    } catch (error) {
      console.error('Elasticsearch indexing error:', error);
    }
  }

  /**
   * Remove product from index
   */
  async removeProduct(productId: string): Promise<void> {
    try {
      await this.client.delete({
        index: this.PRODUCTS_INDEX,
        id: productId,
      });
      await this.updateIndexStats();
    } catch (error) {
      console.error('Elasticsearch delete error:', error);
    }
  }

  /**
   * Reindex all products
   */
  async reindexAll(): Promise<number> {
    // Update index status
    await this.prisma.searchIndex.update({
      where: { indexName: this.PRODUCTS_INDEX },
      data: { status: 'rebuilding' },
    });

    try {
      // Get all active products
      const products = await this.prisma.product.findMany({
        where: { status: ProductStatus.active },
        include: {
          category: { select: { id: true, name: true } },
          seller: { select: { id: true, displayName: true } },
          images: { take: 1, select: { url: true } },
        },
      });

      // Delete existing index
      await this.client.indices.delete({ index: this.PRODUCTS_INDEX }).catch(() => {});
      await this.ensureIndexExists();

      // Bulk index
      if (products.length > 0) {
        const body = products.flatMap((product) => [
          { index: { _index: this.PRODUCTS_INDEX, _id: product.id } },
          {
            id: product.id,
            title: product.title,
            description: product.description,
            price: parseFloat(product.price.toString()),
            condition: product.condition,
            status: product.status,
            categoryId: product.categoryId,
            categoryName: product.category.name,
            sellerId: product.sellerId,
            sellerName: product.seller.displayName,
            imageUrl: product.images[0]?.url,
            isTradeEnabled: product.isTradeEnabled,
            createdAt: product.createdAt,
            updatedAt: product.updatedAt,
          },
        ]);

        await this.client.bulk({ refresh: true, operations: body });
      }

      // Update index status
      await this.prisma.searchIndex.update({
        where: { indexName: this.PRODUCTS_INDEX },
        data: {
          status: 'active',
          documentCount: products.length,
          lastSyncedAt: new Date(),
        },
      });

      return products.length;
    } catch (error) {
      console.error('Elasticsearch reindex error:', error);
      await this.prisma.searchIndex.update({
        where: { indexName: this.PRODUCTS_INDEX },
        data: { status: 'error' },
      });
      throw new InternalServerErrorException('Reindex başarısız');
    }
  }

  /**
   * Get autocomplete suggestions
   */
  async autocomplete(query: string, limit = 10): Promise<string[]> {
    try {
      const response = await this.client.search({
        index: this.PRODUCTS_INDEX,
        query: {
          bool: {
            must: [
              {
                multi_match: {
                  query,
                  type: 'phrase_prefix',
                  fields: ['title', 'categoryName'],
                },
              },
            ],
            filter: [{ term: { status: ProductStatus.active } }],
          },
        },
        _source: ['title'],
        size: limit,
      });

      return response.hits.hits.map((hit: any) => hit._source.title);
    } catch (error) {
      console.error('Elasticsearch autocomplete error:', error);
      return [];
    }
  }

  /**
   * Fallback to database search when Elasticsearch is unavailable
   */
  private async fallbackSearch(options: SearchOptions): Promise<SearchResponse> {
    const {
      query,
      categoryId,
      minPrice,
      maxPrice,
      condition,
      page = 1,
      pageSize = 20,
      sortBy = 'relevance',
    } = options;

    const where: any = { status: ProductStatus.active };

    if (query) {
      where.OR = [
        { title: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
      ];
    }

    if (categoryId) where.categoryId = categoryId;
    if (condition) where.condition = condition;

    if (minPrice !== undefined || maxPrice !== undefined) {
      where.price = {};
      if (minPrice !== undefined) where.price.gte = minPrice;
      if (maxPrice !== undefined) where.price.lte = maxPrice;
    }

    let orderBy: any;
    switch (sortBy) {
      case 'price_asc':
        orderBy = { price: 'asc' };
        break;
      case 'price_desc':
        orderBy = { price: 'desc' };
        break;
      case 'newest':
        orderBy = { createdAt: 'desc' };
        break;
      default:
        orderBy = { createdAt: 'desc' };
    }

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: {
          category: { select: { name: true } },
          seller: { select: { displayName: true } },
          images: { take: 1, select: { url: true } },
        },
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      results: products.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description || undefined,
        price: parseFloat(p.price.toString()),
        condition: p.condition,
        status: p.status,
        categoryName: p.category.name,
        sellerName: p.seller.displayName,
        imageUrl: p.images[0]?.url,
        score: 0,
      })),
      total,
      page,
      pageSize,
      took: 0,
    };
  }

  /**
   * Update index statistics
   */
  private async updateIndexStats(): Promise<void> {
    try {
      const response = await this.client.count({ 
        index: this.PRODUCTS_INDEX 
      });
      await this.prisma.searchIndex.update({
        where: { indexName: this.PRODUCTS_INDEX },
        data: {
          documentCount: response.count,
          lastSyncedAt: new Date(),
        },
      });
    } catch (error) {
      console.error('Failed to update index stats:', error);
    }
  }
}
