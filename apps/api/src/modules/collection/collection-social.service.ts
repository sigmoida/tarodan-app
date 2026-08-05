import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { Prisma, ProductKind } from "@prisma/client";
import { CollectionListResponseDto } from "./dto";
import { NotificationService } from "../notification/notification.service";
import { NotificationType } from "../notification/dto";
import { CollectionCommonService } from "./collection-common.service";

// "Görünür" item filtresi: custom item'lar + ürünü active/sold olan item'lar.
// mapCollectionToDto'daki filtreyle birebir aynı semantik — liste ve detay
// endpoint'lerinin aynı itemCount'u dönmesi için tek kaynak.
const VISIBLE_ITEM_FILTER: Prisma.CollectionItemWhereInput = {
  OR: [
    { productId: null },
    {
      product: {
        kind: ProductKind.listing,
        status: { in: ["active", "sold"] },
      },
    },
  ],
};

/**
 * CollectionSocialService — beğeni/etkileşim işleri: likeCollection,
 * unlikeCollection, getLikedCollections. Beğeni bildirimi için notificationService,
 * koleksiyon→DTO eşlemesi için common (this.common.mapCollectionToDto).
 */
@Injectable()
export class CollectionSocialService {
  private readonly logger = new Logger(CollectionSocialService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly common: CollectionCommonService,
  ) {}

  // ==========================================================================
  // LIKE COLLECTION
  // ==========================================================================
  async likeCollection(
    idOrSlug: string,
    userId: string,
  ): Promise<{ liked: boolean; likeCount: number }> {
    const isUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        idOrSlug,
      );
    const isCollectionId = idOrSlug.startsWith("collection-");

    // Find collection by ID or slug
    let collection;
    try {
      if (isUUID || isCollectionId) {
        // Try to find by ID first
        collection = await this.prisma.collection.findUnique({
          where: { id: idOrSlug },
          select: {
            id: true,
            name: true,
            likeCount: true,
            isPublic: true,
            userId: true,
          },
        });

        // If not found and it's a collection- prefixed ID, try to find by slug (strip prefix)
        if (!collection && isCollectionId) {
          const slug = idOrSlug.replace("collection-", "");
          collection = await this.prisma.collection.findFirst({
            where: { slug },
            select: {
              id: true,
              name: true,
              likeCount: true,
              isPublic: true,
              userId: true,
            },
          });
        }
      } else {
        // For slug, we need to find by slug (slug is unique per user, not globally)
        // First try to find public collection with this slug
        collection = await this.prisma.collection.findFirst({
          where: { slug: idOrSlug, isPublic: true },
          select: {
            id: true,
            name: true,
            likeCount: true,
            isPublic: true,
            userId: true,
          },
        });

        // If not found and user is logged in, try to find user's own collection (even if private)
        if (!collection && userId) {
          collection = await this.prisma.collection.findFirst({
            where: { slug: idOrSlug, userId: userId },
            select: {
              id: true,
              name: true,
              likeCount: true,
              isPublic: true,
              userId: true,
            },
          });
        }

        // If still not found, try any collection (for cases where slug might match)
        if (!collection) {
          collection = await this.prisma.collection.findFirst({
            where: { slug: idOrSlug },
            select: {
              id: true,
              name: true,
              likeCount: true,
              isPublic: true,
              userId: true,
            },
          });
        }

        // If collection is private and user is not the owner, don't allow like
        if (
          collection &&
          !collection.isPublic &&
          collection.userId !== userId
        ) {
          throw new ForbiddenException("Bu koleksiyon özel");
        }
      }
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      this.logger.error("likeCollection: error finding collection");
      throw new NotFoundException("Koleksiyon bulunamadı");
    }

    if (!collection || !collection.id) {
      this.logger.warn("likeCollection: collection not found");
      throw new NotFoundException("Koleksiyon bulunamadı");
    }

    // Prevent users from liking their own collections
    if (collection.userId === userId) {
      throw new BadRequestException("Kendi koleksiyonunuzu beğenemezsiniz");
    }

    // Check if user already liked this collection
    // Use findFirst to avoid composite key issues
    let existingLike;
    try {
      existingLike = await this.prisma.collectionLike.findFirst({
        where: {
          collectionId: collection.id,
          userId: userId,
        },
      });
    } catch (findError) {
      this.logger.error("likeCollection: error finding existing like");
      throw findError;
    }

    let liked: boolean;
    let likeCount: number;

