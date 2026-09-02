import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../../prisma";
import { UserBlockService } from "../../user-block/user-block.service";
import {
  User,
  Prisma,
  ProductStatus,
  TradeStatus,
  OrderStatus,
  RefundRequestStatus,
  PayoutStatus,
  PaymentHoldStatus,
} from "@prisma/client";
import { ModerationAiClient } from "../../moderation/moderation-ai.client";
import { computeTrustScore } from "../helpers/trust-score";
import { publicUserRatingWhere } from "../../../common/helpers/public-rating";
import {
  effectiveMembershipTierType,
  isPremiumEntitled,
  saleCapableSellerWhere,
} from "../../membership/helpers/membership.util";
import { i18nMessage } from "../../i18n";
import {
  ONBOARDING_TOURS,
  type OnboardingTourKey,
} from "../helpers/user-preferences.constants";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NotificationSettings,
  UpdateNotificationSettingsDto,
} from "../dto";
import { UserCommonService } from "../user-common.service";
import {
  isUsernameAllowed,
  normalizeUsername,
} from "../../auth/utils/username.util";
import {
  PUBLIC_IDENTITY_SELECT,
  toPublicIdentity,
} from "../../../common/helpers/public-identity";
import { catalogProductWhere } from "../../product/helpers/catalog-product-where";

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
    private readonly userBlocks: UserBlockService,
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
        ...catalogProductWhere(),
        sellerId: id,
        status: { notIn: [ProductStatus.inactive, ProductStatus.deleted] },
      },
    });

    // Güven Skoru için ek istatistikler (puan, satış, takas)
    const [ratingAgg, salesCount, tradesCount] = await Promise.all([
      this.prisma.rating.aggregate({
        where: publicUserRatingWhere({ receiverId: id }),
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
    const isPremium = isPremiumEntitled(user.membership, user);
    const freeTier = await this.prisma.membershipTier.findUnique({
      where: { type: "free" },
    });
    if (!freeTier) {
      throw new NotFoundException(
        i18nMessage("server.membership.freeTierNotFound"),
      );
    }
    const effectiveTier =
      user.membership && (user.membership.tier.type === "free" || isPremium)
        ? user.membership.tier
        : freeTier;
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
    const effectiveTierView = {
      id: effectiveTier.id,
      type: effectiveTier.type,
      name: effectiveTier.name,
      maxFreeListings: effectiveTier.maxFreeListings,
      maxTotalListings: effectiveTier.maxTotalListings,
      maxImagesPerListing: effectiveTier.maxImagesPerListing,
      canCreateCollections: effectiveTier.canCreateCollections,
      canTrade: effectiveTier.canTrade,
      // featuredListingSlots kaldırıldı: ücretli öne çıkarma paketleri devraldı.
    };
    const membershipInfo = user.membership
      ? {
          id: user.membership.id,
          status: user.membership.status,
          currentPeriodStart: user.membership.currentPeriodStart,
          currentPeriodEnd: user.membership.currentPeriodEnd,
          tier: effectiveTierView,
        }
      : {
          tier: effectiveTierView,
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

    // Şirket kimliği (companyName + taxId) SELF-SERVICE yazılamaz: bu alanlar
    // yalnız kurumsal onay boru hattı (finalApprove) tarafından damgalanır ve
    // web guard'ı / vergilendirme yüzeyleri bunlara güvenir. Profilden yalnız
    // ONAYLI kurumsal hesap güncelleyebilir. Eski `isCorporateSeller` bayrağı
    // istemcinin gönderdiği çıplak bir alandı — herhangi bir bireysel kullanıcı
    // kendini "şirket" ilan edip guard'ın üyelik döngüsüne kilitlenebiliyordu.
    const canEditCompanyFields = user.businessStatus === "approved";

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

    // Only approved corporate accounts may touch company identity fields.
    if (canEditCompanyFields) {
      if (data.companyName !== undefined) {
        updateData.companyName = data.companyName || null;
      }
      if (data.taxId !== undefined) {
        updateData.taxId = data.taxId || null;
      }
    } else if (data.companyName !== undefined || data.taxId !== undefined) {
      // Onaysız hesapta gönderilen şirket alanları YOK SAYILIR ve varsa eski
      // self-declare kalıntısı temizlenir.
      updateData.companyName = null;
      updateData.taxId = null;
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

  async claimUsername(userId: string, requestedUsername: string) {
    const username = normalizeUsername(requestedUsername);
    if (!isUsernameAllowed(username)) {
      throw new BadRequestException(i18nMessage("server.user.usernameFormat"));
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { usernameClaimedAt: true },
    });
    if (!user) {
      throw new NotFoundException(i18nMessage("server.user.notFound"));
    }
    if (user.usernameClaimedAt) {
      throw new ConflictException(
        i18nMessage("server.user.usernameAlreadySet"),
      );
    }

    try {
      const result = await this.prisma.user.updateMany({
        where: { id: userId, usernameClaimedAt: null },
        data: { username, usernameClaimedAt: new Date() },
      });
      if (result.count !== 1) {
        throw new ConflictException(
          i18nMessage("server.user.usernameAlreadySet"),
        );
      }
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException(
          i18nMessage("server.auth.usernameAlreadyTaken"),
        );
      }
      throw error;
    }

    return { username, usernameClaimed: true };
  }

  /**
   * Bir tanıtım turunu tamamlandı olarak işaretler.
   *
   * Sürüm alanı tur anahtarından çözülür (ONBOARDING_TOURS tek kaynak), böylece
   * her yeni tur için ayrı uç/servis yazmak gerekmez. Güncelleme `lt` ile
   * MONOTON: aynı çağrı iki kez gelse de tek etki eder ve sürüm asla geri gitmez
   * (aksi halde tur kullanıcıya tekrar tekrar gösterilirdi).
   */
  async completeTour(userId: string, tour: OnboardingTourKey, version: number) {
    const config = ONBOARDING_TOURS[tour];
    if (!config) {
      throw new BadRequestException(
        i18nMessage("server.user.unknownOnboardingTour"),
      );
    }
    // Sürüm turun kendi güncel sürümüyle sınırlı: istemci ileri bir sürüm
    // gönderip turu kalıcı olarak susturamaz.
    const target = Math.min(version, config.version);
    const field = config.field;

    await this.prisma.user.updateMany({
      where: { id: userId, [field]: { lt: target } },
      data: { [field]: target },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { [field]: true },
    });
    if (!user) {
      throw new NotFoundException(i18nMessage("server.user.notFound"));
    }

    return user;
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
        // marketingEmails düğmesi pazarlama e-postalarının kullanıcıya görünen
        // TEK anahtarıdır; gerçek gönderim kapıları ise User.acceptsMarketingEmails
        // kolonunu okur (bülten aboneliği, fiyat-düşüş e-postası, üyelik teklif
        // e-postası). Senkronlanmazsa düğmeyi kapatan kullanıcı pazarlama
        // e-postası almaya devam eder.
        ...(patch.marketingEmails !== undefined
          ? { acceptsMarketingEmails: patch.marketingEmails }
          : {}),
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
        ...catalogProductWhere(),
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

    // Check 2: every non-terminal legacy and escrow trade state.
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
            TradeStatus.awaiting_payment,
            TradeStatus.shipping_to_warehouse,
            TradeStatus.at_warehouse,
            TradeStatus.admin_reviewing,
            TradeStatus.shipping_to_recipients,
            TradeStatus.returning,
            TradeStatus.disputed,
          ],
        },
      },
      select: { id: true, tradeNumber: true, status: true },
    });

    // Check 3: every order state with an unfinished fulfilment/refund obligation.
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
            OrderStatus.awaiting_buyer_confirmation,
            OrderStatus.refund_requested,
          ],
        },
      },
      select: { id: true, orderNumber: true, status: true },
    });

    const openRefunds = await this.prisma.refundRequest.findMany({
      where: {
        OR: [
          { requesterId: userId },
          { order: { OR: [{ buyerId: userId }, { sellerId: userId }] } },
        ],
        status: {
          in: [
            RefundRequestStatus.pending_review,
            RefundRequestStatus.approved,
            RefundRequestStatus.wait_for_delivery,
            RefundRequestStatus.return_shipment_open,
            RefundRequestStatus.return_in_transit,
            RefundRequestStatus.return_delivered,
            RefundRequestStatus.disputed,
          ],
        },
      },
      select: { id: true, status: true },
    });

    const pendingPayouts = await this.prisma.payoutTransfer.findMany({
      where: {
        sellerId: userId,
        status: {
          in: [
            PayoutStatus.pending,
            PayoutStatus.processing,
            PayoutStatus.retry_pending,
            PayoutStatus.returned,
          ],
        },
      },
      select: { id: true, status: true },
    });

    const openPaymentHolds = await this.prisma.paymentHold.findMany({
      where: {
        sellerId: userId,
        status: {
          in: [PaymentHoldStatus.held, PaymentHoldStatus.released],
        },
      },
      select: { id: true, status: true },
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

    if (openRefunds.length > 0) {
      errors.push(
        i18nMessage("server.user.deleteBlockedOpenRefunds", {
          count: openRefunds.length,
        }),
      );
    }

    if (pendingPayouts.length > 0) {
      errors.push(
        i18nMessage("server.user.deleteBlockedPendingPayouts", {
          count: pendingPayouts.length,
        }),
      );
    }

    if (openPaymentHolds.length > 0) {
      errors.push(
        i18nMessage("server.user.deleteBlockedPaymentHolds", {
          count: openPaymentHolds.length,
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
          openRefunds: openRefunds.length,
          pendingPayouts: pendingPayouts.length,
          openPaymentHolds: openPaymentHolds.length,
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

          // 3b) Pazarlama listesinden çıkar. E-posta birazdan
          // `deleted_...@deleted.local` olarak anonimleştirileceği için abone
          // satırı gerçek adresle öksüz kalır ve hesap silinmiş olmasına rağmen
          // bülten gitmeye devam ederdi. Aynı transaction'da olmalı.
          await tx.newsletterSubscriber.updateMany({
            where: { email: user.email.toLowerCase(), unsubscribedAt: null },
            data: { unsubscribedAt: new Date(), updatedAt: new Date() },
          });

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
  async getPublicProfile(identifier: string, viewerId?: string) {
    const normalizedIdentifier = normalizeUsername(identifier);
    const identity = await this.prisma.user.findFirst({
      where: {
        OR: [{ id: identifier }, { username: normalizedIdentifier }],
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!identity) {
      throw new NotFoundException(i18nMessage("server.user.notFound"));
    }
    const userId = identity.id;

    // Engel (iki yön) varsa profil "yok" davranır; engellendiğini sızdırmaz.
    await this.userBlocks.assertVisibleTo(
      viewerId,
      userId,
      "server.user.notFound",
    );

    // Sahibin kendi profili mi? Sahip ise sayaçlar "tümünü" gösterir
    // (ilan: draft hariç tüm durumlar, takas: tüm statüler, koleksiyon: özel dahil);
    // başkası bakarken yalnızca herkese görünür/biten kayıtlar sayılır.
    const isOwner = !!viewerId && viewerId === userId;

    // adminCode (B/K kodu) İÇ referanstır: herkese açık profilde yeri yok.
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        ...PUBLIC_IDENTITY_SELECT,
        bio: true,
        isSeller: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException(i18nMessage("server.user.notFound"));
    }

    // İlan/koleksiyon sayımı viewer'a göre değişir (sahip → tümü, başkası → görünür olanlar).
    const listingWhere: Prisma.ProductWhereInput = isOwner
      ? {
          ...catalogProductWhere(),
          sellerId: userId,
          status: { notIn: [ProductStatus.deleted] },
        }
      : {
          ...catalogProductWhere(),
          sellerId: userId,
          status: ProductStatus.active,
          seller: saleCapableSellerWhere(),
        };
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
        where: publicUserRatingWhere({ receiverId: userId }),
        _avg: { score: true },
        _count: true,
      }),
      this.prisma.userFollow.count({ where: { followingId: userId } }),
      this.prisma.userMembership.findUnique({
        where: { userId },
        select: {
          status: true,
          currentPeriodEnd: true,
          tier: { select: { type: true, isActive: true } },
          user: {
            select: {
              businessStatus: true,
              companyName: true,
              taxId: true,
            },
          },
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
    const isPremium = isPremiumEntitled(membership, membership?.user);
    const membershipTier = effectiveMembershipTierType(
      membership,
      membership?.user,
    );

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
      ...toPublicIdentity(user),
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
