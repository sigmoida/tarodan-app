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
  Logger,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { UPLOAD_MULTER_OPTIONS } from "../../common/upload/multer-options";
import { CollectionService } from "./collection.service";
import { MediaService } from "../media/media.service";
import { ModerationAiClient } from "../moderation/moderation-ai.client";
import {
  CreateCollectionDto,
  UpdateCollectionDto,
  AddCollectionItemDto,
  ReorderCollectionItemsDto,
  CollectionResponseDto,
  CollectionListResponseDto,
  CollectionItemResponseDto,
} from "./dto";
import { Public } from "../auth/decorators/public.decorator";
import { errorStack } from "../../common/helpers/error-message";
import { i18nMessage } from "../i18n";
import { UuidParam } from "../../common/pipes/uuid-param.decorator";
import { resolveUploadTarget } from "../media/helpers/upload-target";
import type { Response } from "express";
import type { RequestUser } from "../auth/interfaces/jwt-payload.interface";

/** A request behind the JWT guard: the user is always set. */
type AuthenticatedRequest = { user: Pick<RequestUser, "id"> };
/** A `@Public()` request: the user is set only when a valid token came along. */
type OptionalUserRequest = { user?: Pick<RequestUser, "id"> };

@Controller("collections")
export class CollectionController {
  private readonly logger = new Logger(CollectionController.name);

  constructor(
    private readonly collectionService: CollectionService,
    private readonly mediaService: MediaService,
    private readonly moderationAi: ModerationAiClient,
  ) {}

  /**
   * Create a new collection
   * POST /collections
   */
  @Post()
  async createCollection(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateCollectionDto,
  ): Promise<CollectionResponseDto> {
    return this.collectionService.createCollection(req.user.id, dto);
  }

  /**
   * Browse public collections (public)
   * GET /collections/browse
   */
  @Public()
  @Get("browse")
  async browsePublicCollections(
    @Query("page") page?: number,
    @Query("pageSize") pageSize?: number,
    @Query("sortBy")
    sortBy?:
      "popular" | "recent" | "name" | "items" | "items_asc" | "items_desc",
    @Query("search") search?: string,
    @Query("categoryId") categoryId?: string,
    @Query("category") category?: string,
    @Request() req?: OptionalUserRequest,
  ): Promise<CollectionListResponseDto> {
    return this.collectionService.browsePublicCollections(
      page,
      pageSize,
      sortBy,
      search,
      categoryId,
      category,
      req?.user?.id,
    );
  }

