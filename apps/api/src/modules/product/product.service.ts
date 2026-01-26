import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Inject,
  forwardRef,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { CacheService } from '../cache/cache.service';
import { MembershipService } from '../membership/membership.service';
import { SearchService } from '../search/search.service';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/dto';
import { SmtpProvider } from '../notification/providers/smtp.provider';
import { CreateProductDto, UpdateProductDto, ProductQueryDto } from './dto';
import { ProductStatus, Prisma } from '@prisma/client';

@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    @Inject(forwardRef(() => MembershipService))
    private readonly membershipService: MembershipService,
    private readonly searchService: SearchService,
    @Inject(forwardRef(() => NotificationService))
    private readonly notificationService: NotificationService,
    private readonly smtpProvider: SmtpProvider,
  ) {}

  /**
   * Create a new product
   * POST /products
   * 
   * Membership Listing Limits:
   * - Free: 5 free listings, 10 total
   * - Basic: 15 free listings, 50 total
   * - Premium: 50 free listings, 200 total
   * - Business: 200 free listings, 1000 total
   */
  async create(sellerId: string, dto: CreateProductDto) {
    // Verify seller status - auto-enable if not already a seller
    const seller = await this.prisma.user.findUnique({
      where: { id: sellerId },
    });

    if (!seller) {
      throw new ForbiddenException('Kullanıcı bulunamadı');
    }

    // Check if user is banned
    if (seller.isBanned) {
      throw new ForbiddenException('Hesabınız banlanmış. Yeni ürün ekleyemezsiniz.');
    }

    // ========================================================================
    // MEMBERSHIP LISTING LIMIT CHECK
    // ========================================================================
    const canCreate = await this.membershipService.canCreateListing(sellerId);
    if (!canCreate.allowed) {
      // Get detailed limits for error message
      const limits = await this.membershipService.getUserLimits(sellerId);
      throw new ForbiddenException(
        `İlan limitinize ulaştınız. Mevcut üyeliğiniz (${limits.tierName}) ile maksimum ${limits.remainingTotalListings + await this.getActiveListingCount(sellerId)} ilan oluşturabilirsiniz. ` +
        `Daha fazla ilan eklemek için üyeliğinizi yükseltin.`
      );
    }

    // Check image limit based on membership tier
    const limits = await this.membershipService.getUserLimits(sellerId);
    if (dto.imageUrls && dto.imageUrls.length > limits.maxImages) {
      throw new BadRequestException(
        `Üyeliğiniz (${limits.tierName}) ile ilan başına maksimum ${limits.maxImages} görsel yükleyebilirsiniz. ` +
        `${dto.imageUrls.length} görsel gönderdiniz.`
      );
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
        quantity: dto.quantity !== undefined ? dto.quantity : null, // null = unlimited stock
        isTradeEnabled: dto.isTradeEnabled || false,
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

    // Index to Elasticsearch (only if status is active)
    if (product.status === ProductStatus.active) {
      try {
        await this.searchService.indexProduct(product.id);
      } catch (error) {
        console.error('Failed to index product to Elasticsearch:', error);
        // Don't fail the request if indexing fails
      }
    }

    return await this.formatProductResponse(product);
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
          // IMPORTANT: Public listings MUST only show active products
          // Ignore any status parameter from query - only active products are visible publicly
          status: ProductStatus.active,
          // Only show products with available stock (quantity > 0 or quantity is null for unlimited)
          AND: [
            {
              OR: [
                { quantity: { gt: 0 } },
                { quantity: null },
              ],
            },
          ],
        };

        if (search) {
          const searchCondition = {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ],
          };
          where.AND = where.AND ? [...(where.AND as any[]), searchCondition] : [searchCondition];
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
        const useScoring = !sortBy; // Use scoring only if no explicit sortBy is provided
        
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

        // Fetch products with membership info if using scoring
        const products = await this.prisma.product.findMany({
          where,
          orderBy: useScoring ? undefined : orderBy, // Skip orderBy if using scoring
          skip: useScoring ? 0 : (page - 1) * limit, // Fetch all if scoring, then paginate after
          take: useScoring ? undefined : limit,
          include: {
            images: { orderBy: { sortOrder: 'asc' }, take: 1 }, // Only first image for list
            seller: useScoring
              ? {
                  include: {
                    membership: {
                      include: {
                        tier: {
                          select: {
                            type: true,
                          },
                        },
                      },
                    },
                  },
                }
              : {
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

        // Calculate scores and sort if using scoring
        let productsToReturn = products;
        if (useScoring) {
          productsToReturn = products
            .map((product) => {
              // Calculate membership score
              let membershipScore = 1; // Default: Free tier
              // Check if seller has active membership
              const membership = (product.seller as any).membership;
              if (membership && membership.status === 'active' && membership.tier?.type) {
                const tierType = membership.tier.type;
                if (tierType === 'premium' || tierType === 'business') {
                  membershipScore = 3;
                } else {
                  membershipScore = 1;
                }
              }

              // Calculate view count score
              const viewCount = product.viewCount || 0;
              let viewScore = 1;
              if (viewCount >= 10000) {
                viewScore = 3;
              } else if (viewCount >= 1000) {
                viewScore = 2;
              }

              // Calculate like count score
              const likeCount = product.likeCount || 0;
              let likeScore = 1;
              if (likeCount >= 100) {
                likeScore = 3;
              } else if (likeCount >= 50) {
                likeScore = 2;
              }

              // Total score
              const totalScore = membershipScore + viewScore + likeScore;

              return {
                ...product,
                _score: totalScore,
                _random: Math.random(), // For randomizing same scores
              };
            })
            .sort((a, b) => {
              // Sort by score (desc), then random for same scores
              if (b._score !== a._score) {
                return b._score - a._score;
              }
              return b._random - a._random;
            })
            .slice((page - 1) * limit, page * limit) // Paginate after sorting
            .map(({ _score, _random, ...product }) => {
              // Clean up seller object - remove membership if it was included
              const cleanedProduct = { ...product };
              if ((cleanedProduct.seller as any).membership) {
                cleanedProduct.seller = {
                  id: cleanedProduct.seller.id,
                  displayName: (cleanedProduct.seller as any).displayName,
                  isVerified: (cleanedProduct.seller as any).isVerified,
                  sellerType: (cleanedProduct.seller as any).sellerType,
                };
              }
              return cleanedProduct;
            });
        }

        const formattedProducts = await Promise.all(
          productsToReturn.map((p) => this.formatProductResponse(p))
        );

        return {
          data: formattedProducts,
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

        // Allow active and sold products to be viewable
        // Sold products will show "Out of Stock" on the frontend
        // Pending, rejected, inactive products are NOT visible publicly
        const viewableStatuses: ProductStatus[] = [ProductStatus.active, ProductStatus.sold];
        if (!viewableStatuses.includes(product.status)) {
          throw new NotFoundException('Ürün bulunamadı');
        }

        return await this.formatProductResponse(product);
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

    // Check if user is banned
    const seller = await this.prisma.user.findUnique({
      where: { id: sellerId },
      select: { isBanned: true },
    });

    if (seller?.isBanned) {
      throw new ForbiddenException('Hesabınız banlanmış. Ürün düzenleyemezsiniz.');
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
        include: { membership: { include: { tier: true } } },
      });
      
      if (!seller?.membership?.tier?.canTrade) {
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
      // CRITICAL: Handle quantity properly
      // - If dto.quantity is explicitly null, set to null (unlimited stock)
      // - If dto.quantity is a number, set to that number
      // - If dto.quantity is undefined, don't update (preserve existing value)
      quantity: dto.quantity !== undefined ? (dto.quantity === null ? null : Number(dto.quantity)) : undefined,
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

    // Check if price changed (for wishlist notifications)
    const oldPrice = Number(product.price);
    const newPrice = dto.price ? Number(dto.price) : oldPrice;
    const priceChanged = dto.price !== undefined && oldPrice !== newPrice;

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

      // If price changed, notify users who have this product in their wishlist
      if (priceChanged && updated.status === ProductStatus.active) {
        try {
          await this.notifyWishlistUsersOfPriceChange(id, oldPrice, newPrice, updated.title);
        } catch (error) {
          // Don't fail the update if notification fails
          this.logger.error(`Failed to notify wishlist users of price change for product ${id}:`, error);
        }
      }

      // Update Elasticsearch index (only if status is active)
      if (updated.status === ProductStatus.active) {
        try {
          await this.searchService.indexProduct(updated.id);
        } catch (error) {
          console.error('Failed to update product in Elasticsearch:', error);
          // Don't fail the request if indexing fails
        }
      } else {
        // Remove from index if status changed to non-active
        try {
          await this.searchService.removeProduct(updated.id);
        } catch (error) {
          console.error('Failed to remove product from Elasticsearch:', error);
          // Don't fail the request if indexing fails
        }
      }

      return await this.formatProductResponse(updated);
    } catch (error) {
      if (error.code === 'P2025') {
        throw new ConflictException('Ürün başka bir işlem tarafından güncellendi. Lütfen yenileyin.');
      }
      throw error;
    }
  }

  /**
   * Notify users who have this product in their wishlist about price change
   * Sends both in-app notifications and emails
   */
  private async notifyWishlistUsersOfPriceChange(
    productId: string,
    oldPrice: number,
    newPrice: number,
    productTitle: string,
  ): Promise<void> {
    // Get all wishlist items for this product with user info
    const wishlistItems = await this.prisma.wishlistItem.findMany({
      where: { productId },
      include: {
        wishlist: {
          include: {
            user: true, // Get full user object to check acceptsMarketingEmails
          },
        },
      },
    });

    // Filter users who accept marketing emails for email notifications
    const usersToNotify = wishlistItems
      .map((item) => (item as any).wishlist?.user)
      .filter((user: any) => user !== null && user !== undefined);

    if (usersToNotify.length === 0) {
      return;
    }

    // Determine if price increased or decreased
    const priceChange = newPrice - oldPrice;
    const isPriceDrop = priceChange < 0;
    const priceChangePercent = ((priceChange / oldPrice) * 100).toFixed(1);

    // Send both in-app notifications and emails to each user
    for (const user of usersToNotify) {
      try {
        // 1. Send in-app notification (only for price drops)
        if (isPriceDrop) {
          await this.notificationService.createInAppNotification(
            user.id,
            NotificationType.PRICE_DROP,
            {
              productId,
              productTitle,
              newPrice,
            },
          );
        }

        // 2. Send email (only for users who accept marketing emails)
        try {
          const acceptsMarketingEmails = user.acceptsMarketingEmails === true;
          if (acceptsMarketingEmails) {
            const htmlContent = this.generatePriceChangeEmailHtml(
              user.displayName,
              productTitle,
              oldPrice,
              newPrice,
              priceChange,
              priceChangePercent,
              isPriceDrop,
              productId,
            );
            const textContent = this.generatePriceChangeEmailText(
              user.displayName,
              productTitle,
              oldPrice,
              newPrice,
              priceChange,
              priceChangePercent,
              isPriceDrop,
              productId,
            );

            await this.smtpProvider.sendEmail({
              to: user.email,
              subject: isPriceDrop
                ? `🎉 Fiyat Düştü: ${productTitle}`
                : `📈 Fiyat Değişti: ${productTitle}`,
              html: htmlContent,
              text: textContent,
            });
          }
        } catch (emailError: any) {
          // Email failure shouldn't stop in-app notification
          this.logger.warn(`Failed to send price change email for user ${user.id}:`, emailError);
        }
      } catch (error: any) {
        this.logger.error(`Failed to send price change notification for user ${user.id}:`, error);
      }
    }

    this.logger.log(`Sent price change notifications to ${usersToNotify.length} users for product ${productId}`);
  }

  /**
   * Generate HTML content for price change email
   */
  private generatePriceChangeEmailHtml(
    userName: string,
    productTitle: string,
    oldPrice: number,
    newPrice: number,
    priceChange: number,
    priceChangePercent: string,
    isPriceDrop: boolean,
    productId: string,
  ): string {
    const baseStyle = `
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      max-width: 600px;
      margin: 0 auto;
      background: #ffffff;
      padding: 32px;
    `;
    const headerStyle = `color: #1a1a2e; margin-bottom: 24px;`;
    const buttonStyle = `
      display: inline-block;
      padding: 14px 28px;
      background-color: #4f46e5;
      color: white;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
    `;
    const boxStyle = `
      background: #f8fafc;
      padding: 20px;
      border-radius: 12px;
      margin: 20px 0;
      border: 1px solid #e2e8f0;
    `;

    return `
      <div style="${baseStyle}">
        <h1 style="${headerStyle}">${isPriceDrop ? '🎉 Fiyat Düştü!' : '📈 Fiyat Değişti!'}</h1>
        <p>Merhaba ${userName},</p>
        <p>İstek listenizdeki bir ürünün fiyatı değişti:</p>
        <div style="${boxStyle}">
          <p style="margin: 8px 0; font-size: 18px; font-weight: 600;"><strong>${productTitle}</strong></p>
          <p style="margin: 8px 0;"><strong>Eski Fiyat:</strong> <span style="text-decoration: line-through; color: #64748b;">${oldPrice.toFixed(2)} TL</span></p>
          <p style="margin: 8px 0; font-size: 20px; color: ${isPriceDrop ? '#059669' : '#dc2626'}; font-weight: 600;">
            <strong>Yeni Fiyat:</strong> ${newPrice.toFixed(2)} TL
          </p>
          <p style="margin: 8px 0; color: ${isPriceDrop ? '#059669' : '#dc2626'};">
            <strong>${isPriceDrop ? 'İndirim:' : 'Artış:'}</strong> ${Math.abs(priceChange).toFixed(2)} TL (${Math.abs(Number(priceChangePercent))}%)
          </p>
        </div>
        ${isPriceDrop ? `
        <p style="color: #059669; font-weight: 500; margin: 20px 0;">
          🎉 Bu ürünün fiyatı düştü! Hemen almak için aşağıdaki butona tıklayın.
        </p>
        ` : `
        <p style="color: #dc2626; font-weight: 500; margin: 20px 0;">
          ⚠️ Bu ürünün fiyatı arttı. Hala ilginizi çekiyorsa hemen alabilirsiniz.
        </p>
        `}
        <a href="${process.env.FRONTEND_URL || 'https://tarodan.com'}/products/${productId}" style="${buttonStyle}">Ürünü Görüntüle</a>
        <p style="margin-top: 24px; color: #64748b; font-size: 14px;">
          Bu ürünü istek listenizden kaldırmak için ürün sayfasına gidip "İstek Listesinden Çıkar" butonuna tıklayabilirsiniz.
        </p>
      </div>
    `;
  }

  /**
   * Generate text content for price change email
   */
  private generatePriceChangeEmailText(
    userName: string,
    productTitle: string,
    oldPrice: number,
    newPrice: number,
    priceChange: number,
    priceChangePercent: string,
    isPriceDrop: boolean,
    productId: string,
  ): string {
    return `
${isPriceDrop ? '🎉 Fiyat Düştü!' : '📈 Fiyat Değişti!'}

Merhaba ${userName},

İstek listenizdeki bir ürünün fiyatı değişti:

Ürün: ${productTitle}
Eski Fiyat: ${oldPrice.toFixed(2)} TL
Yeni Fiyat: ${newPrice.toFixed(2)} TL
${isPriceDrop ? 'İndirim' : 'Artış'}: ${Math.abs(priceChange).toFixed(2)} TL (${Math.abs(Number(priceChangePercent))}%)

${isPriceDrop ? '🎉 Bu ürünün fiyatı düştü! Hemen almak için linke tıklayın.' : '⚠️ Bu ürünün fiyatı arttı. Hala ilginizi çekiyorsa hemen alabilirsiniz.'}

Ürünü görüntüle: ${process.env.FRONTEND_URL || 'https://tarodan.com'}/products/${productId}

Bu ürünü istek listenizden kaldırmak için ürün sayfasına gidip "İstek Listesinden Çıkar" butonuna tıklayabilirsiniz.
    `.trim();
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
    // Invalidate user's membership limits cache to refresh listing counts
    await this.cache.del(`membership:limits:${sellerId}`);
    await this.cache.del(`membership:${sellerId}`);

    // Remove from Elasticsearch index
    try {
      await this.searchService.removeProduct(id);
    } catch (error) {
      console.error('Failed to remove product from Elasticsearch:', error);
      // Don't fail the request if indexing fails
    }

    return { message: 'Ürün silindi' };
  }

  /**
   * Get seller's own single product (any status)
   */
  async findSellerProductById(sellerId: string, productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
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

    // Only the owner can see their own non-active products
    if (product.sellerId !== sellerId) {
      throw new ForbiddenException('Bu ürünü görüntüleme yetkiniz yok');
    }

    return await this.formatProductResponse(product);
  }

  /**
   * Get seller's own products (all statuses)
   */
  async findSellerProducts(sellerId: string, query: ProductQueryDto) {
    const { status, page = 1, limit = 20 } = query;

    const where: Prisma.ProductWhereInput = {
      sellerId,
      ...(status && status.trim() !== '' 
        ? { status: status as ProductStatus } 
        : { 
            // Exclude inactive, draft, and deleted listings from default view
            status: { 
              notIn: [ProductStatus.inactive, ProductStatus.draft] 
            } 
          }
      ),
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

    const formattedProducts = await Promise.all(
      products.map(async (p) => ({
        ...(await this.formatProductResponse(p)),
        pendingOffersCount: p._count.offers,
      }))
    );

    return {
      data: formattedProducts,
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
  private async formatProductResponse(product: any) {
    // Get seller's active listings count
    let sellerListingsCount = 0;
    let sellerRating = null;
    let sellerTotalRatings = 0;
    
    if (product.seller?.id) {
      sellerListingsCount = await this.prisma.product.count({
        where: {
          sellerId: product.seller.id,
          status: ProductStatus.active,
        },
      });

      // Get seller rating stats
      const sellerRatingStats = await this.prisma.rating.aggregate({
        where: { receiverId: product.seller.id },
        _avg: { score: true },
        _count: true,
      });

      if (sellerRatingStats._count > 0 && sellerRatingStats._avg?.score) {
        sellerRating = Number(sellerRatingStats._avg.score.toFixed(1));
        sellerTotalRatings = sellerRatingStats._count;
      }
    }

    // Get product rating stats
    const ratingStats = await this.prisma.productRating.aggregate({
      where: { productId: product.id },
      _avg: { score: true },
      _count: true,
    });

    return {
      id: product.id,
      title: product.title,
      description: product.description,
      price: Number(product.price),
      condition: product.condition,
      status: product.status,
      isTradeEnabled: product.isTradeEnabled || false,
      viewCount: product.viewCount || 0,
      likeCount: product.likeCount || 0,
      quantity: product.quantity !== null && product.quantity !== undefined ? Number(product.quantity) : null, // null = unlimited stock
      images: product.images?.map((img: any) => ({
        id: img.id,
        url: img.url,
        sortOrder: img.sortOrder,
      })) || [],
      rating: {
        average: ratingStats._avg?.score ? Number(ratingStats._avg.score.toFixed(1)) : null,
        count: ratingStats._count || 0,
      },
      seller: product.seller
        ? {
            id: product.seller.id,
            displayName: product.seller.displayName,
            isVerified: product.seller.isVerified,
            sellerType: product.seller.sellerType,
            listings_count: sellerListingsCount,
            productsCount: sellerListingsCount,
            rating: sellerRating,
            totalRatings: sellerTotalRatings,
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

  // ==========================================================================
  // LISTING STATISTICS & LIMITS
  // ==========================================================================

  /**
   * Get active listing count for a seller
   * Active listings include: pending, active, reserved statuses
   */
  async getActiveListingCount(sellerId: string): Promise<number> {
    return this.prisma.product.count({
      where: {
        sellerId,
        status: { in: [ProductStatus.active, ProductStatus.pending, ProductStatus.reserved] },
      },
    });
  }

  // ==========================================================================
  // PRODUCT LIKE & VIEW SYSTEM (Business Dashboard Feature)
  // ==========================================================================

  /**
   * Like a product
   * POST /products/:id/like
   */
  async likeProduct(productId: string, userId: string): Promise<{ liked: boolean; likeCount: number }> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException('Ürün bulunamadı');
    }

    // Cannot like own product
    if (product.sellerId === userId) {
      throw new BadRequestException('Kendi ürününüzü beğenemezsiniz');
    }

    // Check if already liked
    const existingLike = await this.prisma.productLike.findUnique({
      where: {
        productId_userId: {
          productId,
          userId,
        },
      },
    });

    if (existingLike) {
      throw new BadRequestException('Bu ürünü zaten beğendiniz');
    }

    // Create like and increment counter in transaction
    const [_, updatedProduct] = await this.prisma.$transaction([
      this.prisma.productLike.create({
        data: {
          productId,
          userId,
        },
      }),
      this.prisma.product.update({
        where: { id: productId },
        data: { likeCount: { increment: 1 } },
      }),
    ]);

    // Invalidate cache
    await this.cache.del(`products:detail:${productId}`);

    return { liked: true, likeCount: updatedProduct.likeCount };
  }

  /**
   * Unlike a product
   * DELETE /products/:id/unlike
   */
  async unlikeProduct(productId: string, userId: string): Promise<{ liked: boolean; likeCount: number }> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException('Ürün bulunamadı');
    }

    // Check if liked
    const existingLike = await this.prisma.productLike.findUnique({
      where: {
        productId_userId: {
          productId,
          userId,
        },
      },
    });

    if (!existingLike) {
      throw new BadRequestException('Bu ürünü beğenmemişsiniz');
    }

    // Delete like and decrement counter in transaction
    const [_, updatedProduct] = await this.prisma.$transaction([
      this.prisma.productLike.delete({
        where: {
          productId_userId: {
            productId,
            userId,
          },
        },
      }),
      this.prisma.product.update({
        where: { id: productId },
        data: { likeCount: { decrement: 1 } },
      }),
    ]);

    // Invalidate cache
    await this.cache.del(`products:detail:${productId}`);

    return { liked: false, likeCount: Math.max(0, updatedProduct.likeCount) };
  }

  /**
   * Check if user has liked a product
   */
  async isProductLikedByUser(productId: string, userId: string): Promise<boolean> {
    const like = await this.prisma.productLike.findUnique({
      where: {
        productId_userId: {
          productId,
          userId,
        },
      },
    });
    return !!like;
  }

  /**
   * Increment product view count
   * POST /products/:id/view
   * Uses Redis to prevent same user incrementing multiple times per day
   */
  /**
   * Check if user agent indicates a bot
   */
  private isBot(userAgent?: string): boolean {
    if (!userAgent) return true; // No user agent is suspicious
    
    const botPatterns = [
      'bot', 'crawler', 'spider', 'scraper', 'curl', 'wget',
      'python-requests', 'java/', 'go-http-client', 'libwww',
      'httpunit', 'nutch', 'linkwalker', 'archiver', 'fetch',
      'slurp', 'yandex', 'bingbot', 'googlebot', 'baiduspider'
    ];
    
    const ua = userAgent.toLowerCase();
    return botPatterns.some(pattern => ua.includes(pattern));
  }

  async incrementViewCount(
    productId: string, 
    userId?: string,
    clientIp?: string,
    userAgent?: string
  ): Promise<{ viewCount: number }> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException('Ürün bulunamadı');
    }

    // Skip counting views from product owner (kendi ürününü görüntüleme sayılmaz)
    if (userId && product.sellerId === userId) {
      return { viewCount: product.viewCount };
    }

    // Bot protection: Skip counting for bots
    if (this.isBot(userAgent)) {
      return { viewCount: product.viewCount };
    }

    // Her görüntülemede sayacı artır
    const updatedProduct = await this.prisma.product.update({
      where: { id: productId },
      data: { viewCount: { increment: 1 } },
    });

    // Invalidate cache
    await this.cache.del(`products:detail:${productId}`);
    await this.cache.delPattern('products:list:*');

    return { viewCount: updatedProduct.viewCount };
  }

  /**
   * Get product stats (views, likes) for seller dashboard
   */
  async getProductStats(productId: string, sellerId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        _count: {
          select: {
            likes: true,
            offers: true,
            orders: true,
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Ürün bulunamadı');
    }

    if (product.sellerId !== sellerId) {
      throw new ForbiddenException('Bu ürünün istatistiklerini görme yetkiniz yok');
    }

    return {
      id: product.id,
      title: product.title,
      viewCount: product.viewCount,
      likeCount: product.likeCount,
      offersCount: product._count.offers,
      ordersCount: product._count.orders,
    };
  }

  /**
   * Get detailed listing statistics for a seller
   * Returns counts by status and membership limit info
   */
  async getSellerListingStats(sellerId: string) {
    // Get all listing counts by status (exclude inactive and draft)
    const [pending, active, reserved, sold, rejected, inactive, total] = await Promise.all([
      this.prisma.product.count({ where: { sellerId, status: ProductStatus.pending } }),
      this.prisma.product.count({ where: { sellerId, status: ProductStatus.active } }),
      this.prisma.product.count({ where: { sellerId, status: ProductStatus.reserved } }),
      this.prisma.product.count({ where: { sellerId, status: ProductStatus.sold } }),
      this.prisma.product.count({ where: { sellerId, status: ProductStatus.rejected } }),
      this.prisma.product.count({ where: { sellerId, status: ProductStatus.inactive } }),
      // Total should exclude inactive and draft listings
      this.prisma.product.count({ 
        where: { 
          sellerId,
          status: { notIn: [ProductStatus.inactive, ProductStatus.draft] }
        } 
      }),
    ]);

    // Active listings = pending + active + reserved (counts against limit)
    const activeListings = pending + active + reserved;

    // Get membership limits
    const limits = await this.membershipService.getUserLimits(sellerId);

    return {
      // Counts by status
      counts: {
        pending,
        active,
        reserved,
        sold,
        rejected,
        inactive,
        total, // Total excluding inactive and draft
        activeListings, // This counts against the limit
      },
      // Membership limits
      limits: {
        tierName: limits.tierName,
        tierType: limits.tierType,
        maxFreeListings: limits.maxFreeListings,       // Tier's total max free listings
        maxTotalListings: limits.maxTotalListings,     // Tier's total max listings
        remainingFreeListings: limits.remainingFreeListings,
        remainingTotalListings: limits.remainingTotalListings,
        maxImagesPerListing: limits.maxImages,
        canCreateListing: limits.canCreateListing,
        canUseFreeSlot: limits.canUseFreeSlot,
        canTrade: limits.canTrade,
        canCreateCollection: limits.canCreateCollection,
      },
      // Quick summary for UI
      summary: {
        used: activeListings,
        max: limits.maxTotalListings,                  // Real tier limit
        remaining: limits.remainingTotalListings,
        canCreate: limits.canCreateListing,
        percentUsed: limits.maxTotalListings > 0 
          ? Math.round((activeListings / limits.maxTotalListings) * 100) 
          : 0,
      },
    };
  }
}
