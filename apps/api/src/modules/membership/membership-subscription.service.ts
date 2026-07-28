import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import {
  MembershipTierType,
  SubscriptionStatus,
  ProductStatus,
  OrderStatus,
  PaymentStatus,
  SavedCardStatus,
  TradeStatus,
  CommissionTaxpayerType,
  type MembershipTier,
} from "@prisma/client";
import { SubscribeDto, UserMembershipResponseDto } from "./dto";
import { PaymentService } from "../payment/payment.service";
import { PaymentProvider } from "../payment/dto";
import { Request } from "express";
import { MembershipPaymentInitResponseDto } from "./dto/membership-payment.dto";
import { PaymentProviderRegistry } from "../payment-providers/payment-provider.registry";
import { ConfigService } from "@nestjs/config";
import { MembershipCommonService } from "./membership-common.service";
import { isPremiumEntitled } from "./membership.util";
import { resolveTaxpayerType } from "../order/order-commission.helper";
import { i18nMessage } from "../i18n";
import { PaymentProviderEventService } from "../payment/payment-provider-event.service";

/**
 * MembershipSubscriptionService — abonelik yaşam döngüsü + PayTR/ödeme tarafı:
 * subscribe / initiateMembershipPayment / cancelSubscription / toggleAutoRenew /
 * runAutoRenewals (MIT recurring) / checkExpiredMemberships / kayıtlı kartlar.
 * Facade delege eder; dış çağıranlar (controller/scheduler) facade üzerinden erişir.
 */
@Injectable()
export class MembershipSubscriptionService {
  private readonly logger = new Logger(MembershipSubscriptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
    private readonly paymentProviders: PaymentProviderRegistry,
    private readonly configService: ConfigService,
    private readonly common: MembershipCommonService,
    private readonly providerEvents: PaymentProviderEventService,
  ) {}