  /**
   * Get my collections
   * GET /collections/me
   */
  @Get("me")
  async getMyCollections(
    @Request() req: AuthenticatedRequest,
    @Query("page") page?: number,
    @Query("pageSize") pageSize?: number,
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
  @Get("liked")
  @HttpCode(HttpStatus.OK)
  async getLikedCollections(
    @Request() req: OptionalUserRequest & { res?: Response },
    @Query("page") page?: number | string,
    @Query("pageSize") pageSize?: number | string,
  ): Promise<CollectionListResponseDto> {
    // Force no caching
    req.res?.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    req.res?.setHeader("Pragma", "no-cache");
    req.res?.setHeader("Expires", "0");

    if (!req.user || !req.user.id) {
      return { collections: [], total: 0, page: 1, pageSize: 20 };
    }

    // Parse and validate page and pageSize parameters
    const parsedPage = page ? parseInt(String(page), 10) : 1;
    const parsedPageSize = pageSize ? parseInt(String(pageSize), 10) : 20;
    const validPage = isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;
    const validPageSize =
      isNaN(parsedPageSize) || parsedPageSize < 1
        ? 20
        : Math.min(parsedPageSize, 100); // Max 100 items per page

    try {
      return await this.collectionService.getLikedCollections(
        req.user.id,
        validPage,
        validPageSize,
      );
    } catch (error) {
      this.logger.error("getLikedCollections failed");
      return {
        collections: [],
        total: 0,
        page: validPage,
        pageSize: validPageSize,
      };
    }
  }

  /**
   * Get user's collections (public)
   * GET /collections/user/:userId
   */
  @Public()
  @Get("user/:userId")
  async getUserCollections(
    @Param("userId", ParseUUIDPipe) userId: string,
    @Request() req: OptionalUserRequest,
    @Query("page") page?: number,
    @Query("pageSize") pageSize?: number,
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
  @Get("slug/:slug")
  async getCollectionBySlug(
    @Param("slug") slug: string,
    @Request() req: OptionalUserRequest,
  ): Promise<CollectionResponseDto> {
    return this.collectionService.getCollectionBySlug(slug, req.user?.id);
  }

  /**
   * Like a collection
   * POST /collections/:id/like
   * Accepts both UUID and slug
   * MUST be before @Get(':id') to avoid route conflicts
   */
  @Post(":id/like")
  @HttpCode(HttpStatus.OK)
  async likeCollection(
    @Param("id") idOrSlug: string,
    @Request() req: OptionalUserRequest,
  ): Promise<{ liked: boolean; likeCount: number }> {
    if (!req.user || !req.user.id) {
      throw new BadRequestException(
        i18nMessage("server.collection.authRequired"),
      );
    }
    try {
      return await this.collectionService.likeCollection(idOrSlug, req.user.id);
    } catch (error) {
      this.logger.error("likeCollection failed");
      throw error;
    }
  }

  /**
   * Unlike a collection
   * DELETE /collections/:id/like
   * Accepts both UUID and slug
   */
  @Delete(":id/like")
  @HttpCode(HttpStatus.OK)
  async unlikeCollection(
    @Param("id") idOrSlug: string,
    @Request() req: OptionalUserRequest,
  ): Promise<{ liked: boolean; likeCount: number }> {
    if (!req.user || !req.user.id) {
      throw new BadRequestException(
        i18nMessage("server.collection.authRequired"),
      );
    }
    try {
      return await this.collectionService.unlikeCollection(
        idOrSlug,
        req.user.id,
      );
    } catch (error) {
      this.logger.error("unlikeCollection failed");
      throw error;
    }
  }

  /**
   * Get collection by ID (public for public collections)
   * GET /collections/:id
   * Accepts UUID or slug
   */
  @Public()
  @Get(":id")
  async getCollectionById(
    @Param("id") idOrSlug: string,
    @Request() req: OptionalUserRequest,
  ): Promise<CollectionResponseDto> {
    const isUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        idOrSlug,
      );
    if (isUUID) {
      return this.collectionService.getCollectionById(idOrSlug, req.user?.id);
    }
    return this.collectionService.getCollectionBySlug(idOrSlug, req.user?.id);
  }

  /**
   * Update collection
   * PATCH /collections/:id
   */
  @Patch(":id")
  async updateCollection(
    @UuidParam("id") id: string,
    @Request() req: AuthenticatedRequest,
    @Body() dto: UpdateCollectionDto,
  ): Promise<CollectionResponseDto> {
    return this.collectionService.updateCollection(id, req.user.id, dto);
  }

  /**
   * Delete collection
   * DELETE /collections/:id
   */
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCollection(
    @UuidParam("id") id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<void> {
    return this.collectionService.deleteCollection(id, req.user.id);
  }

  /**
   * Add item to collection
   * POST /collections/:id/items
   * Supports both regular products (productId) and custom products (customTitle + other fields)
   * For custom products, image file can be uploaded
   */
  @Post(":id/items")
  @UseInterceptors(FileInterceptor("image", UPLOAD_MULTER_OPTIONS))
  async addItemToCollection(
    @UuidParam("id") id: string,
    @Request() req: AuthenticatedRequest,
    @Body() dto: AddCollectionItemDto,
    @UploadedFile() imageFile?: Express.Multer.File,
  ): Promise<CollectionItemResponseDto> {
    let imageUrl: string | undefined;

    // A multipart image is stored only for a custom item the caller may add;
    // the permission is checked first so a refused request uploads nothing.
    // Sent with a productId, the image is ignored, as before.
    if (imageFile && !dto.productId) {
      await this.collectionService.assertCanEditItems(id, req.user.id);
      await this.moderationAi.assertImageClean(imageFile, {
        entityType: "collection",
        entityId: id,
        userId: req.user?.id,
        field: "item",
      });
      // Same target as `POST /media/upload?folder=collections`: the collections
      // bucket is public, so the stored URL is the permanent public URL (a
      // presigned one expired after 7 days).
      const target = resolveUploadTarget("collections", req.user.id);
      try {
        const uploadResult = await this.mediaService.upload(
          imageFile,
          {
            folder: target.folder,
            bucket: target.bucket,
            resize: { width: 800, height: 800, fit: "cover" },
          },
          req.user.id,
        );
        imageUrl = uploadResult.url;
      } catch (error) {
        this.logger.error(
          `Collection item image upload failed for collection id=${id}`,
          errorStack(error),
        );
        throw new BadRequestException(
          i18nMessage("server.collection.imageUploadFailed"),
        );
      }
      if (!imageUrl) {
        this.logger.error(
          `Collection item image upload returned no URL for collection id=${id}`,
        );
        throw new BadRequestException(
          i18nMessage("server.collection.imageUploadFailed"),
        );
      }
    }

    return this.collectionService.addItemToCollection(
      id,
      req.user.id,
      dto,
      imageUrl,
    );
  }

  /**
   * Remove item from collection
   * DELETE /collections/:id/items/:itemId
   */
  @Delete(":id/items/:itemId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeItemFromCollection(
    @UuidParam("id") id: string,
    @Param("itemId", ParseUUIDPipe) itemId: string,
    @Request() req: AuthenticatedRequest,
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
  @Post(":id/reorder")
  @HttpCode(HttpStatus.NO_CONTENT)
  async reorderItems(
    @UuidParam("id") id: string,
    @Request() req: AuthenticatedRequest,
    @Body() dto: ReorderCollectionItemsDto,
  ): Promise<void> {
    return this.collectionService.reorderItems(id, req.user.id, dto);
  }

  /**
   * Update collection cover image
   * PATCH /collections/:id/cover
   */
  @Patch(":id/cover")
  @UseInterceptors(FileInterceptor("cover", UPLOAD_MULTER_OPTIONS))
  async updateCollectionCover(
    @UuidParam("id") id: string,
    @Request() req: AuthenticatedRequest,
    @UploadedFile() coverFile?: Express.Multer.File,
  ): Promise<CollectionResponseDto> {
    if (!coverFile) {
      throw new BadRequestException("Kapak resmi gerekli");
    }

    await this.moderationAi.assertImageClean(coverFile, {
      entityType: "collection",
      entityId: id,
      userId: req.user?.id,
      field: "cover",
    });

    const uploadResult =
      await this.mediaService.uploadCollectionCover(coverFile);
    return this.collectionService.updateCollectionCover(
      id,
      req.user.id,
      uploadResult.key,
    );
  }
}
