import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { Prisma, ProductKind } from "@prisma/client";
import {
  fulltextCollectionSearch,
  fulltextUserDisplayNameSearch,
} from "../../common/helpers/fulltext-search";
import { generateSlug } from "../../common/helpers/slug";
import {
  CreateCollectionDto,
  UpdateCollectionDto,
  CollectionResponseDto,
  CollectionListResponseDto,
} from "./dto";
import { MembershipService } from "../membership/membership.service";
import { ModerationAiClient } from "../moderation/moderation-ai.client";
import { SearchService } from "../search/search.service";
import { SearchIndexingService } from "../search/search-indexing.service";
import { StorageService } from "../storage/storage.service";
import { CollectionCommonService } from "./collection-common.service";
import { CollectionCoverService } from "./collection-cover.service";
import {
  PUBLIC_NAME_SELECT,
  publicName,
} from "../../common/helpers/public-identity";

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
 * CollectionCrudService — koleksiyon oluşturma/okuma/güncelleme/silme ve genel
 * gezinme (browse). Kapak üretimini cover'a (this.cover.generateCoverImage),
 * koleksiyon→DTO eşlemesini common'a (this.common.mapCollectionToDto) delege eder.
 * Elasticsearch okuma (searchService) ve bayat-indeks reindex tetikleme
 * (searchIndexing) yan etkileri burada birebir korunur.
 */
