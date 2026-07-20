import { Injectable, NotFoundException, Optional } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { StorageService } from "../storage/storage.service";
import { SearchService } from "../search/search.service";
import { CacheService } from "../cache/cache.service";
import { AdminAuditService } from "./admin-audit.service";
import { generateSlug } from "./admin-slug.util";
import { fulltextCollectionSearch } from "../../common/helpers/fulltext-search";
import { resolveOrderBy } from "../../common/list";
import { Prisma } from "@prisma/client";

/**
 * Koleksiyon admin operasyonları — AdminService'in COLLECTION MANAGEMENT
 * bölümünden birebir taşındı. AdminService aynı imzalarla buraya delege eder.
 */
@Injectable()
export class AdminCollectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly searchService: SearchService,
    private readonly cache: CacheService,
    private readonly audit: AdminAuditService,
    @Optional()
    private readonly storageService: StorageService,
  ) {}

  // AdminService'teki leaf yardımcı ile birebir aynı (bilinçli kopya; facade'da
  // başka bölümler de kullandığı için oradan kaldırılamadı).
  private resolveProductImageUrl(
    imageKeyOrUrl: string | null | undefined,
  ): string | null {
    if (!imageKeyOrUrl) return null;
    // Strip expired presigned S3 query params to get the clean public URL
    if (
      (imageKeyOrUrl.startsWith("http://") ||
        imageKeyOrUrl.startsWith("https://")) &&
      imageKeyOrUrl.includes("X-Amz-Signature")
    ) {
      try {
        const parsed = new URL(imageKeyOrUrl);
        parsed.search = "";
        return parsed.toString();
      } catch {
        // fall through
      }
    }
    if (
      imageKeyOrUrl.startsWith("http://") ||
      imageKeyOrUrl.startsWith("https://") ||
      imageKeyOrUrl.startsWith("/")
    )
      return imageKeyOrUrl;
    // Try to resolve any non-URL string as an S3 key (covers dev/, prod/, and other prefixes)
    if (this.storageService) {
      return this.storageService.getPublicAssetUrl(imageKeyOrUrl) ?? null;
    }
    return null;
  }

  // ==================== COLLECTION MANAGEMENT ====================

  /**
   * Get collections with filtering and pagination (admin view)
   */
  async getCollections(query: {
    search?: string;
    userId?: string;
    isPublic?: boolean;
    isFeatured?: boolean;
    page?: number;
    limit?: number;
    sortBy?: "createdAt" | "name" | "likeCount" | "viewCount";
    sortOrder?: "asc" | "desc";
  }) {
    const {
      page = 1,
      limit = 20,
      search,
      userId,
      isPublic,
      isFeatured,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = query;

    const esSortMap: Record<string, "popular" | "recent" | "name"> = {
      createdAt: "recent",
      viewCount: "popular",
      likeCount: "popular",
      name: "name",
    };

    if (search && this.searchService.isAvailable()) {
      const esResult = await this.searchService.searchCollections({
        query: search,
        isPublic,
        isFeatured,
        userId,
        sortBy: esSortMap[sortBy] ?? "recent",
        page,
        pageSize: limit,
      });

      if (esResult && esResult.ids.length > 0) {
        const collections = await this.prisma.collection.findMany({
          where: { id: { in: esResult.ids } },
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                avatarUrl: true,
                membership: { select: { tier: { select: { type: true } } } },
              },
            },
            _count: { select: { items: true } },
          },
        });
        const orderMap = new Map(esResult.ids.map((id, i) => [id, i]));
        collections.sort(
          (a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0),
        );
        return {
          data: collections.map((c) => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
            description: c.description,
            coverImageUrl: c.coverImageKey
              ? this.storageService.getPublicAssetUrl(c.coverImageKey)
              : undefined,
            isPublic: c.isPublic,
            isFeatured: c.isFeatured,
            viewCount: c.viewCount,
            likeCount: c.likeCount,
            itemCount: c._count.items,
            owner: {
              ...c.user,
              membershipTier: c.user.membership?.tier?.type ?? null,
            },
            createdAt: c.createdAt,
            updatedAt: c.updatedAt,
          })),
          total: esResult.total,
          page,
          limit,
          totalPages: Math.ceil(esResult.total / limit),
        };
      }
      if (esResult && esResult.total === 0) {
        return { data: [], total: 0, page, limit, totalPages: 0 };
      }
    }

    const where: Prisma.CollectionWhereInput = {};
    if (search) {
      const ids = await fulltextCollectionSearch(this.prisma, search);
      if (ids.length === 0) {
        return { data: [], total: 0, page, limit, totalPages: 0 };
      }
      where.id = { in: ids };
    }
    if (userId) where.userId = userId;
    if (isPublic !== undefined) where.isPublic = isPublic;
    if (isFeatured !== undefined) where.isFeatured = isFeatured;

    // Standard sort contract: scalar Collection fields sort directly, the
    // computed/relation columns (item count, owner) go through the sortMap, and
    // any unknown key falls back to `createdAt` instead of throwing a raw-orderBy
    // 500 (the admin list exposes every column as sortable — see epic #375).
    const orderBy = resolveOrderBy<Prisma.CollectionOrderByWithRelationInput>(
      "Collection",
      { sortBy, sortOrder },
      {
        defaultSort: { createdAt: "desc" },
        sortMap: {
          itemsCount: (direction) => ({ items: { _count: direction } }),
          "user.displayName": (direction) => ({
            user: { displayName: direction },
          }),
        },
      },
    );

    const [total, collections] = await Promise.all([
      this.prisma.collection.count({ where }),
      this.prisma.collection.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              displayName: true,
              avatarUrl: true,
              membership: { select: { tier: { select: { type: true } } } },
            },
          },
          _count: { select: { items: true } },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: collections.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        coverImageUrl: c.coverImageKey
          ? this.storageService.getPublicAssetUrl(c.coverImageKey)
          : undefined,
        isPublic: c.isPublic,
        isFeatured: c.isFeatured,
        viewCount: c.viewCount,
        likeCount: c.likeCount,
        itemCount: c._count.items,
        owner: {
          ...c.user,
          membershipTier: c.user.membership?.tier?.type ?? null,
        },
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get collection by ID with items (admin view)
   */
  async getCollectionById(collectionId: string) {
    const collection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true } },
        items: {
          include: {
            product: {
              select: {
                id: true,
                title: true,
                price: true,
                images: { take: 1, select: { cardKey: true } },
              },
            },
          },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (!collection) {
      throw new NotFoundException("Koleksiyon bulunamadı");
    }

    return {
      id: collection.id,
      name: collection.name,
      slug: collection.slug,
      description: collection.description,
      coverImageUrl: collection.coverImageKey
        ? this.storageService.getPublicAssetUrl(collection.coverImageKey)
        : undefined,
      isPublic: collection.isPublic,
      isFeatured: collection.isFeatured,
      viewCount: collection.viewCount,
      likeCount: collection.likeCount,
      itemCount: collection.items.length,
      owner: collection.user,
      items: await Promise.all(
        collection.items.map(async (item) => ({
          id: item.id,
          productId: item.productId,
          sortOrder: item.sortOrder,
          product: item.product
            ? {
                id: item.product.id,
                title: item.product.title,
                price: Number(item.product.price),
                images: await Promise.all(
                  (item.product.images || []).map(async (img: any) => ({
                    ...img,
                    url: this.resolveProductImageUrl(img.cardKey),
                  })),
                ),
              }
            : null,
          customTitle: item.customTitle,
          customImageUrl: item.customImageUrl,
        })),
      ),
      createdAt: collection.createdAt,
      updatedAt: collection.updatedAt,
    };
  }

  /**
   * Create collection (admin)
   */
  async createAdminCollection(
    adminId: string,
    dto: {
      name: string;
      description?: string;
      isPublic?: boolean;
      isFeatured?: boolean;
      coverImageKey?: string;
      userId?: string;
    },
  ) {
    const slug = generateSlug(dto.name);
    const userId = dto.userId || adminId;

    // Check for unique slug within user's collections
    const existingSlug = await this.prisma.collection.findFirst({
      where: { userId, slug },
    });

    const finalSlug = existingSlug ? `${slug}-${Date.now()}` : slug;

    const collection = await this.prisma.collection.create({
      data: {
        userId,
        name: dto.name,
        slug: finalSlug,
        description: dto.description,
        isPublic: dto.isPublic ?? true,
        isFeatured: dto.isFeatured ?? false,
        coverImageKey: dto.coverImageKey,
      },
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });

    await this.audit.createAuditLog(
      adminId,
      "collection_create",
      "Collection",
      collection.id,
      null,
      collection,
    );

    return {
      ...collection,
      itemCount: 0,
      owner: collection.user,
    };
  }

  /**
   * Update collection (admin)
   */
  async updateAdminCollection(
    adminId: string,
    collectionId: string,
    dto: {
      name?: string;
      description?: string;
      isPublic?: boolean;
      isFeatured?: boolean;
      coverImageKey?: string;
    },
  ) {
    const existing = await this.prisma.collection.findUnique({
      where: { id: collectionId },
    });

    if (!existing) {
      throw new NotFoundException("Koleksiyon bulunamadı");
    }

    const updateData: Prisma.CollectionUpdateInput = {};
    if (dto.name !== undefined) {
      updateData.name = dto.name;
      updateData.slug = generateSlug(dto.name);
    }
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.isPublic !== undefined) updateData.isPublic = dto.isPublic;
    if (dto.isFeatured !== undefined) updateData.isFeatured = dto.isFeatured;
    if (dto.coverImageKey !== undefined)
      updateData.coverImageKey = dto.coverImageKey;

    const updated = await this.prisma.collection.update({
      where: { id: collectionId },
      data: updateData,
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true } },
        _count: { select: { items: true } },
      },
    });

    await this.audit.createAuditLog(
      adminId,
      "collection_update",
      "Collection",
      collectionId,
      existing,
      updated,
    );

    return {
      ...updated,
      itemCount: updated._count.items,
      owner: updated.user,
    };
  }

  /**
   * Delete collection (admin)
   */
  async deleteAdminCollection(adminId: string, collectionId: string) {
    const existing = await this.prisma.collection.findUnique({
      where: { id: collectionId },
    });

    if (!existing) {
      throw new NotFoundException("Koleksiyon bulunamadı");
    }

    await this.prisma.collection.delete({
      where: { id: collectionId },
    });

    await this.audit.createAuditLog(
      adminId,
      "collection_delete",
      "Collection",
      collectionId,
      existing,
      null,
    );

    return { success: true };
  }

  /**
   * Add products to collection
   */
  async addItemsToCollection(
    adminId: string,
    collectionId: string,
    productIds: string[],
  ) {
    const collection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
      include: { _count: { select: { items: true } } },
    });

    if (!collection) {
      throw new NotFoundException("Koleksiyon bulunamadı");
    }

    // Get max sort order
    const maxSortOrder = collection._count.items;

    // Create items
    const createdItems = await Promise.all(
      productIds.map(
        (productId, index) =>
          this.prisma.collectionItem
            .create({
              data: {
                collectionId,
                productId,
                sortOrder: maxSortOrder + index,
              },
              include: {
                product: {
                  select: {
                    id: true,
                    title: true,
                    price: true,
                    images: { take: 1, select: { cardKey: true } },
                  },
                },
              },
            })
            .catch(() => null), // Ignore duplicates
      ),
    );

    const successfulItems = createdItems.filter((item) => item !== null);

    await this.audit.createAuditLog(
      adminId,
      "collection_items_add",
      "Collection",
      collectionId,
      null,
      { addedProductIds: productIds },
    );

    return {
      success: true,
      addedCount: successfulItems.length,
      items: successfulItems,
    };
  }

  /**
   * Remove item from collection
   */
  async removeItemFromAdminCollection(
    adminId: string,
    collectionId: string,
    itemId: string,
  ) {
    const item = await this.prisma.collectionItem.findFirst({
      where: { id: itemId, collectionId },
    });

    if (!item) {
      throw new NotFoundException("Koleksiyon öğesi bulunamadı");
    }

    await this.prisma.collectionItem.delete({
      where: { id: itemId },
    });

    await this.audit.createAuditLog(
      adminId,
      "collection_item_remove",
      "CollectionItem",
      itemId,
      item,
      null,
    );

    return { success: true };
  }

  /**
   * Set collection visibility
   */
  async setCollectionVisibility(
    adminId: string,
    collectionId: string,
    isPublic: boolean,
  ) {
    const existing = await this.prisma.collection.findUnique({
      where: { id: collectionId },
    });

    if (!existing) {
      throw new NotFoundException("Koleksiyon bulunamadı");
    }

    const updated = await this.prisma.collection.update({
      where: { id: collectionId },
      data: { isPublic },
    });

    await this.audit.createAuditLog(
      adminId,
      "collection_visibility_change",
      "Collection",
      collectionId,
      { isPublic: existing.isPublic },
      { isPublic },
    );

    return { success: true, isPublic: updated.isPublic };
  }

  /**
   * Set collection featured status
   */
  async setCollectionFeatured(
    adminId: string,
    collectionId: string,
    isFeatured: boolean,
  ) {
    const existing = await this.prisma.collection.findUnique({
      where: { id: collectionId },
    });

    if (!existing) {
      throw new NotFoundException("Koleksiyon bulunamadı");
    }

    const updated = await this.prisma.collection.update({
      where: { id: collectionId },
      data: { isFeatured },
    });

    await this.audit.createAuditLog(
      adminId,
      "collection_featured_change",
      "Collection",
      collectionId,
      { isFeatured: existing.isFeatured },
      { isFeatured },
    );

    // Anasayfa "haftanın koleksiyoneri" snapshot'ını ve cache'ini düşür; sonraki
    // okuma yeni isFeatured durumuna göre kazananı yeniden hesaplayıp saklar.
    await this.prisma.featuredSnapshot
      .deleteMany({ where: { type: "collector" } })
      .catch(() => {});
    if (this.cache) {
      await this.cache.del("featured:collector").catch(() => {});
      await this.cache.delPattern("featured:top-collections:*").catch(() => {});
    }

    return { success: true, isFeatured: updated.isFeatured };
  }
}
