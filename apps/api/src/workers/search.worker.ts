/**
 * Search Indexing Worker
 * Handles Elasticsearch indexing via SearchService (async, queue-based)
 */
import {
  Processor,
  Process,
  OnQueueFailed,
  OnQueueCompleted,
} from "@nestjs/bull";
import { Logger } from "@nestjs/common";
import { Job } from "bull";
import { SearchService } from "../modules/search/search.service";

export interface SearchJobData {
  type: "index" | "update" | "delete" | "bulk-index" | "reindex-all";
  entityType: "product" | "collection";
  entityId?: string;
  entityIds?: string[];
}

@Processor("search")
export class SearchWorker {
  private readonly logger = new Logger(SearchWorker.name);

  constructor(private readonly searchService: SearchService) {}

  // ── Product jobs ──

  @Process("index")
  async handleIndex(job: Job<SearchJobData>) {
    const { entityId } = job.data;
    if (!entityId) throw new Error("entityId is required for indexing");
    this.logger.log(`Index job ${job.id}: product ${entityId}`);
    await this.searchService.indexProduct(entityId);
    return { success: true, entityId };
  }

  @Process("update")
  async handleUpdate(job: Job<SearchJobData>) {
    const { entityId } = job.data;
    if (!entityId) throw new Error("entityId is required for update");
    this.logger.log(`Update job ${job.id}: product ${entityId}`);
    await this.searchService.indexProduct(entityId);
    return { success: true, entityId };
  }

  @Process("delete")
  async handleDelete(job: Job<SearchJobData>) {
    const { entityId } = job.data;
    if (!entityId) throw new Error("entityId is required for delete");
    this.logger.log(`Delete job ${job.id}: product ${entityId}`);
    await this.searchService.removeProduct(entityId);
    return { success: true, entityId };
  }

  @Process("bulk-index")
  async handleBulkIndex(job: Job<SearchJobData>) {
    const { entityIds } = job.data;
    if (!entityIds?.length) return { success: true, indexed: 0 };
    this.logger.log(`Bulk index job ${job.id}: ${entityIds.length} products`);
    let indexed = 0;
    for (const id of entityIds) {
      try {
        await this.searchService.indexProduct(id);
        indexed++;
      } catch (err) {
        // warn BİLİNÇLİ: periyodik ES↔DB senkronu (search-periodic-sync /
        // search-hourly-reconcile) eksik dokümanı kendisi tamamlar, tek ürünün
        // dizinlenememesi alarm gerektirmez.
        this.logger.warn(
          `Failed to index product ${id}: ${(err as Error).message}`,
        );
      }
    }
    this.logger.log(`Bulk indexed ${indexed}/${entityIds.length} products`);
    return { success: true, indexed };
  }

  @Process("reindex-all")
  async handleReindexAll(job: Job<SearchJobData>) {
    this.logger.log(`Reindex-all job ${job.id}`);
    const total = await this.searchService.reindexAll();
    this.logger.log(`Reindex complete: ${total} products`);
    return { success: true, total };
  }

  // ── Collection jobs ──

  @Process("index-collection")
  async handleIndexCollection(job: Job<SearchJobData>) {
    const { entityId } = job.data;
    if (!entityId)
      throw new Error("entityId is required for collection indexing");
    this.logger.log(`Index collection job ${job.id}: ${entityId}`);
    await this.searchService.indexCollection(entityId);
    return { success: true, entityId };
  }

  @Process("delete-collection")
  async handleDeleteCollection(job: Job<SearchJobData>) {
    const { entityId } = job.data;
    if (!entityId)
      throw new Error("entityId is required for collection delete");
    this.logger.log(`Delete collection job ${job.id}: ${entityId}`);
    await this.searchService.removeCollection(entityId);
    return { success: true, entityId };
  }

  @Process("reindex-all-collections")
  async handleReindexAllCollections(job: Job<SearchJobData>) {
    this.logger.log(`Reindex-all-collections job ${job.id}`);
    const total = await this.searchService.reindexAllCollections();
    this.logger.log(`Collections reindex complete: ${total}`);
    return { success: true, total };
  }

  // ── Lifecycle ──

  @OnQueueCompleted()
  onCompleted(job: Job) {
    this.logger.log(`Search job ${job.id} completed`);
  }

  @OnQueueFailed()
  onFailed(job: Job, error: Error) {
    this.logger.error(`Search job ${job.id} failed: ${error.message}`);
  }
}