@Injectable()
export class CollectionCrudService {
  private readonly logger = new Logger(CollectionCrudService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly membershipService: MembershipService,
    private readonly searchService: SearchService,
    private readonly searchIndexing: SearchIndexingService,
    private readonly storageService: StorageService,
    private readonly moderationAi: ModerationAiClient,
    private readonly common: CollectionCommonService,
    private readonly cover: CollectionCoverService,
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
        canCreate.reason || "Koleksiyon oluşturma yetkiniz yok",
      );
    }

    // Koleksiyon adı ve açıklaması metin denetimi
    await this.moderationAi.assertTextClean(dto.name, {
      entityType: "collection",
      userId,
      field: "name",
      label: "koleksiyon adı",
    });
    if (dto.description) {
      await this.moderationAi.assertTextClean(dto.description, {
        entityType: "collection",
        userId,
        field: "description",
        label: "koleksiyon açıklaması",
      });
    }

    // Generate slug from name
    const slug = generateSlug(dto.name);

    // Check if slug already exists for user
    const existing = await this.prisma.collection.findUnique({
      where: { userId_slug: { userId, slug } },
    });

    if (existing) {
      throw new BadRequestException("Bu isimde bir koleksiyonunuz zaten var");
    }

    const collection = await this.prisma.collection.create({
      data: {
        userId,
        name: dto.name,
        slug,
        description: dto.description,
        coverImageKey: dto.coverImageKey,
        isPublic: dto.isPublic ?? true,
        categoryId: dto.categoryId || undefined,
      },
      include: {
        user: { select: { id: true, ...PUBLIC_NAME_SELECT } },
        category: { select: { id: true, name: true, slug: true } },
        items: {
          include: {
            product: {
              include: {
                images: {
                  take: 1,
                },
              },
            },
          },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    return await this.common.mapCollectionToDto(collection, false);
  }

  // ==========================================================================
  // GET COLLECTION BY ID
  // ==========================================================================
  async getCollectionById(
    collectionId: string,
    viewerId?: string,
  ): Promise<CollectionResponseDto> {
    // First get basic collection info
    const basicCollection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
      select: { id: true },
    });

    if (!basicCollection) {
      throw new NotFoundException("Koleksiyon bulunamadı");
    }

    // Now get full collection with relations
    const collection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
      include: {
        user: { select: { id: true, ...PUBLIC_NAME_SELECT } },
        category: { select: { id: true, name: true, slug: true } },
        items: {
          include: {
            product: {
              select: {
                id: true,
                kind: true,
                title: true,
                price: true,
                status: true,
                boostedUntil: true,
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

    // Fetch images separately for each product
    const productIds = (collection.items
      ?.map((item) => item.productId)
      .filter((id): id is string => id !== null) || []) as string[];
    if (productIds.length > 0) {
      const productImages = await this.prisma.productImage.findMany({
        where: { productId: { in: productIds } },
        orderBy: [{ productId: "asc" }, { sortOrder: "asc" }],
      });

      const imagesByProduct = new Map<string, any[]>();
      for (const img of productImages) {
        if (!imagesByProduct.has(img.productId)) {
          imagesByProduct.set(img.productId, []);
        }
        const arr = imagesByProduct.get(img.productId)!;
        if (arr.length < 1) {
          arr.push({ cardKey: img.cardKey, detailKey: img.detailKey });
        }
      }

      // Attach images to products
      if (collection.items) {
        for (const item of collection.items) {
          if (item.product && imagesByProduct.has(item.product.id)) {
            (item.product as any).images =
              imagesByProduct.get(item.product.id) || [];
          } else if (item.product) {
            (item.product as any).images = [];
          }
        }
      }
    }

    // Private collection can only be seen by owner
    if (!collection.isPublic && collection.userId !== viewerId) {
      throw new ForbiddenException("Bu koleksiyon özel");
    }

    // Check if viewer has liked this collection
    let isLiked = false;
    if (viewerId) {
      const like = await this.prisma.collectionLike.findFirst({
        where: {
          collectionId: collection.id,
          userId: viewerId,
        },
      });
      isLiked = !!like;
    }

    // Görüntülenmeyi kullanıcı başına tekil say: aynı kullanıcı tekrar açsa/refresh
    // etse/beğeni toggle'layıp yeniden fetch etse viewCount artmaz. Sadece giriş
    // yapmış ve sahibi olmayan bir kullanıcının İLK görüntülemesi sayılır.
    // Anonim (viewerId yok) ziyaretler sayılmaz.
    if (viewerId && viewerId !== collection.userId) {
      const inserted = await this.prisma.collectionView.createMany({
        data: [{ collectionId: collection.id, userId: viewerId }],
        skipDuplicates: true,
      });
      if (inserted.count > 0) {
        await this.prisma.collection.update({
          where: { id: collection.id },
          data: { viewCount: { increment: 1 } },
        });
      }
    }

    // Generate cover image if not exists
    if (!collection.coverImageKey) {
      await this.cover.generateCoverImage(collectionId);
      const updated = await this.prisma.collection.findUnique({
        where: { id: collectionId },
        select: { coverImageKey: true },
      });
      if (updated?.coverImageKey) {
        collection.coverImageKey = updated.coverImageKey;
      }
    }

    return await this.common.mapCollectionToDto(collection, isLiked);
  }

  // ==========================================================================
  // GET COLLECTION BY SLUG
  // ==========================================================================
  async getCollectionBySlug(
    slug: string,
    viewerId?: string,
  ): Promise<CollectionResponseDto> {
    const collection = await this.prisma.collection.findFirst({
      where: { slug },
      include: {
        user: { select: { id: true, ...PUBLIC_NAME_SELECT } },
        category: { select: { id: true, name: true, slug: true } },
        items: {
          include: {
            product: {
              select: {
                id: true,
                kind: true,
                title: true,
                price: true,
                status: true,
                boostedUntil: true,
              },
            },
          },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (collection) {
      const productIds = (collection.items
        ?.map((item) => item.productId)
        .filter((id): id is string => id !== null) || []) as string[];
      if (productIds.length > 0) {
        const productImages = await this.prisma.productImage.findMany({
          where: { productId: { in: productIds } },
          orderBy: [{ productId: "asc" }, { sortOrder: "asc" }],
        });

        const imagesByProduct = new Map<string, any[]>();
        for (const img of productImages) {
          if (!imagesByProduct.has(img.productId)) {
            imagesByProduct.set(img.productId, []);
          }
          const arr = imagesByProduct.get(img.productId)!;
          if (arr.length < 1) {
            arr.push({ cardKey: img.cardKey, detailKey: img.detailKey });
          }
        }

        if (collection.items) {
          for (const item of collection.items) {
            if (item.product && imagesByProduct.has(item.product.id)) {
              (item.product as any).images =
                imagesByProduct.get(item.product.id) || [];
            } else if (item.product) {
              (item.product as any).images = [];
            }
          }
        }
      }
    }

    if (!collection) {
      throw new NotFoundException("Koleksiyon bulunamadı");
    }

    // Private collection can only be seen by owner
    if (!collection.isPublic && collection.userId !== viewerId) {
      throw new ForbiddenException("Bu koleksiyon özel");
    }

    // Check if viewer has liked this collection
    let isLiked = false;
    if (viewerId) {
      const like = await this.prisma.collectionLike.findFirst({
        where: {
          collectionId: collection.id,
          userId: viewerId,
        },
      });
      isLiked = !!like;
    }

    // Görüntülenmeyi kullanıcı başına tekil say (bkz. getCollectionById).
    // Sadece giriş yapmış, sahibi olmayan kullanıcının ilk görüntülemesi sayılır.
    if (viewerId && viewerId !== collection.userId) {
      const inserted = await this.prisma.collectionView.createMany({
        data: [{ collectionId: collection.id, userId: viewerId }],
        skipDuplicates: true,
      });
      if (inserted.count > 0) {
        await this.prisma.collection.update({
          where: { id: collection.id },
          data: { viewCount: { increment: 1 } },
        });
      }
    }

    // Generate cover image if not exists
    if (!collection.coverImageKey) {
      await this.cover.generateCoverImage(collection.id);
      const updated = await this.prisma.collection.findUnique({
        where: { id: collection.id },
        select: { coverImageKey: true },
      });
      if (updated?.coverImageKey) {
        collection.coverImageKey = updated.coverImageKey;
      }
    }

    return await this.common.mapCollectionToDto(collection, isLiked);
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
          user: { select: { id: true, ...PUBLIC_NAME_SELECT } },
          _count: { select: { items: { where: VISIBLE_ITEM_FILTER } } },
        },
        orderBy: { createdAt: "desc" },
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
      }),
      this.prisma.collection.count({ where }),
    ]);

    // Generate cover images for collections that don't have one (fire and forget)
    const collectionsWithoutCover = collections.filter(
      (c) => !c.coverImageKey && (c._count?.items ?? 0) > 0,
    );
    if (collectionsWithoutCover.length > 0) {
      // Generate covers in background (don't await)
      Promise.all(
        collectionsWithoutCover.map((c) =>
          this.cover.generateCoverImage(c.id).catch((err) => {
            this.logger.warn(
              `Failed to generate cover for collection ${c.id}: ${err.message}`,
            );
          }),
        ),
      ).catch(() => {
        // Ignore errors in background generation
      });
    }

    return {
      collections: await Promise.all(
        collections.map(async (c) => ({
          id: c.id,
          userId: c.userId,
          userName: publicName(c.user),
          name: c.name,
          slug: c.slug,
          description: c.description || undefined,
          coverImageUrl: c.coverImageKey
            ? this.storageService.getPublicAssetUrl(c.coverImageKey)
            : undefined,
          isPublic: c.isPublic,
          viewCount: c.viewCount,
          likeCount: c.likeCount,
          itemCount: c._count?.items ?? 0,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        })),
      ),
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
    sortBy:
      | "popular"
      | "recent"
      | "name"
      | "items"
      | "items_asc"
      | "items_desc" = "popular",
    search?: string,
    categoryId?: string,
    categorySlug?: string,
  ): Promise<CollectionListResponseDto> {
    const safePage = Math.max(1, Number(page) || 1);
    const safePageSize = Math.min(100, Math.max(1, Number(pageSize) || 20));

    let resolvedCategoryId = categoryId;
    if (!resolvedCategoryId && categorySlug?.trim()) {
      const slug = categorySlug.trim().toLowerCase();
      const cat = await this.prisma.category.findFirst({
        where: { slug: { equals: slug, mode: "insensitive" }, isActive: true },
        select: { id: true },
      });
      resolvedCategoryId = cat?.id ?? undefined;
    }

    // Try Elasticsearch first
    const esResult = await this.searchService.searchCollections({
      query: search,
      categoryId: resolvedCategoryId,
      isPublic: true,
      sortBy,
      page: safePage,
      pageSize: safePageSize,
    });

    if (esResult && esResult.ids.length > 0) {
      const validIds = esResult.ids.filter(
        (id): id is string => id != null && id !== "",
      );
      const expectedCount = Math.min(esResult.total, safePageSize);

      if (validIds.length < expectedCount * 0.5) {
        this.logger.warn(
          `ES returned ${validIds.length} valid IDs but expected ~${expectedCount} (total=${esResult.total}) – falling back to Prisma and triggering reindex`,
        );
        this.searchIndexing.queueReindexAllCollections().catch(() => {});
        return this.browsePublicCollectionsPrisma(
          safePage,
          safePageSize,
          sortBy,
          search,
          resolvedCategoryId,
        );
      }

      const hydrated = await this.hydrateCollections(
        validIds,
        esResult.total,
        safePage,
        safePageSize,
      );
      if (hydrated.collections.length < validIds.length * 0.5) {
        this.logger.warn(
          `ES returned ${validIds.length} IDs but Prisma hydrated only ${hydrated.collections.length} – stale index, falling back to Prisma`,
        );
        this.searchIndexing.queueReindexAllCollections().catch(() => {});
        return this.browsePublicCollectionsPrisma(
          safePage,
          safePageSize,
          sortBy,
          search,
          resolvedCategoryId,
        );
      }
      return hydrated;
    }

    // ES returned null (unavailable) or 0 results – fall back to Prisma (source of truth).
    return this.browsePublicCollectionsPrisma(
      safePage,
      safePageSize,
      sortBy,
      search,
      resolvedCategoryId,
    );
  }

  private async hydrateCollections(
    ids: string[],
    total: number,
    page: number,
    pageSize: number,
  ): Promise<CollectionListResponseDto> {
    const collections = await this.prisma.collection.findMany({
      where: { id: { in: ids } },
      include: {
        user: { select: { id: true, ...PUBLIC_NAME_SELECT } },
        category: { select: { id: true, name: true, slug: true } },
        _count: { select: { items: { where: VISIBLE_ITEM_FILTER } } },
      },
    });

    const orderMap = new Map(ids.map((id, i) => [id, i]));
    collections.sort(
      (a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0),
    );

    const noCover = collections.filter(
      (c) => !c.coverImageKey && (c._count?.items ?? 0) > 0,
    );
    if (noCover.length > 0) {
      Promise.all(
        noCover.map((c) => this.cover.generateCoverImage(c.id).catch(() => {})),
      ).catch(() => {});
    }

    return {
      collections: await Promise.all(
        collections.map(async (c) => ({
          id: c.id,
          userId: c.userId,
          userName: publicName(c.user),
          categoryId: c.categoryId ?? undefined,
          category: c.category
            ? {
                id: c.category.id,
                name: c.category.name,
                slug: c.category.slug,
              }
            : undefined,
          name: c.name,
          slug: c.slug,
          description: c.description || undefined,
          coverImageUrl: c.coverImageKey
            ? this.storageService.getPublicAssetUrl(c.coverImageKey)
            : undefined,
          isPublic: c.isPublic,
          viewCount: c.viewCount,
          likeCount: c.likeCount,
          itemCount: c._count?.items ?? 0,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        })),
      ),
      total,
      page,
      pageSize,
    };
  }

  private async browsePublicCollectionsPrisma(
    safePage: number,
    safePageSize: number,
    sortBy: string,
    search?: string,
    resolvedCategoryId?: string,
  ): Promise<CollectionListResponseDto> {
    const where: Prisma.CollectionWhereInput = {
      isPublic: true,
      ...(resolvedCategoryId ? { categoryId: resolvedCategoryId } : {}),
    };

    if (search && search.trim() !== "") {
      const trimmed = search.trim();
      const [collectionIds, userIds] = await Promise.all([
        fulltextCollectionSearch(this.prisma, trimmed),
        fulltextUserDisplayNameSearch(this.prisma, trimmed),
      ]);

      if (collectionIds.length === 0 && userIds.length === 0) {
        return {
          collections: [],
          total: 0,
          page: safePage,
          pageSize: safePageSize,
        };
      }

      const conditions: Prisma.CollectionWhereInput[] = [];
      if (collectionIds.length > 0)
        conditions.push({ id: { in: collectionIds } });
      if (userIds.length > 0) conditions.push({ userId: { in: userIds } });
      where.OR = conditions;
    }

    let orderBy: Prisma.CollectionOrderByWithRelationInput;
    let needsInMemorySort = false;

    switch (sortBy) {
      case "popular":
        orderBy = { viewCount: "desc" };
        break;
      case "recent":
        orderBy = { createdAt: "desc" };
        break;
      case "name":
        needsInMemorySort = true;
        orderBy = { createdAt: "desc" };
        break;
      case "items":
      case "items_asc":
      case "items_desc":
        needsInMemorySort = true;
        orderBy = { createdAt: "desc" };
        break;
      default:
        orderBy = { viewCount: "desc" };
    }

    let [collections, total] = await Promise.all([
      this.prisma.collection.findMany({
        where,
        include: {
          user: { select: { id: true, ...PUBLIC_NAME_SELECT } },
          category: { select: { id: true, name: true, slug: true } },
          _count: { select: { items: { where: VISIBLE_ITEM_FILTER } } },
        },
        ...(needsInMemorySort
          ? {}
          : {
              orderBy,
              skip: (safePage - 1) * safePageSize,
              take: safePageSize,
            }),
      }),
      this.prisma.collection.count({ where }),
    ]);

    if (needsInMemorySort) {
      if (sortBy === "name") {
        const collator = new Intl.Collator("tr", {
          sensitivity: "base",
          numeric: false,
        });
        collections = collections.sort((a, b) =>
          collator.compare(a.name.toLowerCase(), b.name.toLowerCase()),
        );
      } else if (sortBy === "items" || sortBy === "items_desc") {
        collections = collections.sort(
          (a, b) => (b._count?.items ?? 0) - (a._count?.items ?? 0),
        );
      } else if (sortBy === "items_asc") {
        collections = collections.sort(
          (a, b) => (a._count?.items ?? 0) - (b._count?.items ?? 0),
        );
      }
      collections = collections.slice(
        (safePage - 1) * safePageSize,
        safePage * safePageSize,
      );
    }

    const noCover = collections.filter(
      (c) => !c.coverImageKey && (c._count?.items ?? 0) > 0,
    );
    if (noCover.length > 0) {
      Promise.all(
        noCover.map((c) => this.cover.generateCoverImage(c.id).catch(() => {})),
      ).catch(() => {});
    }

    return {
      collections: await Promise.all(
        collections.map(async (c) => ({
          id: c.id,
          userId: c.userId,
          userName: publicName(c.user),
          categoryId: c.categoryId ?? undefined,
          category: c.category
            ? {
                id: c.category.id,
                name: c.category.name,
                slug: c.category.slug,
              }
            : undefined,
          name: c.name,
          slug: c.slug,
          description: c.description || undefined,
          coverImageUrl: c.coverImageKey
            ? this.storageService.getPublicAssetUrl(c.coverImageKey)
            : undefined,
          isPublic: c.isPublic,
          viewCount: c.viewCount,
          likeCount: c.likeCount,
          itemCount: c._count?.items ?? 0,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        })),
      ),
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
      throw new NotFoundException("Koleksiyon bulunamadı");
    }

    if (collection.userId !== userId) {
      throw new ForbiddenException("Bu koleksiyonu düzenleme yetkiniz yok");
    }

    // Değişen metin alanları denetimi
    if (dto.name && dto.name !== collection.name) {
      await this.moderationAi.assertTextClean(dto.name, {
        entityType: "collection",
        entityId: collectionId,
        userId,
        field: "name",
        label: "koleksiyon adı",
      });
    }
    if (
      dto.description !== undefined &&
      dto.description !== collection.description
    ) {
      await this.moderationAi.assertTextClean(dto.description, {
        entityType: "collection",
        entityId: collectionId,
        userId,
        field: "description",
        label: "koleksiyon açıklaması",
      });
    }

    let newSlug = collection.slug;
    if (dto.name && dto.name !== collection.name) {
      newSlug = generateSlug(dto.name);

      // Check if new slug already exists
      const existing = await this.prisma.collection.findFirst({
        where: {
          userId,
          slug: newSlug,
          id: { not: collectionId },
        },
      });

      if (existing) {
        throw new BadRequestException("Bu isimde bir koleksiyonunuz zaten var");
      }
    }

    const updated = await this.prisma.collection.update({
      where: { id: collectionId },
      data: {
        ...(dto.name && { name: dto.name, slug: newSlug }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.coverImageKey !== undefined && {
          coverImageKey: dto.coverImageKey,
        }),
        ...(dto.isPublic !== undefined && { isPublic: dto.isPublic }),
        ...(dto.categoryId !== undefined
          ? dto.categoryId == null || dto.categoryId === ""
            ? { category: { disconnect: true } }
            : { category: { connect: { id: dto.categoryId } } }
          : {}),
      },
      include: {
        user: { select: { id: true, ...PUBLIC_NAME_SELECT } },
        category: { select: { id: true, name: true, slug: true } },
        items: {
          include: {
            product: {
              include: {
                images: {
                  take: 1,
                },
              },
            },
          },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    return await this.common.mapCollectionToDto(updated, false);
  }

  // ==========================================================================
  // DELETE COLLECTION
  // ==========================================================================
  async deleteCollection(collectionId: string, userId: string): Promise<void> {
    const collection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
    });

    if (!collection) {
      throw new NotFoundException("Koleksiyon bulunamadı");
    }

    if (collection.userId !== userId) {
      throw new ForbiddenException("Bu koleksiyonu silme yetkiniz yok");
    }

    await this.prisma.collection.delete({
      where: { id: collectionId },
    });
  }
}
