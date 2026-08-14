import { Injectable, NotFoundException, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import {
  MembershipTierType,
  SubscriptionStatus,
  ProductStatus,
  OrderStatus,
  PaymentStatus,
} from "@prisma/client";
import { MembershipTierResponseDto, UserMembershipResponseDto } from "./dto";
import { PaymentService } from "../payment/payment.service";
import { PaymentProvider } from "../payment/dto";
import { i18nMessage } from "../i18n";
import { catalogProductWhere } from "../product/helpers/catalog-product-where";
import { isPremiumEntitled } from "./helpers/membership.util";

/**
 * MembershipCommonService — üyelik alt-servislerinin paylaştığı çekirdek okuma/
 * eşleme yardımcıları. getUserMembership (self-heal dahil) hem sorgu (facade) hem
 * abonelik (MembershipSubscriptionService) tarafından kullanıldığı için burada.
 * DI leaf: yalnız prisma + paymentService enjekte eder (döngü yok).
 */
@Injectable()
export class MembershipCommonService {
  private readonly logger = new Logger(MembershipCommonService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
  ) {}

  // ==========================================================================
  // GET USER'S MEMBERSHIP
  // ==========================================================================
  async getUserMembership(userId: string): Promise<UserMembershipResponseDto> {
    const entitlementOwner = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        businessStatus: true,
        companyName: true,
        taxId: true,
      },
    });
    if (!entitlementOwner) {
      throw new NotFoundException(i18nMessage("server.user.notFound"));
    }

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
        throw new NotFoundException(
          i18nMessage("server.membership.freeTierNotFound"),
        );
      }

      const now = new Date();
      const oneYearLater = new Date(
        now.getFullYear() + 100,
        now.getMonth(),
        now.getDate(),
      ); // Free tier never expires

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

    // Ham abonelik kaydı ödeme/mutabakat için korunur; tüm özellik kapıları
    // aşağıda hesaplanan efektif tier'ı kullanır.
    let pendingTierName: string | undefined;
    let pendingTierType: MembershipTierType | undefined;
    let pendingPayment = false;
    if (membership.status === SubscriptionStatus.past_due) {
      // SELF-HEAL: past_due görünüyor ama ödeme aslında PayTR'de başarılı olmuş
      // olabilir (callback ngrok'a düşemediğinde sipariş pending kalır). Kullanıcı
      // sayfayı açtığı an, bu döneme ait BEKLEYEN PayTR ödemesini durum-sorgu ile
      // doğrula ve tamamla → reconciliation cron'unu beklemeden anında aktive olur.
      const virtualProductId = `membership-${membership.tierId}`;
      // 1dk tolerans: sipariş, abonelikten (currentPeriodStart) hemen sonra oluşur.
      const healFloor = new Date(
        membership.currentPeriodStart.getTime() - 60 * 1000,
      );

      // (a) Bu döneme ait BEKLEYEN ödemeyi PayTR'ye sor; ödendiyse tamamla.
      const pendingPaymentRow = await this.prisma.payment.findFirst({
        where: {
          status: PaymentStatus.pending,
          provider: PaymentProvider.paytr,
          providerConversationId: { not: null },
          order: {
            buyerId: userId,
            productId: virtualProductId,
            createdAt: { gte: healFloor },
          },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (pendingPaymentRow) {
        try {
          await this.paymentService.verifyPaymentFromClient(
            pendingPaymentRow.id,
            { internal: true },
          );
        } catch (err) {
          this.logger.warn(
            `Membership self-heal verify failed for payment ${pendingPaymentRow.id}: ${(err as Error)?.message}`,
          );
        }
      }

      // (b) Tamamlanmış sipariş var mı (verify ya da cron'un işlediği) → aktive et.
      const paidOrder = await this.prisma.order.findFirst({
        where: {
          buyerId: userId,
          productId: virtualProductId,
          status: {
            in: [
              OrderStatus.completed,
              OrderStatus.delivered,
              OrderStatus.paid,
              OrderStatus.preparing,
            ],
          },
          createdAt: { gte: healFloor },
        },
        orderBy: { createdAt: "desc" },
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
        this.logger.log(
          `Self-healed membership ${membership.id} past_due → active (paid order ${paidOrder.orderNumber})`,
        );
      } else {
        pendingTierName = membership.tier.name;
        pendingTierType = membership.tier.type;
        pendingPayment = true;
      }
    }

    let effectiveTier = { ...membership.tier };
    if (
      membership.tier.type !== MembershipTierType.free &&
      !isPremiumEntitled(membership, entitlementOwner)
    ) {
      const freeTier = await this.prisma.membershipTier.findUnique({
        where: { type: MembershipTierType.free },
      });
      if (!freeTier) {
        throw new NotFoundException(
          i18nMessage("server.membership.freeTierNotFound"),
        );
      }
      effectiveTier = { ...freeTier };
    }

    const pendingIntent = await this.prisma.membershipPayment.findFirst({
      where: {
        membershipId: membership.id,
        status: PaymentStatus.pending,
        order: {
          status: OrderStatus.pending_payment,
          paymentExpiresAt: { gt: new Date() },
        },
      },
      include: { targetTier: true },
      orderBy: { createdAt: "desc" },
    });
    if (pendingIntent?.targetTier) {
      pendingTierName = pendingIntent.targetTier.name;
      pendingTierType = pendingIntent.targetTier.type;
      pendingPayment = true;
    }

    const tierDto = this.mapTierToDto(effectiveTier);

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
      // Ertelemeli downgrade: dönem sonunda geçilecek tier (null = yok). UI
      // "Üyeliğiniz {currentPeriodEnd} tarihinde {scheduledTierType} olacak" gösterebilir.
      ...(membership.scheduledTierType
        ? { scheduledTierType: membership.scheduledTierType }
        : {}),
      ...(membership.scheduledBillingPeriod
        ? { scheduledBillingPeriod: membership.scheduledBillingPeriod }
        : {}),
      ...(pendingPayment && pendingTierName
        ? { pendingTierName, pendingTierType, pendingPayment: true }
        : {}),
      ...stats,
    };
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================
  private async getUserUsageStats(userId: string, tier: any) {
    // Count active listings
    const activeListings = await this.prisma.product.count({
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
    });

    // Limitler DOĞRUDAN katman satırından gelir — tek kaynak MembershipTier.
    // Buradaki eski platform-ayarı override zinciri kaldırıldı (basic dalı da
    // yoktu, yani ayar ile davranış zaten çelişiyordu).
    const maxFreeListings = tier.maxFreeListings;
    const maxTotalListings = tier.maxTotalListings;

    // Calculate remaining
    const usedFreeListings = Math.min(activeListings, maxFreeListings);
    const usedTotalListings = activeListings;

    return {
      usedFreeListings,
      usedTotalListings,
      remainingFreeListings: Math.max(0, maxFreeListings - usedFreeListings),
      remainingTotalListings:
        maxTotalListings === -1
          ? -1 // Unlimited
          : Math.max(0, maxTotalListings - usedTotalListings),
      // featured-slot alanları kaldırıldı: özellik hiç uygulanmadı (sayaç hep
      // 0'dı) ve öne çıkarmayı ücretli paketler devraldı.
    };
  }

  mapTierToDto(tier: any): MembershipTierResponseDto {
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
      // isAdFree + featuredListingSlots DEVRE DIŞI: banner herkese gösterilir,
      // öne çıkarmayı ücretli paketler devraldı — vaat edilmez, dönülmez.
      isActive: tier.isActive,
    };
  }
}
