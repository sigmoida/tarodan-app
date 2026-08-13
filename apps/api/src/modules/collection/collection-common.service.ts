import { Injectable, Logger } from "@nestjs/common";
import { StorageService } from "../storage/storage.service";
import { CollectionResponseDto, CollectionItemResponseDto } from "./dto";
import { ProductKind } from "@prisma/client";
import { publicName } from "../../common/helpers/public-identity";

/**
 * CollectionCommonService — koleksiyon alt servislerinin paylaştığı DTO/eşleme
 * yardımcıları. mapCollectionToDto crud/cover/social taraflarınca, mapItemToDto
 * items tarafınca (ve mapCollectionToDto içinden) kullanılır; bu yüzden ikisi de
 * public'e çekildi. Alt servisler this.common.* üzerinden erişir.
 */
@Injectable()
export class CollectionCommonService {
  private readonly logger = new Logger(CollectionCommonService.name);

  constructor(private readonly storageService: StorageService) {}

  async mapCollectionToDto(
    collection: any,
    isLiked?: boolean,
  ): Promise<CollectionResponseDto> {
    const resolvedCoverUrl = collection.coverImageKey
      ? this.storageService.getPublicAssetUrl(collection.coverImageKey)
      : undefined;

    // Filter out products that are not active or sold
    const activeItems =
      collection.items && Array.isArray(collection.items)
        ? collection.items.filter((item: any) => {
            if (!item.productId) return true;
            const status = item.product?.status;
            return (
              item.product?.kind === ProductKind.listing &&
              (status === "active" || status === "sold")
            );
          })
        : [];

    const mappedItems = (
      await Promise.all(
        activeItems.map(async (item: any) => {
          try {
            return await this.mapItemToDto(item);
          } catch (itemError) {
            this.logger.warn("mapCollectionToDto: error mapping item");
            return null;
          }
        }),
      )
    ).filter((item: any) => item !== null);

    return {
      id: collection.id,
      userId: collection.userId,
      userName: publicName(collection.user),
      categoryId: collection.categoryId ?? undefined,
      category: collection.category
        ? {
            id: collection.category.id,
            name: collection.category.name,
            slug: collection.category.slug,
          }
        : undefined,
      name: collection.name,
      slug: collection.slug,
      description: collection.description || undefined,
      coverImageUrl: resolvedCoverUrl,
      isPublic: collection.isPublic,
      viewCount: collection.viewCount ?? 0,
      likeCount: collection.likeCount ?? 0,
      itemCount: mappedItems.length,
      items: mappedItems,
      isLiked: isLiked ?? false,
      createdAt: collection.createdAt,
      updatedAt: collection.updatedAt,
    };
  }

  async mapItemToDto(item: any): Promise<CollectionItemResponseDto> {
    try {
      // Check if this is a custom product (no productId)
      if (!item.productId) {
        // Custom product
        return {
          id: item.id || "",
          productId: undefined,
          productTitle: item.customTitle || "İsimsiz Ürün",
          productImage: item.customImageUrl || undefined,
          productPrice: undefined,
          sortOrder: item.sortOrder || 0,
          isFeatured: item.isFeatured || false,
          addedAt: item.addedAt || new Date(),
          isCustom: true,
          customTitle: item.customTitle,
          customDescription: item.customDescription,
          customBrand: item.customBrand,
          customModel: item.customModel,
          customYear: item.customYear,
          customScale: item.customScale,
          customManufacturer: item.customManufacturer,
          customMaterial: item.customMaterial,
          customImageUrl: item.customImageUrl,
        };
      }

      // Regular product
      if (!item || !item.product) {
        // Product was deleted or item is invalid, return minimal data
        return {
          id: item?.id || "",
          productId: item?.productId || "",
          productTitle: "Ürün bulunamadı",
          productImage: undefined,
          productPrice: 0,
          sortOrder: item?.sortOrder || 0,
          isFeatured: item?.isFeatured || false,
          addedAt: item?.addedAt || new Date(),
          isCustom: false,
        };
      }

      const product = item.product;
      // Safely access images array - handle both array and null/undefined
      let firstImage = null;
      if (product) {
        if (
          product.images &&
          Array.isArray(product.images) &&
          product.images.length > 0
        ) {
          firstImage = product.images[0];
        }
      }

      const boostedUntil = (product as any).boostedUntil
        ? new Date((product as any).boostedUntil)
        : null;
      const isBoosted =
        boostedUntil != null && boostedUntil.getTime() > Date.now();

      return {
        id: item.id || "",
        productId: product.id || "",
        productTitle: product.title || "İsimsiz Ürün",
        productImage: firstImage?.cardKey
          ? this.storageService.getPublicAssetUrl(firstImage.cardKey)
          : undefined,
        productPrice: product.price ? parseFloat(String(product.price)) : 0,
        productStatus: (product as any).status ?? "active",
        sortOrder: item.sortOrder || 0,
        isFeatured: item.isFeatured || false,
        isBoosted,
        addedAt: item.addedAt || new Date(),
        isCustom: false,
      };
    } catch (error) {
      this.logger.warn("mapItemToDto: error mapping collection item");
      // Return safe fallback
      return {
        id: item?.id || "",
        productId: item?.productId || undefined,
        productTitle: item?.customTitle || "Hata: Ürün bilgisi yüklenemedi",
        productImage: item?.customImageUrl || undefined,
        productPrice: undefined,
        sortOrder: item?.sortOrder || 0,
        isFeatured: item?.isFeatured || false,
        addedAt: item?.addedAt || new Date(),
        isCustom: !item?.productId,
        customTitle: item?.customTitle,
        customDescription: item?.customDescription,
        customBrand: item?.customBrand,
        customModel: item?.customModel,
        customYear: item?.customYear,
        customScale: item?.customScale,
        customManufacturer: item?.customManufacturer,
        customMaterial: item?.customMaterial,
        customImageUrl: item?.customImageUrl,
      };
    }
  }
}
