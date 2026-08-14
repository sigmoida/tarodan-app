import { Injectable, Logger } from "@nestjs/common";
import {
  Prisma,
  SubscriptionStatus,
  ProductStatus,
  OrderStatus,
  PaymentStatus,
} from "@prisma/client";
import { Optional } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { QUEUE_NAMES } from "../../../workers/constants";
import { enqueueSellerListingReindex } from "../../membership/seller-listing-reindex";
import { PrismaService } from "../../../prisma";
import {
  computeRelevanceScore,
  RELEVANCE_PREMIUM_BONUS,
} from "../../product/helpers/relevance-score";
import { ElogoInvoicingService } from "../../elogo";
import {
  hasUsableRecurringCard,
  isPremiumEntitled,
} from "../../membership/membership.util";
import { OutboxService } from "../../outbox/outbox.service";
import { OUTBOX_REVENUE_INVOICE_ISSUE } from "../../outbox/outbox.types";

/**
 * VirtualOrderFulfillmentService (Faz 8.2) — SANAL sipariş (üyelik / boost) fulfillment'ı.
 * Fiziksel ürün akışından (escrow hold + stok) tamamen farklıdır: escrow/stok YOK; bunun
 * yerine üyelik/boost aktive edilir ve sipariş terminal `completed` olur (kargo/teslimat yok).
 * Yalnız tekil ödeme yolunda görülür (sepet/takas sanal ürün içermez).
 *
 * In-tx metotlar caller'ın `tx`'ini alır (ödeme tamamlama ile atomik). eLogo faturaları
 * POST-COMMIT fire-and-forget'tır (idempotent + retry cron'lu) — ödemeyi bloklamaz.
 */
@Injectable()
export class VirtualOrderFulfillmentService {
  private readonly logger = new Logger(VirtualOrderFulfillmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly elogoInvoicing: ElogoInvoicingService,
    private readonly outbox?: OutboxService,
    // Aktivasyon takas yetkisini değiştirir; arama dokümanı (sellerCanTrade)
    // ancak reindex'le tazelenir. @Optional — spec harness'ları konumsal kurar.
    @Optional()
    @InjectQueue(QUEUE_NAMES.SEARCH)
    private readonly searchQueue?: Queue,
  ) {}

  /**
   * POST-COMMIT: satıcının tüm ilanlarını yeniden indeksle; üyelik hem satış
   * hem takas yetkisini etkiler.
   * Fire-and-forget — issueMembershipInvoice ile aynı kalıp; reindex hatası
   * ödeme akışını bozmaz.
   */
  reindexSellerListings(sellerId: string): void {
    void enqueueSellerListingReindex(
      this.prisma,
      this.searchQueue,
      sellerId,
    ).catch(() => undefined);
  }

