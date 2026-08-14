import { Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { QUEUE_NAMES } from "../../../workers/constants";
import { SearchJobData } from "../../../workers/search.worker";

@Injectable()
export class SearchIndexingService {
  private readonly logger = new Logger(SearchIndexingService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.SEARCH) private readonly searchQueue: Queue,
  ) {}

  // ── Product ──

  async queueIndexProduct(productId: string): Promise<void> {
    await this.searchQueue.add("index", {
      type: "index",
      entityType: "product",
      entityId: productId,
    } as SearchJobData);
    this.logger.debug(`Queued index for product ${productId}`);
  }

  async queueRemoveProduct(productId: string): Promise<void> {
    await this.searchQueue.add("delete", {
      type: "delete",
      entityType: "product",
      entityId: productId,
    } as SearchJobData);
    this.logger.debug(`Queued delete for product ${productId}`);
  }

  async queueReindexAll(): Promise<void> {
    await this.searchQueue.add(
      "reindex-all",
      {
        type: "reindex-all",
        entityType: "product",
      } as SearchJobData,
      { attempts: 1 },
    );
    this.logger.log("Queued full product reindex");
  }

  // ── Collection ──

  async queueIndexCollection(collectionId: string): Promise<void> {
    await this.searchQueue.add("index-collection", {
      type: "index",
      entityType: "collection",
      entityId: collectionId,
    } as SearchJobData);
    this.logger.debug(`Queued index for collection ${collectionId}`);
  }

  async queueRemoveCollection(collectionId: string): Promise<void> {
    await this.searchQueue.add("delete-collection", {
      type: "delete",
      entityType: "collection",
      entityId: collectionId,
    } as SearchJobData);
    this.logger.debug(`Queued delete for collection ${collectionId}`);
  }

  async queueReindexAllCollections(): Promise<void> {
    await this.searchQueue.add(
      "reindex-all-collections",
      {
        type: "reindex-all",
        entityType: "collection",
      } as SearchJobData,
      {
        attempts: 1,
        jobId: "reindex-all-collections-singleton",
      },
    );
    this.logger.log("Queued full collection reindex");
  }
}
