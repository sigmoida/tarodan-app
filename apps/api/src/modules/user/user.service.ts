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
        userMembership: {
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
    const membershipInfo = user.userMembership ? {
      id: user.userMembership.id,
      status: user.userMembership.status,
      currentPeriodStart: user.userMembership.currentPeriodStart,
      currentPeriodEnd: user.userMembership.currentPeriodEnd,
      tier: {
        id: user.userMembership.tier.id,
        type: user.userMembership.tier.type,
        name: user.userMembership.tier.name,
        maxFreeListings: user.userMembership.tier.maxFreeListings,
        maxTotalListings: user.userMembership.tier.maxTotalListings,
        maxImagesPerListing: user.userMembership.tier.maxImagesPerListing,
        canCreateCollections: user.userMembership.tier.canCreateCollections,
        canTrade: user.userMembership.tier.canTrade,
        isAdFree: user.userMembership.tier.isAdFree,
        featuredListingSlots: user.userMembership.tier.featuredListingSlots,
        commissionDiscount: user.userMembership.tier.commissionDiscount,
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

    // Remove raw userMembership and add the mapped membership
    const { userMembership, ...rest } = user;
    return { 
      ...rest, 
      membership: membershipInfo,
      listingCount: user._count?.products || 0,
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

    return this.prisma.user.update({
      where: { id: userId },
      data,
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
}
