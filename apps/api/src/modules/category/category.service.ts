import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { CacheService } from "../cache/cache.service";
import { Category } from "@prisma/client";
import { generateSlug } from "../../common/helpers/slug";
import { saleCapableSellerWhere } from "../membership/membership.util";
import { catalogProductWhere } from "../product/helpers/catalog-product-where";
import {
  assertCategoryHasPublishedCommissionCoverage,
  assertNoActiveCategoryDescendants,
  assertValidCategoryParent,
  CATEGORIES_CACHE_KEY,
} from "./category-integrity.helper";

@Injectable()
export class CategoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /**
   * Invalidate categories cache (e.g. after seed or admin category change)
   */
  async invalidateCache(): Promise<void> {
    await this.cache.del(CATEGORIES_CACHE_KEY);
  }

  /**
   * Get all active categories (hierarchical)
   */
  async findAll() {
    return this.cache.getOrSet(
      CATEGORIES_CACHE_KEY,
      async () => {
        const categories = await this.prisma.category.findMany({
          where: { isActive: true },
          orderBy: { sortOrder: "asc" },
          include: {
            _count: {
              select: {
                products: {
                  where: {
                    ...catalogProductWhere(),
                    status: "active",
                    seller: saleCapableSellerWhere(),
                  },
                },
              },
            },
          },
        });

        // Build hierarchy
        const activeCategoryIds = new Set(categories.map((c) => c.id));
        const rootCategories = categories.filter(
          (c) => !c.parentId || !activeCategoryIds.has(c.parentId),
        );
        const childrenMap = new Map<string, typeof categories>();

        categories.forEach((c) => {
          if (c.parentId) {
            if (!childrenMap.has(c.parentId)) {
              childrenMap.set(c.parentId, []);
            }
            childrenMap.get(c.parentId)!.push(c);
          }
        });

        return rootCategories.map((root) =>
          this.buildCategoryTree(root, childrenMap),
        );
      },
      { ttl: 300 }, // 5 min cache
    );
  }

  /**
   * Get category by ID with product count
   */
  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        parent: {
          select: { id: true, name: true, slug: true },
        },
        children: {
          where: { isActive: true },
          select: { id: true, name: true, slug: true },
        },
        _count: {
          select: {
            products: {
              where: {
                ...catalogProductWhere(),
                status: "active",
                seller: saleCapableSellerWhere(),
              },
            },
          },
        },
      },
    });

    if (!category) {
      throw new NotFoundException("Kategori bulunamadı");
    }

    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      parent: category.parent,
      children: category.children,
      productCount: category._count.products,
    };
  }

  /**
   * Get category by slug
   */
  async findBySlug(slug: string) {
    const category = await this.prisma.category.findUnique({
      where: { slug },
      include: {
        parent: {
          select: { id: true, name: true, slug: true },
        },
        children: {
          where: { isActive: true },
          select: { id: true, name: true, slug: true },
        },
        _count: {
          select: {
            products: {
              where: {
                ...catalogProductWhere(),
                status: "active",
                seller: saleCapableSellerWhere(),
              },
            },
          },
        },
      },
    });

    if (!category) {
      throw new NotFoundException("Kategori bulunamadı");
    }

    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      parent: category.parent,
      children: category.children,
      productCount: category._count.products,
    };
  }

  /**
   * Build category tree recursively
   */
  private buildCategoryTree(
    category: any,
    childrenMap: Map<string, any[]>,
  ): any {
    const children = childrenMap.get(category.id) || [];

    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      productCount: category._count.products,
      children: children.map((child) =>
        this.buildCategoryTree(child, childrenMap),
      ),
    };
  }
  /**
   * Create a new category
   */
  async create(data: any): Promise<Category> {
    if (data.isActive === true) {
      throw new BadRequestException(
        "Yeni kategori önce pasif oluşturulmalı, komisyon kuralları yayınlandıktan sonra aktifleştirilmelidir.",
      );
    }
    if (data.parentId) {
      await assertValidCategoryParent(
        this.prisma,
        "new-category",
        data.parentId,
        false,
      );
    }
    const slug = await this.uniqueSlug(generateSlug(data.name));

    const category = await this.prisma.category.create({
      data: {
        ...data,
        slug,
        isActive: false,
      },
    });

    await this.invalidateCache();
    return category;
  }

  /**
   * Update category
   */
  async update(id: string, data: any): Promise<Category> {
    const category = await this.prisma.category.findUnique({
      where: { id },
    });

    if (!category) {
      throw new NotFoundException("Kategori bulunamadı");
    }

    const nextParentId =
      data.parentId !== undefined ? data.parentId || null : category.parentId;
    const nextIsActive = data.isActive ?? category.isActive;
    if (
      nextParentId &&
      (data.parentId !== undefined || data.isActive === true)
    ) {
      await assertValidCategoryParent(
        this.prisma,
        id,
        nextParentId,
        nextIsActive,
      );
    }
    if (data.isActive === false && category.isActive) {
      await assertNoActiveCategoryDescendants(this.prisma, id);
    }
    if (data.isActive === true && !category.isActive) {
      await assertCategoryHasPublishedCommissionCoverage(this.prisma, id);
    }

    let slug = category.slug;
    if (data.name && data.name !== category.name) {
      slug = await this.uniqueSlug(generateSlug(data.name), id);
    }

    const updated = await this.prisma.category.update({
      where: { id },
      data: {
        ...data,
        slug,
      },
    });

    await this.invalidateCache();
    return updated;
  }

  /**
   * Delete category
   */
  async remove(id: string): Promise<Category> {
    // Check if category has products
    const productCount = await this.prisma.product.count({
      where: { categoryId: id },
    });

    if (productCount > 0) {
      // Soft delete if products exist? Or prevent delete?
      // Prevent delete is safer.
      throw new Error("Bu kategoriye ait ürünler var, silinemez.");
    }

    // Check children
    const childCount = await this.prisma.category.count({
      where: { parentId: id },
    });

    if (childCount > 0) {
      throw new Error("Alt kategorileri olan kategori silinemez.");
    }

    const result = await this.prisma.category.delete({
      where: { id },
    });

    await this.invalidateCache();
    return result;
  }

  /**
   * Çakışan slug'a artan sayaç ekler: `model-arabalar`, `model-arabalar-2`…
   * Önceki sürüm rastgele bir sonek üretiyordu; hem `Math.random` kullanıyor
   * hem de `.substring(7)` bazen boş string döndürüp "slug-" üretiyordu.
   * Ayrıca create yolunda soneki KATEGORİ ADINA yazıyordu.
   */
  private async uniqueSlug(base: string, excludeId?: string): Promise<string> {
    let candidate = base;
    for (let counter = 2; ; counter++) {
      const existing = await this.prisma.category.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!existing || existing.id === excludeId) return candidate;
      candidate = `${base}-${counter}`;
    }
  }
}
