// =============================================================================
// GAP-L02: GRAPHQL CATEGORY RESOLVER
// =============================================================================

import { Logger } from '@nestjs/common';
import { Resolver, Query, Args, Int, ID } from '@nestjs/graphql';
import { CategoryType, CategoryTreeType } from '../types/category.type';
import { PrismaService } from '../../../prisma';
import { ProductStatus } from '@prisma/client';

@Resolver(() => CategoryType)
export class CategoryResolver {
  private readonly logger = new Logger(CategoryResolver.name);

  constructor(private readonly prisma: PrismaService) {}

  @Query(() => CategoryType, { name: 'category', nullable: true })
  async getCategory(@Args('id', { type: () => ID }) id: string): Promise<CategoryType | null> {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        parent: true,
        children: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        },
        products: {
          where: { status: ProductStatus.active },
        },
      },
    });

    if (!category) return null;

    return this.mapCategory(category);
  }

  @Query(() => CategoryType, { name: 'categoryBySlug', nullable: true })
  async getCategoryBySlug(@Args('slug', { type: () => String }) slug: string): Promise<CategoryType | null> {
    const category = await this.prisma.category.findUnique({
      where: { slug },
      include: {
        parent: true,
        children: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        },
        products: {
          where: { status: ProductStatus.active },
        },
      },
    });

    if (!category) return null;

    return this.mapCategory(category);
  }

  @Query(() => CategoryTreeType, { name: 'categories' })
  async getCategories(
    @Args('parentId', { type: () => ID, nullable: true }) parentId?: string,
    @Args('activeOnly', { type: () => Boolean, nullable: true, defaultValue: true }) activeOnly?: boolean,
  ): Promise<CategoryTreeType> {
    try {
      const where: any = {};
      
      // Only filter by parentId if it's explicitly provided
      if (parentId !== undefined && parentId !== '') {
        where.parentId = parentId;
      } else {
        // Default: get root categories
        where.parentId = null;
      }
      
      if (activeOnly !== false) {
        where.isActive = true;
      }

      const categories = await this.prisma.category.findMany({
        where,
        orderBy: { sortOrder: 'asc' },
        include: {
          parent: true,
          children: {
            where: activeOnly !== false ? { isActive: true } : {},
            orderBy: { sortOrder: 'asc' },
          },
          products: {
            where: { status: ProductStatus.active },
          },
        },
      });

      return {
        categories: categories.map((c) => this.mapCategory(c)),
        total: categories.length,
      };
    } catch (error) {
      this.logger.warn('GraphQL categories query error');
      return {
        categories: [],
        total: 0,
      };
    }
  }

  @Query(() => [CategoryType], { name: 'allCategories', description: 'Get all categories without filters' })
  async getAllCategories(): Promise<CategoryType[]> {
    try {
      const categories = await this.prisma.category.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        include: {
          products: {
            where: { status: ProductStatus.active },
          },
        },
      });

      return categories.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description || undefined,
        parentId: c.parentId || undefined,
        sortOrder: c.sortOrder,
        isActive: c.isActive,
        productCount: c.products?.length || 0,
        children: undefined,
        parent: undefined,
      }));
    } catch (error) {
      this.logger.warn('GraphQL allCategories query error');
      return [];
    }
  }

  @Query(() => [CategoryType], { name: 'categoryTree' })
  async getCategoryTree(): Promise<CategoryType[]> {
    // Get all root categories with their children (2 levels deep)
    const rootCategories = await this.prisma.category.findMany({
      where: {
        parentId: null,
        isActive: true,
      },
      orderBy: { sortOrder: 'asc' },
      include: {
        children: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          include: {
            children: {
              where: { isActive: true },
              orderBy: { sortOrder: 'asc' },
              include: {
                products: {
                  where: { status: ProductStatus.active },
                },
              },
            },
            products: {
              where: { status: ProductStatus.active },
            },
          },
        },
        products: {
          where: { status: ProductStatus.active },
        },
      },
    });

    return rootCategories.map((c) => this.mapCategoryDeep(c));
  }

  @Query(() => [CategoryType], { name: 'popularCategories' })
  async getPopularCategories(
    @Args('limit', { type: () => Int, defaultValue: 6 }) limit: number,
  ): Promise<CategoryType[]> {
    // Get categories with most active products
    const categories = await this.prisma.category.findMany({
      where: { isActive: true },
      include: {
        products: {
          where: { status: ProductStatus.active },
        },
      },
    });

    // Sort by product count
    const sorted = categories
      .map((c) => ({ ...c, productCount: c.products.length }))
      .sort((a, b) => b.productCount - a.productCount)
      .slice(0, limit);

    return sorted.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description || undefined,
      parentId: c.parentId || undefined,
      sortOrder: c.sortOrder,
      isActive: c.isActive,
      productCount: c.productCount,
      children: undefined,
      parent: undefined,
    }));
  }

  private mapCategory(category: any): CategoryType {
    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description || undefined,
      parentId: category.parentId || undefined,
      sortOrder: category.sortOrder,
      isActive: category.isActive,
      productCount: category.products?.length || 0,
      children: category.children?.map((c: any) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description || undefined,
        parentId: c.parentId || undefined,
        sortOrder: c.sortOrder,
        isActive: c.isActive,
        productCount: c.products?.length || 0,
        children: undefined,
        parent: undefined,
      })) || undefined,
      parent: category.parent ? {
        id: category.parent.id,
        name: category.parent.name,
        slug: category.parent.slug,
        description: category.parent.description || undefined,
        parentId: category.parent.parentId || undefined,
        sortOrder: category.parent.sortOrder,
        isActive: category.parent.isActive,
        productCount: 0,
        children: undefined,
        parent: undefined,
      } : undefined,
    };
  }

  private mapCategoryDeep(category: any): CategoryType {
    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description || undefined,
      parentId: category.parentId || undefined,
      sortOrder: category.sortOrder,
      isActive: category.isActive,
      productCount: category.products?.length || 0,
      children: category.children?.map((c: any) => this.mapCategoryDeep(c)) || undefined,
      parent: undefined,
    };
  }
}
