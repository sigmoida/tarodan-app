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

/**
 * CollectionItemsService — koleksiyon öğesi işlemleri: addItemToCollection,
 * removeItemFromCollection, reorderItems. Öğe→DTO eşlemesi için common'a delege
 * eder (this.common.mapItemToDto).
 */
@Injectable()
export class CollectionItemsService {
  private readonly logger = new Logger(CollectionItemsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly common: CollectionCommonService,
  ) {}

  // ==========================================================================
  // ADD ITEM TO COLLECTION
  // ==========================================================================
  async addItemToCollection(
    collectionId: string,
    userId: string,
    dto: AddCollectionItemDto,
    imageUrl?: string,
  ): Promise<CollectionItemResponseDto> {
    const collection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
    });

    if (!collection) {
      throw new NotFoundException("Koleksiyon bulunamadı");
    }

    if (collection.userId !== userId) {
      throw new ForbiddenException("Bu koleksiyona ekleme yetkiniz yok");
    }

    // Validate: either productId or customTitle must be provided
    if (!dto.productId && !dto.customTitle) {
      throw new BadRequestException(
        "Ürün ID veya custom ürün bilgileri gerekli",
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
        throw new NotFoundException("Ürün bulunamadı");
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
        throw new BadRequestException("Ürün zaten koleksiyonda");
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
          throw new BadRequestException("Ürün zaten koleksiyonda");
        }
        throw e;
      }

      return await this.common.mapItemToDto(item);
    }

    // Custom product logic
    // Validate customTitle is required for custom products
    if (!dto.customTitle || dto.customTitle.trim().length === 0) {
      throw new BadRequestException("Custom ürün için isim zorunludur");
    }

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
        customImageUrl: imageUrl || dto.customImageUrl,
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
    const collection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
    });

    if (!collection) {
      throw new NotFoundException("Koleksiyon bulunamadı");
    }

    if (collection.userId !== userId) {
      throw new ForbiddenException("Bu koleksiyondan silme yetkiniz yok");
    }

    const item = await this.prisma.collectionItem.findFirst({
      where: { id: itemId, collectionId },
    });

    if (!item) {
      throw new NotFoundException("Koleksiyon öğesi bulunamadı");
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
    const collection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
    });

    if (!collection) {
      throw new NotFoundException("Koleksiyon bulunamadı");
    }

    if (collection.userId !== userId) {
      throw new ForbiddenException("Bu koleksiyonu düzenleme yetkiniz yok");
    }

    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.collectionItem.update({
          where: { id: item.itemId },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );
  }
}
