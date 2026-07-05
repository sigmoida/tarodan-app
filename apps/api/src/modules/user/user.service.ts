import { Injectable, NotFoundException, BadRequestException, Logger, Inject, forwardRef, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { User, Prisma, ProductStatus, TradeStatus, OrderStatus } from '@prisma/client';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/dto';
import { StorageService } from '../storage/storage.service';
import { RatingService } from '../rating/rating.service';
import { ModerationAiClient } from '../moderation/moderation-ai.client';
import { computeTrustScore } from './helpers/trust-score';
import { CacheService } from '../cache/cache.service';
import { isPremiumEntitled } from '../membership/membership.util';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NotificationSettings,
  UpdateNotificationSettingsDto,
} from './dto';

// In-memory storage for user blocks until schema is updated
interface UserBlock {
  id: string;
  blockerId: string;
  blockedId: string;
  createdAt: Date;
}

/** Edge case 1.11: allow address delete only when no open order references it as shipping (terminal orders keep JSON snapshot). */
const ADDRESS_DELETE_BLOCKED_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.pending_payment,
  OrderStatus.paid,
  OrderStatus.preparing,
  OrderStatus.shipped,
  OrderStatus.delivered,
  OrderStatus.refund_requested,
];

/**
 * Anasayfa öne çıkarma bölümlerinin (haftanın koleksiyoneri / haftanın şirketi /
 * top koleksiyonlar) ortak skorlama ayarları. Tek kaynak: ağırlıklar üç yerde
 * tekrar etmesin ve "haftalık" pencere her bölümde aynı olsun.
 */
const FEATURED_SCORING = {
  /** Skorda "yakın zaman" sayılan pencere (gün). */
  windowDays: 7,
  weights: {
    /** Tüm zamanlar görüntülenme. */
    view: 1,
    /** Tüm zamanlar beğeni. */
    like: 5,
    /** Tamamlanmış satış. */
    sale: 20,
    /** Son `windowDays` içindeki beğeni (haftalık ivmeyi öne çıkarır). */
    recentLike: 10,
    /** Son `windowDays` içinde güncellenen aktif ürün. */
    recentUpdate: 5,
  },
  /**
   * Featured yanıtlarının cache süresi (sn). Bu bölümler haftalık değişir ve
   * hesabı pahalıdır; kısa bir cache her isteğin ağır sorgu çalıştırmasını önler.
   */
  cacheTtlSeconds: 600,
} as const;

