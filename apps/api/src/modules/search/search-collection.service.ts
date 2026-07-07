import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { StorageService } from '../storage/storage.service';
import { SearchCommonService } from './search-common.service';

/**
 * Koleksiyon indeksleme + arama alt servisi (search.service.ts'ten birebir
 * taşındı): buildCollectionDocument, indexCollection, removeCollection,
 * reindexAllCollections, searchCollections, syncCollectionsIndexIfEmpty.
 * Paylaşılan ES client'ı + bayraklar + collections-index ensure helper'ı için
 * SearchCommonService'e delege eder. reindexingCollections re-entrancy guard'ı
 * Common'da TEK örnek olarak tutulur.
 */
@Injectable()
export class SearchCollectionService {
  private readonly logger = new Logger(SearchCollectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly common: SearchCommonService,
  ) {}

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
    if (!this.common.isAvailable()) return;
    const collection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
      include: this.collectionInclude,
    });
    if (!collection) return;
    try {
      await this.common.client.index({
        index: this.common.collectionsIndex,
        id: collection.id,
        document: this.buildCollectionDocument(collection),
      });
    } catch (error) {
      this.logger.warn(`ES indexing error for collection ${collectionId}`);
    }
  }

  async removeCollection(collectionId: string): Promise<void> {
    if (!this.common.isAvailable()) return;
    try {
      await this.common.client.delete({ index: this.common.collectionsIndex, id: collectionId });
    } catch (error) {
      this.logger.warn(`ES delete error for collection ${collectionId}`);
    }
  }

  async reindexAllCollections(): Promise<number> {
    if (!this.common.isAvailable()) return 0;
    if (this.common.reindexingCollections) {
      this.logger.warn('Collections reindex already in progress, skipping');
      return 0;
    }
    this.common.reindexingCollections = true;
    try {
      await this.prisma.searchIndex.upsert({
        where: { indexName: this.common.collectionsIndex },
        update: { status: 'rebuilding' },
        create: { indexName: this.common.collectionsIndex, status: 'rebuilding', settings: {} },
      });

      const collections = await this.prisma.collection.findMany({
        include: this.collectionInclude,
      });

      await this.common.ensureCollectionsIndexExists();

      let indexed = 0;
      if (collections.length > 0) {
        const operations = collections.flatMap((c) => [
          { index: { _index: this.common.collectionsIndex, _id: c.id } },
          this.buildCollectionDocument(c),
        ]);
        const bulkResp = await this.common.client.bulk({ refresh: true, operations });

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
        const allEsDocs = await this.common.client.search({
          index: this.common.collectionsIndex,
          size: 10000,
          _source: false,
        });
        const orphanIds = allEsDocs.hits.hits
          .map((h: any) => h._id as string)
          .filter((id) => !collectionIds.has(id));
        if (orphanIds.length > 0) {
          const deleteOps = orphanIds.flatMap((id) => [
            { delete: { _index: this.common.collectionsIndex, _id: id } },
          ]);
          await this.common.client.bulk({ refresh: true, operations: deleteOps });
          this.logger.log(`Removed ${orphanIds.length} orphaned docs from collections index`);
        }
      } catch (orphanErr) {
        this.logger.warn('Failed to clean orphaned collection docs from ES');
      }

      await this.prisma.searchIndex.update({
        where: { indexName: this.common.collectionsIndex },
        data: { status: 'active', documentCount: indexed, lastSyncedAt: new Date() },
      });
      this.logger.log(`Reindexed ${indexed} collections (non-destructive)`);
      return indexed;
    } catch (error) {
      this.logger.error('Collections reindex error');
      await this.prisma.searchIndex.update({
        where: { indexName: this.common.collectionsIndex },
        data: { status: 'error' },
      }).catch(() => {});
      throw new InternalServerErrorException('Collections reindex failed');
    } finally {
      this.common.reindexingCollections = false;
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
    if (!this.common.isAvailable()) return null;

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
      const response = await this.common.client.search({
        index: this.common.collectionsIndex,
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

  async syncCollectionsIndexIfEmpty(): Promise<void> {
    if (!this.common.isAvailable()) return;
    try {
      const [esRes, dbCount] = await Promise.all([
        this.common.client.count({ index: this.common.collectionsIndex }).catch(() => ({ count: 0 })),
        this.prisma.collection.count({ where: { isPublic: true } }),
      ]);
      const esCount = esRes?.count ?? 0;
      if (dbCount > 0 && (esCount === 0 || esCount < dbCount * 0.5)) {
        this.logger.log(`Collections index out of sync: ES=${esCount}, DB=${dbCount} – reindexing...`);
        const indexed = await this.reindexAllCollections();
        this.logger.log(`Collections reindex complete: ${indexed} indexed.`);
      } else if (dbCount > 0 && esCount > 0) {
        const sample = await this.common.client.search({
          index: this.common.collectionsIndex,
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
}
