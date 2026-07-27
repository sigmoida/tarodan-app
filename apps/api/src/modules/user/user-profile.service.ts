import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import {
  User,
  Prisma,
  ProductStatus,
  TradeStatus,
  OrderStatus,
} from "@prisma/client";
import { ModerationAiClient } from "../moderation/moderation-ai.client";
import { computeTrustScore } from "./helpers/trust-score";
import { isPremiumEntitled } from "../membership/membership.util";
import { i18nMessage } from "../i18n";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NotificationSettings,
  UpdateNotificationSettingsDto,
} from "./dto";
import { UserCommonService } from "./user-common.service";

/**
 * UserProfileService — profil/lookup/hesap grubu: avatar redirect, find*,
 * findByIdWithAddresses, updateProfile, bildirim tercihleri, deleteAccount
 * (anonimleştirme), verifyUser, upgradToSeller, getPublicProfile. Avatar
 * çözümü için common'a delege eder (this.common.resolveAvatarUrl).
 */
@Injectable()
export class UserProfileService {
  private readonly logger = new Logger(UserProfileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly moderationAi: ModerationAiClient,
    private readonly common: UserCommonService,
  ) {}

  /**
   * Stabil avatar endpoint'i (GET /users/:id/avatar) için kullanıcının taze
   * presigned avatar URL'ini döndürür. Avatar yoksa/çözülemezse null.
   */
  async getAvatarRedirectUrl(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    });
    return this.common.resolveAvatarUrl(user?.avatarUrl);
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
          orderBy: { isDefault: "desc" },
        },
        membership: {
          include: {
            tier: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(i18nMessage("server.user.notFound"));
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
        where: { receiverId: id, status: "approved" },
        _avg: { score: true },
        _count: true,
      }),
      this.prisma.order.count({ where: { sellerId: id, status: "completed" } }),
      this.prisma.trade.count({
        where: {
          OR: [{ initiatorId: id }, { receiverId: id }],
          status: "completed",
        },
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

    // Format membership info for frontend — EFFECTIVE view. The web gates its UI
    // (Takas / Koleksiyon / limits) off this payload, so it must match the backend's
    // own gates: an unpaid (past_due) or expired membership grants NO premium
    // capability. `isPremium` (isPremiumEntitled) is the single source of truth —
    // when it's false the tier is presented as free, while the real status/period is
    // still returned for display. Detailed plan/pending info lives in /membership/me.
    const FREE_TIER_VIEW = {
      type: "free",
      name: "Ücretsiz",
      maxFreeListings: 5,
      maxTotalListings: 10,
      maxImagesPerListing: 3,
      canTrade: false,
      canCreateCollections: false,
      isAdFree: false,
      featuredListingSlots: 0,
      commissionDiscount: 0,
    };
    const membershipInfo = user.membership
      ? {
          id: user.membership.id,
          status: user.membership.status,
          currentPeriodStart: user.membership.currentPeriodStart,
          currentPeriodEnd: user.membership.currentPeriodEnd,
          tier: isPremium
            ? {
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
              }
            : { id: user.membership.tier.id, ...FREE_TIER_VIEW },
        }
      : {
          tier: FREE_TIER_VIEW,
          status: "active",
          expiresAt: null,
        };

    // Resolve avatar URL (S3 key → presigned URL)
    const resolvedAvatarUrl = await this.common.resolveAvatarUrl(
      user.avatarUrl,
    );

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
      preferredLanguage?: string;
    },
  ) {
    // Profil serbest metinlerini AI moderasyonundan geçir (uygunsuz → engelle)
    await this.moderationAi.assertTextClean(data.displayName, {
      entityType: "user",
      entityId: userId,
      userId,
      field: "display_name",
      label: "görünen ad",
    });
    await this.moderationAi.assertTextClean(data.bio, {
      entityType: "user",
      entityId: userId,
      userId,
      field: "bio",
      label: "biyografi",
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
      throw new NotFoundException(i18nMessage("server.user.notFound"));
    }

    const isBusinessTier = user.membership?.tier?.type === "business";
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
        throw new BadRequestException(
          i18nMessage("server.user.phoneAlreadyInUse"),
        );
      }
    }

    // Prepare update data
    const updateData: Prisma.UserUpdateInput = {};

    if (data.displayName !== undefined)
      updateData.displayName = data.displayName;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.bio !== undefined) updateData.bio = data.bio;
    if (data.showTrustScore !== undefined)
      updateData.showTrustScore = data.showTrustScore;
    if (data.preferredLanguage !== undefined)
      updateData.preferredLanguage = data.preferredLanguage;
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
      throw new BadRequestException(
        i18nMessage("server.user.noFieldsToUpdate"),
      );
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
      throw new NotFoundException(i18nMessage("server.user.notFound"));
    }

    const stored =
      (user.notificationSettings as Partial<NotificationSettings> | null) ?? {};
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
      data: {
        notificationSettings: merged as unknown as Prisma.InputJsonValue,
      },
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
      throw new NotFoundException(i18nMessage("server.user.notFound"));
    }

    // Check 1: Active products (active, pending, reserved)
    const activeProducts = await this.prisma.product.findMany({
      where: {
        sellerId: userId,
        status: {
          in: [
            ProductStatus.active,
            ProductStatus.pending,
            ProductStatus.reserved,
          ],
        },
      },
      select: { id: true, title: true, status: true },
    });

    // Check 2: Active trades (pending, accepted, shipped, received - not completed/cancelled/rejected/disputed)
    const activeTrades = await this.prisma.trade.findMany({
      where: {
        OR: [{ initiatorId: userId }, { receiverId: userId }],
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
        OR: [{ buyerId: userId }, { sellerId: userId }],
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

    // Build blocking reasons as catalog payloads; AllExceptionsFilter renders
    // both the top-level message and each errors[] entry in the request locale
    // while preserving the {errors, details} contract the client relies on (#224).
    const errors: ReturnType<typeof i18nMessage>[] = [];

    if (activeProducts.length > 0) {
      errors.push(
        i18nMessage("server.user.deleteBlockedActiveListings", {
          count: activeProducts.length,
        }),
      );
    }

    if (activeTrades.length > 0) {
      errors.push(
        i18nMessage("server.user.deleteBlockedActiveTrades", {
          count: activeTrades.length,
        }),
      );
    }

    if (pendingOrders.length > 0) {
      errors.push(
        i18nMessage("server.user.deleteBlockedPendingOrders", {
          count: pendingOrders.length,
        }),
      );
    }

    if (errors.length > 0) {
      throw new BadRequestException({
        ...i18nMessage("server.user.deleteAccountBlocked"),
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
      await this.prisma.$transaction(
        async (tx) => {
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
              passwordHash: "",
              displayName: "Silinmiş Kullanıcı",
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
        },
        {
          timeout: 60000,
        },
      );

      this.logger.log(`User account anonymized (soft-deleted): ${userId}`);
      // #224: mesaj artık UserController.deleteAccount() tarafından locale'e göre
      // kuruluyor (server.user.accountDeleted) — servis burada sabit metin döndürmüyor.
    } catch (error: any) {
      this.logger.error(
        `Delete account (anonymize) failed for ${userId}: ${error?.message}`,
      );
      throw new BadRequestException(
        i18nMessage("server.user.deleteAccountFailed"),
      );
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
        sellerType: "individual",
      },
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
      throw new NotFoundException(i18nMessage("server.user.notFound"));
    }

    // İlan/koleksiyon sayımı viewer'a göre değişir (sahip → tümü, başkası → görünür olanlar).
    const listingWhere = isOwner
      ? { sellerId: userId, status: { notIn: ["deleted"] } as any }
      : { sellerId: userId, status: "active" };
    const collectionWhere = isOwner ? { userId } : { userId, isPublic: true };

    // Get seller stats + followers count + membership
    // completedTrades: güven skoru için sabit metrik (viewer'dan bağımsız).
    // allTrades: sahip görünümünde gösterilen "tüm takaslar" sayısı.
    const [
      totalListings,
      totalSales,
      completedTrades,
      allTrades,
      ratings,
      followersCount,
      membership,
      totalCollections,
    ] = await Promise.all([
      this.prisma.product.count({ where: listingWhere }),
      this.prisma.order.count({
        where: { sellerId: userId, status: "completed" },
      }),
      this.prisma.trade.count({
        where: {
          OR: [{ initiatorId: userId }, { receiverId: userId }],
          status: "completed",
        },
      }),
      this.prisma.trade.count({
        where: {
          OR: [{ initiatorId: userId }, { receiverId: userId }],
        },
      }),
      this.prisma.rating.aggregate({
        where: { receiverId: userId, status: "approved" },
        _avg: { score: true },
        _count: true,
      }),
      this.prisma.userFollow.count({ where: { followingId: userId } }),
      this.prisma.userMembership.findUnique({
        where: { userId },
        select: {
          status: true,
          currentPeriodEnd: true,
          tier: { select: { type: true } },
        },
      }),
      this.prisma.collection.count({ where: collectionWhere }),
    ]);

    // Gösterilecek takas sayısı: sahip → tümü, başkası → yalnızca tamamlanmış.
    const totalTrades = isOwner ? allTrades : completedTrades;

    // Resolve avatar URL (S3 key → presigned URL)
    const resolvedAvatarUrl = await this.common.resolveAvatarUrl(
      user.avatarUrl,
    );

    // Premium (ücretli, aktif) üyelik mi?
    const membershipTier = membership?.tier.type ?? "free";
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
}
