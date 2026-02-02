import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { CacheService } from '../cache/cache.service';
import { Category } from '@prisma/client';

@Injectable()
export class CategoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) { }

  /**
   * Get all active categories (hierarchical)
   */
  async findAll() {
    const cacheKey = 'categories:all';

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const categories = await this.prisma.category.findMany({
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          include: {
            _count: {
              select: {
                products: { where: { status: 'active' } },
              },
            },
          },
        });

        // Build hierarchy
        const rootCategories = categories.filter((c) => !c.parentId);
        const childrenMap = new Map<string, typeof categories>();

        categories.forEach((c) => {
          if (c.parentId) {
            if (!childrenMap.has(c.parentId)) {
              childrenMap.set(c.parentId, []);
            }
            childrenMap.get(c.parentId)!.push(c);
          }
        });

        return rootCategories.map((root) => this.buildCategoryTree(root, childrenMap));
      },
      { ttl: 3600 }, // 1 hour cache for categories
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
            products: { where: { status: 'active' } },
          },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Kategori bulunamadı');
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
            products: { where: { status: 'active' } },
          },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Kategori bulunamadı');
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
      children: children.map((child) => this.buildCategoryTree(child, childrenMap)),
    };
  }
  /**
   * Create a new category
   */
  async create(data: any): Promise<Category> {
    const slug = this.generateSlug(data.name);

    // Check if slug exists
    const existing = await this.prisma.category.findUnique({
      where: { slug },
    });

    if (existing) {
      // Append random string to make unique
      const random = Math.random().toString(36).substring(7);
      return this.create({ ...data, name: `${data.name}-${random}` });
    }

    const category = await this.prisma.category.create({
      data: {
        ...data,
        slug,
      },
    });

    this.cache.del('categories:all');
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
      throw new NotFoundException('Kategori bulunamadı');
    }

    let slug = category.slug;
    if (data.name && data.name !== category.name) {
      slug = this.generateSlug(data.name);
      const existing = await this.prisma.category.findUnique({
        where: { slug },
      });
      if (existing && existing.id !== id) {
        slug = `${slug}-${Math.random().toString(36).substring(7)}`;
      }
    }

    const updated = await this.prisma.category.update({
      where: { id },
      data: {
        ...data,
        slug,
      },
    });

    this.cache.del('categories:all');
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
      throw new Error('Bu kategoriye ait ürünler var, silinemez.');
    }

    // Check children
    const childCount = await this.prisma.category.count({
      where: { parentId: id },
    });

    if (childCount > 0) {
      throw new Error('Alt kategorileri olan kategori silinemez.');
    }

    const result = await this.prisma.category.delete({
      where: { id },
    });

    this.cache.del('categories:all');
    return result;
  }

  private generateSlug(text: string): string {
    const trMap: Record<string, string> = {
      'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u',
      'Ç': 'c', 'Ğ': 'g', 'İ': 'i', 'Ö': 'o', 'Ş': 's', 'Ü': 'u'
    };

    return text
      .split('')
      .map(char => trMap[char] || char)
      .join('')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  }
}
