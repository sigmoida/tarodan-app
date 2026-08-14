import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { PrismaService } from "../../../prisma";
import { SearchIndexingService } from "./search-indexing.service";

interface EntityEvent {
  entityId: string;
}

interface CarModelEvent extends EntityEvent {
  productIds?: string[];
}

@Injectable()
export class SearchSyncListener {
  private readonly logger = new Logger(SearchSyncListener.name);

  constructor(
    private readonly searchIndexing: SearchIndexingService,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent("product.changed", { async: true })
  async handleProductChanged(payload: EntityEvent): Promise<void> {
    this.logger.debug(
      `product.changed → queueIndexProduct(${payload.entityId})`,
    );
    await this.searchIndexing.queueIndexProduct(payload.entityId);
  }

  @OnEvent("product.deleted", { async: true })
  async handleProductDeleted(payload: EntityEvent): Promise<void> {
    this.logger.debug(
      `product.deleted → queueRemoveProduct(${payload.entityId})`,
    );
    await this.searchIndexing.queueRemoveProduct(payload.entityId);
  }

  @OnEvent("collection.changed", { async: true })
  async handleCollectionChanged(payload: EntityEvent): Promise<void> {
    this.logger.debug(
      `collection.changed → queueIndexCollection(${payload.entityId})`,
    );
    await this.searchIndexing.queueIndexCollection(payload.entityId);
  }

  @OnEvent("collection.deleted", { async: true })
  async handleCollectionDeleted(payload: EntityEvent): Promise<void> {
    this.logger.debug(
      `collection.deleted → queueRemoveCollection(${payload.entityId})`,
    );
    await this.searchIndexing.queueRemoveCollection(payload.entityId);
  }

  @OnEvent("carModel.changed", { async: true })
  async handleCarModelChanged(payload: CarModelEvent): Promise<void> {
    const carModelId = payload.entityId;
    const products = await this.prisma.product.findMany({
      where: { carModelId },
      select: { id: true },
    });
    for (const p of products) {
      await this.searchIndexing.queueIndexProduct(p.id);
    }
    this.logger.debug(
      `carModel.changed → reindexed ${products.length} products for carModel ${carModelId}`,
    );
  }

  @OnEvent("carModel.deleted", { async: true })
  async handleCarModelDeleted(payload: CarModelEvent): Promise<void> {
    const productIds = payload.productIds ?? [];
    for (const productId of productIds) {
      await this.searchIndexing.queueIndexProduct(productId);
    }
    this.logger.debug(
      `carModel.deleted → reindexed ${productIds.length} products (carModelId set to null)`,
    );
  }
}
