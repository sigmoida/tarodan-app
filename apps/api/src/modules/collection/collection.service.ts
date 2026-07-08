import { Injectable, Logger } from '@nestjs/common';
import {
  CreateCollectionDto,
  UpdateCollectionDto,
  AddCollectionItemDto,
  ReorderCollectionItemsDto,
  CollectionResponseDto,
  CollectionListResponseDto,
  CollectionItemResponseDto,
} from './dto';
import { CollectionCrudService } from './collection-crud.service';
import { CollectionCoverService } from './collection-cover.service';
import { CollectionItemsService } from './collection-items.service';
import { CollectionSocialService } from './collection-social.service';

/**
 * CollectionService (facade) — her public imza aynen korunur. CRUD/okuma/browse
 * crud'a, kapak (updateCollectionCover/generateCoverImage) cover'a, öğe işlemleri
 * (add/remove/reorder) items'a, beğeni/etkileşim (like/unlike/getLiked) social'a
 * delege edilir. Paylaşılan DTO/eşleme yardımcıları CollectionCommonService'te.
 * Controller değişmez; dış çağıran yok (admin AdminCollectionService kullanır).
 * DI grafı asiklik: sub → common, crud → cover, facade → {crud, cover, items,
 * social}; forwardRef yok.
 */
@Injectable()
export class CollectionService {
  private readonly logger = new Logger(CollectionService.name);

  constructor(
    private readonly crud: CollectionCrudService,
    private readonly cover: CollectionCoverService,
    private readonly items: CollectionItemsService,
    private readonly social: CollectionSocialService,
  ) {}

  // ==========================================================================
  // CREATE COLLECTION (delegate → CollectionCrudService)
  // ==========================================================================
  async createCollection(
    userId: string,
    dto: CreateCollectionDto,
  ): Promise<CollectionResponseDto> {
    return this.crud.createCollection(userId, dto);
  }

  // ==========================================================================
  // GET COLLECTION BY ID (delegate → CollectionCrudService)
  // ==========================================================================
  async getCollectionById(
    collectionId: string,
    viewerId?: string,
  ): Promise<CollectionResponseDto> {
    return this.crud.getCollectionById(collectionId, viewerId);
  }

  // ==========================================================================
  // GET COLLECTION BY SLUG (delegate → CollectionCrudService)
  // ==========================================================================
  async getCollectionBySlug(
    slug: string,
    viewerId?: string,
  ): Promise<CollectionResponseDto> {
    return this.crud.getCollectionBySlug(slug, viewerId);
  }

  // ==========================================================================
  // GET USER COLLECTIONS (delegate → CollectionCrudService)
  // ==========================================================================
  async getUserCollections(
    userId: string,
    viewerId?: string,
    page?: number,
    pageSize?: number,
  ): Promise<CollectionListResponseDto> {
    return this.crud.getUserCollections(userId, viewerId, page, pageSize);
  }

  // ==========================================================================
  // BROWSE PUBLIC COLLECTIONS (delegate → CollectionCrudService)
  // ==========================================================================
  async browsePublicCollections(
    page?: number,
    pageSize?: number,
    sortBy: 'popular' | 'recent' | 'name' | 'items' | 'items_asc' | 'items_desc' = 'popular',
    search?: string,
    categoryId?: string,
    categorySlug?: string,
  ): Promise<CollectionListResponseDto> {
    return this.crud.browsePublicCollections(page, pageSize, sortBy, search, categoryId, categorySlug);
  }

  // ==========================================================================
  // UPDATE COLLECTION (delegate → CollectionCrudService)
  // ==========================================================================
  async updateCollection(
    collectionId: string,
    userId: string,
    dto: UpdateCollectionDto,
  ): Promise<CollectionResponseDto> {
    return this.crud.updateCollection(collectionId, userId, dto);
  }

  // ==========================================================================
  // UPDATE COLLECTION COVER IMAGE (delegate → CollectionCoverService)
  // ==========================================================================
  async updateCollectionCover(
    collectionId: string,
    userId: string,
    coverImageKey: string,
  ): Promise<CollectionResponseDto> {
    return this.cover.updateCollectionCover(collectionId, userId, coverImageKey);
  }

  // ==========================================================================
  // GENERATE COVER IMAGE FROM COLLECTION ITEMS (delegate → CollectionCoverService)
  // ==========================================================================
  async generateCoverImage(collectionId: string): Promise<string | null> {
    return this.cover.generateCoverImage(collectionId);
  }

  // ==========================================================================
  // DELETE COLLECTION (delegate → CollectionCrudService)
  // ==========================================================================
  async deleteCollection(collectionId: string, userId: string): Promise<void> {
    return this.crud.deleteCollection(collectionId, userId);
  }

  // ==========================================================================
  // ADD ITEM TO COLLECTION (delegate → CollectionItemsService)
  // ==========================================================================
  async addItemToCollection(
    collectionId: string,
    userId: string,
    dto: AddCollectionItemDto,
    imageUrl?: string,
  ): Promise<CollectionItemResponseDto> {
    return this.items.addItemToCollection(collectionId, userId, dto, imageUrl);
  }

  // ==========================================================================
  // REMOVE ITEM FROM COLLECTION (delegate → CollectionItemsService)
  // ==========================================================================
  async removeItemFromCollection(
    collectionId: string,
    itemId: string,
    userId: string,
  ): Promise<void> {
    return this.items.removeItemFromCollection(collectionId, itemId, userId);
  }

  // ==========================================================================
  // REORDER ITEMS (delegate → CollectionItemsService)
  // ==========================================================================
  async reorderItems(
    collectionId: string,
    userId: string,
    dto: ReorderCollectionItemsDto,
  ): Promise<void> {
    return this.items.reorderItems(collectionId, userId, dto);
  }

  // ==========================================================================
  // LIKE COLLECTION (delegate → CollectionSocialService)
  // ==========================================================================
  async likeCollection(idOrSlug: string, userId: string): Promise<{ liked: boolean; likeCount: number }> {
    return this.social.likeCollection(idOrSlug, userId);
  }

  // ==========================================================================
  // UNLIKE COLLECTION (delegate → CollectionSocialService)
  // ==========================================================================
  async unlikeCollection(idOrSlug: string, userId: string): Promise<{ liked: boolean; likeCount: number }> {
    return this.social.unlikeCollection(idOrSlug, userId);
  }

  // ==========================================================================
  // GET LIKED COLLECTIONS (delegate → CollectionSocialService)
  // ==========================================================================
  async getLikedCollections(
    userId: string,
    page: number = 1,
    pageSize: number = 20,
  ): Promise<CollectionListResponseDto> {
    return this.social.getLikedCollections(userId, page, pageSize);
  }
}
