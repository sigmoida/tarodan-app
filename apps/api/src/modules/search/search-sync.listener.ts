import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SearchIndexingService } from './search-indexing.service';

interface EntityEvent {
  entityId: string;
}

@Injectable()
export class SearchSyncListener {
  private readonly logger = new Logger(SearchSyncListener.name);

  constructor(private readonly searchIndexing: SearchIndexingService) {}

  @OnEvent('product.changed', { async: true })
  async handleProductChanged(payload: EntityEvent): Promise<void> {
    this.logger.debug(`product.changed → queueIndexProduct(${payload.entityId})`);
    await this.searchIndexing.queueIndexProduct(payload.entityId);
  }

  @OnEvent('product.deleted', { async: true })
  async handleProductDeleted(payload: EntityEvent): Promise<void> {
    this.logger.debug(`product.deleted → queueRemoveProduct(${payload.entityId})`);
    await this.searchIndexing.queueRemoveProduct(payload.entityId);
  }

  @OnEvent('collection.changed', { async: true })
  async handleCollectionChanged(payload: EntityEvent): Promise<void> {
    this.logger.debug(`collection.changed → queueIndexCollection(${payload.entityId})`);
    await this.searchIndexing.queueIndexCollection(payload.entityId);
  }

  @OnEvent('collection.deleted', { async: true })
  async handleCollectionDeleted(payload: EntityEvent): Promise<void> {
    this.logger.debug(`collection.deleted → queueRemoveCollection(${payload.entityId})`);
    await this.searchIndexing.queueRemoveCollection(payload.entityId);
  }
}