    try {
      if (existingLike) {
        await this.prisma.$transaction(async (tx) => {
          const likeToDelete = await tx.collectionLike.findFirst({
            where: {
              collectionId: collection.id,
              userId: userId,
            },
          });
          if (likeToDelete) {
            await tx.collectionLike.delete({
              where: { id: likeToDelete.id },
            });
          }
          await tx.collection.update({
            where: { id: collection.id },
            data: { likeCount: { decrement: 1 } },
          });
        });

        liked = false;
        likeCount = Math.max(0, (collection.likeCount || 0) - 1);
      } else {
        await this.prisma.$transaction(async (tx) => {
          const existing = await tx.collectionLike.findFirst({
            where: {
              collectionId: collection.id,
              userId: userId,
            },
          });
          if (!existing) {
            await tx.collectionLike.create({
              data: {
                collectionId: collection.id,
                userId: userId,
              },
            });
          }
          await tx.collection.update({
            where: { id: collection.id },
            data: { likeCount: { increment: 1 } },
          });
        });

        liked = true;
        likeCount = (collection.likeCount || 0) + 1;

        // Send notification to collection owner
        try {
          const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { displayName: true },
          });

          await this.notificationService.createInAppNotification(
            collection.userId,
            NotificationType.COLLECTION_LIKED,
            {
              collectionId: collection.id,
              collectionName: collection.name,
              userName: user?.displayName || "Bir kullanıcı",
            },
          );
        } catch (notifError) {
          this.logger.warn("likeCollection: failed to send notification");
        }
      }
    } catch (error) {
      this.logger.error("likeCollection: transaction error");
      throw error;
    }

    return {
      liked,
      likeCount,
    };
  }

  // ==========================================================================
  // UNLIKE COLLECTION
  // ==========================================================================
  async unlikeCollection(
    idOrSlug: string,
    userId: string,
  ): Promise<{ liked: boolean; likeCount: number }> {
    // Check if idOrSlug is UUID or collection- prefixed ID
    const isUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        idOrSlug,
      );
    const isCollectionId = idOrSlug.startsWith("collection-");

    // Find collection by ID or slug
    let collection;
    if (isUUID || isCollectionId) {
      collection = await this.prisma.collection.findUnique({
        where: { id: idOrSlug },
        select: { id: true, likeCount: true },
      });

      if (!collection && isCollectionId) {
        const slug = idOrSlug.replace("collection-", "");
        collection = await this.prisma.collection.findFirst({
          where: { slug },
          select: { id: true, likeCount: true },
        });
      }
    } else {
      collection = await this.prisma.collection.findFirst({
        where: { slug: idOrSlug },
        select: { id: true, likeCount: true },
      });
    }

    if (!collection) {
      throw new NotFoundException("Koleksiyon bulunamadı");
    }

    // Find and delete the like
    const existingLike = await this.prisma.collectionLike.findFirst({
      where: {
        collectionId: collection.id,
        userId: userId,
      },
    });

    if (!existingLike) {
      return {
        liked: false,
        likeCount: collection.likeCount || 0,
      };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.collectionLike.delete({
        where: { id: existingLike.id },
      });
      await tx.collection.update({
        where: { id: collection.id },
        data: { likeCount: { decrement: 1 } },
      });
    });

    return {
      liked: false,
      likeCount: Math.max(0, (collection.likeCount || 0) - 1),
    };
  }

  // ==========================================================================
  // GET LIKED COLLECTIONS
  // ==========================================================================
  async getLikedCollections(
    userId: string,
    page: number = 1,
    pageSize: number = 20,
  ): Promise<CollectionListResponseDto> {
    if (!userId) {
      return {
        collections: [],
        total: 0,
        page: 1,
        pageSize: 20,
      };
    }

    // Validate and sanitize page and pageSize parameters
    const validPage =
      isNaN(page) || page < 1 ? 1 : Math.max(1, Math.floor(page));
    const validPageSize =
      isNaN(pageSize) || pageSize < 1
        ? 20
        : Math.max(1, Math.min(Math.floor(pageSize), 100));

    try {
      const skip = (validPage - 1) * validPageSize;

      const [likedCollections, total] = await Promise.all([
        this.prisma.collectionLike.findMany({
          where: { userId },
          include: {
            collection: {
              include: {
                user: {
                  select: {
                    id: true,
                    displayName: true,
                    avatarUrl: true,
                  },
                },
                // Gerçek görünür item sayısı — items aşağıda kapak için take:4 ile
                // sınırlı olduğundan itemCount'u bu _count'tan override ediyoruz.
                _count: { select: { items: { where: VISIBLE_ITEM_FILTER } } },
                items: {
                  take: 4,
                  orderBy: { sortOrder: "asc" },
                  include: {
                    product: {
                      select: {
                        id: true,
                        kind: true,
                        title: true,
                        status: true,
                        boostedUntil: true,
                        images: {
                          take: 1,
                          select: { cardKey: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: validPageSize,
        }),
        this.prisma.collectionLike.count({
          where: { userId },
        }),
      ]);

      const validLikes = likedCollections.filter((like) => {
        const col = (like as any).collection;
        if (!col) return false;
        if (!col.isPublic && col.userId !== userId) return false;
        return true;
      });

      const collections = (
        await Promise.all(
          validLikes.map(async (like) => {
            try {
              const col = (like as any).collection;
              const dto = await this.common.mapCollectionToDto(col, true);
              // items take:4 ile sınırlı olduğu için mapCollectionToDto'nun
              // ürettiği itemCount yanıltıcı; gerçek görünür sayıyla değiştir.
              dto.itemCount = col._count?.items ?? dto.itemCount;
              return dto;
            } catch (err) {
              this.logger.error(
                "getLikedCollections: error mapping collection",
              );
              return null;
            }
          }),
        )
      ).filter((collection) => collection !== null);

      return {
        collections,
        total,
        page: validPage,
        pageSize: validPageSize,
      };
    } catch (error) {
      this.logger.error("getLikedCollections: database error");
      // Return empty result instead of throwing
      return {
        collections: [],
        total: 0,
        page: validPage,
        pageSize: validPageSize,
      };
    }
  }
}
