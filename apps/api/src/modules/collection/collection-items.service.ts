import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { Prisma } from "@prisma/client";
import {
  AddCollectionItemDto,
  ReorderCollectionItemsDto,
  CollectionItemResponseDto,
} from "./dto";
import { CollectionCommonService } from "./collection-common.service";
import { catalogProductWhere } from "../product/helpers/catalog-product-where";
import { StorageService } from "../storage/storage.service";
import { resolveUploadTarget } from "../media/helpers/upload-target";
import { i18nMessage } from "../i18n";

/**
 * CollectionItemsService: collection item operations (addItemToCollection,
 * removeItemFromCollection, reorderItems). Item-to-DTO mapping is delegated to
 * the common service (this.common.mapItemToDto).
 */
@Injectable()
export class CollectionItemsService {
  private readonly logger = new Logger(CollectionItemsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly common: CollectionCommonService,
    private readonly storage: StorageService,
  ) {}

  /**
   * 404 when the collection does not exist, 403 when the caller is not its
   * owner. Every item write checks this first; the controller also calls it
   * before storing a multipart image, so a request that will be refused
   * uploads nothing.
   */
  async assertCanEditItems(
    collectionId: string,
    userId: string,
  ): Promise<void> {
    const collection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
      select: { userId: true },
    });

    if (!collection) {
      throw new NotFoundException(i18nMessage("server.collection.notFound"));
    }

    if (collection.userId !== userId) {
      throw new ForbiddenException(
        i18nMessage("server.collection.editForbidden"),
      );
    }
  }

  // ==========================================================================
  // ADD ITEM TO COLLECTION
  // ==========================================================================
  async addItemToCollection(
    collectionId: string,
    userId: string,
    dto: AddCollectionItemDto,
    imageUrl?: string,
  ): Promise<CollectionItemResponseDto> {
    await this.assertCanEditItems(collectionId, userId);

    // Validate: either productId or customTitle must be provided
    if (!dto.productId && !dto.customTitle) {
      throw new BadRequestException(
        i18nMessage("server.collection.productOrCustomRequired"),
      );
    }

    // If productId is provided, use existing product logic
    if (dto.productId) {
      // Verify product exists
      const product = await this.prisma.product.findFirst({
        where: { id: dto.productId, ...catalogProductWhere() },
        include: { images: { take: 1 } },
      });

      if (!product) {
        throw new NotFoundException(
          i18nMessage("server.offer.productNotFound"),
        );
      }

      // Check if already in collection
      const existing = await this.prisma.collectionItem.findUnique({
        where: {
          collectionId_productId: {
            collectionId,
            productId: dto.productId,
          },
        },
      });

      if (existing) {
        throw new BadRequestException(
          i18nMessage("server.collection.itemAlreadyAdded"),
        );
      }

      // Get max sort order
      const maxSort = await this.prisma.collectionItem.aggregate({
        where: { collectionId },
        _max: { sortOrder: true },
      });

      let item;
      try {
        item = await this.prisma.collectionItem.create({
          data: {
            collectionId,
            productId: dto.productId,
            sortOrder: dto.sortOrder ?? (maxSort._max.sortOrder ?? 0) + 1,
            isFeatured: dto.isFeatured ?? false,
          },
          include: {
            product: {
              include: { images: { take: 1 } },
            },
          },
        });
      } catch (e) {
        // Eşzamanlı istekler existence kontrolünü birlikte geçebilir; unique
        // ihlalini (collectionId, productId) 500 yerine aynı 400'e çevir.
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === "P2002"
        ) {
          throw new BadRequestException(
            i18nMessage("server.collection.itemAlreadyAdded"),
          );
        }
        throw e;
      }

      return await this.common.mapItemToDto(item);
    }

    // Custom product logic
    // Validate customTitle is required for custom products
    if (!dto.customTitle || dto.customTitle.trim().length === 0) {
      throw new BadRequestException(
        i18nMessage("server.collection.customNameRequired"),
      );
    }

    // Checked before any write: a refused image stores nothing.
    const customImageUrl = this.ownCollectionImageUrl(
      imageUrl ?? dto.customImageUrl,
      userId,
    );

    // Get max sort order
    const maxSort = await this.prisma.collectionItem.aggregate({
      where: { collectionId },
      _max: { sortOrder: true },
    });

    const item = await this.prisma.collectionItem.create({
      data: {
        collectionId,
        productId: null,
        customTitle: dto.customTitle,
        customDescription: dto.customDescription,
        customBrand: dto.customBrand,
        customModel: dto.customModel,
        customYear: dto.customYear,
        customScale: dto.customScale,
        customManufacturer: dto.customManufacturer,
        customMaterial: dto.customMaterial,
        customImageUrl,
        sortOrder: dto.sortOrder ?? (maxSort._max.sortOrder ?? 0) + 1,
        isFeatured: dto.isFeatured ?? false,
      },
    });

    return await this.common.mapItemToDto(item);
  }

  // ==========================================================================
  // REMOVE ITEM FROM COLLECTION
  // ==========================================================================
  async removeItemFromCollection(
    collectionId: string,
    itemId: string,
    userId: string,
  ): Promise<void> {
    await this.assertCanEditItems(collectionId, userId);

    const item = await this.prisma.collectionItem.findFirst({
      where: { id: itemId, collectionId },
    });

    if (!item) {
      throw new NotFoundException(
        i18nMessage("server.collection.itemNotFound"),
      );
    }

    await this.prisma.collectionItem.delete({
      where: { id: itemId },
    });
  }

  // ==========================================================================
  // REORDER ITEMS
  // ==========================================================================
  async reorderItems(
    collectionId: string,
    userId: string,
    dto: ReorderCollectionItemsDto,
  ): Promise<void> {
    await this.assertCanEditItems(collectionId, userId);

    // Every update is scoped to this collection. One id that is not an item of
    // it (another collection's item, a deleted one) fails the whole request
    // with 404 and the transaction rolls back, so nothing is reordered.
    await this.prisma.$transaction(async (tx) => {
      for (const item of dto.items) {
        const { count } = await tx.collectionItem.updateMany({
          where: { id: item.itemId, collectionId },
          data: { sortOrder: item.sortOrder },
        });
        if (count === 0) {
          throw new NotFoundException(
            i18nMessage("server.collection.itemNotFound"),
          );
        }
      }
    });
  }

  /**
   * The image URL to store on a custom item, or null for none. Only an image
   * the owner uploaded for collections is accepted: a URL on our own public
   * storage (`StorageService.ownPublicAssetKey`) whose key sits in the folder
   * `POST /media/upload?folder=collections` writes for this user (the
   * multipart `image` path writes there too). Anything else would be shown to
   * every viewer unmoderated and fetched by the cover generator, so it is
   * refused with 400. The canonical URL is rebuilt from the key.
   */
  private ownCollectionImageUrl(
    url: string | undefined,
    userId: string,
  ): string | null {
    if (url === undefined || url.trim() === "") return null;

    const target = resolveUploadTarget("collections", userId);
    const ownFolder = this.storage.objectKeyPrefix(
      target.bucket,
      target.folder,
    );
    const key = this.storage.ownPublicAssetKey(url);
    if (!key || !key.startsWith(ownFolder)) {
      this.logger.warn(
        `Refused customImageUrl for a collection item of user id=${userId}`,
      );
      throw new BadRequestException(
        i18nMessage("server.collection.invalidImageUrl"),
      );
    }
    return this.storage.getPublicAssetUrl(key);
  }
}
