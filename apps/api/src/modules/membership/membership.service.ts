import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma';
import {
  MembershipTierType,
  SubscriptionStatus,
  ProductStatus,
  OrderStatus,
  PaymentStatus,
  SavedCardStatus,
} from '@prisma/client';
import {
  SubscribeDto,
  CreateMembershipTierDto,
  UpdateMembershipTierDto,
  MembershipTierResponseDto,
  UserMembershipResponseDto,
  MembershipLimitsDto,
} from './dto';
import { PaymentService } from '../payment/payment.service';
import { PaymentProvider } from '../payment/dto';
import { Request } from 'express';
import { MembershipPaymentInitResponseDto } from './dto/membership-payment.dto';
import { PayTRService } from '../payment-providers/paytr.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MembershipService {
  private readonly logger = new Logger(MembershipService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
    private readonly paytr: PayTRService,
    private readonly configService: ConfigService,
  ) {}

  // ==========================================================================
  // GET ALL TIERS
  // ==========================================================================
  async getAllTiers(includeInactive = false): Promise<MembershipTierResponseDto[]> {
    const tiers = await this.prisma.membershipTier.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    return tiers.map((tier) => this.mapTierToDto(tier));
  }

  // ==========================================================================
  // GET TIER BY TYPE
  // ==========================================================================
  async getTierByType(type: MembershipTierType): Promise<MembershipTierResponseDto> {
    const tier = await this.prisma.membershipTier.findUnique({
      where: { type },
    });

    if (!tier) {
      throw new NotFoundException(`Üyelik tipi bulunamadı: ${type}`);
    }

    return this.mapTierToDto(tier);
  }

  // ==========================================================================
  // GET USER'S MEMBERSHIP
  // ==========================================================================
  async getUserMembership(userId: string): Promise<UserMembershipResponseDto> {
    let membership = await this.prisma.userMembership.findUnique({
      where: { userId },
      include: { tier: true },
    });

    // If no membership, create free tier membership
    if (!membership) {
      const freeTier = await this.prisma.membershipTier.findUnique({
        where: { type: MembershipTierType.free },
      });

      if (!freeTier) {
        throw new NotFoundException('Ücretsiz üyelik tipi bulunamadı');
      }

      const now = new Date();
      const oneYearLater = new Date(now.getFullYear() + 100, now.getMonth(), now.getDate()); // Free tier never expires

      membership = await this.prisma.userMembership.create({
        data: {
          userId,
          tierId: freeTier.id,
          status: SubscriptionStatus.active,
          currentPeriodStart: now,
          currentPeriodEnd: oneYearLater,
        },
        include: { tier: true },
      });
    }

    // Ödeme beklerken (past_due) “satın alınmış” gibi gösterme: efektif planı ücretsiz yap
    let effectiveTier = membership.tier;
    let pendingTierName: string | undefined;
    let pendingTierType: string | undefined;
    let pendingPayment = false;
    if (membership.status === SubscriptionStatus.past_due) {
      // SELF-HEAL: past_due görünüyor ama ödeme aslında PayTR'de başarılı olmuş
      // olabilir (callback ngrok'a düşemediğinde sipariş pending kalır). Kullanıcı
      // sayfayı açtığı an, bu döneme ait BEKLEYEN PayTR ödemesini durum-sorgu ile
      // doğrula ve tamamla → reconciliation cron'unu beklemeden anında aktive olur.
      const virtualProductId = `membership-${membership.tierId}`;
      // 1dk tolerans: sipariş, abonelikten (currentPeriodStart) hemen sonra oluşur.
      const healFloor = new Date(membership.currentPeriodStart.getTime() - 60 * 1000);

      // (a) Bu döneme ait BEKLEYEN ödemeyi PayTR'ye sor; ödendiyse tamamla.
      const pendingPaymentRow = await this.prisma.payment.findFirst({
        where: {
          status: PaymentStatus.pending,
          provider: PaymentProvider.paytr,
          providerConversationId: { not: null },
          order: { buyerId: userId, productId: virtualProductId, createdAt: { gte: healFloor } },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (pendingPaymentRow) {
        try {
          await this.paymentService.verifyPaymentFromClient(pendingPaymentRow.id);
        } catch (err) {
          this.logger.warn(`Membership self-heal verify failed for payment ${pendingPaymentRow.id}: ${(err as Error)?.message}`);
        }
      }

      // (b) Tamamlanmış sipariş var mı (verify ya da cron'un işlediği) → aktive et.
      const paidOrder = await this.prisma.order.findFirst({
        where: {
          buyerId: userId,
          productId: virtualProductId,
          status: { in: [OrderStatus.completed, OrderStatus.delivered, OrderStatus.paid, OrderStatus.preparing] },
          createdAt: { gte: healFloor },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Üyelik (verify aktivasyonu sonrası) güncel durumu yeniden oku.
      const fresh = await this.prisma.userMembership.findUnique({
        where: { userId },
        include: { tier: true },
      });
      if (fresh) membership = fresh;

      if (membership.status === SubscriptionStatus.active) {
        // verify zaten aktive etti; banner gösterme.
      } else if (paidOrder) {
        membership = await this.prisma.userMembership.update({
          where: { userId },
          data: { status: SubscriptionStatus.active, cancelledAt: null },
          include: { tier: true },
        });
        this.logger.log(`Self-healed membership ${membership.id} past_due → active (paid order ${paidOrder.orderNumber})`);
      } else {
        const freeTier = await this.prisma.membershipTier.findUnique({
          where: { type: MembershipTierType.free },
        });
        if (freeTier) {
          effectiveTier = freeTier;
          pendingTierName = membership.tier.name;
          pendingTierType = membership.tier.type;
          pendingPayment = true;
        }
      }
    }

    // Map tier to DTO first
    const tierDto = this.mapTierToDto(effectiveTier);
    
    // Override listing limits based on tier type if platform setting exists
    // This must be done BEFORE getUserUsageStats so it uses the correct limit
    if (effectiveTier.type === MembershipTierType.free) {
      const freeListingLimitSetting = await this.prisma.platformSetting.findUnique({
        where: { settingKey: 'free_listing_limit' },
      });
      if (freeListingLimitSetting?.settingValue) {
        const platformLimit = parseInt(freeListingLimitSetting.settingValue, 10);
        if (!isNaN(platformLimit) && platformLimit > 0) {
          tierDto.maxFreeListings = platformLimit;
          tierDto.maxTotalListings = platformLimit; // For free tier, total = free
          // Also update the tier object so getUserUsageStats uses the correct value
          effectiveTier.maxFreeListings = platformLimit;
          effectiveTier.maxTotalListings = platformLimit;
        }
      }
    } else if (effectiveTier.type === MembershipTierType.basic) {
      const basicListingLimitSetting = await this.prisma.platformSetting.findUnique({
        where: { settingKey: 'basic_listing_limit' },
      });
      if (basicListingLimitSetting?.settingValue) {
        const platformLimit = parseInt(basicListingLimitSetting.settingValue, 10);
        if (!isNaN(platformLimit)) {
          if (platformLimit === -1) {
            tierDto.maxTotalListings = -1;
            effectiveTier.maxTotalListings = -1;
          } else if (platformLimit > 0) {
            tierDto.maxTotalListings = platformLimit;
            effectiveTier.maxTotalListings = platformLimit;
          }
        }
      }
    } else if (effectiveTier.type === MembershipTierType.premium) {
      const premiumListingLimitSetting = await this.prisma.platformSetting.findUnique({
        where: { settingKey: 'premium_listing_limit' },
      });
      if (premiumListingLimitSetting?.settingValue) {
        const platformLimit = parseInt(premiumListingLimitSetting.settingValue, 10);
        if (!isNaN(platformLimit)) {
          if (platformLimit === -1) {
            tierDto.maxTotalListings = -1; // Unlimited
            effectiveTier.maxTotalListings = -1;
          } else if (platformLimit > 0) {
            tierDto.maxTotalListings = platformLimit;
            effectiveTier.maxTotalListings = platformLimit;
          }
        }
      }
    } else if (effectiveTier.type === MembershipTierType.business) {
      const businessListingLimitSetting = await this.prisma.platformSetting.findUnique({
        where: { settingKey: 'business_listing_limit' },
      });
      if (businessListingLimitSetting?.settingValue) {
        const platformLimit = parseInt(businessListingLimitSetting.settingValue, 10);
        if (!isNaN(platformLimit)) {
          if (platformLimit === -1) {
            tierDto.maxTotalListings = -1; // Unlimited
            effectiveTier.maxTotalListings = -1;
          } else if (platformLimit > 0) {
            tierDto.maxTotalListings = platformLimit;
            effectiveTier.maxTotalListings = platformLimit;
          }
        }
      }
    }

    // Get usage stats (this will use the overridden maxFreeListings)
    const stats = await this.getUserUsageStats(userId, effectiveTier);

    return {
      id: membership.id,
      userId: membership.userId,
      tier: tierDto,
      status: membership.status,
      autoRenew: membership.autoRenew,
      currentPeriodStart: membership.currentPeriodStart,
      currentPeriodEnd: membership.currentPeriodEnd,
      cancelledAt: membership.cancelledAt || undefined,
      createdAt: membership.createdAt,
      ...(pendingPayment && pendingTierName ? { pendingTierName, pendingTierType, pendingPayment: true } : {}),
      ...stats,
    };
  }

  // ==========================================================================
  // GET USER'S MEMBERSHIP LIMITS (for checking permissions)
  // ==========================================================================
  async getUserLimits(userId: string): Promise<MembershipLimitsDto> {
    try {
      if (!userId) {
        throw new BadRequestException('Kullanıcı kimliği bulunamadı');
      }

      const membership = await this.getUserMembership(userId);

      if (!membership || !membership.tier) {
        throw new NotFoundException('Üyelik bilgisi bulunamadı');
      }

      // getUserUsageStats already handles platform setting override for all tiers
      // We just need to ensure maxFreeListings and maxTotalListings reflect the platform setting override
      let maxFreeListings = membership.tier.maxFreeListings;
      let maxTotalListings = membership.tier.maxTotalListings;
      
      if (membership.tier.type === MembershipTierType.free) {
        const freeListingLimitSetting = await this.prisma.platformSetting.findUnique({
          where: { settingKey: 'free_listing_limit' },
        });
        if (freeListingLimitSetting?.settingValue) {
          const platformLimit = parseInt(freeListingLimitSetting.settingValue, 10);
          if (!isNaN(platformLimit) && platformLimit > 0) {
            maxFreeListings = platformLimit;
            maxTotalListings = platformLimit; // For free tier, total = free
          }
        }
      } else if (membership.tier.type === MembershipTierType.premium) {
        const premiumListingLimitSetting = await this.prisma.platformSetting.findUnique({
          where: { settingKey: 'premium_listing_limit' },
        });
        if (premiumListingLimitSetting?.settingValue) {
          const platformLimit = parseInt(premiumListingLimitSetting.settingValue, 10);
          if (!isNaN(platformLimit)) {
            if (platformLimit === -1) {
              maxTotalListings = -1; // Unlimited
            } else if (platformLimit > 0) {
              maxTotalListings = platformLimit;
            }
          }
        }
      } else if (membership.tier.type === MembershipTierType.business) {
        const businessListingLimitSetting = await this.prisma.platformSetting.findUnique({
          where: { settingKey: 'business_listing_limit' },
        });
        if (businessListingLimitSetting?.settingValue) {
          const platformLimit = parseInt(businessListingLimitSetting.settingValue, 10);
          if (!isNaN(platformLimit)) {
            if (platformLimit === -1) {
              maxTotalListings = -1; // Unlimited
            } else if (platformLimit > 0) {
              maxTotalListings = platformLimit;
            }
          }
        }
      }

      return {
        canCreateListing: membership.remainingTotalListings === -1 || membership.remainingTotalListings > 0, // -1 means unlimited
        canUseFreeSlot: membership.remainingFreeListings > 0,
        canTrade: membership.tier.canTrade,
        canCreateCollection: membership.tier.canCreateCollections,
        maxImages: membership.tier.maxImagesPerListing,
        maxFreeListings: maxFreeListings, // Use platform setting override for free tier
        maxTotalListings: maxTotalListings, // Use platform setting override for all tiers
        remainingFreeListings: membership.remainingFreeListings, // Already calculated correctly by getUserUsageStats
        remainingTotalListings: membership.remainingTotalListings, // Already calculated correctly by getUserUsageStats
        remainingFeaturedSlots: membership.remainingFeaturedSlots,
        commissionDiscount: membership.tier.commissionDiscount,
        tierName: membership.tier.name,
        tierType: membership.tier.type,
      };
    } catch (error) {
      this.logger.warn('getUserLimits failed');
      // Re-throw known exceptions
      if (error instanceof BadRequestException || error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      // Wrap unknown errors
      throw new BadRequestException(`Üyelik limitleri alınamadı: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
    }
  }

  // ==========================================================================
  // SUBSCRIBE TO TIER
  // ==========================================================================
  async subscribe(userId: string, dto: SubscribeDto): Promise<UserMembershipResponseDto> {
    const tier = await this.prisma.membershipTier.findUnique({
      where: { type: dto.tierType },
    });

    if (!tier) {
      throw new NotFoundException(`Üyelik tipi bulunamadı: ${dto.tierType}`);
    }

    if (!tier.isActive) {
      throw new BadRequestException('Bu üyelik tipi aktif değil');
    }

    // Business tier can only be subscribed by corporate accounts (users with companyName and taxId)
    if (dto.tierType === MembershipTierType.business) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { companyName: true, taxId: true },
      });

      if (!user || !user.companyName || !user.taxId) {
        throw new ForbiddenException('Business üyelik sadece şirket hesapları için geçerlidir');
      }
    }

    // Check if user already has this tier (past_due = ödeme bekliyor, sayma; sadece aktif plan aynıysa engelle)
    const existingMembership = await this.prisma.userMembership.findUnique({
      where: { userId },
      include: { tier: true },
    });

    if (existingMembership?.tier.type === dto.tierType && existingMembership?.status !== SubscriptionStatus.past_due) {
      throw new BadRequestException('Zaten bu üyelik tipine sahipsiniz');
    }

    // Calculate period
    const now = new Date();
    const periodEnd = new Date(now);
    if (dto.billingPeriod === 'monthly') {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    } else {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    }

    const price = dto.billingPeriod === 'monthly' ? tier.monthlyPrice : tier.yearlyPrice;

    // For free tier, just update
    if (dto.tierType === MembershipTierType.free || price.toNumber() === 0) {
      if (existingMembership) {
        await this.prisma.userMembership.update({
          where: { userId },
          data: {
            tierId: tier.id,
            status: SubscriptionStatus.active,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            cancelledAt: null,
          },
        });
      } else {
        await this.prisma.userMembership.create({
          data: {
            userId,
            tierId: tier.id,
            status: SubscriptionStatus.active,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
          },
        });
      }

      return this.getUserMembership(userId);
    }

    // For paid tiers, create membership in pending state and initiate payment
    let membership;
    if (existingMembership) {
      membership = await this.prisma.userMembership.update({
        where: { userId },
        data: {
          tierId: tier.id,
          status: SubscriptionStatus.past_due, // Will be activated after payment
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          cancelledAt: null,
          autoRenew: true, // Ücretli üyelikte oto-yenileme hatırlatması default açık
        },
      });
    } else {
      membership = await this.prisma.userMembership.create({
        data: {
          userId,
          tierId: tier.id,
          status: SubscriptionStatus.past_due, // Will be activated after payment
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          autoRenew: true, // Ücretli üyelikte oto-yenileme hatırlatması default açık
        },
      });
    }

    try {
      const paymentResult = await this.initiateMembershipPayment(
        userId,
        PaymentProvider.paytr,
        undefined,
      );

      // Return membership info with payment URL
      return {
        ...(await this.getUserMembership(userId)),
        paymentUrl: paymentResult.paymentUrl,
        paymentId: paymentResult.paymentId,
        orderId: (paymentResult as any).orderId,
        provider: paymentResult.provider,
        useBypass: paymentResult.useBypass === true,
      } as any;
    } catch (error) {
      // If payment initiation fails, rollback membership
      await this.prisma.userMembership.delete({
        where: { userId },
      }).catch(() => {
        // Ignore if already deleted or doesn't exist
      });
      throw error;
    }
  }

  // ==========================================================================
  // INITIATE MEMBERSHIP PAYMENT
  // ==========================================================================
  async initiateMembershipPayment(
    userId: string,
    provider: PaymentProvider,
    req?: Request,
  ): Promise<MembershipPaymentInitResponseDto> {
    const membership = await this.prisma.userMembership.findUnique({
      where: { userId },
      include: { tier: true },
    });

    if (!membership) {
      throw new NotFoundException('Üyelik bulunamadı');
    }

    if (membership.tier.type === MembershipTierType.free) {
      throw new BadRequestException('Ücretsiz üyelik için ödeme gerekmez');
    }

    // Determine billing period from membership period (monthly or yearly)
    const periodDays = Math.round(
      (membership.currentPeriodEnd.getTime() - membership.currentPeriodStart.getTime()) / (1000 * 60 * 60 * 24)
    );
    const isYearly = periodDays > 180; // More than 6 months = yearly
    
    const price = isYearly 
      ? membership.tier.yearlyPrice.toNumber() 
      : membership.tier.monthlyPrice.toNumber();

    if (price === 0) {
      throw new BadRequestException('Bu üyelik seviyesi için ödeme gerekmez');
    }

    // Find platform seller for membership orders
    const platformSeller = await this.prisma.user.findFirst({
      where: {
        email: 'platform@tarodan.com',
        sellerType: 'platform',
      },
    });

    if (!platformSeller) {
      throw new NotFoundException('Platform seller bulunamadı');
    }

    // Find or create a virtual product for membership
    // Use a category - we'll need to find a default category
    const defaultCategory = await this.prisma.category.findFirst({
      where: { isActive: true },
    });

    if (!defaultCategory) {
      throw new NotFoundException('Kategori bulunamadı');
    }

    // Create or find virtual product for membership
    const virtualProductId = `membership-${membership.tierId}`;
    let product = await this.prisma.product.findUnique({
      where: { id: virtualProductId },
    });

    if (!product) {
      product = await this.prisma.product.create({
        data: {
          id: virtualProductId,
          sellerId: platformSeller.id,
          categoryId: defaultCategory.id,
          // tier.name zaten "… Üyelik" içerir ("Premium Üyelik Üyelik" olmasın)
          title: membership.tier.name.includes('Üyelik')
            ? membership.tier.name
            : `${membership.tier.name} Üyelik`,
          description: `Üyelik ödemesi için sanal ürün`,
          price: price,
          condition: 'new',
          status: ProductStatus.active,
        },
      });
    }

    // Yetim sipariş birikmesini önle: kullanıcı "Ödemeyi tamamla"ya her bastığında
    // YENİ sipariş oluşturmak yerine, bu tier için hâlâ ödeme bekleyen siparişi
    // yeniden kullan. (Aksi halde her denemede bir pending_payment sipariş kalıyor
    // ve sarı "ödemeyi tamamla" uyarısı asla net şekilde temizlenmiyordu.)
    let order = await this.prisma.order.findFirst({
      where: {
        buyerId: userId,
        productId: product.id,
        status: OrderStatus.pending_payment,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (order) {
      order = await this.prisma.order.update({
        where: { id: order.id },
        data: {
          totalAmount: price,
          paymentExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
    } else {
      const orderNumber = `MEM-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
      order = await this.prisma.order.create({
        data: {
          orderNumber,
          buyerId: userId,
          sellerId: platformSeller.id,
          productId: product.id,
          totalAmount: price,
          commissionAmount: 0, // No commission for membership
          shippingCost: 0,
          status: OrderStatus.pending_payment,
          paymentExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          shippingAddress: {
            type: 'membership',
          } as any,
        },
      });
    }

    // Initiate payment with the created order
    const paymentResult = await this.paymentService.initiatePayment(
      userId,
      {
        orderId: order.id,
        provider,
      },
      req,
    );

    return {
      paymentId: paymentResult.paymentId,
      membershipPaymentId: membership.id,
      orderId: order.id,
      paymentUrl: paymentResult.paymentUrl || '',
      paymentHtml: paymentResult.paymentHtml,
      provider: paymentResult.provider,
      expiresIn: paymentResult.expiresIn || 300,
      useBypass: (paymentResult as { useBypass?: boolean }).useBypass === true,
    };
  }

  // ==========================================================================
  // CANCEL SUBSCRIPTION
  // ==========================================================================
  async cancelSubscription(userId: string): Promise<UserMembershipResponseDto> {
    const membership = await this.prisma.userMembership.findUnique({
      where: { userId },
      include: { tier: true },
    });

    if (!membership) {
      throw new NotFoundException('Üyelik bulunamadı');
    }

    if (membership.tier.type === MembershipTierType.free) {
      throw new BadRequestException('Ücretsiz üyelik iptal edilemez');
    }

    if (membership.status === SubscriptionStatus.cancelled) {
      throw new BadRequestException('Üyelik zaten iptal edilmiş');
    }

    await this.prisma.userMembership.update({
      where: { userId },
      data: {
        status: SubscriptionStatus.cancelled,
        cancelledAt: new Date(),
      },
    });

    return this.getUserMembership(userId);
  }

  // ==========================================================================
  // AUTO-RENEW TOGGLE
  // ==========================================================================
  async toggleAutoRenew(
    userId: string,
    autoRenew: boolean,
  ): Promise<UserMembershipResponseDto> {
    const membership = await this.prisma.userMembership.findUnique({
      where: { userId },
      include: { tier: true },
    });

    if (!membership) {
      throw new NotFoundException('Üyelik bulunamadı');
    }

    // Otomatik yenileme yalnızca HATIRLATMA-tabanlıdır: dönem bitişinde bildirim
    // gönderilir ve kullanıcı normal PayTR ödeme akışından tek tıkla yeniler.
    // Kayıtlı karttan otomatik çekim YOK (saved card özelliği kaldırıldı).
    await this.prisma.userMembership.update({
      where: { userId },
      data: { autoRenew },
    });

    return this.getUserMembership(userId);
  }

  // ==========================================================================
  // ADMIN: CREATE TIER
  // ==========================================================================
  async createTier(dto: CreateMembershipTierDto): Promise<MembershipTierResponseDto> {
    const existingTier = await this.prisma.membershipTier.findUnique({
      where: { type: dto.type },
    });

    if (existingTier) {
      throw new BadRequestException(`Üyelik tipi zaten mevcut: ${dto.type}`);
    }

    const tier = await this.prisma.membershipTier.create({
      data: {
        type: dto.type,
        name: dto.name,
        description: dto.description,
        monthlyPrice: dto.monthlyPrice,
        yearlyPrice: dto.yearlyPrice,
        maxFreeListings: dto.maxFreeListings,
        maxTotalListings: dto.maxTotalListings,
        maxImagesPerListing: dto.maxImagesPerListing,
        canCreateCollections: dto.canCreateCollections,
        canTrade: dto.canTrade,
        isAdFree: dto.isAdFree,
        featuredListingSlots: dto.featuredListingSlots,
        commissionDiscount: dto.commissionDiscount,
        isActive: true,
      },
    });

    return this.mapTierToDto(tier);
  }

  // ==========================================================================
  // ADMIN: UPDATE TIER
  // ==========================================================================
  async updateTier(
    tierType: MembershipTierType,
    dto: UpdateMembershipTierDto,
  ): Promise<MembershipTierResponseDto> {
    const tier = await this.prisma.membershipTier.findUnique({
      where: { type: tierType },
    });

    if (!tier) {
      throw new NotFoundException(`Üyelik tipi bulunamadı: ${tierType}`);
    }

    const updatedTier = await this.prisma.membershipTier.update({
      where: { type: tierType },
      data: dto,
    });

    return this.mapTierToDto(updatedTier);
  }

  // ==========================================================================
  // OTO-YENİLEME (MIT recurring) — kullanıcısız kayıtlı kart çekimi
  // ==========================================================================
  /**
   * Faz 4 — Kullanıcısız oto-yenileme. Saatlik cron'dan çağrılır.
   * PAYTR_RECURRING_ENABLED=false ise hiçbir GERÇEK çekim yapmaz (no-op) — yetki + flag
   * açılmadan kör çekim imkânsız. Süresi dolmuş + autoRenew + ücretli + geçerli kayıtlı
   * kartı (active, require_cvv=false) olan üyelikleri PayTR recurring ile çeker; başarılıysa
   * dönemi uzatır. Dunning: try_again=false (kart ölü) → kart 'revoked', bir daha denenmez
   * (dönem sonunda checkExpiredMemberships free'ye düşürür); try_again=true (geçici) → kart
   * açık kalır, sonraki turda tekrar denenir. Üyelik virtual order'dır → escrow/hold yok.
   */
  async runAutoRenewals(): Promise<{ renewed: number; failed: number; attempted: number }> {
    if (this.configService.get('PAYTR_RECURRING_ENABLED') !== 'true') {
      return { renewed: 0, failed: 0, attempted: 0 };
    }
    const now = new Date();
    const due = await this.prisma.userMembership.findMany({
      where: {
        autoRenew: true,
        status: { in: [SubscriptionStatus.active, SubscriptionStatus.past_due] },
        currentPeriodEnd: { lte: now },
        tier: { type: { not: MembershipTierType.free } },
        user: {
          savedCards: {
            some: { provider: 'paytr', status: SavedCardStatus.active, requireCvv: false },
          },
        },
      },
      include: {
        tier: true,
        user: {
          include: {
            savedCards: {
              where: { provider: 'paytr', status: SavedCardStatus.active, requireCvv: false },
              orderBy: { isDefault: 'desc' },
              take: 1,
            },
          },
        },
      },
      take: 50,
    });

    let renewed = 0;
    let failed = 0;
    for (const m of due) {
      const card = m.user.savedCards[0];
      if (!card) continue;
      try {
        const periodDays = Math.round(
          (m.currentPeriodEnd.getTime() - m.currentPeriodStart.getTime()) / 86_400_000,
        );
        const isYearly = periodDays > 180;
        const price = Number(isYearly ? m.tier.yearlyPrice : m.tier.monthlyPrice);
        if (!(price > 0)) continue;

        const newStart = now;
        const newEnd = new Date(newStart);
        if (isYearly) newEnd.setFullYear(newEnd.getFullYear() + 1);
        else newEnd.setMonth(newEnd.getMonth() + 1);

        const merchantOid = `REN${m.id.replace(/-/g, '').slice(0, 18)}T${Date.now().toString().slice(-6)}`;
        const nameParts = (m.user.displayName || 'Üye').split(' ');
        const buyer = {
          id: m.userId,
          name: nameParts[0] || 'Üye',
          surname: nameParts.slice(1).join(' ') || '-',
          email: m.user.email,
          phone: m.user.phone || '+905000000000',
          ip: card.mandateIp || '0.0.0.0',
          address: 'Türkiye',
          city: 'İstanbul',
          country: 'Türkiye',
        };
        const basket = [
          { id: m.tierId, name: `${m.tier.name} Üyelik (yenileme)`, category: 'Üyelik', price, quantity: 1 },
        ];

        const result = await this.paytr.chargeRecurring({
          utoken: card.utoken,
          ctoken: card.ctoken,
          amount: price,
          merchantOid,
          buyer,
          basketItems: basket,
        });

        if (result.status === 'success') {
          await this.prisma.$transaction(async (tx) => {
            await tx.userMembership.update({
              where: { id: m.id },
              data: {
                status: SubscriptionStatus.active,
                currentPeriodStart: newStart,
                currentPeriodEnd: newEnd,
              },
            });
            await tx.membershipPayment.create({
              data: {
                membershipId: m.id,
                amount: price,
                provider: 'paytr',
                providerPaymentId: merchantOid,
                status: PaymentStatus.completed,
                periodStart: newStart,
                periodEnd: newEnd,
              },
            });
          });
          renewed++;
          this.logger.log(`Oto-yenileme OK: membership=${m.id} oid=${merchantOid} tutar=${price}`);
        } else if (result.status === 'wait_callback') {
          // Sonuç Bildirim URL'ine düşecek; takip için pending kayıt (tam callback tamamlaması Faz 4b).
          await this.prisma.membershipPayment.create({
            data: {
              membershipId: m.id,
              amount: price,
              provider: 'paytr',
              providerPaymentId: merchantOid,
              status: PaymentStatus.pending,
              periodStart: newStart,
              periodEnd: newEnd,
            },
          });
          this.logger.warn(`Oto-yenileme wait_callback: membership=${m.id} oid=${merchantOid}`);
        } else {
          failed++;
          await this.prisma.membershipPayment.create({
            data: {
              membershipId: m.id,
              amount: price,
              provider: 'paytr',
              providerPaymentId: merchantOid,
              status: PaymentStatus.failed,
              periodStart: newStart,
              periodEnd: newEnd,
            },
          });
          if (result.tryAgain === false) {
            await this.prisma.savedCard.update({
              where: { id: card.id },
              data: { status: SavedCardStatus.revoked },
            });
            this.logger.error(
              `Oto-yenileme KALICI başarısız (kart revoke): membership=${m.id} sebep=${result.reason}`,
            );
          } else {
            this.logger.warn(
              `Oto-yenileme geçici başarısız (retry edilecek): membership=${m.id} sebep=${result.reason}`,
            );
          }
        }
      } catch (e: any) {
        failed++;
        this.logger.error(`Oto-yenileme hata membership=${m.id}: ${e?.message}`);
      }
    }
    return { renewed, failed, attempted: due.length };
  }

  // ==========================================================================
  // SAVED CARDS (CAPI) — kullanıcı kart yönetimi (listele / sil)
  // PAN/CVV ASLA dönmez; yalnız maskeli bilgi + PayTR token referansları.
  // ==========================================================================

  /**
   * Kullanıcının kayıtlı (oto-yenilemede kullanılabilir) kartlarını döndürür.
   * Sadece status=active kartlar; revoke/expired gizlenir. require_cvv kartlar
   * listelenir ama autoRenewEligible=false (kullanıcısız çekilemez).
   */
  async listSavedCards(userId: string): Promise<
    Array<{
      id: string;
      last4: string;
      brand: string | null;
      expMonth: string | null;
      expYear: string | null;
      requireCvv: boolean;
      isDefault: boolean;
      autoRenewEligible: boolean;
      createdAt: Date;
    }>
  > {
    const cards = await this.prisma.savedCard.findMany({
      where: { userId, provider: 'paytr', status: SavedCardStatus.active },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    return cards.map((c) => ({
      id: c.id,
      last4: c.last4,
      brand: c.brand,
      expMonth: c.expMonth,
      expYear: c.expYear,
      requireCvv: c.requireCvv,
      isDefault: c.isDefault,
      autoRenewEligible: !c.requireCvv,
      createdAt: c.createdAt,
    }));
  }

  /**
   * Kayıtlı kartı kaldırır: önce PayTR capi/delete, sonra yerelde status=revoked.
   * Kaydı fiziksel silmeyiz — geçmiş MembershipPayment/denetim izi korunsun. PayTR
   * silme onayı alınamasa bile yerelde revoke edilir (kart "kullanılmaz" işaretlenir;
   * bu sayede runAutoRenewals bu kartı bir daha seçmez). Kart sahibi değilse 404.
   */
  async deleteSavedCard(userId: string, cardId: string): Promise<{ deleted: boolean }> {
    const card = await this.prisma.savedCard.findFirst({
      where: { id: cardId, userId },
    });
    if (!card) {
      throw new NotFoundException('Kayıtlı kart bulunamadı');
    }
    if (card.status === SavedCardStatus.revoked) {
      return { deleted: true }; // idempotent
    }
    let providerDeleted = false;
    try {
      const res = await this.paytr.capiDeleteCard(card.utoken, card.ctoken);
      providerDeleted = res.status === 'success';
      if (!providerDeleted) {
        this.logger.warn(
          `PayTR kart silme onayı alınamadı (card=${cardId}): ${res.reason || res.status}; yerelde revoke ediliyor`,
        );
      }
    } catch (e: any) {
      this.logger.error(`PayTR kart silme hatası (card=${cardId}): ${e?.message}`);
    }
    await this.prisma.savedCard.update({
      where: { id: card.id },
      data: { status: SavedCardStatus.revoked, isDefault: false },
    });
    return { deleted: true };
  }

  // ==========================================================================
  // CHECK MEMBERSHIP EXPIRY (Scheduled job)
  // ==========================================================================
  async checkExpiredMemberships(): Promise<number> {
    const now = new Date();

    // Find expired memberships
    const expiredMemberships = await this.prisma.userMembership.findMany({
      where: {
        status: SubscriptionStatus.active,
        currentPeriodEnd: { lt: now },
        tier: { type: { not: MembershipTierType.free } },
      },
    });

    // Downgrade to free tier
    const freeTier = await this.prisma.membershipTier.findUnique({
      where: { type: MembershipTierType.free },
    });

    if (!freeTier) return 0;

    let downgradeCount = 0;

    for (const membership of expiredMemberships) {
      try {
        await this.prisma.userMembership.update({
          where: { id: membership.id },
          data: {
            tierId: freeTier.id,
            // Free'ye düşürülen üye artık AKTİF bir ücretsiz üye. Önceden tier=free
            // + status=expired (tutarsız) set ediliyordu; bu, getCurrentMembership /
            // status okuyan diğer yerlerde kafa karışıklığı yaratıyordu.
            status: SubscriptionStatus.active,
            autoRenew: false,
          },
        });
        downgradeCount++;
      } catch (error) {
        this.logger.warn('Failed to downgrade membership');
      }
    }

    return downgradeCount;
  }

  // ==========================================================================
  // VALIDATE LISTING CREATION
  // ==========================================================================
  async canCreateListing(userId: string): Promise<{ allowed: boolean; reason?: string }> {
    const limits = await this.getUserLimits(userId);

    if (!limits.canCreateListing) {
      return {
        allowed: false,
        reason: 'İlan limitinize ulaştınız. Üyeliğinizi yükseltin.',
      };
    }

    return { allowed: true };
  }

  // ==========================================================================
  // VALIDATE TRADE CREATION
  // ==========================================================================
  async canCreateTrade(userId: string): Promise<{ allowed: boolean; reason?: string }> {
    // Takas kapısı GERÇEK (satın alınan) tier'a bakar. getUserLimits, ödeme bekleyen (past_due)
    // paralı üyeliği "free"ye düşürdüğü için premium üye takası yanlışlıkla engelleniyordu (BUG A).
    // Bu yüzden ham üyeliği okuyup tier.canTrade'i kontrol ediyoruz; past_due (ödeme bekleyen)
    // paralı üye de takas yapabilir. Sadece free / iptal / süresi dolmuş engellenir.
    let membership = await this.prisma.userMembership.findUnique({
      where: { userId },
      include: { tier: true },
    });
    // Kayıt (register) userMembership satırı oluşturmaz; satır yalnızca
    // getUserMembership ilk çağrıldığında lazy oluşturulur. canCreateTrade ham satırı
    // okuduğu için, üyelik sayfasını hiç açmamış yeni free kullanıcı yanlışlıkla
    // engelleniyordu. Satırı (free tier) garanti edip ÖYLE kontrol et — past_due
    // premium hâlâ takas edebilsin diye sonra yine HAM tier/status okunur (BUG A).
    if (!membership) {
      await this.getUserMembership(userId); // free tier satırını lazy oluşturur
      membership = await this.prisma.userMembership.findUnique({
        where: { userId },
        include: { tier: true },
      });
    }
    const eligibleStatus =
      membership?.status === SubscriptionStatus.active ||
      membership?.status === SubscriptionStatus.past_due;

    if (!membership || !membership.tier?.canTrade || !eligibleStatus) {
      return {
        allowed: false,
        reason: 'Takas özelliği üyeliğinizde mevcut değil. Üyeliğinizi yükseltin.',
      };
    }

    return { allowed: true };
  }

  // ==========================================================================
  // VALIDATE COLLECTION CREATION
  // ==========================================================================
  async canCreateCollection(userId: string): Promise<{ allowed: boolean; reason?: string }> {
    const limits = await this.getUserLimits(userId);

    if (!limits.canCreateCollection) {
      return {
        allowed: false,
        reason: 'Koleksiyon özelliği üyeliğinizde mevcut değil. Üyeliğinizi yükseltin.',
      };
    }

    return { allowed: true };
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================
  private async getUserUsageStats(userId: string, tier: any) {
    // Count active listings
    const activeListings = await this.prisma.product.count({
      where: {
        sellerId: userId,
        status: { in: [ProductStatus.active, ProductStatus.pending, ProductStatus.reserved] },
      },
    });

    // Count featured listings (placeholder - would need featured flag on product)
    const featuredListings = 0;

    // Check platform setting for listing limit override based on tier type
    let maxFreeListings = tier.maxFreeListings;
    let maxTotalListings = tier.maxTotalListings;
    
    if (tier.type === MembershipTierType.free) {
      const freeListingLimitSetting = await this.prisma.platformSetting.findUnique({
        where: { settingKey: 'free_listing_limit' },
      });
      if (freeListingLimitSetting?.settingValue) {
        const platformLimit = parseInt(freeListingLimitSetting.settingValue, 10);
        if (!isNaN(platformLimit) && platformLimit > 0) {
          maxFreeListings = platformLimit;
          maxTotalListings = platformLimit; // For free tier, total = free
        }
      }
    } else if (tier.type === MembershipTierType.premium) {
      const premiumListingLimitSetting = await this.prisma.platformSetting.findUnique({
        where: { settingKey: 'premium_listing_limit' },
      });
      if (premiumListingLimitSetting?.settingValue) {
        const platformLimit = parseInt(premiumListingLimitSetting.settingValue, 10);
        if (!isNaN(platformLimit)) {
          if (platformLimit === -1) {
            maxTotalListings = -1; // Unlimited
          } else if (platformLimit > 0) {
            maxTotalListings = platformLimit;
          }
        }
      }
    } else if (tier.type === MembershipTierType.business) {
      const businessListingLimitSetting = await this.prisma.platformSetting.findUnique({
        where: { settingKey: 'business_listing_limit' },
      });
      if (businessListingLimitSetting?.settingValue) {
        const platformLimit = parseInt(businessListingLimitSetting.settingValue, 10);
        if (!isNaN(platformLimit)) {
          if (platformLimit === -1) {
            maxTotalListings = -1; // Unlimited
          } else if (platformLimit > 0) {
            maxTotalListings = platformLimit;
          }
        }
      }
    }

    // Calculate remaining
    const usedFreeListings = Math.min(activeListings, maxFreeListings);
    const usedTotalListings = activeListings;
    const usedFeaturedSlots = featuredListings;

    return {
      usedFreeListings,
      usedTotalListings,
      usedFeaturedSlots,
      remainingFreeListings: Math.max(0, maxFreeListings - usedFreeListings),
      remainingTotalListings: maxTotalListings === -1 
        ? -1 // Unlimited
        : Math.max(0, maxTotalListings - usedTotalListings),
      remainingFeaturedSlots: Math.max(0, tier.featuredListingSlots - usedFeaturedSlots),
    };
  }

  private mapTierToDto(tier: any): MembershipTierResponseDto {
    return {
      id: tier.id,
      type: tier.type,
      name: tier.name,
      description: tier.description || undefined,
      monthlyPrice: parseFloat(tier.monthlyPrice),
      yearlyPrice: parseFloat(tier.yearlyPrice),
      maxFreeListings: tier.maxFreeListings,
      maxTotalListings: tier.maxTotalListings,
      maxImagesPerListing: tier.maxImagesPerListing,
      canCreateCollections: tier.canCreateCollections,
      canTrade: tier.canTrade,
      isAdFree: tier.isAdFree,
      featuredListingSlots: tier.featuredListingSlots,
      commissionDiscount: parseFloat(tier.commissionDiscount),
      isActive: tier.isActive,
    };
  }
}
