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
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CollectionService } from './collection.service';
import { MediaService } from '../media/media.service';
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
  constructor(
    private readonly collectionService: CollectionService,
    private readonly mediaService: MediaService,
  ) {}

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
  @HttpCode(HttpStatus.OK)
  async getLikedCollections(
    @Request() req: any,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ): Promise<CollectionListResponseDto> {
    // Force no caching
    req.res?.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    req.res?.setHeader('Pragma', 'no-cache');
    req.res?.setHeader('Expires', '0');
    
    console.log('\n=== LIKED COLLECTIONS REQUEST ===');
    console.log('User:', req.user?.id, req.user?.email);
    
    if (!req.user || !req.user.id) {
      console.error('[getLikedCollections] NOT AUTHENTICATED');
      return { collections: [], total: 0, page: page || 1, pageSize: pageSize || 20 };
    }
    
    try {
      const result = await this.collectionService.getLikedCollections(req.user.id, page, pageSize);
      console.log(`[getLikedCollections] Found ${result.collections.length} collections for user ${req.user.id}`);
      return result;
    } catch (error) {
      console.error('[getLikedCollections] Error:', error);
      return { collections: [], total: 0, page: page || 1, pageSize: pageSize || 20 };
    }
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
    console.log(`[likeCollection] Request: idOrSlug=${idOrSlug}, userId=${req.user?.id}`);
    
    if (!req.user || !req.user.id) {
      throw new BadRequestException('Kullanıcı kimlik doğrulaması gerekli');
    }
    try {
      const result = await this.collectionService.likeCollection(idOrSlug, req.user.id);
      console.log(`[likeCollection] Result: liked=${result.liked}, likeCount=${result.likeCount}`);
      return result;
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
   * Supports both regular products (productId) and custom products (customTitle + other fields)
   * For custom products, image file can be uploaded
   */
  @Post(':id/items')
  @UseInterceptors(FileInterceptor('image'))
  async addItemToCollection(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
    @Body() dto: AddCollectionItemDto,
    @UploadedFile() imageFile?: Express.Multer.File,
  ): Promise<CollectionItemResponseDto> {
    let imageUrl: string | undefined;

    // If image file is provided, upload it
    if (imageFile) {
      try {
        const uploadResult = await this.mediaService.upload(imageFile, {
          folder: 'collection-items',
          resize: { width: 800, height: 800, fit: 'cover' },
        });
        imageUrl = uploadResult.url;
      } catch (error: any) {
        throw new BadRequestException('Resim yükleme başarısız: ' + (error.message || 'Bilinmeyen hata'));
      }
    }

    return this.collectionService.addItemToCollection(id, req.user.id, dto, imageUrl);
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

  /**
   * Update collection cover image
   * PATCH /collections/:id/cover
   */
  @Patch(':id/cover')
  @UseInterceptors(FileInterceptor('cover'))
  async updateCollectionCover(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
    @UploadedFile() coverFile?: Express.Multer.File,
  ): Promise<CollectionResponseDto> {
    if (!coverFile) {
      throw new BadRequestException('Kapak resmi gerekli');
    }

    let coverImageUrl: string;
    try {
      const uploadResult = await this.mediaService.upload(coverFile, {
        folder: 'collection-covers',
        resize: { width: 1200, height: 600, fit: 'cover' },
      });
      coverImageUrl = uploadResult.url;
    } catch (error: any) {
      throw new BadRequestException('Kapak resmi yükleme başarısız: ' + (error.message || 'Bilinmeyen hata'));
    }

    return this.collectionService.updateCollectionCover(id, req.user.id, coverImageUrl);
  }

}
