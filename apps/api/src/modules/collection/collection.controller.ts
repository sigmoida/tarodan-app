import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Request,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { CollectionService } from './collection.service';
import {
  CreateCollectionDto,
  UpdateCollectionDto,
  AddCollectionItemDto,
  ReorderCollectionItemsDto,
  CollectionResponseDto,
  CollectionListResponseDto,
  CollectionItemResponseDto,
} from './dto';
import { Public } from '../auth/decorators/public.decorator';

@Controller('collections')
export class CollectionController {
  constructor(private readonly collectionService: CollectionService) {}

  /**
   * Create a new collection
   * POST /collections
   */
  @Post()
  async createCollection(
    @Request() req: any,
    @Body() dto: CreateCollectionDto,
  ): Promise<CollectionResponseDto> {
    return this.collectionService.createCollection(req.user.id, dto);
  }

  /**
   * Browse public collections (public)
   * GET /collections/browse
   */
  @Public()
  @Get('browse')
  async browsePublicCollections(
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('sortBy') sortBy?: 'popular' | 'recent' | 'name' | 'items' | 'items_asc' | 'items_desc',
    @Query('search') search?: string,
  ): Promise<CollectionListResponseDto> {
    return this.collectionService.browsePublicCollections(
      page,
      pageSize,
      sortBy,
      search,
    );
  }

  /**
   * Get my collections
   * GET /collections/me
   */
  @Get('me')
  async getMyCollections(
    @Request() req: any,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ): Promise<CollectionListResponseDto> {
    return this.collectionService.getUserCollections(
      req.user.id,
      req.user.id,
      page,
      pageSize,
    );
  }

  /**
   * Get liked collections
   * GET /collections/liked
   */
  @Get('liked')
  async getLikedCollections(
    @Request() req: any,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ): Promise<CollectionListResponseDto> {
    return this.collectionService.getLikedCollections(
      req.user.id,
      page,
      pageSize,
    );
  }

  /**
   * Get user's collections (public)
   * GET /collections/user/:userId
   */
  @Public()
  @Get('user/:userId')
  async getUserCollections(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Request() req: any,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ): Promise<CollectionListResponseDto> {
    return this.collectionService.getUserCollections(
      userId,
      req.user?.id,
      page,
      pageSize,
    );
  }

  /**
   * Get collection by slug (public for public collections)
   * GET /collections/slug/:slug
   */
  @Public()
  @Get('slug/:slug')
  async getCollectionBySlug(
    @Param('slug') slug: string,
    @Request() req: any,
  ): Promise<CollectionResponseDto> {
    return this.collectionService.getCollectionBySlug(slug, req.user?.id);
  }

  /**
   * Like a collection
   * POST /collections/:id/like
   * Accepts both UUID and slug
   * MUST be before @Get(':id') to avoid route conflicts
   */
  @Post(':id/like')
  @HttpCode(HttpStatus.OK)
  async likeCollection(
    @Param('id') idOrSlug: string,
    @Request() req: any,
  ): Promise<{ liked: boolean; likeCount: number }> {
    if (!req.user || !req.user.id) {
      throw new BadRequestException('Kullanıcı kimlik doğrulaması gerekli');
    }
    try {
      return await this.collectionService.likeCollection(idOrSlug, req.user.id);
    } catch (error) {
      console.error('Error in likeCollection controller:', error);
      throw error;
    }
  }

  /**
   * Unlike a collection
   * DELETE /collections/:id/like
   * Accepts both UUID and slug
   */
  @Delete(':id/like')
  @HttpCode(HttpStatus.OK)
  async unlikeCollection(
    @Param('id') idOrSlug: string,
    @Request() req: any,
  ): Promise<{ liked: boolean; likeCount: number }> {
    if (!req.user || !req.user.id) {
      throw new BadRequestException('Kullanıcı kimlik doğrulaması gerekli');
    }
    try {
      return await this.collectionService.unlikeCollection(idOrSlug, req.user.id);
    } catch (error) {
      console.error('Error in unlikeCollection controller:', error);
      throw error;
    }
  }

  /**
   * Get collection by ID (public for public collections)
   * GET /collections/:id
   * Accepts UUID, collection- prefixed ID, or slug
   */
  @Public()
  @Get(':id')
  async getCollectionById(
    @Param('id') idOrSlug: string,
    @Request() req: any,
  ): Promise<CollectionResponseDto> {
    // Check if it's a UUID
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
    // Check if it's a collection- prefixed ID (from seed data)
    const isCollectionId = idOrSlug.startsWith('collection-');
    
    if (isUUID || isCollectionId) {
      return this.collectionService.getCollectionById(idOrSlug, req.user?.id);
    } else {
      return this.collectionService.getCollectionBySlug(idOrSlug, req.user?.id);
    }
  }

  /**
   * Update collection
   * PATCH /collections/:id
   */
  @Patch(':id')
  async updateCollection(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
    @Body() dto: UpdateCollectionDto,
  ): Promise<CollectionResponseDto> {
    return this.collectionService.updateCollection(id, req.user.id, dto);
  }

  /**
   * Delete collection
   * DELETE /collections/:id
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCollection(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
  ): Promise<void> {
    return this.collectionService.deleteCollection(id, req.user.id);
  }

  /**
   * Add item to collection
   * POST /collections/:id/items
   */
  @Post(':id/items')
  async addItemToCollection(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
    @Body() dto: AddCollectionItemDto,
  ): Promise<CollectionItemResponseDto> {
    return this.collectionService.addItemToCollection(id, req.user.id, dto);
  }

  /**
   * Remove item from collection
   * DELETE /collections/:id/items/:itemId
   */
  @Delete(':id/items/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeItemFromCollection(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Request() req: any,
  ): Promise<void> {
    return this.collectionService.removeItemFromCollection(
      id,
      itemId,
      req.user.id,
    );
  }

  /**
   * Reorder collection items
   * POST /collections/:id/reorder
   */
  @Post(':id/reorder')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reorderItems(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
    @Body() dto: ReorderCollectionItemsDto,
  ): Promise<void> {
    return this.collectionService.reorderItems(id, req.user.id, dto);
  }

}