  // ==========================================================================
  // SUBSCRIBE TO TIER
  // ==========================================================================
  async subscribe(
    userId: string,
    dto: SubscribeDto,
  ): Promise<UserMembershipResponseDto> {
    const tier = await this.prisma.membershipTier.findUnique({
      where: { type: dto.tierType },
    });

    if (!tier) {
      throw new NotFoundException(
        i18nMessage("server.membership.tierNotFound", { type: dto.tierType }),
      );
    }

    if (!tier.isActive) {
      throw new BadRequestException(
        i18nMessage("server.membership.tierNotActive"),
      );
    }

    // Business tier: only APPROVED corporate accounts. companyName + taxId are
    // client-writable via the profile endpoint, so their mere presence is not proof
    // of a corporate seller — the approval gate is businessStatus === "approved"
    // (the SAME corporate test used by pricing/VAT/commission via resolveTaxpayerType).
    // Otherwise a user could self-assign company details and reach Business unreviewed.
    if (dto.tierType === MembershipTierType.business) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { companyName: true, taxId: true, businessStatus: true },
      });

      const isApprovedCorporate =
        !!user &&
        !!user.companyName &&
        resolveTaxpayerType({
          businessStatus: user.businessStatus,
          taxId: user.taxId,
        }) === CommissionTaxpayerType.corporate;

      if (!isApprovedCorporate) {
        throw new ForbiddenException(
          i18nMessage("server.membership.businessTierRequiresCompany"),
        );
      }
    }

    const existingMembership = await this.prisma.userMembership.findUnique({
      where: { userId },
      include: {
        tier: true,
        user: {
          select: {
            businessStatus: true,
            companyName: true,
            taxId: true,
          },
        },
      },
    });

    // Calculate period
    const now = new Date();
    const periodEnd = new Date(now);
    if (dto.billingPeriod === "monthly") {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    } else {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    }

    const price =
      dto.billingPeriod === "monthly" ? tier.monthlyPrice : tier.yearlyPrice;

    // === GEÇİŞ YÖNÜ KARARI (upgrade anında / downgrade ertelemeli) ===
    // Kullanıcı şu an GEÇERLİ ve ücretli bir tier'a sahipse, yön hem tier seviyesine
    // (sortOrder) hem de faturalama periyoduna göre belirlenir:
    //   - Tier ↑                         → UPGRADE (anında + ödeme)
    //   - Tier ↓                         → DOWNGRADE (dönem sonuna ertelenir)
    //   - Aynı tier, aylık→yıllık        → UPGRADE (anında: yıllık ücret şimdi)
    //   - Aynı tier, yıllık→aylık        → DOWNGRADE (dönem sonunda aylığa geçer)
    //   - Aynı tier, aynı periyot        → bekleyen değişiklik varsa İPTAL, yoksa hata
    // Downgrade'de tier HEMEN değişmez; mevcut (yüksek) plan ödenmiş dönem sonuna kadar
    // sürer. Dönem sonunda runAutoRenewals (ücretli hedef) veya checkExpiredMemberships
    // (free hedef / ödenmemiş) planlanan tier+periyoda geçirir. İlan limiti/takas/diğer
    // özellikler canlı hesaplandığı için yalnız gerçek geçiş anında değişir (tutarlı).
    if (
      existingMembership &&
      isPremiumEntitled(existingMembership, existingMembership.user)
    ) {
      const curPeriodDays = Math.round(
        (existingMembership.currentPeriodEnd.getTime() -
          existingMembership.currentPeriodStart.getTime()) /
          86_400_000,
      );
      const currentIsYearly = curPeriodDays > 180;
      const targetIsYearly = dto.billingPeriod === "yearly";

      let direction: "upgrade" | "downgrade" | "same";
      if (tier.sortOrder > existingMembership.tier.sortOrder) {
        direction = "upgrade";
      } else if (tier.sortOrder < existingMembership.tier.sortOrder) {
        direction = "downgrade";
      } else if (targetIsYearly && !currentIsYearly) {
        direction = "upgrade"; // aynı tier, aylık→yıllık
      } else if (!targetIsYearly && currentIsYearly) {
        direction = "downgrade"; // aynı tier, yıllık→aylık
      } else {
        direction = "same"; // aynı tier + aynı periyot
      }

      if (direction === "same") {
        // Bekleyen bir değişiklik (downgrade/period) varsa kullanıcı eski planına
        // dönmek istiyor demektir → planı iptal et (revert). Yoksa gerçekten aynı plan.
        if (
          existingMembership.scheduledTierType ||
          existingMembership.scheduledBillingPeriod
        ) {
          await this.prisma.userMembership.update({
            where: { userId },
            data: { scheduledTierType: null, scheduledBillingPeriod: null },
          });
          return this.common.getUserMembership(userId);
        }
        throw new BadRequestException(
          i18nMessage("server.membership.alreadyOnThisPlan"),
        );
      }

      if (direction === "downgrade") {
        await this.prisma.userMembership.update({
          where: { userId },
          data: {
            scheduledTierType: dto.tierType,
            scheduledBillingPeriod: dto.billingPeriod,
            // Ücretli hedefe dönem sonunda oto-yenileme ile geçilebilsin diye autoRenew
            // açık tutulur. Hedef free ise yenileme denenmez; checkExpiredMemberships
            // dönem sonunda free'ye düşürür.
            autoRenew: dto.tierType !== MembershipTierType.free,
            // Bekleyen iptali geçersiz kıl: üyelik aktif kalır, dönem sonunda
            // free yerine seçilen tier+periyoda geçer.
            status: SubscriptionStatus.active,
            cancelledAt: null,
          },
        });
        return this.common.getUserMembership(userId);
      }
      // direction === 'upgrade' → aşağıdaki anında ödeme akışına düşer.
    }

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
            scheduledTierType: null, // anında geçiş: varsa bekleyen değişiklik iptal
            scheduledBillingPeriod: null,
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

      return this.common.getUserMembership(userId);
    }

    // === ÜCRETLİ TIER ÖDEME AKIŞI ===
    // KRİTİK: Aktif ve ödenmiş (entitled) bir üyeliği ödemeden ÖNCE hedef tier'a
    // çevirMEyiz. Aksi halde (a) ödeme onaylanmadan yüksek tier'ın komisyon/limitleri
    // açılır, (b) kullanıcı ödemeyi terk ederse mevcut ödenmiş hakkı bozulur. Bunun
    // yerine canlı satır olduğu gibi kalır; hedef tier'a ait sipariş açılır ve ödeme
    // onaylanınca fulfillment satırı ÖDENEN tier'a geçirir.
    if (
      existingMembership &&
      isPremiumEntitled(existingMembership, existingMembership.user)
    ) {
      const paymentResult = await this.initiateMembershipPayment(
        userId,
        PaymentProvider.paytr,
        undefined,
        { tier, billingPeriod: dto.billingPeriod },
      );
      return {
        ...(await this.common.getUserMembership(userId)),
        paymentId: paymentResult.paymentId,
        orderId: (paymentResult as any).orderId,
        provider: paymentResult.provider,
        useBypass: paymentResult.useBypass === true,
      } as any;
    }

    // Entitled OLMAYAN durumlar (yeni / free / past_due / expired): kaybedilecek bir
    // hak yok → hedef tier'ı past_due olarak hazırla. Efektif üyelik ve komisyon,
    // ödeme onaylanana kadar bunu free kabul eder (isPremiumEntitled false).
    if (existingMembership) {
      await this.prisma.userMembership.update({
        where: { userId },
        data: {
          tierId: tier.id,
          status: SubscriptionStatus.past_due, // Will be activated after payment
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          cancelledAt: null,
          autoRenew: true, // Ücretli üyelikte oto-yenileme hatırlatması default açık
          scheduledTierType: null, // anında upgrade: varsa bekleyen değişiklik iptal
          scheduledBillingPeriod: null,
        },
      });
    } else {
      await this.prisma.userMembership.create({
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

      // Üyelik bilgisi + ödeme niyeti (intent): istemci /payment/[id] kart formuna gider.
      return {
        ...(await this.common.getUserMembership(userId)),
        paymentId: paymentResult.paymentId,
        orderId: (paymentResult as any).orderId,
        provider: paymentResult.provider,
        useBypass: paymentResult.useBypass === true,
      } as any;
    } catch (error) {
      // Ödeme başlatma hatasında kaydı SİLME; önceki duruma geri al (yoksa yeni
      // oluşturulan past_due satırı kaldır). Ödenmiş üyeliği yok etmek yerine korur.
      if (existingMembership) {
        await this.prisma.userMembership
          .update({
            where: { userId },
            data: {
              tierId: existingMembership.tierId,
              status: existingMembership.status,
              currentPeriodStart: existingMembership.currentPeriodStart,
              currentPeriodEnd: existingMembership.currentPeriodEnd,
              cancelledAt: existingMembership.cancelledAt,
              autoRenew: existingMembership.autoRenew,
              scheduledTierType: existingMembership.scheduledTierType,
              scheduledBillingPeriod: existingMembership.scheduledBillingPeriod,
            },
          })
          .catch(() => {});
      } else {
        await this.prisma.userMembership
          .delete({ where: { userId } })
          .catch(() => {});
      }
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
    // Ödeme HEDEF tier için yapılır. Upgrade akışında (override verilir) canlı üyelik
    // satırına dokunmadan hedef tier'a ait sipariş açılır; override yoksa mevcut satırın
    // tier'ı ve periyodu kullanılır (ör. "Ödemeyi tamamla" ile past_due satırı yenileme).
    override?: { tier: MembershipTier; billingPeriod: string },
  ): Promise<MembershipPaymentInitResponseDto> {
    const membership = await this.prisma.userMembership.findUnique({
      where: { userId },
      include: { tier: true },
    });

    if (!membership) {
      throw new NotFoundException(i18nMessage("server.membership.notFound"));
    }

    const targetTier = override?.tier ?? membership.tier;

    if (targetTier.type === MembershipTierType.free) {
      throw new BadRequestException(
        i18nMessage("server.membership.freeTierNoPaymentNeeded"),
      );
    }

    // Determine billing period from the override, else from the membership period.
    let isYearly: boolean;
    if (override) {
      isYearly = override.billingPeriod === "yearly";
    } else {
      const periodDays = Math.round(
        (membership.currentPeriodEnd.getTime() -
          membership.currentPeriodStart.getTime()) /
          (1000 * 60 * 60 * 24),
      );
      isYearly = periodDays > 180; // More than 6 months = yearly
    }

    const price = isYearly
      ? targetTier.yearlyPrice.toNumber()
      : targetTier.monthlyPrice.toNumber();

    if (price === 0) {
      throw new BadRequestException(
        i18nMessage("server.membership.tierNoPaymentNeeded"),
      );
    }

    // Find platform seller for membership orders
    const platformSeller = await this.prisma.user.findFirst({
      where: {
        email: "platform@tarodan.com",
        sellerType: "platform",
      },
    });

    if (!platformSeller) {
      throw new NotFoundException(
        i18nMessage("server.membership.platformSellerNotFound"),
      );
    }

    // Find or create a virtual product for membership
    // Use a category - we'll need to find a default category
    const defaultCategory = await this.prisma.category.findFirst({
      where: { isActive: true },
    });

    if (!defaultCategory) {
      throw new NotFoundException(
        i18nMessage("server.membership.categoryNotFound"),
      );
    }

    // Create or find virtual product for membership
    const virtualProductId = `membership-${targetTier.id}`;
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
          title: targetTier.name.includes("Üyelik")
            ? targetTier.name
            : `${targetTier.name} Üyelik`,
          description: `Üyelik ödemesi için sanal ürün`,
          price: price,
          condition: "new",
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
      orderBy: { createdAt: "desc" },
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
            type: "membership",
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

    // Ödeme niyeti (intent): kart bilgisi /payments/process-direct ile alınır (iframe yok).
    return {
      paymentId: paymentResult.paymentId,
      membershipPaymentId: membership.id,
      orderId: order.id,
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
      throw new NotFoundException(i18nMessage("server.membership.notFound"));
    }

    if (membership.tier.type === MembershipTierType.free) {
      throw new BadRequestException(
        i18nMessage("server.membership.freeTierCannotCancel"),
      );
    }

    if (membership.status === SubscriptionStatus.cancelled) {
      throw new BadRequestException(
        i18nMessage("server.membership.alreadyCancelled"),
      );
    }

    await this.prisma.userMembership.update({
      where: { userId },
      data: {
        status: SubscriptionStatus.cancelled,
        cancelledAt: new Date(),
        // İptal = dönem sonunda free'ye dön. Bekleyen bir değişiklik planı varsa
        // (downgrade/period) iptal onu geçersiz kılar; dönem sonunda free olur.
        scheduledTierType: null,
        scheduledBillingPeriod: null,
      },
    });

    return this.common.getUserMembership(userId);
  }

  // ==========================================================================
  // CANCEL SCHEDULED CHANGE (bekleyen downgrade / period değişimini geri al)
  // ==========================================================================
  /**
   * Kullanıcının dönem sonuna planladığı değişikliği (downgrade veya period) iptal
   * eder; mevcut plan olduğu gibi sürer ve dönem sonunda aynı tier+periyotla yenilenir.
   * Aktif bir değişiklik planı yoksa hata verir.
   */
  async cancelScheduledChange(
    userId: string,
  ): Promise<UserMembershipResponseDto> {
    const membership = await this.prisma.userMembership.findUnique({
      where: { userId },
    });
    if (!membership) {
      throw new NotFoundException(i18nMessage("server.membership.notFound"));
    }
    if (!membership.scheduledTierType && !membership.scheduledBillingPeriod) {
      throw new BadRequestException(
        i18nMessage("server.membership.noPendingChange"),
      );
    }
    await this.prisma.userMembership.update({
      where: { userId },
      data: { scheduledTierType: null, scheduledBillingPeriod: null },
    });
    return this.common.getUserMembership(userId);
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
      throw new NotFoundException(i18nMessage("server.membership.notFound"));
    }

    // Otomatik yenileme yalnızca HATIRLATMA-tabanlıdır: dönem bitişinde bildirim
    // gönderilir ve kullanıcı normal PayTR ödeme akışından tek tıkla yeniler.
    // Kayıtlı karttan otomatik çekim YOK (saved card özelliği kaldırıldı).
    await this.prisma.userMembership.update({
      where: { userId },
      data: { autoRenew },
    });

    return this.common.getUserMembership(userId);
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
  async runAutoRenewals(): Promise<{
    renewed: number;
    failed: number;
    attempted: number;
  }> {
    if (this.configService.get("PAYTR_RECURRING_ENABLED") !== "true") {
      return { renewed: 0, failed: 0, attempted: 0 };
    }
    const now = new Date();
    const due = await this.prisma.userMembership.findMany({
      where: {
        autoRenew: true,
        status: {
          in: [SubscriptionStatus.active, SubscriptionStatus.past_due],
        },
        currentPeriodEnd: { lte: now },
        tier: { type: { not: MembershipTierType.free } },
        user: {
          savedCards: {
            some: {
              provider: "paytr",
              status: SavedCardStatus.active,
              requireCvv: false,
            },
          },
        },
      },
      include: {
        tier: true,
        user: {
          include: {
            savedCards: {
              where: {
                provider: "paytr",
                status: SavedCardStatus.active,
                requireCvv: false,
              },
              orderBy: { isDefault: "desc" },
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
        // === ERTELEMELİ DEĞİŞİKLİK UYGULAMA (downgrade / period değişimi) ===
        // Dönem sonuna gelen üyelikte bekleyen bir değişiklik planı varsa, YENİ dönem
        // planlanan tier+periyoda göre kurulur ve ücreti ona göre çekilir.
        // - Hedef free ise: yenileme yapmayız; checkExpiredMemberships free'ye düşürür.
        // - Hedef ücretli ise: effectiveTier + effectiveIsYearly'i plana göre belirleriz;
        //   plan başarıda temizlenir (scheduledTierType + scheduledBillingPeriod = null).
        let effectiveTier = m.tier;
        if (m.scheduledTierType) {
          if (m.scheduledTierType === MembershipTierType.free) {
            continue;
          }
          const sched = await this.prisma.membershipTier.findUnique({
            where: { type: m.scheduledTierType },
          });
          if (sched) effectiveTier = sched;
        }

        const curPeriodDays = Math.round(
          (m.currentPeriodEnd.getTime() - m.currentPeriodStart.getTime()) /
            86_400_000,
        );
        // Bekleyen period değişimi varsa onu uygula; yoksa mevcut periyodu sürdür.
        const isYearly = m.scheduledBillingPeriod
          ? m.scheduledBillingPeriod === "yearly"
          : curPeriodDays > 180;

        // Plan (tier veya period) gerçekten değişiyor mu? Başarıda planı temizlemek için.
        const hasScheduledChange = !!(
          m.scheduledTierType || m.scheduledBillingPeriod
        );
        const tierChanging = effectiveTier.id !== m.tierId;

        const price = Number(
          isYearly ? effectiveTier.yearlyPrice : effectiveTier.monthlyPrice,
        );
        if (!(price > 0)) continue;

        const newStart = now;
        const newEnd = new Date(newStart);
        if (isYearly) newEnd.setFullYear(newEnd.getFullYear() + 1);
        else newEnd.setMonth(newEnd.getMonth() + 1);

        const merchantOid = `REN${m.id.replace(/-/g, "").slice(0, 18)}T${Date.now().toString().slice(-6)}`;
        const nameParts = (m.user.displayName || "Üye").split(" ");
        const buyer = {
          id: m.userId,
          name: nameParts[0] || "Üye",
          surname: nameParts.slice(1).join(" ") || "-",
          email: m.user.email,
          phone: m.user.phone || "+905000000000",
          ip: card.mandateIp || "0.0.0.0",
          address: "Türkiye",
          city: "İstanbul",
          country: "Türkiye",
        };
        const basket = [
          {
            id: effectiveTier.id,
            name: `${effectiveTier.name} Üyelik (yenileme)`,
            category: "Üyelik",
            price,
            quantity: 1,
          },
        ];

        const result = await this.paymentProviders.resolve().chargeRecurring({
          utoken: card.utoken,
          ctoken: card.ctoken,
          amount: price,
          merchantOid,
          buyer,
          basketItems: basket,
        });

        // Oto-yenileme ödeme yöntemi her zaman kayıtlı kart (recurring). Gözlemlenebilirlik:
        // merchant_oid + payment_type + ham PayTR yanıtı MembershipPayment'a yazılır.
        const renewMeta = {
          recurring: true,
          savedCardId: card.id,
          ctokenLast4: card.last4,
          providerResponse: result.raw ?? null,
        } as const;
        if (result.status === "success") {
          const mpId = await this.prisma.$transaction(async (tx) => {
            await tx.userMembership.update({
              where: { id: m.id },
              data: {
                status: SubscriptionStatus.active,
                currentPeriodStart: newStart,
                currentPeriodEnd: newEnd,
                // Bekleyen değişiklik (tier ve/veya period) uygulandı: tier'ı geçir
                // (değiştiyse) ve planı temizle. Değişiklik yoksa olduğu gibi kalır.
                ...(tierChanging ? { tierId: effectiveTier.id } : {}),
                ...(hasScheduledChange
                  ? { scheduledTierType: null, scheduledBillingPeriod: null }
                  : {}),
              },
            });
            const mp = await tx.membershipPayment.create({
              data: {
                membershipId: m.id,
                amount: price,
                provider: "paytr",
                providerPaymentId: merchantOid,
                merchantOid,
                paymentType: "card",
                metadata: renewMeta as object,
                status: PaymentStatus.completed,
                periodStart: newStart,
                periodEnd: newEnd,
              },
            });
            return mp.id;
          });
          renewed++;
          await this.providerEvents.record({
            eventType: "recurring_charge",
            merchantOid,
            membershipPaymentId: mpId,
            status: "success",
            paymentType: "card",
            amount: price,
            totalAmount: price,
            raw: result.raw ?? null,
          });
          this.logger.log(
            `Oto-yenileme OK: membership=${m.id} oid=${merchantOid} tutar=${price}`,
          );
        } else if (result.status === "wait_callback") {
          // Sonuç Bildirim URL'ine düşecek; takip için pending kayıt (tam callback tamamlaması Faz 4b).
          const mp = await this.prisma.membershipPayment.create({
            data: {
              membershipId: m.id,
              amount: price,
              provider: "paytr",
              providerPaymentId: merchantOid,
              merchantOid,
              paymentType: "card",
              metadata: renewMeta as object,
              status: PaymentStatus.pending,
              periodStart: newStart,
              periodEnd: newEnd,
            },
          });
          await this.providerEvents.record({
            eventType: "recurring_charge",
            merchantOid,
            membershipPaymentId: mp.id,
            status: "wait_callback",
            paymentType: "card",
            amount: price,
            totalAmount: price,
            raw: result.raw ?? null,
          });
          this.logger.warn(
            `Oto-yenileme wait_callback: membership=${m.id} oid=${merchantOid}`,
          );
        } else {
          failed++;
          const mp = await this.prisma.membershipPayment.create({
            data: {
              membershipId: m.id,
              amount: price,
              provider: "paytr",
              providerPaymentId: merchantOid,
              merchantOid,
              paymentType: "card",
              metadata: {
                ...renewMeta,
                failureReason: result.reason,
              } as object,
              status: PaymentStatus.failed,
              periodStart: newStart,
              periodEnd: newEnd,
            },
          });
          await this.providerEvents.record({
            eventType: "recurring_charge",
            merchantOid,
            membershipPaymentId: mp.id,
            status: "failed",
            paymentType: "card",
            amount: price,
            totalAmount: price,
            failedReasonMsg: result.reason ?? null,
            raw: result.raw ?? null,
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
        this.logger.error(
          `Oto-yenileme hata membership=${m.id}: ${e?.message}`,
        );
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
      bank: string | null;
      cardType: string | null;
      cardScheme: string | null;
      businessCard: boolean | null;
      expMonth: string | null;
      expYear: string | null;
      requireCvv: boolean;
      isDefault: boolean;
      autoRenewEligible: boolean;
      createdAt: Date;
    }>
  > {
    const cards = await this.prisma.savedCard.findMany({
      where: { userId, provider: "paytr", status: SavedCardStatus.active },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
    return cards.map((c) => ({
      id: c.id,
      last4: c.last4,
      brand: c.brand,
      // PayTR CAPI meta (gözlemlenebilirlik/UX): banka + şema + credit/debit + kurumsal.
      bank: c.bank,
      cardType: c.cardType,
      cardScheme: c.cardScheme,
      businessCard: c.businessCard,
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
  async deleteSavedCard(
    userId: string,
    cardId: string,
  ): Promise<{ deleted: boolean }> {
    const card = await this.prisma.savedCard.findFirst({
      where: { id: cardId, userId },
    });
    if (!card) {
      throw new NotFoundException(
        i18nMessage("server.membership.savedCardNotFound"),
      );
    }
    if (card.status === SavedCardStatus.revoked) {
      return { deleted: true }; // idempotent
    }
    let providerDeleted = false;
    try {
      const res = await this.paymentProviders
        .resolve()
        .capiDeleteCard(card.utoken, card.ctoken);
      providerDeleted = res.status === "success";
      if (!providerDeleted) {
        this.logger.warn(
          `PayTR kart silme onayı alınamadı (card=${cardId}): ${res.reason || res.status}; yerelde revoke ediliyor`,
        );
      }
    } catch (e: any) {
      this.logger.error(
        `PayTR kart silme hatası (card=${cardId}): ${e?.message}`,
      );
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

    // Süresi dolan paralı üyelikleri bul. İptal edilenler (cancelled) de dahil:
    // iptal "dönem sonuna kadar aktif kal, sonra free'ye düş" demek — cron yalnız
    // active'leri düşürürse cancelled üyelik premium'da takılı kalıyordu (bug).
    const expiredMemberships = await this.prisma.userMembership.findMany({
      where: {
        status: {
          in: [SubscriptionStatus.active, SubscriptionStatus.cancelled],
        },
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
            cancelledAt: null,
            // Buraya ulaşan üyelik free'ye düşüyor: ücretli hedefe ertelemeli
            // downgrade ödenmediği/yenilenemediği için free'ye iniyor demektir.
            // (Ücretli hedef ödenseydi runAutoRenewals dönemi ileri taşırdı ve bu
            // kayıt expired listesine düşmezdi.) Bekleyen planı temizle.
            scheduledTierType: null,
            scheduledBillingPeriod: null,
          },
        });
        downgradeCount++;

        // Üyelik sona erince, bu kullanıcının AÇTIĞI bekleyen (pending) takas
        // teklifleri otomatik iptal edilir: artık takas hakkı olmadığı için karşı
        // taraf kabul etse bile akış (kargo) ilerleyemezdi. Pending takasta
        // rezervasyon/ödeme/kargo yan etkisi yoktur; bu yüzden sadece durum
        // güncellemesi yeterli ve güvenlidir (stok geri dönüşü/iade gerekmez).
        // NOT: Bu kullanıcıya GELEN pending teklifler iptal EDİLMEZ; onları
        // kabul edemez (acceptTrade kapısı engeller) ve doğal sürede/karşı tarafça
        // kapanır. Yalnızca üyelik dönemi İÇİNDE accepted olmuş takaslar etkilenmez.
        //
        // KRİTİK: İptal SADECE hedef tier'da takas hakkı yoksa yapılır. Hedef
        // tier takas yapabiliyorsa (örn. premium→temel; temelde de takas var)
        // pending teklifler korunur — kullanıcı hâlâ takas edebildiği için.
        if (!freeTier.canTrade)
          try {
            const cancelledPending = await this.prisma.trade.updateMany({
              where: {
                initiatorId: membership.userId,
                status: TradeStatus.pending,
              },
              data: {
                status: TradeStatus.cancelled,
                cancelReason:
                  "Üyelik süresi sona erdiği için bekleyen takas teklifiniz otomatik iptal edildi.",
                cancelledAt: now,
                version: { increment: 1 },
              },
            });
            if (cancelledPending.count > 0) {
              this.logger.log(
                `Auto-cancelled ${cancelledPending.count} pending trade offer(s) for downgraded user`,
              );
            }
          } catch (tradeErr: any) {
            // Takas iptali downgrade'i bloklamasın; üyelik düşürme başarılı sayılır.
            this.logger.warn(
              `Failed to auto-cancel pending trades after downgrade: ${tradeErr?.message}`,
            );
          }
      } catch (error) {
        this.logger.warn("Failed to downgrade membership");
      }
    }

    return downgradeCount;
  }
}