  /**
   * Üyelik siparişi aktivasyonu (in-tx): üyeliği active yap, premium ise satıcının
   * boost'suz aktif ilanlarını premium kademesine (rankTier=1) yükselt, membershipPayment'ı
   * completed'e al, siparişi terminal completed yap, yetim pending kardeş siparişleri iptal et.
   */
  async applyMembershipInTx(
    tx: Prisma.TransactionClient,
    payment: any,
    transactionId?: string,
  ): Promise<void> {
    const membership = await tx.userMembership.findUnique({
      where: { userId: payment.order.buyerId },
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
    if (!membership) {
      throw new Error(
        `Membership record not found for paid order ${payment.orderId}`,
      );
    }

    if (membership) {
      const intent = payment.orderId
        ? await tx.membershipPayment.findUnique({
            where: { orderId: payment.orderId },
            include: { targetTier: true },
          })
        : null;

      // The paid order encodes the tier it was bought for (`membership-<tierId>`).
      // Activation MUST honor the PAID tier — never whatever the live row happens to
      // point to now. Otherwise paying an older, cheaper pending order could activate
      // a pricier tier the membership was switched to by a later subscribe call.
      const paidTierId =
        typeof payment.order.productId === "string" &&
        payment.order.productId.startsWith("membership-")
          ? payment.order.productId.slice("membership-".length)
          : null;

      const paidTier = intent?.targetTier
        ? intent.targetTier
        : paidTierId === membership.tierId
          ? membership.tier
          : paidTierId
            ? await tx.membershipTier.findUnique({ where: { id: paidTierId } })
            : null;

      if (intent) {
        if (
          !paidTier ||
          intent.status !== PaymentStatus.pending ||
          intent.orderId !== payment.orderId ||
          paidTierId !== intent.targetTierId ||
          Number(intent.amount) !== Number(payment.amount) ||
          Number(intent.amount) !== Number(payment.order.totalAmount) ||
          (intent.billingPeriod !== "monthly" &&
            intent.billingPeriod !== "yearly")
        ) {
          throw new Error(
            `Membership payment intent mismatch for order ${payment.orderId}`,
          );
        }
      }

      let effectiveTier = membership.tier;
      let entitlementPeriodEnd = membership.currentPeriodEnd;
      let tierPatch: Prisma.UserMembershipUpdateInput = {};
      if (paidTier && intent) {
        const start = new Date();
        const end = new Date(start);
        if (intent.billingPeriod === "yearly")
          end.setFullYear(end.getFullYear() + 1);
        else end.setMonth(end.getMonth() + 1);
        effectiveTier = paidTier;
        entitlementPeriodEnd = end;
        tierPatch = {
          tier: { connect: { id: paidTier.id } },
          currentPeriodStart: start,
          currentPeriodEnd: end,
          scheduledTierType: null,
          scheduledBillingPeriod: null,
        };
      } else if (paidTier) {
        // Backward compatibility for pre-intent membership orders.
        const start = new Date();
        const end = new Date(start);
        const isYearly =
          Number(payment.order.totalAmount) >= Number(paidTier.yearlyPrice);
        if (isYearly) end.setFullYear(end.getFullYear() + 1);
        else end.setMonth(end.getMonth() + 1);
        effectiveTier = paidTier;
        entitlementPeriodEnd = end;
        tierPatch = {
          tier: { connect: { id: paidTier.id } },
          currentPeriodStart: start,
          currentPeriodEnd: end,
          scheduledTierType: null,
          scheduledBillingPeriod: null,
        };
      }

      // D1: autoRenew yalnız kullanıcısız çekilebilir kayıtlı kart varsa açılır.
      // Kartsız üyeye "yenilenecek" vaadi vermek dönem sonunda sessiz düşüş
      // demekti; kartsızlar hatırlatma e-postası + yeniden satın alma akışına düşer.
      const autoRenew = await hasUsableRecurringCard(tx, payment.order.buyerId);
      await tx.userMembership.update({
        where: { userId: payment.order.buyerId },
        data: {
          status: SubscriptionStatus.active,
          cancelledAt: null,
          autoRenew,
          ...tierPatch,
        },
      });
      this.reindexSellerListings(payment.order.buyerId);

      if (intent) {
        const completedIntent = await tx.membershipPayment.updateMany({
          where: { id: intent.id, status: PaymentStatus.pending },
          data: {
            status: PaymentStatus.completed,
            providerPaymentId:
              transactionId || payment.providerPaymentId || payment.id,
            periodStart:
              (tierPatch.currentPeriodStart as Date | undefined) ??
              intent.periodStart,
            periodEnd:
              (tierPatch.currentPeriodEnd as Date | undefined) ??
              intent.periodEnd,
            metadata: {
              ...((intent.metadata as Record<string, unknown> | null) ?? {}),
              completedBy: "payment_callback",
              completedAt: new Date().toISOString(),
            },
          },
        });
        if (completedIntent.count !== 1) {
          throw new Error(
            `Membership payment intent ${intent.id} was already claimed`,
          );
        }
      }

      // Premium (free olmayan) üyelik aktifleşti: satıcının boost'suz aktif ilanlarını
      // premium kademesine (rankTier=1) yükselt. Boost'lu (2) ürünlere dokunma.
      const grantsPremium = isPremiumEntitled(
        {
          status: SubscriptionStatus.active,
          currentPeriodEnd: entitlementPeriodEnd,
          tier: effectiveTier,
        },
        membership.user,
      );
      if (grantsPremium) {
        await tx.product.updateMany({
          where: {
            sellerId: payment.order.buyerId,
            status: ProductStatus.active,
            rankTier: 0,
          },
          data: {
            rankTier: 1,
            relevanceScore: { increment: RELEVANCE_PREMIUM_BONUS },
          },
        });
      }

      this.logger.log(
        `Membership activated for user ${payment.order.buyerId} after payment ${payment.id}`,
      );
    }

    // Üyelik sanal hizmettir → terminal "completed" (paylaşılan kod preparing yapmıştı).
    await tx.order.update({
      where: { id: payment.orderId },
      data: { status: OrderStatus.completed, preparingDeadline: null },
    });

    // Yetim sipariş temizliği: aynı sanal üründen kalan pending_payment kardeşleri iptal et.
    const siblingPendings = await tx.order.findMany({
      where: {
        buyerId: payment.order.buyerId,
        productId: payment.order.productId,
        status: OrderStatus.pending_payment,
        id: { not: payment.orderId },
      },
      select: { id: true },
    });
    if (siblingPendings.length > 0) {
      const ids = siblingPendings.map((o) => o.id);
      await tx.order.updateMany({
        where: { id: { in: ids } },
        data: { status: OrderStatus.cancelled },
      });
      await tx.payment.updateMany({
        where: { orderId: { in: ids }, status: PaymentStatus.pending },
        data: {
          status: PaymentStatus.failed,
          failureReason: "Üyelik başka ödeme ile tamamlandı",
        },
      });
      await tx.membershipPayment.updateMany({
        where: { orderId: { in: ids }, status: PaymentStatus.pending },
        data: {
          status: PaymentStatus.failed,
          idempotencyKey: null,
          metadata: {
            cancelledReason: "superseded_membership_payment",
            cancelledAt: new Date().toISOString(),
          },
        },
      });
      this.logger.log(
        `Cancelled ${ids.length} sibling pending membership orders for user ${payment.order.buyerId}`,
      );
    }
  }

  /**
   * Boost siparişi aktivasyonu (in-tx): ProductBoost'u aktive et (stacking — kalan süre
   * üstüne ekle), ürünü sponsorlu kademeye (rankTier=2) al, siparişi terminal completed yap.
   * @returns cache invalidate için productId (boost yoksa null).
   */
  async applyBoostInTx(
    tx: Prisma.TransactionClient,
    payment: any,
  ): Promise<string | null> {
    const boost = await tx.productBoost.findUnique({
      where: { orderId: payment.orderId },
    });
    if (!boost) {
      this.logger.warn(
        `Boost order ${payment.orderId} paid but no matching ProductBoost found`,
      );
      return null;
    }

    const nowTs = new Date();
    // Stacking: aktif boost varsa yeni süre kalanın ÜSTÜNE eklenir.
    const boostedProduct = await tx.product.findUnique({
      where: { id: boost.productId },
      select: {
        boostedUntil: true,
        homeShowcaseUntil: true,
        qualityScore: true,
        popularityScore: true,
        viewCount: true,
        likeCount: true,
        clickCount: true,
      },
    });
    const base =
      boostedProduct?.boostedUntil && boostedProduct.boostedUntil > nowTs
        ? boostedProduct.boostedUntil
        : nowTs;
    const endsAt = new Date(
      base.getTime() + boost.durationDays * 24 * 60 * 60 * 1000,
    );
    // Vitrin penceresi AYRI izlenir: Vitrin paketi yalnız KENDİ süresi kadar
    // vitrin verir (varsa kalan vitrin süresinin üstüne eklenir). Eskiden
    // homeShowcaseUntil = endsAt yazılıyordu — 30 gün kalan ekonomik boost'un
    // üstüne 3 günlük Vitrin alan ilan 33 gün vitrinde kalıyordu (hediye süre).
    const showcaseBase =
      boostedProduct?.homeShowcaseUntil &&
      boostedProduct.homeShowcaseUntil > nowTs
        ? boostedProduct.homeShowcaseUntil
        : nowTs;
    const showcaseEndsAt = new Date(
      showcaseBase.getTime() + boost.durationDays * 24 * 60 * 60 * 1000,
    );
    await tx.productBoost.update({
      where: { id: boost.id },
      data: {
        status: "active",
        startsAt: nowTs,
        endsAt,
        purchasedAt: nowTs,
        baselineViewCount: boostedProduct?.viewCount ?? 0,
        baselineLikeCount: boostedProduct?.likeCount ?? 0,
        baselineClickCount: boostedProduct?.clickCount ?? 0,
      },
    });
    await tx.product.update({
      where: { id: boost.productId },
      data: {
        boostedUntil: endsAt,
        // LIFO ordering key (most-recently purchased first) for search + home.
        boostedAt: nowTs,
        // A Vitrin (showcaseOnHome) package also lights up the home showcase —
        // yalnız kendi süresi kadar (karışık stack'te hediye süre yok).
        ...(boost.showcaseOnHome ? { homeShowcaseUntil: showcaseEndsAt } : {}),
        rankTier: 2,
        relevanceScore: computeRelevanceScore({
          rankTier: 2,
          qualityScore: boostedProduct?.qualityScore ?? 0,
          popularityScore: boostedProduct?.popularityScore,
        }),
      },
    });
    await tx.order.update({
      where: { id: payment.orderId },
      data: { status: OrderStatus.completed, preparingDeadline: null },
    });
    this.logger.log(
      `Boost activated for product ${boost.productId} until ${endsAt.toISOString()} after payment ${payment.id}`,
    );
    return boost.productId;
  }

  async completeRecurringMembershipPayment(
    membershipPaymentId: string,
    transactionId: string,
    providerResponse?: unknown,
  ): Promise<boolean> {
    // Captured in a local: narrowing `this.outbox` does not survive into the
    // transaction closure below, since a property could in principle change
    // between the check and the callback running.
    const outbox = this.outbox;
    if (!outbox) {
      throw new Error("Outbox service is unavailable");
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const attempt = await tx.membershipPayment.findUnique({
        where: { id: membershipPaymentId },
        include: {
          targetTier: true,
          membership: {
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
          },
        },
      });
      const metadata =
        (attempt?.metadata as Record<string, unknown> | null) ?? {};
      if (
        !attempt ||
        attempt.orderId ||
        metadata.kind !== "recurring" ||
        !attempt.targetTier ||
        (attempt.billingPeriod !== "monthly" &&
          attempt.billingPeriod !== "yearly")
      ) {
        throw new Error(
          `Invalid recurring membership intent ${membershipPaymentId}`,
        );
      }

      const sourcePeriodEnd =
        typeof metadata.sourcePeriodEnd === "string"
          ? metadata.sourcePeriodEnd
          : null;
      const entitlementCanApply =
        sourcePeriodEnd === attempt.membership.currentPeriodEnd.toISOString();

      const claimed = await tx.membershipPayment.updateMany({
        where: {
          id: attempt.id,
          status: { in: [PaymentStatus.pending, PaymentStatus.processing] },
        },
        data: {
          status: PaymentStatus.completed,
          providerPaymentId: transactionId,
          metadata: {
            ...metadata,
            providerResponse: (providerResponse ??
              null) as Prisma.InputJsonValue,
            completedAt: new Date().toISOString(),
            entitlementApplied: entitlementCanApply,
            ...(entitlementCanApply
              ? {}
              : { manualReviewReason: "membership_period_changed" }),
          },
        },
      });
      if (claimed.count !== 1) return false;

      if (entitlementCanApply) {
        await tx.userMembership.update({
          where: { id: attempt.membershipId },
          data: {
            tierId: attempt.targetTier.id,
            status: SubscriptionStatus.active,
            currentPeriodStart: attempt.periodStart,
            currentPeriodEnd: attempt.periodEnd,
            cancelledAt: null,
            scheduledTierType: null,
            scheduledBillingPeriod: null,
          },
        });
        this.reindexSellerListings(attempt.membership.userId);

        const grantsPremium = isPremiumEntitled(
          {
            status: SubscriptionStatus.active,
            currentPeriodEnd: attempt.periodEnd,
            tier: attempt.targetTier,
          },
          attempt.membership.user,
        );
        if (grantsPremium) {
          await tx.product.updateMany({
            where: {
              sellerId: attempt.membership.userId,
              status: ProductStatus.active,
              rankTier: 0,
            },
            data: {
              rankTier: 1,
              relevanceScore: { increment: RELEVANCE_PREMIUM_BONUS },
            },
          });
        }
      }
      await outbox.enqueue(tx, {
        type: OUTBOX_REVENUE_INVOICE_ISSUE,
        payload: {
          membershipPaymentId: attempt.id,
          kind: "membership",
        },
        dedupeKey: `${OUTBOX_REVENUE_INVOICE_ISSUE}:membership:${attempt.id}`,
      });

      return true;
    });
    return result;
  }

  async failRecurringMembershipPayment(
    membershipPaymentId: string,
    reason: string,
    providerResponse?: unknown,
  ): Promise<boolean> {
    const attempt = await this.prisma.membershipPayment.findUnique({
      where: { id: membershipPaymentId },
      select: { metadata: true },
    });
    if (!attempt) return false;
    const metadata = (attempt.metadata as Record<string, unknown> | null) ?? {};
    const failed = await this.prisma.membershipPayment.updateMany({
      where: {
        id: membershipPaymentId,
        status: { in: [PaymentStatus.pending, PaymentStatus.processing] },
      },
      data: {
        status: PaymentStatus.failed,
        metadata: {
          ...metadata,
          providerResponse: (providerResponse ?? null) as Prisma.InputJsonValue,
          failureReason: reason,
          failedAt: new Date().toISOString(),
        },
      },
    });
    return failed.count === 1;
  }

  /**
   * POST-COMMIT eLogo üyelik faturası (Tarodan geliri, sanal hizmet). Fire-and-forget,
   * idempotent, retry cron'lu. membershipPayment kaydı varsa ondan, yoksa MEM- siparişten kes.
   */
  issueMembershipInvoice(
    payment: any,
    orderId: string,
    transactionId?: string,
  ): void {
    void (async () => {
      const mp = await this.prisma.membershipPayment.findFirst({
        where: {
          providerPaymentId:
            transactionId || payment.providerPaymentId || undefined,
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (mp) await this.elogoInvoicing.issueMembershipInvoice(mp.id);
      else await this.elogoInvoicing.issueMembershipInvoiceForOrder(orderId);
    })().catch((e) =>
      this.logger.warn(`eLogo üyelik faturası tetik hatası: ${e?.message}`),
    );
  }

  /** POST-COMMIT eLogo boost faturası (satıcıya, sanal hizmet). Fire-and-forget. */
  issueBoostInvoice(orderId: string): void {
    void (async () => {
      const boost = await this.prisma.productBoost.findUnique({
        where: { orderId },
        select: { id: true },
      });
      if (boost) await this.elogoInvoicing.issueBoostInvoice(boost.id);
    })().catch((e) =>
      this.logger.warn(`eLogo boost faturası tetik hatası: ${e?.message}`),
    );
  }
}
