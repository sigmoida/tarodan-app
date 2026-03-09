import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { QUEUE_NAMES } from '../../workers/constants';
import { SearchJobData } from '../../workers/search.worker';

@Injectable()
export class SearchIndexingService {
  private readonly logger = new Logger(SearchIndexingService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.SEARCH) private readonly searchQueue: Queue,
  ) {}

  async queueIndexProduct(productId: string): Promise<void> {
    await this.searchQueue.add('index', {
      type: 'index',
      entityType: 'product',
      entityId: productId,
    } as SearchJobData);
    this.logger.debug(`Queued index for product ${productId}`);
  }

  async queueRemoveProduct(productId: string): Promise<void> {
    await this.searchQueue.add('delete', {
      type: 'delete',
      entityType: 'product',
      entityId: productId,
    } as SearchJobData);
    this.logger.debug(`Queued delete for product ${productId}`);
  }

  async queueReindexAll(): Promise<void> {
    await this.searchQueue.add('reindex-all', {
      type: 'reindex-all',
      entityType: 'product',
    } as SearchJobData, { attempts: 1 });
    this.logger.log('Queued full reindex');
  }
}
