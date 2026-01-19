import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { CacheService } from '../cache/cache.service';
import { CreateProductDto, UpdateProductDto, ProductQueryDto } from './dto';
import { ProductStatus, Prisma } from '@prisma/client';

@Injectable()
export class ProductService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /**
   * Create a new product
   * POST /products
   */
  async create(sellerId: string, dto: CreateProductDto) {
    // Verify seller status - auto-enable if not already a seller
    const seller = await this.prisma.user.findUnique({
      where: { id: sellerId },
    });

    if (!seller) {
      throw new ForbiddenException('Kullanıcı bulunamadı');
    }

    // Auto-enable seller mode when user creates their first listing
    if (!seller.isSeller) {
      await this.prisma.user.update({
        where: { id: sellerId },
        data: { 
          isSeller: true,
          sellerType: 'individual', // Default to individual seller
        },
      });
    }

    // Verify category exists
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
    });

    if (!category || !category.isActive) {
      throw new BadRequestException('Geçersiz kategori');
    }

    // Create product with images
    const product = await this.prisma.product.create({
      data: {
        sellerId,
        categoryId: dto.categoryId,
        title: dto.title,
        description: dto.description,
        price: dto.price,
        condition: dto.condition,
        status: ProductStatus.pending, // Needs admin approval
        images: dto.imageUrls?.length
          ? {
              create: dto.imageUrls.map((url, index) => ({
                url,
                sortOrder: index,
              })),
            }
          : undefined,
      },
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
        seller: {
          select: {
            id: true,
            displayName: true,
            isVerified: true,
            sellerType: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    // Invalidate product list cache
    await this.cache.delPattern('products:list:*');

    return this.formatProductResponse(product);
  }

  /**
   * Get paginated products with filters
   * GET /products
   */
  async findAll(query: ProductQueryDto) {
    const {
      search,
      categoryId,
      sellerId,
      status,
      condition,
      brand,
      scale,
      tradeOnly,
      minPrice,
      maxPrice,
      sortBy,
      page = 1,
      limit = 20,
    } = query;

    // Build cache key from query params
    const cacheKey = `products:list:${JSON.stringify({
      search,
      categoryId,
      sellerId,
      status: status || ProductStatus.active,
      condition,
      brand,
      scale,
      tradeOnly,
      minPrice,
      maxPrice,
      sortBy,
      page,
      limit,
    })}`;

    // Use cache with 5 minute TTL for product listings
    return this.cache.getOrSet(
      cacheKey,
      async () => {
        // Build where clause
        const where: Prisma.ProductWhereInput = {
          // By default, only show active products to public
          status: status || ProductStatus.active,
        };

        if (search) {
          where.OR = [
            { title: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
          ];
        }

        // Brand filter - search in title (since brand is typically in product title)
        if (brand) {
          where.title = { contains: brand, mode: 'insensitive' };
        }

        // Scale filter - search in title or description
        if (scale) {
          const scaleCondition = {
            OR: [
              { title: { contains: scale, mode: 'insensitive' } },
              { description: { contains: scale, mode: 'insensitive' } },
            ],
          };
          where.AND = where.AND ? [...(where.AND as any[]), scaleCondition] : [scaleCondition];
        }

        // Trade only filter
        if (tradeOnly) {
          where.isTradeEnabled = true;
        }

        if (categoryId) {
          where.categoryId = categoryId;
        }

        if (sellerId) {
          where.sellerId = sellerId;
        }

        if (condition) {
          where.condition = condition as any; // ProductCondition enum
        }

        if (minPrice !== undefined || maxPrice !== undefined) {
          where.price = {};
          if (minPrice !== undefined) {
            where.price.gte = minPrice;
          }
          if (maxPrice !== undefined) {
            where.price.lte = maxPrice;
          }
        }

        // Build order by
        let orderBy: Prisma.ProductOrderByWithRelationInput = { createdAt: 'desc' };
        switch (sortBy) {
          case 'price_asc':
            orderBy = { price: 'asc' };
            break;
          case 'price_desc':
            orderBy = { price: 'desc' };
            break;
          case 'created_asc':
            orderBy = { createdAt: 'asc' };
            break;
          case 'created_desc':
            orderBy = { createdAt: 'desc' };
            break;
          case 'title_asc':
            orderBy = { title: 'asc' };
            break;
          case 'title_desc':
            orderBy = { title: 'desc' };
            break;
        }

        // Count total
        const total = await this.prisma.product.count({ where });

        // Fetch products
        const products = await this.prisma.product.findMany({
          where,
          orderBy,
          skip: (page - 1) * limit,
          take: limit,
          include: {
            images: { orderBy: { sortOrder: 'asc' }, take: 1 }, // Only first image for list
            seller: {
              select: {
                id: true,
                displayName: true,
                isVerified: true,
                sellerType: true,
              },
            },
            category: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        });

        return {
          data: products.map((p) => this.formatProductResponse(p)),
          meta: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
          },
        };
      },
      { ttl: 300 }, // 5 minutes cache
    );
  }

  /**
   * Get single product by ID
   * GET /products/:id
   */
  async findOne(id: string) {
    const cacheKey = `products:detail:${id}`;

    // Use cache with 10 minute TTL for product details
    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const product = await this.prisma.product.findUnique({
          where: { id },
          include: {
            images: { orderBy: { sortOrder: 'asc' } },
            seller: {
              select: {
                id: true,
                displayName: true,
                isVerified: true,
                sellerType: true,
              },
            },
            category: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        });

        if (!product) {
          throw new NotFoundException('Ürün bulunamadı');
        }

        return this.formatProductResponse(product);
      },
      { ttl: 600 }, // 10 minutes cache
    );
  }

  /**
   * Update product
   * PATCH /products/:id
   */
  async update(id: string, sellerId: string, dto: UpdateProductDto) {
    // Find product with optimistic locking
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException('Ürün bulunamadı');
    }

    // Verify ownership
    if (product.sellerId !== sellerId) {
      throw new ForbiddenException('Bu ürünü düzenleme yetkiniz yok');
    }

    // Cannot update sold or reserved products
    if (product.status === ProductStatus.sold || product.status === ProductStatus.reserved) {
      throw new BadRequestException('Satılmış veya rezerve edilmiş ürünler güncellenemez');
    }

    // Verify category if being updated
    if (dto.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
      });

      if (!category || !category.isActive) {
        throw new BadRequestException('Geçersiz kategori');
      }
    }

    // Sellers can only set status to active or inactive
    if (dto.status && dto.status !== ProductStatus.active && dto.status !== ProductStatus.inactive) {
      throw new ForbiddenException('Sadece aktif veya pasif duruma geçirebilirsiniz');
    }

    // Check membership for trade feature
    let canEnableTrade = false;
    if (dto.isTradeEnabled === true) {
      const seller = await this.prisma.user.findUnique({
        where: { id: sellerId },
        include: { membershipTier: true },
      });
      
      if (!seller?.membershipTier?.canTrade) {
        throw new BadRequestException('Takas özelliği için Premium üyelik gereklidir. Üyeliğinizi yükseltin.');
      }
      canEnableTrade = true;
    }

    // Build update data
    const updateData: Prisma.ProductUpdateInput = {
      title: dto.title,
      description: dto.description,
      price: dto.price,
      condition: dto.condition,
      status: dto.status,
      isTradeEnabled: dto.isTradeEnabled !== undefined ? dto.isTradeEnabled : undefined,
      category: dto.categoryId ? { connect: { id: dto.categoryId } } : undefined,
      version: { increment: 1 }, // Optimistic locking
    };

    // Handle image updates if provided
    if (dto.imageUrls !== undefined) {
      // Delete existing images and create new ones
      await this.prisma.productImage.deleteMany({
        where: { productId: id },
      });

      if (dto.imageUrls.length > 0) {
        await this.prisma.productImage.createMany({
          data: dto.imageUrls.map((url, index) => ({
            productId: id,
            url,
            sortOrder: index,
          })),
        });
      }
    }

    // Update with optimistic locking
    try {
      const updated = await this.prisma.product.update({
        where: {
          id,
          version: product.version, // Optimistic lock check
        },
        data: updateData,
        include: {
          images: { orderBy: { sortOrder: 'asc' } },
          seller: {
            select: {
              id: true,
              displayName: true,
              isVerified: true,
              sellerType: true,
            },
          },
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      });

      // Invalidate cache for this product and product lists
      await this.cache.del(`products:detail:${id}`);
      await this.cache.delPattern('products:list:*');

      return this.formatProductResponse(updated);
    } catch (error) {
      if (error.code === 'P2025') {
        throw new ConflictException('Ürün başka bir işlem tarafından güncellendi. Lütfen yenileyin.');
      }
      throw error;
    }
  }

  /**
   * Delete product (soft delete by setting inactive)
   * DELETE /products/:id
   */
  async remove(id: string, sellerId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException('Ürün bulunamadı');
    }

    // Verify ownership
    if (product.sellerId !== sellerId) {
      throw new ForbiddenException('Bu ürünü silme yetkiniz yok');
    }

    // Cannot delete sold or reserved products
    if (product.status === ProductStatus.sold || product.status === ProductStatus.reserved) {
      throw new BadRequestException('Satılmış veya rezerve edilmiş ürünler silinemez');
    }

    // Soft delete: set status to inactive
    await this.prisma.product.update({
      where: { id },
      data: { status: ProductStatus.inactive },
    });

    // Invalidate cache
    await this.cache.del(`products:detail:${id}`);
    await this.cache.delPattern('products:list:*');

    return { message: 'Ürün silindi' };
  }

  /**
   * Get seller's own products (all statuses)
   */
  async findSellerProducts(sellerId: string, query: ProductQueryDto) {
    const { status, page = 1, limit = 20 } = query;

    const where: Prisma.ProductWhereInput = {
      sellerId,
      status: status, // Allow filtering by status for own products
    };

    const total = await this.prisma.product.count({ where });

    const products = await this.prisma.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        _count: {
          select: {
            offers: { where: { status: 'pending' } },
          },
        },
      },
    });

    return {
      data: products.map((p) => ({
        ...this.formatProductResponse(p),
        pendingOffersCount: p._count.offers,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Format product response
   */
  private formatProductResponse(product: any) {
    return {
      id: product.id,
      title: product.title,
      description: product.description,
      price: Number(product.price),
      condition: product.condition,
      status: product.status,
      isTradeEnabled: product.isTradeEnabled || false,
      viewCount: product.viewCount || 0,
      images: product.images?.map((img: any) => ({
        id: img.id,
        url: img.url,
        sortOrder: img.sortOrder,
      })) || [],
      seller: product.seller
        ? {
            id: product.seller.id,
            displayName: product.seller.displayName,
            isVerified: product.seller.isVerified,
            sellerType: product.seller.sellerType,
          }
        : undefined,
      category: product.category
        ? {
            id: product.category.id,
            name: product.category.name,
            slug: product.category.slug,
          }
        : undefined,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }
}