/** Skorlama penceresinin başlangıç tarihini döndürür (şimdi - windowDays). */
function featuredWindowStart(): Date {
  return new Date(Date.now() - FEATURED_SCORING.windowDays * 24 * 60 * 60 * 1000);
}

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);
  
  // Temporary in-memory storage for user blocks
  private userBlocks: Map<string, UserBlock> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => NotificationService))
    private readonly notificationService: NotificationService,
    @Optional()
    private readonly storageService: StorageService,
    private readonly ratingService: RatingService,
    private readonly moderationAi: ModerationAiClient,
    @Optional()
    private readonly cache: CacheService,
  ) {}

  /**
   * Resolve avatarUrl - if it's an S3 key, generate presigned URL
   * If it's already an http(s) URL, return as-is
   */
  private async resolveAvatarUrl(avatarUrl: string | null | undefined): Promise<string | null> {
    if (!avatarUrl) return null;
    // Already a full URL - return as-is
    if (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://')) return avatarUrl;
    // S3 key - resolve to presigned URL
    if (this.storageService) {
      try {
        return await this.storageService.getPresignedDownloadUrl('avatars', avatarUrl, 86400); // 24 hours
      } catch (e: any) {
        this.logger.warn(`Failed to resolve avatar presigned URL for key: ${avatarUrl} - ${e.message}`);
        return null;
      }
    }
    return null;
  }

  /**
   * Stabil avatar endpoint'i (GET /users/:id/avatar) için kullanıcının taze
   * presigned avatar URL'ini döndürür. Avatar yoksa/çözülemezse null.
   */
  async getAvatarRedirectUrl(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    });
    return this.resolveAvatarUrl(user?.avatarUrl);
  }

  private resolveProductImageUrl(imageKeyOrUrl: string | null | undefined): string | null {
    if (!imageKeyOrUrl) return null;
    if (imageKeyOrUrl.startsWith('http://') || imageKeyOrUrl.startsWith('https://') || imageKeyOrUrl.startsWith('/')) return imageKeyOrUrl;
    if (imageKeyOrUrl.includes('dev/') || imageKeyOrUrl.includes('prod/')) {
      return this.storageService?.getPublicAssetUrl(imageKeyOrUrl) ?? null;
    }
    return null;
  }

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
      },
    });

    if (!user) {
      throw new NotFoundException('Kullanıcı bulunamadı');
    }

    // Count only active listings (exclude inactive and deleted)
    const listingCount = await this.prisma.product.count({
      where: {
        sellerId: id,
        status: { notIn: [ProductStatus.inactive, ProductStatus.deleted] },
      },
    });

    // Güven Skoru için ek istatistikler (puan, satış, takas)
    const [ratingAgg, salesCount, tradesCount] = await Promise.all([
      this.prisma.rating.aggregate({
        where: { receiverId: id, status: 'approved' },
        _avg: { score: true },
        _count: true,
      }),
      this.prisma.order.count({ where: { sellerId: id, status: 'completed' } }),
      this.prisma.trade.count({
        where: { OR: [{ initiatorId: id }, { receiverId: id }], status: 'completed' },
      }),
    ]);
    const isPremium = isPremiumEntitled(user.membership);
    const trust = computeTrustScore({
      averageRating: ratingAgg._avg?.score || 0,
      totalRatings: ratingAgg._count,
      totalSales: salesCount,
      totalTrades: tradesCount,
      isVerified: user.isVerified,
    });

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

    // Resolve avatar URL (S3 key → presigned URL)
    const resolvedAvatarUrl = await this.resolveAvatarUrl(user.avatarUrl);

    // Remove raw membership and hassas alanları yanıttan çıkar (passwordHash,
    // fcmToken, ban metadata'sı asla client'a dönmemeli).
    const {
      membership: rawMembership,
      passwordHash: _passwordHash,
      fcmToken: _fcmToken,
      bannedBy: _bannedBy,
      bannedReason: _bannedReason,
      ...rest
    } = user;
    return {
      ...rest,
      avatarUrl: resolvedAvatarUrl,
      membership: membershipInfo,
      listingCount,
      isPremium,
      trustScore: trust.score,
      trustLevel: trust.level,
      stats: {
        totalListings: listingCount,
        totalSales: salesCount,
        totalTrades: tradesCount,
        averageRating: ratingAgg._avg?.score || 0,
        totalRatings: ratingAgg._count,
      },
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
      avatarUrl?: string;
      showTrustScore?: boolean;
    },
  ) {
    // Profil serbest metinlerini AI moderasyonundan geçir (uygunsuz → engelle)
    await this.moderationAi.assertTextClean(data.displayName, {
      entityType: 'user',
      entityId: userId,
      userId,
      field: 'display_name',
      label: 'görünen ad',
    });
    await this.moderationAi.assertTextClean(data.bio, {
      entityType: 'user',
      entityId: userId,
      userId,
      field: 'bio',
      label: 'biyografi',
    });

    // Check if user is business tier - only business tier users should have business info
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

    const isBusinessTier = user.membership?.tier?.type === 'business';
    const isCorporateSeller = data.isCorporateSeller === true;

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
    if (data.showTrustScore !== undefined) updateData.showTrustScore = data.showTrustScore;
    if (data.birthDate !== undefined) {
      updateData.birthDate = data.birthDate ? new Date(data.birthDate) : null;
    }
    
    // Only process business information if user is business tier or isCorporateSeller is true
    if (isBusinessTier || isCorporateSeller) {
      if (data.companyName !== undefined) {
        updateData.companyName = data.companyName || null;
      }
      if (data.taxId !== undefined) {
        updateData.taxId = data.taxId || null;
      }
    } else {
      // For non-business users without corporate seller flag, clear business info if it exists
      if (data.companyName !== undefined || data.taxId !== undefined) {
        updateData.companyName = null;
        updateData.taxId = null;
      }
    }
    // Handle avatar URL (S3 key)
    if (data.avatarUrl !== undefined) {
      updateData.avatarUrl = data.avatarUrl || null;
    }

    // Note: taxOffice is not in schema, so we skip it
    // Note: isCorporateSeller is a frontend-only flag, not stored in DB

    // Check if there's any data to update
    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('Güncellenecek alan bulunamadı');
    }

    // Update user
    await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    // Return updated user in the same format as findByIdWithAddresses
    return this.findByIdWithAddresses(userId);
  }

  /**
   * Bildirim tercihlerini getir. Kayıt yoksa varsayılanlar döner; kısmi
   * kayıtlar varsayılanların üzerine birleştirilir.
   */
  async getNotificationSettings(userId: string): Promise<NotificationSettings> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { notificationSettings: true },
    });

    if (!user) {
      throw new NotFoundException('Kullanıcı bulunamadı');
    }

    const stored = (user.notificationSettings as Partial<NotificationSettings> | null) ?? {};
    return { ...DEFAULT_NOTIFICATION_SETTINGS, ...stored };
  }

  /**
   * Bildirim tercihlerini kısmen güncelle (gelen anahtarları mevcut değerlerin
   * üzerine birleştirir) ve güncel tam nesneyi döner.
   */
  async updateNotificationSettings(
    userId: string,
    dto: UpdateNotificationSettingsDto,
  ): Promise<NotificationSettings> {
    const current = await this.getNotificationSettings(userId);
    // Yalnızca tanımlı (undefined olmayan) anahtarları uygula.
    const patch: Partial<NotificationSettings> = {};
    for (const [key, value] of Object.entries(dto)) {
      if (value !== undefined) {
        (patch as any)[key] = value;
      }
    }
    const merged: NotificationSettings = { ...current, ...patch };

    await this.prisma.user.update({
      where: { id: userId },
      data: { notificationSettings: merged as unknown as Prisma.InputJsonValue },
    });

    return merged;
  }

  /**
   * Delete user account
   * Only allowed if:
   * - All products are removed (inactive, sold, rejected, draft)
   * - No active trades (pending, accepted, shipped, etc.)
   * - No pending orders (pending_payment, paid, preparing, shipped, delivered)
   */
  async deleteAccount(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Kullanıcı bulunamadı');
    }

    // Check 1: Active products (active, pending, reserved)
    const activeProducts = await this.prisma.product.findMany({
      where: {
        sellerId: userId,
        status: {
          in: [ProductStatus.active, ProductStatus.pending, ProductStatus.reserved],
        },
      },
      select: { id: true, title: true, status: true },
    });

    // Check 2: Active trades (pending, accepted, shipped, received - not completed/cancelled/rejected/disputed)
    const activeTrades = await this.prisma.trade.findMany({
      where: {
        OR: [
          { initiatorId: userId },
          { receiverId: userId },
        ],
        status: {
          in: [
            TradeStatus.pending,
            TradeStatus.accepted,
            TradeStatus.initiator_shipped,
            TradeStatus.receiver_shipped,
            TradeStatus.both_shipped,
            TradeStatus.initiator_received,
            TradeStatus.receiver_received,
          ],
        },
      },
      select: { id: true, tradeNumber: true, status: true },
    });

    // Check 3: Pending orders (as buyer or seller)
    const pendingOrders = await this.prisma.order.findMany({
      where: {
        OR: [
          { buyerId: userId },
          { sellerId: userId },
        ],
        status: {
          in: [
            OrderStatus.pending_payment,
            OrderStatus.paid,
            OrderStatus.preparing,
            OrderStatus.shipped,
            OrderStatus.delivered,
          ],
        },
      },
      select: { id: true, orderNumber: true, status: true },
    });

    // Build error messages
    const errors: string[] = [];

    if (activeProducts.length > 0) {
      errors.push(
        `${activeProducts.length} aktif ilanınız bulunmaktadır. Lütfen önce tüm ilanlarınızı kaldırın.`,
      );
    }

    if (activeTrades.length > 0) {
      errors.push(
        `${activeTrades.length} aktif takas teklifiniz bulunmaktadır. Lütfen takas işlemlerinizi tamamlayın veya iptal edin.`,
      );
    }

    if (pendingOrders.length > 0) {
      errors.push(
        `${pendingOrders.length} bekleyen satın alım/satış işleminiz bulunmaktadır. Lütfen siparişlerinizi tamamlayın veya iptal edin.`,
      );
    }

    if (errors.length > 0) {
      throw new BadRequestException({
        message: 'Hesabınızı silmek için aşağıdaki işlemleri tamamlamanız gerekmektedir:',
        errors,
        details: {
          activeProducts: activeProducts.length,
          activeTrades: activeTrades.length,
          pendingOrders: pendingOrders.length,
        },
      });
    }

    // Tüm kontroller geçti → hesabı ANONİMLEŞTİR (hard-delete DEĞİL).
    // User satırı KORUNUR; böylece sipariş/fatura/ödeme/iade gibi finansal FK'lar bozulmaz
    // (orders_buyer_id_fkey vb. ihlali engellenir — eski kod tx.user.delete'te patlıyordu).
    // Silinen: kimlik-doğrulama/oturum, ödeme kimlik bilgileri ve doğrudan iletişim PII'si.
    // Korunan: pazaryeri/sosyal içerik (ilan, yorum, mesaj, takas) "Silinmiş Kullanıcı"ya
    // bağlı kalır. deletedAt işaretlenir → auth artık bu hesabı reddeder.
    try {
      await this.prisma.$transaction(async (tx) => {
        // 1) Kimlik-doğrulama / oturum verileri (login imkânsız hale gelir)
        await tx.refreshToken.deleteMany({ where: { userId } });
        await tx.passwordResetToken.deleteMany({ where: { userId } });
        await tx.emailVerificationToken.deleteMany({ where: { userId } });
        await tx.pushToken.deleteMany({ where: { userId } });
        await tx.oAuthAccount.deleteMany({ where: { userId } });
        await tx.twoFactorSecret.deleteMany({ where: { userId } });

        // 2) Ödeme kimlik bilgileri (kayıtlı kartlar)
        await tx.savedCard.deleteMany({ where: { userId } });

        // 3) Doğrudan PII / kişisel veriler
        await tx.address.deleteMany({ where: { userId } });
        await tx.notificationLog.deleteMany({ where: { userId } });

        // 4) PII'yi anonimleştir + login engelle. Unique alanları (email/phone/companyName)
        //    serbest bırak ki kullanıcı aynı bilgiyle yeniden kayıt olabilsin.
        await tx.user.update({
          where: { id: userId },
          data: {
            email: `deleted_${userId}@deleted.local`,
            phone: null,
            passwordHash: '',
            displayName: 'Silinmiş Kullanıcı',
            avatarUrl: null,
            bio: null,
            fcmToken: null,
            companyName: null,
            taxId: null,
            acceptsMarketingEmails: false,
            isSeller: false,
            deletedAt: new Date(),
          },
        });
      }, {
        timeout: 60000,
      });

      this.logger.log(`User account anonymized (soft-deleted): ${userId}`);
      return { message: 'Hesabınız başarıyla silindi' };
    } catch (error: any) {
      this.logger.error(`Delete account (anonymize) failed for ${userId}: ${error?.message}`);
      throw new BadRequestException('Hesap silinirken bir hata oluştu. Lütfen destek ile iletişime geçin.');
    }
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
   * Maximum 3 addresses per user
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
    // Count existing addresses
    const existingAddresses = await this.prisma.address.count({
      where: { userId },
    });

    // Check address limit (max 3)
    if (existingAddresses >= 3) {
      throw new BadRequestException('En fazla 3 adres ekleyebilirsiniz. Yeni adres eklemek için mevcut bir adresi silin.');
    }

    const title = (data.title?.trim() && data.title.trim()) || `Adres ${existingAddresses + 1}`;

    // If this is the default address, unset other defaults
    if (data.isDefault) {
      await this.prisma.address.updateMany({
        where: { userId },
        data: { isDefault: false },
      });
    }

    return this.prisma.address.create({
      data: {
        userId,
        fullName: data.fullName,
        phone: data.phone,
        title,
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

    const openOrdersUsingAddress = await this.prisma.order.count({
      where: {
        buyerId: userId,
        shippingAddressId: addressId,
        status: { in: ADDRESS_DELETE_BLOCKED_ORDER_STATUSES },
      },
    });
    if (openOrdersUsingAddress > 0) {
      throw new BadRequestException(
        'Bu teslimat adresine bağlı devam eden siparişleriniz var. Sipariş tamamlanana veya iptal edilene kadar adresi silemezsiniz.',
      );
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
  async getPublicProfile(userId: string, viewerId?: string) {
    // Sahibin kendi profili mi? Sahip ise sayaçlar "tümünü" gösterir
    // (ilan: draft hariç tüm durumlar, takas: tüm statüler, koleksiyon: özel dahil);
    // başkası bakarken yalnızca herkese görünür/biten kayıtlar sayılır.
    const isOwner = !!viewerId && viewerId === userId;

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

    // İlan/koleksiyon sayımı viewer'a göre değişir (sahip → tümü, başkası → görünür olanlar).
    const listingWhere = isOwner
      ? { sellerId: userId, status: { notIn: ['deleted'] } as any }
      : { sellerId: userId, status: 'active' };
    const collectionWhere = isOwner
      ? { userId }
      : { userId, isPublic: true };

    // Get seller stats + followers count + membership
    // completedTrades: güven skoru için sabit metrik (viewer'dan bağımsız).
    // allTrades: sahip görünümünde gösterilen "tüm takaslar" sayısı.
    const [totalListings, totalSales, completedTrades, allTrades, ratings, followersCount, membership, totalCollections] = await Promise.all([
      this.prisma.product.count({ where: listingWhere }),
      this.prisma.order.count({ where: { sellerId: userId, status: 'completed' } }),
      this.prisma.trade.count({
        where: {
          OR: [{ initiatorId: userId }, { receiverId: userId }],
          status: 'completed',
        }
      }),
      this.prisma.trade.count({
        where: {
          OR: [{ initiatorId: userId }, { receiverId: userId }],
        }
      }),
      this.prisma.rating.aggregate({
        where: { receiverId: userId, status: 'approved' },
        _avg: { score: true },
        _count: true,
      }),
      this.prisma.userFollow.count({ where: { followingId: userId } }),
      this.prisma.userMembership.findUnique({
        where: { userId },
        select: { status: true, currentPeriodEnd: true, tier: { select: { type: true } } },
      }),
      this.prisma.collection.count({ where: collectionWhere }),
    ]);

    // Gösterilecek takas sayısı: sahip → tümü, başkası → yalnızca tamamlanmış.
    const totalTrades = isOwner ? allTrades : completedTrades;

    // Resolve avatar URL (S3 key → presigned URL)
    const resolvedAvatarUrl = await this.resolveAvatarUrl(user.avatarUrl);

    // Premium (ücretli, aktif) üyelik mi?
    const membershipTier = membership?.tier.type ?? 'free';
    const isPremium = isPremiumEntitled(membership);

    // Güven Skoru (0..100) — premium avantajı
    const trust = computeTrustScore({
      averageRating: ratings._avg?.score || 0,
      totalRatings: ratings._count,
      totalSales,
      totalTrades: completedTrades,
      isVerified: user.isVerified,
    });
    // Güven skoru premium üyelerde HER ZAMAN herkese açık (gizleme özelliği kaldırıldı).
    const trustVisible = isPremium;

    return {
      ...user,
      avatarUrl: resolvedAvatarUrl,
      followersCount,
      isPremium,
      membershipTier,
      trustScore: trustVisible ? trust.score : null,
      trustLevel: trustVisible ? trust.level : null,
      stats: {
        totalListings,
        totalSales,
        totalTrades,
        totalCollections,
        averageRating: ratings._avg?.score || 0,
        totalRatings: ratings._count,
      },
    };
  }

  /**
   * Check if current user is following target user
   */
  async checkFollowing(currentUserId: string, targetUserId: string) {
    const follow = await this.prisma.userFollow.findUnique({
      where: {
        followerId_followingId: {
          followerId: currentUserId,
          followingId: targetUserId,
        },
      },
    });

    return { following: !!follow };
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

    // Send notification to the followed user
    try {
      const follower = await this.prisma.user.findUnique({
        where: { id: currentUserId },
        select: { displayName: true },
      });

      await this.notificationService.createInAppNotification(
        targetUserId,
        NotificationType.NEW_FOLLOWER,
        {
          followerId: currentUserId,
          followerName: follower?.displayName || 'Bir kullanıcı',
        },
      );
      await this.notificationService.sendTemplateEmailToUser(
        targetUserId,
        'new-follower',
        {
          followerName: follower?.displayName || 'Bir kullanıcı',
          followerId: currentUserId,
        },
      );
    } catch (error) {
      this.logger.error('Failed to send follow notification:', error);
    }

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

    const resolved = await Promise.all(
      following.map(async (f: any) => ({
        ...f,
        following: f.following ? {
          ...f.following,
          avatarUrl: await this.resolveAvatarUrl(f.following.avatarUrl),
        } : f.following,
      })),
    );

    return { following: resolved };
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
   * Satıcı panosu özet istatistikleri (her satıcı için).
   * Toplam gelir: ödemesi alınmış ve iptal/iade edilmemiş siparişler (pending_payment
   * ve cancelled/refunded hariç) → bir satış yapıldığında gelir hemen görünür.
   */
  async getSellerSummaryStats(userId: string) {
    const REVENUE_STATUSES: OrderStatus[] = [
      OrderStatus.paid,
      OrderStatus.preparing,
      OrderStatus.shipped,
      OrderStatus.delivered,
      OrderStatus.awaiting_buyer_confirmation,
      OrderStatus.completed,
    ];

    const [revenue, soldOrdersCount, activeProductsCount, followersCount] = await Promise.all([
      this.prisma.order.aggregate({
        where: { sellerId: userId, status: { in: REVENUE_STATUSES } },
        _sum: { totalAmount: true },
      }),
      this.prisma.order.count({
        where: { sellerId: userId, status: { in: REVENUE_STATUSES } },
      }),
      this.prisma.product.count({
        where: { sellerId: userId, status: ProductStatus.active },
      }),
      this.prisma.userFollow.count({ where: { followingId: userId } }),
    ]);

    return {
      totalRevenue: Number(revenue._sum.totalAmount || 0),
      soldProductsCount: soldOrdersCount,
      activeProductsCount,
      followersCount,
    };
  }

  /**
   * Get user analytics data
   * Available for all authenticated users
   */
  /**
   * Kullanıcının özet istatistikleri — İstatistikler sayfasının tek veri
   * kaynağı. "Satış/harcama" için ödemesi alınmış tüm siparişler sayılır
   * (paid → completed); yalnızca completed/delivered sayılırsa kargo
   * sürecindeki siparişler 0 olarak görünür.
   */
  async getMyStats(userId: string) {
    const PAID_STATUSES = [
      'paid',
      'preparing',
      'shipped',
      'delivered',
      'awaiting_buyer_confirmation',
      'completed',
    ] as const;

    // "Satıldı" ürün durumundan (sold) DEĞİL, ödemesi alınmış SATIŞ SİPARİŞİNDEN
    // türetilir — çünkü seed/eski veride satılmış ürünler 'active' kalmış olabilir.
    // Böylece "1465 TL kazanç ama 0 satış" tutarsızlığı oluşmaz.
    const [
      user,
      productsCount,
      activeProductsCount,
      soldProductsCount,
      viewsAgg,
      likesAgg,
      ordersCount,
      completedOrdersCount,
      purchasesCount,
      salesCount,
      spentAgg,
      revenueAgg,
      tradesCount,
      successfulTradesCount,
      collectionsCount,
      ratingAgg,
      followersCount,
      followingCount,
    ] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          createdAt: true,
          membership: { select: { tier: { select: { type: true } } } },
        },
      }),
      this.prisma.product.count({
        where: { sellerId: userId, status: { notIn: ['deleted'] } },
      }),
      // Gerçekten satılabilir aktif ilan = active VE ödenmiş satış siparişi YOK
      this.prisma.product.count({
        where: {
          sellerId: userId,
          status: 'active',
          orders: { none: { status: { in: [...PAID_STATUSES] } } },
        },
      }),
      // Satılmış ilan = en az bir ödenmiş satış siparişi OLAN farklı ürün sayısı
      this.prisma.product.count({
        where: {
          sellerId: userId,
          status: { notIn: ['deleted'] },
          orders: { some: { status: { in: [...PAID_STATUSES] } } },
        },
      }),
      this.prisma.product.aggregate({
        where: { sellerId: userId },
        _sum: { viewCount: true },
      }),
      this.prisma.product.aggregate({
        where: { sellerId: userId },
        _sum: { likeCount: true },
      }),
      // "Siparişlerim" sayacı, listeyle (order.service.ts findUserOrders) tutarlı
      // olmalı: üyelik/boost sanal siparişleri liste DIŞLADIĞI için sayaç da hariç
      // tutmalı. Aksi halde şirket üyelik alınca sayaç 1, liste boş görünür.
      this.prisma.order.count({
        where: {
          buyerId: userId,
          NOT: {
            OR: [
              { productId: { startsWith: 'membership-' } },
              { productId: { startsWith: 'boost-' } },
            ],
          },
        },
      }),
      this.prisma.order.count({
        where: { buyerId: userId, status: { in: ['delivered', 'completed'] } },
      }),
      // Harcama yapılan (ödemesi alınmış) alıcı siparişi sayısı
      this.prisma.order.count({
        where: { buyerId: userId, status: { in: [...PAID_STATUSES] } },
      }),
      // Yapılan satış (ödemesi alınmış satıcı siparişi) sayısı
      this.prisma.order.count({
        where: { sellerId: userId, status: { in: [...PAID_STATUSES] } },
      }),
      this.prisma.order.aggregate({
        where: { buyerId: userId, status: { in: [...PAID_STATUSES] } },
        _sum: { totalAmount: true },
      }),
      this.prisma.order.aggregate({
        where: { sellerId: userId, status: { in: [...PAID_STATUSES] } },
        _sum: { totalAmount: true },
      }),
      this.prisma.trade.count({
        where: { OR: [{ initiatorId: userId }, { receiverId: userId }] },
      }),
      this.prisma.trade.count({
        where: {
          OR: [{ initiatorId: userId }, { receiverId: userId }],
          status: 'completed',
        },
      }),
      this.prisma.collection.count({ where: { userId } }),
      this.prisma.rating.aggregate({
        where: { receiverId: userId, status: 'approved' },
        _avg: { score: true },
        _count: true,
      }),
      // Takipçi/takip sayıları — getPublicProfile ile birebir aynı sayım (line ~814)
      // Böylece kullanıcı kendi profilinde de doğru takipçi sayısını görür.
      this.prisma.userFollow.count({ where: { followingId: userId } }),
      this.prisma.userFollow.count({ where: { followerId: userId } }),
    ]);

    if (!user) {
      throw new NotFoundException('Kullanıcı bulunamadı');
    }

    return {
      productsCount,
      activeProductsCount,
      soldProductsCount,
      ordersCount,
      completedOrdersCount,
      purchasesCount,
      salesCount,
      tradesCount,
      successfulTradesCount,
      collectionsCount,
      followersCount,
      followingCount,
      totalViews: viewsAgg._sum.viewCount || 0,
      totalFavorites: likesAgg._sum.likeCount || 0,
      rating: ratingAgg._avg?.score || 0,
      reviewsCount: ratingAgg._count || 0,
      totalRevenue: Number(revenueAgg._sum.totalAmount || 0),
      totalSpent: Number(spentAgg._sum.totalAmount || 0),
      memberSince: user.createdAt,
      membershipTier: user.membership?.tier?.type || 'free',
    };
  }

  async getUserAnalytics(userId: string, period: '7d' | '30d' | '90d' = '30d') {
    const now = new Date();
    const daysMap = { '7d': 7, '30d': 30, '90d': 90 };
    const days = daysMap[period];
    const periodStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const previousPeriodStart = new Date(periodStart.getTime() - days * 24 * 60 * 60 * 1000);

    // Satış = ödemesi alınmış sipariş (paid → completed). Yalnızca
    // completed/delivered sayılırsa kargo sürecindeki satışlar 0 görünür
    // (detaylı analiz/admin tarafıyla tutarsızlık).
    const SOLD_STATUSES = [
      'paid',
      'preparing',
      'shipped',
      'delivered',
      'awaiting_buyer_confirmation',
      'completed',
    ];

    // Get current period stats
    const [
      totalViews,
      totalLikes,
      totalSalesCount,
      totalRevenue,
      activeListings,
      pendingOrders,
      allTimeSalesCount,
      // Previous period for comparison
      prevPeriodLikes,
      currentPeriodLikes,
      prevSalesCount,
      prevRevenue,
    ] = await Promise.all([
      // Current period
      this.prisma.product.aggregate({
        where: { sellerId: userId },
        _sum: { viewCount: true },
      }),
      this.prisma.product.aggregate({
        where: { sellerId: userId },
        _sum: { likeCount: true },
      }),
      this.prisma.order.count({
        where: { 
          sellerId: userId, 
          status: { in: SOLD_STATUSES as any },
          createdAt: { gte: periodStart },
        },
      }),
      this.prisma.order.aggregate({
        where: { 
          sellerId: userId, 
          status: { in: SOLD_STATUSES as any },
          createdAt: { gte: periodStart },
        },
        _sum: { totalAmount: true },
      }),
      this.prisma.product.count({
        where: { sellerId: userId, status: 'active' },
      }),
      this.prisma.order.count({
        where: {
          sellerId: userId,
          status: { in: ['pending_payment', 'paid', 'preparing'] },
        },
      }),
      this.prisma.order.count({
        where: {
          sellerId: userId,
          status: { in: SOLD_STATUSES as any },
        },
      }),
      // Previous period for comparison
      this.prisma.productLike.count({
        where: {
          product: { sellerId: userId },
          createdAt: { gte: previousPeriodStart, lt: periodStart },
        },
      }),
      this.prisma.productLike.count({
        where: {
          product: { sellerId: userId },
          createdAt: { gte: periodStart },
        },
      }),
      this.prisma.order.count({
        where: { 
          sellerId: userId, 
          status: { in: SOLD_STATUSES as any },
          createdAt: { gte: previousPeriodStart, lt: periodStart },
        },
      }),
      this.prisma.order.aggregate({
        where: { 
          sellerId: userId, 
          status: { in: SOLD_STATUSES as any },
          createdAt: { gte: previousPeriodStart, lt: periodStart },
        },
        _sum: { totalAmount: true },
      }),
    ]);

    // Calculate change percentages
    const calcChange = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    const currentViews = totalViews._sum.viewCount || 0;
    const currentLikes = totalLikes._sum.likeCount || 0;
    const currentRevenue = Number(totalRevenue._sum.totalAmount || 0);
    const previousRevenue = Number(prevRevenue._sum.totalAmount || 0);

    // Get top products
    const topProducts = await this.prisma.product.findMany({
      where: { sellerId: userId },
      orderBy: { viewCount: 'desc' },
      take: 5,
      select: {
        id: true,
        title: true,
        viewCount: true,
        likeCount: true,
        price: true,
        status: true,
        images: { take: 1, select: { cardKey: true } },
      },
    });

    // Get daily views for chart (approximate from products updated)
    const dailyViews: { date: string; views: number; favorites: number }[] = [];
    for (let i = Math.min(days, 14) - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      // Get likes for that day
      const dayStart = new Date(dateStr);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      
      const dayLikes = await this.prisma.productLike.count({
        where: {
          product: { sellerId: userId },
          createdAt: { gte: dayStart, lt: dayEnd },
        },
      });

      // Views are only stored as a cumulative counter; approximate the daily
      // breakdown from that day's likes and the overall views-per-like ratio
      const avgViewsPerLike = currentViews > 0 && currentLikes > 0
        ? Math.round(currentViews / currentLikes)
        : 0;

      dailyViews.push({
        date: dateStr,
        views: dayLikes * avgViewsPerLike,
        favorites: dayLikes,
      });
    }

    // Get recent activity
    const [recentOrders, recentLikes, recentMessages] = await Promise.all([
      this.prisma.order.findMany({
        where: { sellerId: userId },
        orderBy: { createdAt: 'desc' },
        take: 3,
        select: {
          id: true,
          status: true,
          totalAmount: true,
          createdAt: true,
          product: { select: { title: true } },
          buyer: { select: { displayName: true } },
        },
      }),
      this.prisma.productLike.findMany({
        where: { product: { sellerId: userId } },
        orderBy: { createdAt: 'desc' },
        take: 3,
        select: {
          createdAt: true,
          product: { select: { title: true } },
          user: { select: { displayName: true } },
        },
      }),
      this.prisma.message.findMany({
        where: { 
          receiverId: userId,
        },
        orderBy: { createdAt: 'desc' },
        take: 2,
        select: {
          createdAt: true,
          threadId: true,
          sender: { select: { displayName: true } },
        },
      }),
    ]);

    // Get product titles for messages (if linked to a product thread)
    const messageProductTitles = await Promise.all(
      recentMessages.map(async (m) => {
        const thread = await this.prisma.messageThread.findUnique({
          where: { id: m.threadId },
          select: { productId: true },
        });
        if (thread?.productId) {
          const product = await this.prisma.product.findUnique({
            where: { id: thread.productId },
            select: { title: true },
          });
          return product?.title || 'Ürün';
        }
        return 'Mesaj';
      })
    );

    const recentActivity = [
      ...recentOrders.map(o => ({
        type: 'sale' as const,
        productTitle: o.product?.title || 'Ürün',
        timestamp: o.createdAt.toISOString(),
        amount: Number(o.totalAmount),
        userDisplayName: o.buyer?.displayName,
      })),
      ...recentLikes.map(l => ({
        type: 'favorite' as const,
        productTitle: l.product?.title || 'Ürün',
        timestamp: l.createdAt.toISOString(),
        userDisplayName: l.user?.displayName,
      })),
      ...recentMessages.map((m, i) => ({
        type: 'message' as const,
        productTitle: messageProductTitles[i],
        timestamp: m.createdAt.toISOString(),
        userDisplayName: m.sender?.displayName,
      })),
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 6);

    // Get category stats
    const categoryStats = await this.prisma.product.groupBy({
      by: ['categoryId'],
      where: { sellerId: userId },
      _count: { id: true },
      _sum: { viewCount: true },
    });

    const categories = await this.prisma.category.findMany({
      where: { id: { in: categoryStats.map(c => c.categoryId).filter(Boolean) as string[] } },
      select: { id: true, name: true },
    });

    const salesByCategory = await Promise.all(
      categoryStats.map(async (cat) => {
        const sales = await this.prisma.order.count({
          where: {
            sellerId: userId,
            product: { categoryId: cat.categoryId },
            status: { in: SOLD_STATUSES as any },
          },
        });
        return { categoryId: cat.categoryId, sales };
      })
    );

    const formattedCategoryStats = categoryStats.map(cat => {
      const category = categories.find(c => c.id === cat.categoryId);
      const sales = salesByCategory.find(s => s.categoryId === cat.categoryId)?.sales || 0;
      return {
        name: category?.name || 'Diğer',
        listings: cat._count.id,
        views: cat._sum.viewCount || 0,
        sales,
      };
    }).sort((a, b) => b.views - a.views);

    // Calculate additional metrics
    const avgViewsPerListing = activeListings > 0 ? Math.round(currentViews / activeListings) : 0;
    // Views are an all-time counter, so compare against all-time sales
    const conversionRate = currentViews > 0 ? (allTimeSalesCount / currentViews) * 100 : 0;

    // Average time to sell (estimate)
    const soldProducts = await this.prisma.product.findMany({
      where: { 
        sellerId: userId, 
        status: 'sold',
        updatedAt: { gte: periodStart },
      },
      select: { createdAt: true, updatedAt: true },
      take: 10,
    });
    
    const avgTimeToSell = soldProducts.length > 0
      ? Math.round(
          soldProducts.reduce((sum, p) => 
            sum + (p.updatedAt.getTime() - p.createdAt.getTime()) / (1000 * 60 * 60 * 24), 0
          ) / soldProducts.length
        )
      : 0;

    return {
      totalViews: currentViews,
      totalFavorites: currentLikes,
      totalSales: totalSalesCount,
      totalRevenue: currentRevenue,
      activeListings,
      pendingOrders,
      // Views aren't tracked per day, so likes act as a proxy for the views trend
      viewsChange: calcChange(currentPeriodLikes, prevPeriodLikes),
      favoritesChange: calcChange(currentPeriodLikes, prevPeriodLikes),
      salesChange: calcChange(totalSalesCount, prevSalesCount),
      revenueChange: calcChange(currentRevenue, previousRevenue),
      avgViewsPerListing,
      conversionRate: Math.round(conversionRate * 100) / 100,
      avgTimeToSell,
      repeatCustomerRate: 0, // Would need more complex query
      topProducts: topProducts.map(p => ({
        id: p.id,
        title: p.title,
        views: p.viewCount,
        favorites: p.likeCount,
        price: Number(p.price),
        status: p.status,
        imageUrl: this.resolveProductImageUrl(p.images[0]?.cardKey),
      })),
      dailyViews,
      recentActivity,
      categoryStats: formattedCategoryStats,
    };
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
      // Total products excluding inactive and deleted
      this.prisma.product.count({
        where: {
          sellerId: userId,
          status: { notIn: ['inactive', 'deleted'] }
        }
      }),
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
        images: { take: 1, select: { cardKey: true } },
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
        images: { take: 1, select: { cardKey: true } },
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
        coverImageKey: true,
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
          image: this.resolveProductImageUrl(p.images[0]?.cardKey),
        })),
        byLikes: topProductsByLikes.map(p => ({
          id: p.id,
          title: p.title,
          viewCount: p.viewCount,
          likeCount: p.likeCount,
          price: Number(p.price),
          image: this.resolveProductImageUrl(p.images[0]?.cardKey),
        })),
      },
      topCollections: topCollections.map(c => ({
        id: c.id,
        name: c.name,
        viewCount: c.viewCount,
        likeCount: c.likeCount,
        coverImage: c.coverImageKey ? this.storageService.getPublicAssetUrl(c.coverImageKey) : undefined,
        itemCount: c._count.items,
      })),
      company: {
        name: user.companyName,
        displayName: user.displayName,
        avatarUrl: await this.resolveAvatarUrl(user.avatarUrl),
        isVerified: user.isVerified,
      },
    };
  }

  /**
   * Featured (anasayfa öne çıkarma) yanıtlarını cache-aside ile sarar.
   * Redis yoksa veya hata verirse otomatik olarak factory'ye düşer (graceful).
   */
  private async cacheFeatured<T>(key: string, factory: () => Promise<T>): Promise<T> {
    if (!this.cache) return factory();
    return this.cache.getOrSet(key, factory, { ttl: FEATURED_SCORING.cacheTtlSeconds });
  }

  /**
   * Featured snapshot satırını (haftanın kazananı) upsert eder. Cron ve okuma
   * anındaki fallback kullanır; hata durumunda sessizce geçer (best-effort).
   */
  private async upsertFeaturedSnapshot(type: string, entityId: string, score: number) {
    try {
      await this.prisma.featuredSnapshot.upsert({
        where: { type },
        create: { type, entityId, score },
        update: { entityId, score, computedAt: new Date() },
      });
    } catch (e: any) {
      this.logger.warn(`Featured snapshot upsert failed (${type}): ${e.message}`);
    }
  }

  /**
   * En iyi koleksiyonlar (anasayfa). Görüntülenme/beğeniye göre sıralı, cache'li.
   */
  async getTopCollections(limit: number = 20) {
    return this.cacheFeatured(`featured:top-collections:${limit}`, () =>
      this.computeTopCollections(limit),
    );
  }

  private async computeTopCollections(limit: number) {
    const collections = await this.prisma.collection.findMany({
      where: {
        isPublic: true,
        items: { some: {} },
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
        _count: {
          select: { items: true, likes: true },
        },
      },
      orderBy: [
        { viewCount: 'desc' },
        { likeCount: 'desc' },
      ],
      take: limit,
    });

    return Promise.all(collections.map(async (collection) => {
      // Always show the collection owner's own active products so products always match the user
      const ownProducts = await this.prisma.product.findMany({
        where: { sellerId: collection.user.id, status: 'active' },
        take: 5,
        include: { images: { take: 1, orderBy: { sortOrder: 'asc' } } },
        orderBy: [{ likeCount: 'desc' }, { viewCount: 'desc' }, { createdAt: 'desc' }],
      });

      const items = await Promise.all(ownProducts.map(async p => ({
        id: p.id,
        productId: p.id,
        productTitle: p.title,
        productPrice: Number(p.price),
        productImage: this.resolveProductImageUrl(p.images[0]?.cardKey),
      })));

      return {
        id: collection.id,
        name: collection.name,
        description: collection.description,
        coverImageUrl: collection.coverImageKey ? this.storageService.getPublicAssetUrl(collection.coverImageKey) : undefined,
        viewCount: collection.viewCount,
        likeCount: collection.likeCount,
        itemCount: collection._count.items,
        user: {
          id: collection.user.id,
          displayName: collection.user.displayName,
          avatarUrl: await this.resolveAvatarUrl(collection.user.avatarUrl),
          bio: collection.user.bio,
          isVerified: collection.user.isVerified,
        },
        items,
      };
    }));
  }

  /**
   * Haftanın koleksiyoneri (anasayfa). Haftalık snapshot'tan okur: ağır skorlama
   * cron'da yapılır, burada sadece kazanan koleksiyon taze veriyle doldurulur
   * (presigned URL'ler hep güncel kalır). Snapshot yoksa (ilk açılış) ya da
   * kazanan artık uygun değilse anında hesaplayıp snapshot'ı tazeler.
   */
  async getFeaturedCollector() {
    return this.cacheFeatured('featured:collector', async () => {
      const snap = await this.prisma.featuredSnapshot.findUnique({
        where: { type: 'collector' },
      });
      if (snap) {
        const hydrated = await this.hydrateCollectorById(snap.entityId, snap.score);
        if (hydrated) return hydrated;
      }
      // Snapshot yok ya da hedef koleksiyon artık uygun değil → taze hesapla + sakla
      const selected = await this.selectFeaturedCollector();
      if (!selected) return null;
      await this.upsertFeaturedSnapshot('collector', selected.id, selected.score);
      return this.hydrateCollectorById(selected.id, selected.score, selected.salesCount);
    });
  }

  /**
   * Aday koleksiyonlar arasından haftalık skoru en yüksek olanı seçer (yalnızca
   * id + skor döner; ağır kısım budur, cron tarafından çağrılır).
   * Admin'in `isFeatured` işaretlediği koleksiyonlar önceliklidir.
   */
  async selectFeaturedCollector(): Promise<{ id: string; score: number; salesCount: number } | null> {
    const collectionWhere = {
      isPublic: true,
      items: { some: {} }, // Has at least one item
    };
    const candidateInclude = {
      items: { select: { product: { select: { status: true } } } },
    };

    // Prefer admin-featured collections first; fall back to score-based selection
    const collections = await this.prisma.collection.findMany({
      where: { ...collectionWhere, isFeatured: true },
      include: candidateInclude,
    }).then(async (featured) => {
      if (featured.length > 0) return featured;
      return this.prisma.collection.findMany({ where: collectionWhere, include: candidateInclude });
    });

    if (collections.length === 0) {
      return null;
    }

    // "Haftanın koleksiyoneri": skor son 7 günün ivmesini de katar. Tüm zamanlar
    // metrikleri taban, son penceredeki beğeniler ise haftalık bonus olarak
    // ağırlıklanır; böylece kazanan her hafta tazelenebilir.
    const windowStart = featuredWindowStart();
    const { weights } = FEATURED_SCORING;

    // Son penceredeki koleksiyon beğenilerini tek sorguda topla (N+1 yerine groupBy)
    const recentLikeGroups = await this.prisma.collectionLike.groupBy({
      by: ['collectionId'],
      where: {
        collectionId: { in: collections.map((c) => c.id) },
        createdAt: { gte: windowStart },
      },
      _count: { _all: true },
    });
    const recentLikesByCollection = new Map(
      recentLikeGroups.map((g) => [g.collectionId, g._count._all]),
    );

    const scored = collections.map((collection) => {
      const salesCount = collection.items.filter(
        (item) => item.product && item.product.status === 'sold'
      ).length;
      const recentLikes = recentLikesByCollection.get(collection.id) ?? 0;
      const score =
        collection.viewCount * weights.view +
        collection.likeCount * weights.like +
        salesCount * weights.sale +
        recentLikes * weights.recentLike;
      return { id: collection.id, score, salesCount };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0] ?? null;
  }

  /**
   * Verilen koleksiyon id'sini anasayfa DTO'suna doldurur (kullanıcı + aktif
   * ürünler). Koleksiyon yoksa / public değilse / boşsa null döner — bu durumda
   * snapshot bayatlamış demektir ve çağıran taraf yeniden hesaplamayı tetikler.
   */
  private async hydrateCollectorById(
    collectionId: string,
    score: number,
    salesCount?: number,
  ) {
    const collection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
      include: {
        user: {
          select: { id: true, displayName: true, avatarUrl: true, bio: true, isVerified: true },
        },
        items: { select: { product: { select: { status: true } } } },
        _count: { select: { items: true, likes: true } },
      },
    });

    if (!collection || !collection.isPublic || collection._count.items === 0) {
      return null;
    }

    const resolvedSalesCount =
      salesCount ??
      collection.items.filter((item) => item.product && item.product.status === 'sold').length;

    // Always show the collector's own active product listings (ensures products match the user)
    const ownProducts = await this.prisma.product.findMany({
      where: { sellerId: collection.user.id, status: 'active' },
      take: 5,
      include: { images: { take: 1, orderBy: { sortOrder: 'asc' } } },
      orderBy: [{ likeCount: 'desc' }, { viewCount: 'desc' }, { createdAt: 'desc' }],
    });

    const items = ownProducts.map((p) => ({
      id: p.id,
      productId: p.id,
      productTitle: p.title,
      productPrice: Number(p.price),
      productImage: this.resolveProductImageUrl(p.images[0]?.cardKey),
    }));

    return {
      id: collection.id,
      name: collection.name,
      description: collection.description,
      coverImageUrl: collection.coverImageKey ? this.storageService.getPublicAssetUrl(collection.coverImageKey) : undefined,
      viewCount: collection.viewCount,
      likeCount: collection.likeCount,
      itemCount: collection._count.items,
      salesCount: resolvedSalesCount,
      score,
      user: {
        id: collection.user.id,
        displayName: collection.user.displayName,
        avatarUrl: await this.resolveAvatarUrl(collection.user.avatarUrl),
        bio: collection.user.bio,
        isVerified: collection.user.isVerified,
      },
      items,
    };
  }

  /**
   * Haftanın şirketi (anasayfa). Haftalık snapshot'tan okur; ağır skorlama
   * cron'da yapılır, burada kazanan iş hesabı taze veriyle doldurulur. Snapshot
   * yoksa ya da kazanan artık uygun değilse anında hesaplayıp snapshot'ı tazeler.
   */
  async getFeaturedBusiness() {
    return this.cacheFeatured('featured:business', async () => {
      const snap = await this.prisma.featuredSnapshot.findUnique({
        where: { type: 'business' },
      });
      if (snap) {
        const hydrated = await this.hydrateBusinessById(snap.entityId);
        if (hydrated) return hydrated;
      }
      const selected = await this.selectFeaturedBusiness();
      if (!selected) return null;
      await this.upsertFeaturedSnapshot('business', selected.id, selected.score);
      return this.hydrateBusinessById(selected.id);
    });
  }

  /**
   * Aday iş hesapları arasından haftalık skoru en yüksek olanı seçer (yalnızca
   * id + skor döner). Business tier önceliklidir; yoksa en çok ürünü olan
   * satıcılara düşer. Ağır skorlama burasıdır, cron tarafından çağrılır.
   */
  async selectFeaturedBusiness(): Promise<{ id: string; score: number } | null> {
    const sevenDaysAgo = featuredWindowStart();

    // Find business users (membership.tier.type = 'business' AND companyName not null)
    const businessMemberships = await this.prisma.userMembership.findMany({
      where: {
        tier: { type: 'business' },
        status: 'active',
      },
      include: {
        user: {
          include: {
            _count: {
              select: {
                products: { where: { status: 'active' } },
              },
            },
          },
        },
      },
    });

    let businessUsers = businessMemberships
      .map((m) => m.user)
      .filter(
        (user) =>
          user.companyName &&
          user.isSeller &&
          user._count.products > 0
      );

    if (businessUsers.length === 0) {
      const topSellers = await this.prisma.user.findMany({
        where: {
          isSeller: true,
          products: { some: { status: 'active' } },
        },
        include: {
          _count: { select: { products: { where: { status: 'active' } } } },
        },
        orderBy: { products: { _count: 'desc' } },
        take: 10,
      });
      businessUsers = topSellers.filter((u) => u._count.products > 0);
      if (businessUsers.length === 0) {
        return null;
      }
    }

    // Score = views(1) + likes(5) + recentSales(20) + recentLikes(10) + recentUpdates(5)
    const { weights } = FEATURED_SCORING;
    const businessScores = await Promise.all(
      businessUsers.map(async (user) => {
        const [productStats, salesCount, recentLikes, recentViews] = await Promise.all([
          this.prisma.product.aggregate({
            where: { sellerId: user.id, status: 'active' },
            _sum: { viewCount: true, likeCount: true },
          }),
          this.prisma.order.count({
            where: { sellerId: user.id, status: 'completed', createdAt: { gte: sevenDaysAgo } },
          }),
          this.prisma.productLike.count({
            where: {
              product: { sellerId: user.id, status: 'active' },
              createdAt: { gte: sevenDaysAgo },
            },
          }),
          this.prisma.product.count({
            where: { sellerId: user.id, status: 'active', updatedAt: { gte: sevenDaysAgo } },
          }),
        ]);

        const totalViews = productStats._sum.viewCount || 0;
        const totalLikes = productStats._sum.likeCount || 0;
        const score =
          totalViews * weights.view +
          totalLikes * weights.like +
          salesCount * weights.sale +
          recentLikes * weights.recentLike +
          recentViews * weights.recentUpdate;

        return { id: user.id, score };
      })
    );

    businessScores.sort((a, b) => b.score - a.score);
    return businessScores[0] ?? null;
  }

  /**
   * Verilen iş hesabı id'sini anasayfa DTO'suna doldurur (istatistikler,
   * koleksiyonlar, öne çıkan ürünler, puan). Kullanıcı yoksa / aktif ürünü
   * yoksa null döner — bu durumda snapshot bayatlamıştır ve çağıran taraf
   * yeniden hesaplamayı tetikler.
   */
  private async hydrateBusinessById(userId: string) {
    const sevenDaysAgo = featuredWindowStart();

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        _count: { select: { products: { where: { status: 'active' } } } },
      },
    });

    if (!user || user._count.products === 0) {
      return null;
    }

    // Stats: tüm zamanlar view/like toplamı + son penceredeki tamamlanmış satış
    const [productStats, salesCount] = await Promise.all([
      this.prisma.product.aggregate({
        where: { sellerId: userId, status: 'active' },
        _sum: { viewCount: true, likeCount: true },
      }),
      this.prisma.order.count({
        where: { sellerId: userId, status: 'completed', createdAt: { gte: sevenDaysAgo } },
      }),
    ]);
    const totalViews = productStats._sum.viewCount || 0;
    const totalLikes = productStats._sum.likeCount || 0;

    // Get business's top collections (by engagement score)
    const allCollections = await this.prisma.collection.findMany({
      where: { userId, isPublic: true },
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
        item => item.product && item.product.status === 'sold'
      ).length;
      const { weights } = FEATURED_SCORING;
      const score =
        collection.viewCount * weights.view +
        collection.likeCount * weights.like +
        salesCount * weights.sale;
      return { collection, score };
    });

    collectionsWithScores.sort((a, b) => b.score - a.score);
    const topCollections = collectionsWithScores.slice(0, 4).map(item => item.collection);

    // Format collections with preview items (only active products)
    const formattedCollections = await Promise.all(topCollections.map(async collection => {
      const activeItems = await Promise.all(collection.items
        .filter(item => item.product && item.product.status === 'active')
        .slice(0, 3)
        .map(async item => ({
          id: item.id,
          productTitle: item.product!.title,
          productPrice: Number(item.product!.price),
          productImage: this.resolveProductImageUrl(item.product!.images[0]?.cardKey),
        })));

      return {
        id: collection.id,
        name: collection.name,
        viewCount: collection.viewCount,
        likeCount: collection.likeCount,
        coverImageUrl: collection.coverImageKey ? this.storageService.getPublicAssetUrl(collection.coverImageKey) : undefined,
        _count: collection._count,
        items: activeItems,
      };
    }));

    // Get business's featured products (top performing products)
    // Priority: featured products, then by engagement score (views + likes)
    const allProducts = await this.prisma.product.findMany({
      where: { sellerId: userId, status: 'active' },
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
      where: { receiverId: userId },
      _avg: { score: true },
      _count: true,
    });

    return {
      id: user.id,
      displayName: user.displayName,
      companyName: user.companyName,
      avatarUrl: await this.resolveAvatarUrl(user.avatarUrl),
      bio: user.bio,
      isVerified: user.isVerified,
      stats: {
        totalProducts: user._count.products,
        totalViews,
        totalLikes,
        totalSales: salesCount,
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
      products: await Promise.all(products.map(async (p) => ({
        id: p.id,
        title: p.title,
        price: Number(p.price),
        viewCount: p.viewCount,
        likeCount: p.likeCount,
        image: this.resolveProductImageUrl(p.images[0]?.cardKey),
      }))),
    };
  }

  /**
   * Haftanın koleksiyoneri ve şirketi snapshot'larını yeniden hesaplar.
   * Cron job (FeaturedSchedulerService) ve admin değişiklikleri tarafından
   * çağrılır; ardından okuma cache'lerini düşürerek yeni kazananın anında
   * yansımasını sağlar. Hesaplama hatası diğer tipi etkilemez (best-effort).
   */
  async refreshFeaturedSnapshots(): Promise<void> {
    try {
      const collector = await this.selectFeaturedCollector();
      if (collector) {
        await this.upsertFeaturedSnapshot('collector', collector.id, collector.score);
      }
    } catch (e: any) {
      this.logger.warn(`refreshFeaturedSnapshots(collector) failed: ${e.message}`);
    }

    try {
      const business = await this.selectFeaturedBusiness();
      if (business) {
        await this.upsertFeaturedSnapshot('business', business.id, business.score);
      }
    } catch (e: any) {
      this.logger.warn(`refreshFeaturedSnapshots(business) failed: ${e.message}`);
    }

    if (this.cache) {
      await this.cache.del('featured:collector').catch(() => {});
      await this.cache.del('featured:business').catch(() => {});
    }
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
            where: { receiverId: seller.id, status: 'approved' },
            _avg: { score: true },
            _count: true,
          }),
        ]);

        const score = salesCount * 10 + (ratings._avg?.score || 0) * 20 + seller._count.products * 2;

        const resolvedAvatar = await this.resolveAvatarUrl(seller.avatarUrl);

        return {
          id: seller.id,
          displayName: seller.displayName,
          avatarUrl: resolvedAvatar,
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

  /**
   * İsimle satıcı arama (autocomplete). Yalnızca aktif ürünü olan, banlı/silinmemiş
   * satıcıları döndürür — profili herkese açık olmayanları sızdırmaz.
   */
  async searchSellers(query: string, limit: number = 8) {
    const q = (query || '').trim();
    if (q.length < 2) {
      return [];
    }

    const sellers = await this.prisma.user.findMany({
      where: {
        isSeller: true,
        isBanned: false,
        deletedAt: null,
        products: { some: { status: 'active' } },
        displayName: { contains: q, mode: 'insensitive' },
      },
      take: Math.min(20, Math.max(1, Number(limit) || 8)),
      orderBy: { products: { _count: 'desc' } },
      select: {
        id: true,
        displayName: true,
        avatarUrl: true,
        isVerified: true,
        _count: { select: { products: { where: { status: 'active' } } } },
      },
    });

    return Promise.all(
      sellers.map(async (s) => ({
        id: s.id,
        displayName: s.displayName,
        avatarUrl: await this.resolveAvatarUrl(s.avatarUrl),
        isVerified: s.isVerified,
        totalListings: s._count.products,
      })),
    );
  }

  // ==========================================================================
  // USER BLOCKING
  // ==========================================================================

  /**
   * Block a user
   */
  async blockUser(blockerId: string, blockedId: string): Promise<{ success: boolean; message: string }> {
    // Cannot block yourself
    if (blockerId === blockedId) {
      throw new BadRequestException('Kendinizi engelleyemezsiniz');
    }

    // Check if blocked user exists
    const blockedUser = await this.prisma.user.findUnique({
      where: { id: blockedId },
      select: { id: true, displayName: true },
    });

    if (!blockedUser) {
      throw new NotFoundException('Kullanıcı bulunamadı');
    }

    // Check if already blocked
    const existingBlock = Array.from(this.userBlocks.values()).find(
      (b) => b.blockerId === blockerId && b.blockedId === blockedId
    );

    if (existingBlock) {
      throw new BadRequestException('Bu kullanıcı zaten engellenmiş');
    }

    // Create block
    const block: UserBlock = {
      id: this.generateUUID(),
      blockerId,
      blockedId,
      createdAt: new Date(),
    };

    this.userBlocks.set(block.id, block);

    this.logger.log(`User ${blockerId} blocked user ${blockedId}`);

    return { success: true, message: `${blockedUser.displayName} engellendi` };
  }

  /**
   * Unblock a user
   */
  async unblockUser(blockerId: string, blockedId: string): Promise<{ success: boolean; message: string }> {
    // Find the block
    const block = Array.from(this.userBlocks.values()).find(
      (b) => b.blockerId === blockerId && b.blockedId === blockedId
    );

    if (!block) {
      throw new NotFoundException('Bu kullanıcı engellenmemiş');
    }

    // Remove block
    this.userBlocks.delete(block.id);

    this.logger.log(`User ${blockerId} unblocked user ${blockedId}`);

    return { success: true, message: 'Engel kaldırıldı' };
  }

  /**
   * Get list of blocked users
   */
  async getBlockedUsers(userId: string): Promise<any[]> {
    const blocks = Array.from(this.userBlocks.values()).filter(
      (b) => b.blockerId === userId
    );

    const blockedUserIds = blocks.map((b) => b.blockedId);

    if (blockedUserIds.length === 0) {
      return [];
    }

    const blockedUsers = await this.prisma.user.findMany({
      where: { id: { in: blockedUserIds } },
      select: {
        id: true,
        displayName: true,
        avatarUrl: true,
      },
    });

    return blockedUsers.map((user) => ({
      ...user,
      blockedAt: blocks.find((b) => b.blockedId === user.id)?.createdAt,
    }));
  }

  /**
   * Check if a user is blocked
   */
  isUserBlocked(blockerId: string, blockedId: string): boolean {
    return Array.from(this.userBlocks.values()).some(
      (b) => b.blockerId === blockerId && b.blockedId === blockedId
    );
  }

  /**
   * Check if either user has blocked the other
   */
  areUsersBlocked(userId1: string, userId2: string): boolean {
    return Array.from(this.userBlocks.values()).some(
      (b) =>
        (b.blockerId === userId1 && b.blockedId === userId2) ||
        (b.blockerId === userId2 && b.blockedId === userId1)
    );
  }


  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // -------- Seller Bank Account --------

  async getBankAccount(userId: string) {
    return this.prisma.sellerBankAccount.findUnique({
      where: { userId },
    });
  }

  async upsertBankAccount(
    userId: string,
    data: { accountHolder: string; iban: string; tcKimlikNo?: string; taxId?: string },
  ) {
    const normalizedIban = data.iban.replace(/\s/g, '').toUpperCase();

    return this.prisma.sellerBankAccount.upsert({
      where: { userId },
      create: {
        userId,
        accountHolder: data.accountHolder.trim(),
        iban: normalizedIban,
        tcKimlikNo: data.tcKimlikNo || null,
        taxId: data.taxId || null,
      },
      update: {
        accountHolder: data.accountHolder.trim(),
        iban: normalizedIban,
        tcKimlikNo: data.tcKimlikNo || null,
        taxId: data.taxId || null,
        isVerified: false,
        verifiedAt: null,
      },
    });
  }

  async deleteBankAccount(userId: string) {
    const existing = await this.prisma.sellerBankAccount.findUnique({
      where: { userId },
    });
    if (!existing) {
      throw new NotFoundException('Banka hesabı bulunamadı');
    }
    await this.prisma.sellerBankAccount.delete({ where: { userId } });
    return { success: true };
  }
}
