import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { Prisma } from '@prisma/client';
import {
  CreateCollectionDto,
  UpdateCollectionDto,
  AddCollectionItemDto,
  ReorderCollectionItemsDto,
  CollectionResponseDto,
  CollectionListResponseDto,
  CollectionItemResponseDto,
} from './dto';
import { MembershipService } from '../membership/membership.service';

@Injectable()
export class CollectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly membershipService: MembershipService,
  ) {}

  // ==========================================================================
  // CREATE COLLECTION
  // ==========================================================================
  async createCollection(
    userId: string,
    dto: CreateCollectionDto,
  ): Promise<CollectionResponseDto> {
    // Check if user can create collections based on membership tier
    const canCreate = await this.membershipService.canCreateCollection(userId);
    if (!canCreate.allowed) {
      throw new ForbiddenException(
        canCreate.reason || 'Koleksiyon oluşturma yetkiniz yok',
      );
    }

    // Generate slug from name
    const slug = this.generateSlug(dto.name);

    // Check if slug already exists for user
    const existing = await this.prisma.collection.findUnique({
      where: { userId_slug: { userId, slug } },
    });

    if (existing) {
      throw new BadRequestException('Bu isimde bir koleksiyonunuz zaten var');
    }

    const collection = await this.prisma.collection.create({
      data: {
        userId,
        name: dto.name,
        slug,
        description: dto.description,
        coverImageUrl: dto.coverImageUrl,
        isPublic: dto.isPublic ?? true,
      },
      include: {
        user: { select: { id: true, displayName: true } },
        items: {
          include: {
            product: {
              include: { images: { take: 1 } },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    return this.mapCollectionToDto(collection, false);
  }

  // ==========================================================================
  // GET COLLECTION BY ID
  // ==========================================================================
  async getCollectionById(
    collectionId: string,
    viewerId?: string,
  ): Promise<CollectionResponseDto> {
    const collection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
      include: {
        user: { select: { id: true, displayName: true } },
        items: {
          include: {
            product: {
              include: { images: { take: 1 } },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!collection) {
      throw new NotFoundException('Koleksiyon bulunamadı');
    }

    // Private collection can only be seen by owner
    if (!collection.isPublic && collection.userId !== viewerId) {
      throw new ForbiddenException('Bu koleksiyon özel');
    }

    // Check if viewer has liked this collection
    let isLiked = false;
    if (viewerId) {
      const like = await this.prisma.collectionLike.findUnique({
        where: {
          collectionId_userId: {
            collectionId: collection.id,
            userId: viewerId,
          },
        },
      });
      isLiked = !!like;
    }

    // Increment view count if not owner
    if (viewerId !== collection.userId) {
      await this.prisma.collection.update({
        where: { id: collectionId },
        data: { viewCount: { increment: 1 } },
      });
    }

    return this.mapCollectionToDto(collection, isLiked);
  }

  // ==========================================================================
  // GET COLLECTION BY SLUG
  // ==========================================================================
  async getCollectionBySlug(
    slug: string,
    viewerId?: string,
  ): Promise<CollectionResponseDto> {
    // Try exact slug first, then try stripping "collection-" prefix if present
    const slugsToTry = [slug];
    if (slug.startsWith('collection-')) {
      slugsToTry.push(slug.replace('collection-', ''));
    }

    let collection = null;
    for (const s of slugsToTry) {
      collection = await this.prisma.collection.findFirst({
        where: { slug: s },
        include: {
          user: { select: { id: true, displayName: true } },
          items: {
            include: {
              product: {
                include: { images: { take: 1 } },
              },
            },
            orderBy: { sortOrder: 'asc' },
          },
        },
      });
      if (collection) break;
    }

    if (!collection) {
      throw new NotFoundException('Koleksiyon bulunamadı');
    }

    // Private collection can only be seen by owner
    if (!collection.isPublic && collection.userId !== viewerId) {
      throw new ForbiddenException('Bu koleksiyon özel');
    }

    // Check if viewer has liked this collection
    let isLiked = false;
    if (viewerId) {
      const like = await this.prisma.collectionLike.findUnique({
        where: {
          collectionId_userId: {
            collectionId: collection.id,
            userId: viewerId,
          },
        },
      });
      isLiked = !!like;
    }

    // Increment view count if not owner
    if (viewerId !== collection.userId) {
      await this.prisma.collection.update({
        where: { id: collection.id },
        data: { viewCount: { increment: 1 } },
      });
    }

    return this.mapCollectionToDto(collection, isLiked);
  }

  // ==========================================================================
  // GET USER COLLECTIONS
  // ==========================================================================
  async getUserCollections(
    userId: string,
    viewerId?: string,
    page?: number,
    pageSize?: number,
  ): Promise<CollectionListResponseDto> {
    // Ensure valid pagination values
    const safePage = Math.max(1, Number(page) || 1);
    const safePageSize = Math.min(100, Math.max(1, Number(pageSize) || 20));
    
    // If viewing own collections, show all. Otherwise only public.
    const isOwner = userId === viewerId;

    const where: Prisma.CollectionWhereInput = {
      userId,
      ...(isOwner ? {} : { isPublic: true }),
    };

    const [collections, total] = await Promise.all([
      this.prisma.collection.findMany({
        where,
        include: {
          user: { select: { id: true, displayName: true } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
      }),
      this.prisma.collection.count({ where }),
    ]);

    return {
      collections: collections.map((c) => ({
        id: c.id,
        userId: c.userId,
        userName: c.user.displayName,
        name: c.name,
        slug: c.slug,
        description: c.description || undefined,
        coverImageUrl: c.coverImageUrl || undefined,
        isPublic: c.isPublic,
        viewCount: c.viewCount,
        likeCount: c.likeCount,
        itemCount: c._count?.items ?? 0,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
      total,
      page: safePage,
      pageSize: safePageSize,
    };
  }

  // ==========================================================================
  // BROWSE PUBLIC COLLECTIONS
  // ==========================================================================
  async browsePublicCollections(
    page?: number,
    pageSize?: number,
    sortBy: 'popular' | 'recent' | 'name' | 'items' | 'items_asc' | 'items_desc' = 'popular',
    search?: string,
  ): Promise<CollectionListResponseDto> {
    // Ensure valid pagination values
    const safePage = Math.max(1, Number(page) || 1);
    const safePageSize = Math.min(100, Math.max(1, Number(pageSize) || 20));
    
    // Build where clause
    const where: Prisma.CollectionWhereInput = {
      isPublic: true,
      ...(search && search.trim() !== '' ? {
        OR: [
          { name: { contains: search.trim(), mode: 'insensitive' } },
          { description: { contains: search.trim(), mode: 'insensitive' } },
          { user: { displayName: { contains: search.trim(), mode: 'insensitive' } } },
        ],
      } : {}),
    };
    
    // Build orderBy clause
    let orderBy: Prisma.CollectionOrderByWithRelationInput;
    let needsInMemorySort = false;
    
    switch (sortBy) {
      case 'popular':
        orderBy = { viewCount: 'desc' };
        break;
      case 'recent':
        orderBy = { createdAt: 'desc' };
        break;
      case 'name':
        // Case-insensitive sorting: fetch all and sort in memory
        needsInMemorySort = true;
        orderBy = { createdAt: 'desc' }; // Temporary, will sort after fetch
        break;
      case 'items':
      case 'items_asc':
      case 'items_desc':
        // For items count, we need to fetch all and sort in memory
        // Prisma doesn't support direct _count ordering
        needsInMemorySort = true;
        orderBy = { createdAt: 'desc' }; // Will sort after fetch
        break;
      default:
        orderBy = { viewCount: 'desc' };
    }

    let [collections, total] = await Promise.all([
      this.prisma.collection.findMany({
        where,
        include: {
          user: { select: { id: true, displayName: true } },
          _count: { select: { items: true } },
        },
        ...(needsInMemorySort
          ? {} // Fetch all for in-memory sort
          : {
              orderBy,
              skip: (safePage - 1) * safePageSize,
              take: safePageSize,
            }
        ),
      }),
      this.prisma.collection.count({ where }),
    ]);

    // Sort in memory if needed (for name or items)
    if (needsInMemorySort) {
      if (sortBy === 'name') {
        // Case-insensitive alphabetical sort (Turkish locale aware)
        const collator = new Intl.Collator('tr', { 
          sensitivity: 'base',
          numeric: false
        });
        collections = collections.sort((a, b) => {
          const nameA = a.name.toLowerCase();
          const nameB = b.name.toLowerCase();
          return collator.compare(nameA, nameB);
        });
      } else if (sortBy === 'items' || sortBy === 'items_desc') {
        // Sort by item count descending (most items first)
        collections = collections.sort((a, b) => {
          const countA = a._count?.items ?? 0;
          const countB = b._count?.items ?? 0;
          return countB - countA;
        });
      } else if (sortBy === 'items_asc') {
        // Sort by item count ascending (least items first)
        collections = collections.sort((a, b) => {
          const countA = a._count?.items ?? 0;
          const countB = b._count?.items ?? 0;
          return countA - countB;
        });
      }
      // Apply pagination after sorting
      collections = collections.slice((safePage - 1) * safePageSize, safePage * safePageSize);
    }

    return {
      collections: collections.map((c) => ({
        id: c.id,
        userId: c.userId,
        userName: c.user.displayName,
        name: c.name,
        slug: c.slug,
        description: c.description || undefined,
        coverImageUrl: c.coverImageUrl || undefined,
        isPublic: c.isPublic,
        viewCount: c.viewCount,
        likeCount: c.likeCount,
        itemCount: c._count?.items ?? 0,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
      total,
      page: safePage,
      pageSize: safePageSize,
    };
  }

  // ==========================================================================
  // UPDATE COLLECTION
  // ==========================================================================
  async updateCollection(
    collectionId: string,
    userId: string,
    dto: UpdateCollectionDto,
  ): Promise<CollectionResponseDto> {
    const collection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
    });

    if (!collection) {
      throw new NotFoundException('Koleksiyon bulunamadı');
    }

    if (collection.userId !== userId) {
      throw new ForbiddenException('Bu koleksiyonu düzenleme yetkiniz yok');
    }

    let newSlug = collection.slug;
    if (dto.name && dto.name !== collection.name) {
      newSlug = this.generateSlug(dto.name);

      // Check if new slug already exists
      const existing = await this.prisma.collection.findFirst({
        where: {
          userId,
          slug: newSlug,
          id: { not: collectionId },
        },
      });

      if (existing) {
        throw new BadRequestException('Bu isimde bir koleksiyonunuz zaten var');
      }
    }

    const updated = await this.prisma.collection.update({
      where: { id: collectionId },
      data: {
        ...(dto.name && { name: dto.name, slug: newSlug }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.coverImageUrl !== undefined && { coverImageUrl: dto.coverImageUrl }),
        ...(dto.isPublic !== undefined && { isPublic: dto.isPublic }),
      },
      include: {
        user: { select: { id: true, displayName: true } },
        items: {
          include: {
            product: {
              include: { images: { take: 1 } },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    // Check if user has liked this collection (owner always false)
    return this.mapCollectionToDto(updated, false);
  }

  // ==========================================================================
  // DELETE COLLECTION
  // ==========================================================================
  async deleteCollection(collectionId: string, userId: string): Promise<void> {
    const collection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
    });

    if (!collection) {
      throw new NotFoundException('Koleksiyon bulunamadı');
    }

    if (collection.userId !== userId) {
      throw new ForbiddenException('Bu koleksiyonu silme yetkiniz yok');
    }

    await this.prisma.collection.delete({
      where: { id: collectionId },
    });
  }

  // ==========================================================================
  // ADD ITEM TO COLLECTION
  // ==========================================================================
  async addItemToCollection(
    collectionId: string,
    userId: string,
    dto: AddCollectionItemDto,
  ): Promise<CollectionItemResponseDto> {
    const collection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
    });

    if (!collection) {
      throw new NotFoundException('Koleksiyon bulunamadı');
    }

    if (collection.userId !== userId) {
      throw new ForbiddenException('Bu koleksiyona ekleme yetkiniz yok');
    }

    // Verify product exists
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      include: { images: { take: 1 } },
    });

    if (!product) {
      throw new NotFoundException('Ürün bulunamadı');
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
      throw new BadRequestException('Ürün zaten koleksiyonda');
    }

    // Get max sort order
    const maxSort = await this.prisma.collectionItem.aggregate({
      where: { collectionId },
      _max: { sortOrder: true },
    });

    const item = await this.prisma.collectionItem.create({
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

    return this.mapItemToDto(item);
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
      throw new NotFoundException('Koleksiyon bulunamadı');
    }

    if (collection.userId !== userId) {
      throw new ForbiddenException('Bu koleksiyondan silme yetkiniz yok');
    }

    const item = await this.prisma.collectionItem.findFirst({
      where: { id: itemId, collectionId },
    });

    if (!item) {
      throw new NotFoundException('Koleksiyon öğesi bulunamadı');
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
      throw new NotFoundException('Koleksiyon bulunamadı');
    }

    if (collection.userId !== userId) {
      throw new ForbiddenException('Bu koleksiyonu düzenleme yetkiniz yok');
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

  // ==========================================================================
  // LIKE COLLECTION
  // ==========================================================================
  async likeCollection(idOrSlug: string, userId: string): Promise<{ liked: boolean; likeCount: number }> {
    // Check if idOrSlug is UUID or slug
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
    
    // Find collection by ID or slug
    let collection;
    try {
      if (isUUID) {
        collection = await this.prisma.collection.findUnique({
          where: { id: idOrSlug },
          select: { id: true, likeCount: true },
        });
      } else {
        // For slug, we need to find by slug (slug is unique per user, not globally)
        // First try to find public collection with this slug
        collection = await this.prisma.collection.findFirst({
          where: { slug: idOrSlug, isPublic: true },
          select: { id: true, likeCount: true, isPublic: true, userId: true },
        });
        
        // If not found and user is logged in, try to find user's own collection (even if private)
        if (!collection && userId) {
          collection = await this.prisma.collection.findFirst({
            where: { slug: idOrSlug, userId: userId },
            select: { id: true, likeCount: true, isPublic: true, userId: true },
          });
        }
        
        // If still not found, try any collection (for cases where slug might match)
        if (!collection) {
          collection = await this.prisma.collection.findFirst({
            where: { slug: idOrSlug },
            select: { id: true, likeCount: true, isPublic: true, userId: true },
          });
        }
        
        // If collection is private and user is not the owner, don't allow like
        if (collection && !collection.isPublic && collection.userId !== userId) {
          throw new ForbiddenException('Bu koleksiyon özel');
        }
      }
    } catch (error) {
      console.error('Error finding collection:', error);
      if (error instanceof ForbiddenException) {
        throw error;
      }
      throw new NotFoundException('Koleksiyon bulunamadı');
    }

    if (!collection) {
      console.error(`Collection not found: idOrSlug=${idOrSlug}, isUUID=${isUUID}, userId=${userId}`);
      throw new NotFoundException('Koleksiyon bulunamadı');
    }

    // Check if user already liked this collection
    const existingLike = await this.prisma.collectionLike.findUnique({
      where: {
        collectionId_userId: {
          collectionId: collection.id,
          userId: userId,
        },
      },
    });

    let liked: boolean;
    let likeCount: number;

    if (existingLike) {
      // Unlike: Remove the like and decrement count
      await this.prisma.$transaction([
        this.prisma.collectionLike.delete({
          where: {
            collectionId_userId: {
              collectionId: collection.id,
              userId: userId,
            },
          },
        }),
        this.prisma.collection.update({
          where: { id: collection.id },
          data: { likeCount: { decrement: 1 } },
        }),
      ]);

      liked = false;
      likeCount = collection.likeCount - 1;
    } else {
      // Like: Add the like and increment count
      await this.prisma.$transaction([
        this.prisma.collectionLike.create({
          data: {
            collectionId: collection.id,
            userId: userId,
          },
        }),
        this.prisma.collection.update({
          where: { id: collection.id },
          data: { likeCount: { increment: 1 } },
        }),
      ]);

      liked = true;
      likeCount = collection.likeCount + 1;
    }

    return {
      liked,
      likeCount,
    };
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9çğıöşü]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private mapCollectionToDto(collection: any, isLiked?: boolean): CollectionResponseDto {
    return {
      id: collection.id,
      userId: collection.userId,
      userName: collection.user?.displayName || '',
      name: collection.name,
      slug: collection.slug,
      description: collection.description || undefined,
      coverImageUrl: collection.coverImageUrl || undefined,
      isPublic: collection.isPublic,
      viewCount: collection.viewCount,
      likeCount: collection.likeCount,
      itemCount: collection.items?.length ?? 0,
      items: collection.items?.map((item: any) => this.mapItemToDto(item)),
      isLiked: isLiked,
      createdAt: collection.createdAt,
      updatedAt: collection.updatedAt,
    };
  }

  private mapItemToDto(item: any): CollectionItemResponseDto {
    return {
      id: item.id,
      productId: item.product.id,
      productTitle: item.product.title,
      productImage: item.product.images?.[0]?.url,
      productPrice: parseFloat(item.product.price),
      sortOrder: item.sortOrder,
      isFeatured: item.isFeatured,
      addedAt: item.addedAt,
    };
  }
}
