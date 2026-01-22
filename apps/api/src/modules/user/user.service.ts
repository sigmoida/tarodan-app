import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { User, Prisma } from '@prisma/client';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find user by ID
   */
  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  /**
   * Find user by phone
   */
  async findByPhone(phone: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { phone },
    });
  }

  /**
   * Get user with addresses and membership info
   */
  async findByIdWithAddresses(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        addresses: {
          orderBy: { isDefault: 'desc' },
        },
        membership: {
          include: {
            tier: true,
          },
        },
        _count: {
          select: {
            products: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Kullanıcı bulunamadı');
    }

    // Format membership info for frontend
    const membershipInfo = user.membership ? {
      id: user.membership.id,
      status: user.membership.status,
      currentPeriodStart: user.membership.currentPeriodStart,
      currentPeriodEnd: user.membership.currentPeriodEnd,
      tier: {
        id: user.membership.tier.id,
        type: user.membership.tier.type,
        name: user.membership.tier.name,
        maxFreeListings: user.membership.tier.maxFreeListings,
        maxTotalListings: user.membership.tier.maxTotalListings,
        maxImagesPerListing: user.membership.tier.maxImagesPerListing,
        canCreateCollections: user.membership.tier.canCreateCollections,
        canTrade: user.membership.tier.canTrade,
        isAdFree: user.membership.tier.isAdFree,
        featuredListingSlots: user.membership.tier.featuredListingSlots,
        commissionDiscount: user.membership.tier.commissionDiscount,
      },
    } : {
      tier: {
        type: 'free',
        name: 'Ücretsiz',
        maxFreeListings: 5,
        maxTotalListings: 10,
        maxImagesPerListing: 3,
        canTrade: false,
        canCreateCollections: false,
        featuredListingSlots: 0,
        commissionDiscount: 0,
        isAdFree: false,
      },
      status: 'active',
      expiresAt: null,
    };

    // Remove raw membership and add the mapped membershipInfo
    const { membership: rawMembership, _count, ...rest } = user;
    return { 
      ...rest, 
      membership: membershipInfo,
      listingCount: _count?.products || 0,
    };
  }

  /**
   * Update user profile
   */
  async updateProfile(
    userId: string,
    data: {
      displayName?: string;
      phone?: string;
      bio?: string;
      birthDate?: string;
      companyName?: string;
      taxId?: string;
      taxOffice?: string;
      isCorporateSeller?: boolean;
    },
  ) {
    // Check phone uniqueness if being updated
    if (data.phone) {
      const existingPhone = await this.prisma.user.findFirst({
        where: {
          phone: data.phone,
          NOT: { id: userId },
        },
      });

      if (existingPhone) {
        throw new BadRequestException('Bu telefon numarası zaten kullanılıyor');
      }
    }

    // Prepare update data
    const updateData: Prisma.UserUpdateInput = {};

    if (data.displayName !== undefined) updateData.displayName = data.displayName;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.bio !== undefined) updateData.bio = data.bio;
    if (data.birthDate !== undefined) {
      updateData.birthDate = data.birthDate ? new Date(data.birthDate) : null;
    }
    if (data.companyName !== undefined) {
      updateData.companyName = data.companyName || null;
    }
    if (data.taxId !== undefined) {
      updateData.taxId = data.taxId || null;
    }
    // Note: taxOffice is not in schema, so we skip it
    // Note: isCorporateSeller is a frontend-only flag, not stored in DB

    return this.prisma.user.update({
      where: { id: userId },
      data: updateData,
    });
  }

  /**
   * Mark user as verified
   */
  async verifyUser(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { isVerified: true },
    });
  }

  /**
   * Upgrade user to seller
   */
  async upgradToSeller(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        isSeller: true,
        sellerType: 'individual',
      },
    });
  }

  /**
   * Add user address
   */
  async addAddress(
    userId: string,
    data: {
      title?: string;
      fullName: string;
      phone: string;
      city: string;
      district: string;
      address: string;
      zipCode?: string;
      isDefault?: boolean;
    },
  ) {
    // If this is the default address, unset other defaults
    if (data.isDefault) {
      await this.prisma.address.updateMany({
        where: { userId },
        data: { isDefault: false },
      });
    }

    // If this is the first address, make it default
    const existingAddresses = await this.prisma.address.count({
      where: { userId },
    });

    return this.prisma.address.create({
      data: {
        userId,
        fullName: data.fullName,
        phone: data.phone,
        title: data.title,
        city: data.city,
        district: data.district,
        address: data.address,
        zipCode: data.zipCode,
        isDefault: data.isDefault ?? existingAddresses === 0,
      },
    });
  }

  /**
   * Update user address
   */
  async updateAddress(
    userId: string,
    addressId: string,
    data: {
      title?: string;
      city?: string;
      district?: string;
      address?: string;
      zipCode?: string;
      isDefault?: boolean;
    },
  ) {
    // Verify ownership
    const address = await this.prisma.address.findFirst({
      where: { id: addressId, userId },
    });

    if (!address) {
      throw new NotFoundException('Adres bulunamadı');
    }

    // If setting as default, unset other defaults
    if (data.isDefault) {
      await this.prisma.address.updateMany({
        where: { userId, NOT: { id: addressId } },
        data: { isDefault: false },
      });
    }

    return this.prisma.address.update({
      where: { id: addressId },
      data,
    });
  }

  /**
   * Delete user address
   */
  async deleteAddress(userId: string, addressId: string) {
    // Verify ownership
    const address = await this.prisma.address.findFirst({
      where: { id: addressId, userId },
    });

    if (!address) {
      throw new NotFoundException('Adres bulunamadı');
    }

    await this.prisma.address.delete({
      where: { id: addressId },
    });

    // If deleted address was default, set another as default
    if (address.isDefault) {
      const firstAddress = await this.prisma.address.findFirst({
        where: { userId },
      });

      if (firstAddress) {
        await this.prisma.address.update({
          where: { id: firstAddress.id },
          data: { isDefault: true },
        });
      }
    }

    return { message: 'Adres silindi' };
  }

  /**
   * Get user's addresses
   */
  async getAddresses(userId: string) {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * Get public user profile
   */
  async getPublicProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        displayName: true,
        avatarUrl: true,
        bio: true,
        isVerified: true,
        isSeller: true,
        sellerType: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Kullanıcı bulunamadı');
    }

    // Get seller stats
    const [totalListings, totalSales, totalTrades, ratings] = await Promise.all([
      this.prisma.product.count({ where: { sellerId: userId, status: 'active' } }),
      this.prisma.order.count({ where: { sellerId: userId, status: 'completed' } }),
      this.prisma.trade.count({ 
        where: { 
          OR: [{ initiatorId: userId }, { receiverId: userId }],
          status: 'completed',
        } 
      }),
      this.prisma.rating.aggregate({
        where: { receiverId: userId },
        _avg: { score: true },
        _count: true,
      }),
    ]);

    return {
      ...user,
      stats: {
        totalListings,
        totalSales,
        totalTrades,
        averageRating: ratings._avg?.score || 0,
        totalRatings: ratings._count,
      },
    };
  }

  /**
   * Follow a user
   */
  async followUser(currentUserId: string, targetUserId: string) {
    if (currentUserId === targetUserId) {
      throw new BadRequestException('Kendinizi takip edemezsiniz');
    }

    // Check if target user exists
    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser) {
      throw new NotFoundException('Kullanıcı bulunamadı');
    }

    // Check if already following
    const existingFollow = await this.prisma.userFollow.findUnique({
      where: {
        followerId_followingId: {
          followerId: currentUserId,
          followingId: targetUserId,
        },
      },
    });

    if (existingFollow) {
      return { 
        message: 'Zaten takip ediyorsunuz',
        following: true,
      };
    }

    // Create follow relationship
    await this.prisma.userFollow.create({
      data: {
        followerId: currentUserId,
        followingId: targetUserId,
      },
    });

    return { 
      message: 'Kullanıcı takip edildi',
      following: true,
    };
  }

  /**
   * Unfollow a user
   */
  async unfollowUser(currentUserId: string, targetUserId: string) {
    if (currentUserId === targetUserId) {
      throw new BadRequestException('Kendinizi takipten çıkaramazsınız');
    }

    // Delete follow relationship
    try {
      await this.prisma.userFollow.delete({
        where: {
          followerId_followingId: {
            followerId: currentUserId,
            followingId: targetUserId,
          },
        },
      });
    } catch (error) {
      // Not following, ignore
    }

    return { 
      message: 'Takip bırakıldı',
      following: false,
    };
  }

  /**
   * Get users that current user is following
   */
  async getFollowing(userId: string) {
    const following = await this.prisma.userFollow.findMany({
      where: { followerId: userId },
      include: {
        following: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            bio: true,
            _count: {
              select: {
                products: {
                  where: { status: 'active' },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { following };
  }

  // ==========================================================================
  // BUSINESS DASHBOARD STATS (Business Dashboard Feature)
  // ==========================================================================

  /**
   * Check if user is a business account
   * Business = membershipTier.type = 'business' AND companyName is not null
   */
  async isBusinessAccount(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        membership: {
          include: { tier: true },
        },
      },
    });

    if (!user) return false;

    return user.membership?.tier?.type === 'business' && !!user.companyName;
  }

  /**
   * Get business dashboard statistics
   * Only for business accounts
   */
  async getBusinessDashboardStats(userId: string) {
    // Verify user is a business account
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        membership: {
          include: { tier: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Kullanıcı bulunamadı');
    }

    // Check if user has business tier
    const hasBusinessTier = user.membership?.tier?.type === 'business';
    const hasCompanyName = !!user.companyName;
    
    if (!hasBusinessTier) {
      throw new BadRequestException('Bu özellik sadece işletme üyeliğine sahip hesaplar için geçerlidir. Üyeliğinizi yükseltin.');
    }
    
    if (!hasCompanyName) {
      throw new BadRequestException('İşletme panelini kullanmak için şirket adı bilgisi gereklidir. Lütfen profil ayarlarınızdan şirket adınızı ekleyin.');
    }

    // Get date ranges
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get product stats
    const [
      totalProducts,
      activeProducts,
      totalViews,
      totalLikes,
      totalSales,
      revenue,
      recentViews,
      recentLikes,
    ] = await Promise.all([
      this.prisma.product.count({ where: { sellerId: userId } }),
      this.prisma.product.count({ where: { sellerId: userId, status: 'active' } }),
      this.prisma.product.aggregate({
        where: { sellerId: userId },
        _sum: { viewCount: true },
      }),
      this.prisma.product.aggregate({
        where: { sellerId: userId },
        _sum: { likeCount: true },
      }),
      this.prisma.order.count({
        where: { sellerId: userId, status: 'completed' },
      }),
      this.prisma.order.aggregate({
        where: { sellerId: userId, status: { in: ['completed', 'delivered'] } },
        _sum: { totalAmount: true },
      }),
      // Recent views (7 days) - approximation using product view counts
      this.prisma.product.aggregate({
        where: { sellerId: userId, updatedAt: { gte: sevenDaysAgo } },
        _sum: { viewCount: true },
      }),
      // Recent likes (7 days)
      this.prisma.productLike.count({
        where: {
          product: { sellerId: userId },
          createdAt: { gte: sevenDaysAgo },
        },
      }),
    ]);

    // Get collection stats
    const [
      totalCollections,
      collectionViews,
      collectionLikes,
    ] = await Promise.all([
      this.prisma.collection.count({ where: { userId } }),
      this.prisma.collection.aggregate({
        where: { userId },
        _sum: { viewCount: true },
      }),
      this.prisma.collection.aggregate({
        where: { userId },
        _sum: { likeCount: true },
      }),
    ]);

    // Get top products by views
    const topProductsByViews = await this.prisma.product.findMany({
      where: { sellerId: userId, status: 'active' },
      orderBy: { viewCount: 'desc' },
      take: 5,
      select: {
        id: true,
        title: true,
        viewCount: true,
        likeCount: true,
        price: true,
        images: { take: 1, select: { url: true } },
      },
    });

    // Get top products by likes
    const topProductsByLikes = await this.prisma.product.findMany({
      where: { sellerId: userId, status: 'active' },
      orderBy: { likeCount: 'desc' },
      take: 5,
      select: {
        id: true,
        title: true,
        viewCount: true,
        likeCount: true,
        price: true,
        images: { take: 1, select: { url: true } },
      },
    });

    // Get top collections
    const topCollections = await this.prisma.collection.findMany({
      where: { userId, isPublic: true },
      orderBy: [{ viewCount: 'desc' }, { likeCount: 'desc' }],
      take: 5,
      select: {
        id: true,
        name: true,
        viewCount: true,
        likeCount: true,
        coverImageUrl: true,
        _count: { select: { items: true } },
      },
    });

    return {
      overview: {
        totalProducts,
        activeProducts,
        totalViews: totalViews._sum.viewCount || 0,
        totalLikes: totalLikes._sum.likeCount || 0,
        totalSales,
        totalRevenue: Number(revenue._sum.totalAmount || 0),
        totalCollections,
        collectionViews: collectionViews._sum.viewCount || 0,
        collectionLikes: collectionLikes._sum.likeCount || 0,
      },
      weekly: {
        views: recentViews._sum.viewCount || 0,
        likes: recentLikes,
      },
      topProducts: {
        byViews: topProductsByViews.map(p => ({
          id: p.id,
          title: p.title,
          viewCount: p.viewCount,
          likeCount: p.likeCount,
          price: Number(p.price),
          image: p.images[0]?.url,
        })),
        byLikes: topProductsByLikes.map(p => ({
          id: p.id,
          title: p.title,
          viewCount: p.viewCount,
          likeCount: p.likeCount,
          price: Number(p.price),
          image: p.images[0]?.url,
        })),
      },
      topCollections: topCollections.map(c => ({
        id: c.id,
        name: c.name,
        viewCount: c.viewCount,
        likeCount: c.likeCount,
        coverImage: c.coverImageUrl,
        itemCount: c._count.items,
      })),
      company: {
        name: user.companyName,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        isVerified: user.isVerified,
      },
    };
  }

  /**
   * Get featured collector of the week
   * Based on collection engagement score: views + likes + sales
   * Algorithm: Score = (viewCount * 1) + (likeCount * 5) + (salesCount * 20)
   */
  async getFeaturedCollector() {
    // Get all public collections with items
    const collections = await this.prisma.collection.findMany({
      where: {
        isPublic: true,
        items: { some: {} }, // Has at least one item
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            bio: true,
            isVerified: true,
          },
        },
        items: {
          include: {
            product: {
              select: {
                id: true,
                status: true,
              },
            },
          },
        },
        _count: {
          select: { items: true, likes: true },
        },
      },
    });

    if (collections.length === 0) {
      return null;
    }

    // Calculate engagement score for each collection
    const collectionScores = await Promise.all(
      collections.map(async (collection) => {
        // Count sold products in this collection
        const salesCount = collection.items.filter(
          (item) => item.product.status === 'sold'
        ).length;

        // Calculate engagement score
        // Views are weighted 1, likes are weighted 5, sales are weighted 20
        const score =
          collection.viewCount * 1 +
          collection.likeCount * 5 +
          salesCount * 20;

        return {
          collection,
          score,
          salesCount,
        };
      })
    );

    // Sort by score (highest first) and get top collection
    collectionScores.sort((a, b) => b.score - a.score);
    const topCollectionData = collectionScores[0];

    if (!topCollectionData) {
      return null;
    }

    const topCollection = topCollectionData.collection;

    // Get collection items with product details for display
    const displayItems = await this.prisma.collectionItem.findMany({
      where: { collectionId: topCollection.id },
      take: 4,
      include: {
        product: {
          include: {
            images: { take: 1 },
          },
        },
      },
      orderBy: [
        { isFeatured: 'desc' }, // Featured items first
        { sortOrder: 'asc' },
      ],
    });

    return {
      id: topCollection.id,
      name: topCollection.name,
      description: topCollection.description,
      coverImageUrl: topCollection.coverImageUrl,
      viewCount: topCollection.viewCount,
      likeCount: topCollection.likeCount,
      itemCount: topCollection._count.items,
      salesCount: topCollectionData.salesCount,
      score: topCollectionData.score,
      user: {
        id: topCollection.user.id,
        displayName: topCollection.user.displayName,
        avatarUrl: topCollection.user.avatarUrl,
        bio: topCollection.user.bio,
        isVerified: topCollection.user.isVerified,
      },
      items: displayItems.map(item => ({
        id: item.id,
        productId: item.product.id,
        productTitle: item.product.title,
        productPrice: Number(item.product.price),
        productImage: item.product.images[0]?.url,
      })),
    };
  }

  /**
   * Get featured business of the week
   * Business accounts with most engagement (views, likes, sales)
   */
  async getFeaturedBusiness() {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Find business users (membership.tier.type = 'business' AND companyName not null)
    // Use UserMembership to find users with business tier, then get the users
    const businessMemberships = await this.prisma.userMembership.findMany({
      where: {
        tier: {
          type: 'business',
        },
        status: 'active',
      },
      include: {
        user: {
          include: {
            membership: {
              include: { tier: true },
            },
            _count: {
              select: {
                products: { where: { status: 'active' } },
              },
            },
          },
        },
      },
    });

    // Filter to only users with companyName, isSeller, and active products
    const businessUsers = businessMemberships
      .map((m) => m.user)
      .filter(
        (user) =>
          user.companyName &&
          user.isSeller &&
          user._count.products > 0
      );

    // If no business users, return null (only business accounts should be featured)
    if (businessUsers.length === 0) {
      return null;
    }

    // Calculate engagement score for each business
    // Algorithm: Score = (totalViews * 1) + (totalLikes * 5) + (totalSales * 20) + (recentLikes * 10)
    const businessScores = await Promise.all(
      businessUsers.map(async (user) => {
        const [productStats, salesCount, recentLikes, recentViews] = await Promise.all([
          this.prisma.product.aggregate({
            where: { sellerId: user.id, status: 'active' },
            _sum: { viewCount: true, likeCount: true },
          }),
          this.prisma.order.count({
            where: { 
              sellerId: user.id, 
              status: 'completed',
              createdAt: { gte: sevenDaysAgo },
            },
          }),
          this.prisma.productLike.count({
            where: {
              product: { 
                sellerId: user.id,
                status: 'active',
              },
              createdAt: { gte: sevenDaysAgo },
            },
          }),
          this.prisma.product.count({
            where: {
              sellerId: user.id,
              status: 'active',
              updatedAt: { gte: sevenDaysAgo },
            },
          }),
        ]);

        // Enhanced engagement score calculation
        // Base metrics: views (1x), likes (5x), sales (20x)
        // Recent activity bonus: recent likes (10x), recent product updates (5x)
        const totalViews = productStats._sum.viewCount || 0;
        const totalLikes = productStats._sum.likeCount || 0;
        
        const score =
          totalViews * 1 +
          totalLikes * 5 +
          salesCount * 20 +
          recentLikes * 10 +
          recentViews * 5;

        return { user, score, productStats, salesCount, totalViews, totalLikes };
      })
    );

    // Sort by score and get top business
    businessScores.sort((a, b) => b.score - a.score);
    const topBusiness = businessScores[0];

    if (!topBusiness) {
      return null;
    }

    // Get business's top collections (by engagement score)
    const allCollections = await this.prisma.collection.findMany({
      where: { userId: topBusiness.user.id, isPublic: true },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                status: true,
                title: true,
                price: true,
                images: { take: 1 },
              },
            },
          },
        },
        _count: { select: { items: true } },
      },
    });

    // Calculate collection scores and get top 4
    const collectionsWithScores = allCollections.map(collection => {
      const salesCount = collection.items.filter(
        item => item.product.status === 'sold'
      ).length;
      const score = collection.viewCount * 1 + collection.likeCount * 5 + salesCount * 20;
      return { collection, score };
    });

    collectionsWithScores.sort((a, b) => b.score - a.score);
    const topCollections = collectionsWithScores.slice(0, 4).map(item => item.collection);

    // Format collections with preview items (only active products)
    const formattedCollections = topCollections.map(collection => {
      const activeItems = collection.items
        .filter(item => item.product.status === 'active')
        .slice(0, 3)
        .map(item => ({
          id: item.id,
          productTitle: item.product.title,
          productPrice: Number(item.product.price),
          productImage: item.product.images[0]?.url,
        }));

      return {
        id: collection.id,
        name: collection.name,
        viewCount: collection.viewCount,
        likeCount: collection.likeCount,
        coverImageUrl: collection.coverImageUrl,
        _count: collection._count,
        items: activeItems,
      };
    });

    // Get business's featured products (top performing products)
    // Priority: featured products, then by engagement score (views + likes)
    const allProducts = await this.prisma.product.findMany({
      where: { sellerId: topBusiness.user.id, status: 'active' },
      include: {
        images: { take: 1 },
        _count: {
          select: { likes: true },
        },
      },
    });

    // Calculate product scores and sort
    const productsWithScores = allProducts.map(product => ({
      product,
      score: (product.viewCount || 0) * 1 + (product.likeCount || 0) * 5,
    }));

    productsWithScores.sort((a, b) => b.score - a.score);
    
    // Get top 6 products
    const products = productsWithScores.slice(0, 6).map(item => item.product);

    // Get ratings
    const ratings = await this.prisma.rating.aggregate({
      where: { receiverId: topBusiness.user.id },
      _avg: { score: true },
      _count: true,
    });

    return {
      id: topBusiness.user.id,
      displayName: topBusiness.user.displayName,
      companyName: topBusiness.user.companyName,
      avatarUrl: topBusiness.user.avatarUrl,
      bio: topBusiness.user.bio,
      isVerified: topBusiness.user.isVerified,
      stats: {
        totalProducts: topBusiness.user._count.products,
        totalViews: topBusiness.totalViews || 0,
        totalLikes: topBusiness.totalLikes || 0,
        totalSales: topBusiness.salesCount,
        averageRating: ratings._avg?.score || 0,
        totalRatings: ratings._count,
      },
      collections: formattedCollections.map(c => ({
        id: c.id,
        name: c.name,
        viewCount: c.viewCount,
        likeCount: c.likeCount,
        coverImageUrl: c.coverImageUrl,
        itemCount: c._count?.items || 0,
        previewItems: c.items || [],
      })),
      products: products.map(p => ({
        id: p.id,
        title: p.title,
        price: Number(p.price),
        viewCount: p.viewCount,
        likeCount: p.likeCount,
        image: p.images[0]?.url,
      })),
    };
  }

  /**
   * Get top sellers (for homepage)
   */
  async getTopSellers(limit: number = 5) {
    // Get sellers with most sales and good ratings
    const sellers = await this.prisma.user.findMany({
      where: {
        isSeller: true,
        products: { some: { status: 'active' } },
      },
      take: limit * 2, // Get more to filter
      include: {
        _count: {
          select: {
            products: { where: { status: 'active' } },
          },
        },
      },
    });

    // Calculate scores and sort
    const sellerScores = await Promise.all(
      sellers.map(async (seller) => {
        const [salesCount, ratings] = await Promise.all([
          this.prisma.order.count({
            where: { sellerId: seller.id, status: 'completed' },
          }),
          this.prisma.rating.aggregate({
            where: { receiverId: seller.id },
            _avg: { score: true },
            _count: true,
          }),
        ]);

        const score = salesCount * 10 + (ratings._avg?.score || 0) * 20 + seller._count.products * 2;

        return {
          id: seller.id,
          displayName: seller.displayName,
          avatarUrl: seller.avatarUrl,
          bio: seller.bio,
          isVerified: seller.isVerified,
          rating: ratings._avg?.score || 0,
          totalRatings: ratings._count,
          totalListings: seller._count.products,
          totalSales: salesCount,
          score,
        };
      })
    );

    // Sort by score and return top sellers
    sellerScores.sort((a, b) => b.score - a.score);
    return sellerScores.slice(0, limit).map(({ score, ...seller }) => seller);
  }
}
