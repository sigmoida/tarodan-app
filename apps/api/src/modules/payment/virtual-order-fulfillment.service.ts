import { Injectable, Logger } from "@nestjs/common";
import {
  Prisma,
  SubscriptionStatus,
  ProductStatus,
  OrderStatus,
  PaymentStatus,
} from "@prisma/client";
import { PrismaService } from "../../prisma";
import {
  computeRelevanceScore,
  RELEVANCE_PREMIUM_BONUS,
} from "../product/helpers/relevance-score";
import { ElogoInvoicingService } from "../elogo";

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
  ) {}

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
      include: { tier: true },
    });

    if (membership) {
      await tx.userMembership.update({
        where: { userId: payment.order.buyerId },
        data: { status: SubscriptionStatus.active, cancelledAt: null },
      });

      // Premium (free olmayan) üyelik aktifleşti: satıcının boost'suz aktif ilanlarını
      // premium kademesine (rankTier=1) yükselt. Boost'lu (2) ürünlere dokunma.
      if (membership.tier.type !== "free") {
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

      await tx.membershipPayment.updateMany({
        where: { membershipId: membership.id, status: "pending" },
        data: {
          status: "completed",
          providerPaymentId: transactionId || payment.providerPaymentId,
        },
      });

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
      select: { boostedUntil: true, qualityScore: true, popularityScore: true },
    });
    const base =
      boostedProduct?.boostedUntil && boostedProduct.boostedUntil > nowTs
        ? boostedProduct.boostedUntil
        : nowTs;
    const endsAt = new Date(
      base.getTime() + boost.durationDays * 24 * 60 * 60 * 1000,
    );
    await tx.productBoost.update({
      where: { id: boost.id },
      data: { status: "active", startsAt: nowTs, endsAt, purchasedAt: nowTs },
    });
    await tx.product.update({
      where: { id: boost.productId },
      data: {
        boostedUntil: endsAt,
        // LIFO ordering key (most-recently purchased first) for search + home.
        boostedAt: nowTs,
        // A Vitrin (showcaseOnHome) package also lights up the home showcase.
        ...(boost.showcaseOnHome ? { homeShowcaseUntil: endsAt } : {}),
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
