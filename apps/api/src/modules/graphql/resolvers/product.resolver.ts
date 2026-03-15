// =============================================================================
// GAP-L02: GRAPHQL PRODUCT RESOLVER
// =============================================================================

import { Resolver, Query, Args, Int, ID } from '@nestjs/graphql';
import { ProductType, PaginatedProductsType } from '../types/product.type';
import { PrismaService } from '../../../prisma';
import { ProductStatus, ProductCondition } from '@prisma/client';
import { fulltextProductSearch } from '../../product/helpers/fulltext-search';

@Resolver(() => ProductType)
export class ProductResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => ProductType, { name: 'product', nullable: true })
  async getProduct(@Args('id', { type: () => ID }) id: string): Promise<ProductType | null> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        seller: true,
        category: true,
        images: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!product) return null;

    return this.mapProduct(product);
  }

  @Query(() => PaginatedProductsType, { name: 'products' })
  async getProducts(
    @Args('page', { type: () => Int, defaultValue: 1 }) page: number,
    @Args('limit', { type: () => Int, defaultValue: 20 }) limit: number,
    @Args('categoryId', { type: () => ID, nullable: true }) categoryId?: string,
    @Args('status', { type: () => ProductStatus, nullable: true }) status?: ProductStatus,
    @Args('condition', { type: () => ProductCondition, nullable: true }) condition?: ProductCondition,
    @Args('minPrice', { type: () => Int, nullable: true }) minPrice?: number,
    @Args('maxPrice', { type: () => Int, nullable: true }) maxPrice?: number,
    @Args('isTradeEnabled', { type: () => Boolean, nullable: true }) isTradeEnabled?: boolean,
    @Args('sellerId', { type: () => ID, nullable: true }) sellerId?: string,
    @Args('search', { type: () => String, nullable: true }) search?: string,
  ): Promise<PaginatedProductsType> {
    const skip = (page - 1) * limit;

    const where: any = {
      // Exclude membership virtual products (used only for payment processing)
      NOT: { id: { startsWith: 'membership-' } },
    };

    if (categoryId) where.categoryId = categoryId;
    if (status) where.status = status;
    else where.status = ProductStatus.active; // Default to active only
    if (condition) where.condition = condition;
    if (isTradeEnabled !== undefined) where.isTradeEnabled = isTradeEnabled;
    if (sellerId) where.sellerId = sellerId;

    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) where.price.gte = minPrice;
      if (maxPrice) where.price.lte = maxPrice;
    }

    if (search) {
      const fulltextIds = await fulltextProductSearch(this.prisma, search, limit * page);
      if (fulltextIds.length === 0) {
        return { items: [], total: 0, page, limit, totalPages: 0, hasNext: false, hasPrev: false };
      }
      where.id = { in: fulltextIds };
    }

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          seller: true,
          category: true,
          images: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      items: products.map((p) => this.mapProduct(p)),
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  @Query(() => [ProductType], { name: 'featuredProducts' })
  async getFeaturedProducts(
    @Args('limit', { type: () => Int, defaultValue: 10 }) limit: number,
  ): Promise<ProductType[]> {
    const products = await this.prisma.product.findMany({
      where: {
        status: ProductStatus.active,
        NOT: { id: { startsWith: 'membership-' } },
      },
      orderBy: { viewCount: 'desc' },
      take: limit,
      include: {
        seller: true,
        category: true,
        images: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    return products.map((p) => this.mapProduct(p));
  }

  @Query(() => [ProductType], { name: 'recentProducts' })
  async getRecentProducts(
    @Args('limit', { type: () => Int, defaultValue: 10 }) limit: number,
  ): Promise<ProductType[]> {
    const products = await this.prisma.product.findMany({
      where: {
        status: ProductStatus.active,
        NOT: { id: { startsWith: 'membership-' } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        seller: true,
        category: true,
        images: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    return products.map((p) => this.mapProduct(p));
  }

  private mapProduct(product: any): ProductType {
    return {
      id: product.id,
      title: product.title,
      description: product.description,
      price: product.price.toNumber(),
      condition: product.condition,
      status: product.status,
      isTradeEnabled: product.isTradeEnabled,
      viewCount: product.viewCount,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      seller: {
        id: product.seller.id,
        displayName: product.seller.displayName,
        avatarUrl: product.seller.avatarUrl,
        isVerified: product.seller.isVerified,
        rating: undefined, // Would need to calculate from ratings
      },
      category: {
        id: product.category.id,
        name: product.category.name,
        slug: product.category.slug,
      },
      images: product.images.map((img: any) => ({
        id: img.id,
        url: img.url,
        sortOrder: img.sortOrder,
      })),
    };
  }
}
