import { Injectable, Logger } from "@nestjs/common";
import { DiscountAudience, DiscountTarget } from "@prisma/client";
import { PrismaService } from "../../prisma";
import { audienceMatches } from "./discount-authorization";
import { isProductInDiscountScope } from "./discount-scope";
import { FEE_TARGETS } from "./fee-discount.engine";
import type { FeeDiscountCandidate } from "./fee-discount.engine";

/**
 * "Bu satışta hangi bedel kampanyaları geçerli?" sorusunun tek yanıtlayıcısı.
 *
 * Aktif kampanyalar az sayıdadır: hepsi TEK sorguyla çekilir, uygunluk (kapsam +
 * hedef kitle + bütçe) bellekte değerlendirilir. Böylece çok satırlı sepette N+1
 * sorgu oluşmaz ve önizleme ile tahsilat aynı listeyi görür.
 *
 * KODLU kampanyalar buraya girmez: onlar sepette yazılan kupondur ve
 * `validateCoupon` üzerinden gelir. Burada yalnız otomatik (kodsuz) olanlar var.
 */
export interface FeeDiscountContext {
  productId: string;
  categoryId: string | null;
  sellerId: string;
  buyerId?: string | null;
  buyerTier?: string | null;
  sellerTier?: string | null;
  /** Satırdaki adet — adet koşullu kampanyalar için. */
  quantity?: number;
}

type ActiveFeeDiscount = {
  id: string;
  name: string;
  type: any;
  value: any;
  scope: any;
  sellerId: string | null;
  categoryId: string | null;
  targetProductIds: string[];
  target: DiscountTarget;
  audience: DiscountAudience;
  maxDiscountAmount: any;
  minQuantity: number | null;
  usageLimitTotal: number | null;
  usedCount: number;
  budgetLimit: any;
  budgetSpent: any;
  priority: number;
  targetTiers: { tierType: string }[];
  targetUsers: { userId: string }[];
};

@Injectable()
export class FeeDiscountResolver {
  private readonly logger = new Logger(FeeDiscountResolver.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Şu an yürürlükte olan, kodsuz bedel kampanyaları. */
  async loadActive(now: Date = new Date()): Promise<ActiveFeeDiscount[]> {
    return (await this.prisma.discount.findMany({
      where: {
        isActive: true,
        code: null,
        startDate: { lte: now },
        endDate: { gte: now },
        target: { in: [...FEE_TARGETS] },
        // Bütçesi dolduğu için durdurulan kampanya yeni sepetlere uygulanmaz.
        budgetStoppedAt: null,
      },
      orderBy: { priority: "asc" },
      include: {
        targetTiers: { select: { tierType: true } },
        targetUsers: { select: { userId: true } },
      },
    })) as unknown as ActiveFeeDiscount[];
  }

  /** Yüklenmiş kampanya listesinden bu satıra uyanları süz. */
  selectFor(
    discounts: ActiveFeeDiscount[],
    context: FeeDiscountContext,
  ): FeeDiscountCandidate[] {
    const product = {
      id: context.productId,
      categoryId: context.categoryId,
      sellerId: context.sellerId,
    };

    return discounts
      .filter((discount) => {
        if (!isProductInDiscountScope(product, discount)) return false;
        if (
          discount.usageLimitTotal != null &&
          discount.usedCount >= discount.usageLimitTotal
        ) {
          return false;
        }
        return audienceMatches({
          audience: discount.audience,
          target: discount.target,
          tierTypes: discount.targetTiers.map((row) => row.tierType),
          userIds: discount.targetUsers.map((row) => row.userId),
          buyerId: context.buyerId ?? null,
          sellerId: context.sellerId,
          buyerTier: context.buyerTier ?? null,
          sellerTier: context.sellerTier ?? null,
        });
      })
      .map((discount) => ({
        id: discount.id,
        name: discount.name,
        code: null,
        target: discount.target,
        type: discount.type,
        value: Number(discount.value),
        maxDiscountAmount:
          discount.maxDiscountAmount != null
            ? Number(discount.maxDiscountAmount)
            : null,
        minQuantity: discount.minQuantity,
        budgetRemaining: this.budgetRemaining(discount),
      }))
      .filter(
        (candidate) =>
          candidate.budgetRemaining == null || candidate.budgetRemaining > 0,
      );
  }

  /** Tek satır için kısayol (tekil satın alma yolları). */
  async resolve(
    context: FeeDiscountContext,
    now: Date = new Date(),
  ): Promise<FeeDiscountCandidate[]> {
    const discounts = await this.loadActive(now);
    return this.selectFor(discounts, context);
  }

  private budgetRemaining(discount: ActiveFeeDiscount): number | null {
    if (discount.budgetLimit == null) return null;
    const remaining =
      Number(discount.budgetLimit) - Number(discount.budgetSpent ?? 0);
    return Math.max(0, Math.round((remaining + Number.EPSILON) * 100) / 100);
  }

  /**
   * Verilen indirimi kampanyanın bütçesine yazar ve tavan dolduysa kampanyayı
   * durdurur. Bütçe, rezerve edilen + tüketilen toplamıdır; serbest bırakma
   * `releaseBudget` ile geri düşer.
   */
  async spendBudget(
    entries: { discountId: string; amount: number }[],
    client?: any,
  ): Promise<void> {
    const db = client ?? this.prisma;
    for (const entry of entries) {
      if (!(entry.amount > 0)) continue;
      try {
        const updated = await db.discount.update({
          where: { id: entry.discountId },
          data: { budgetSpent: { increment: entry.amount } },
          select: { id: true, budgetLimit: true, budgetSpent: true },
        });
        if (
          updated.budgetLimit != null &&
          Number(updated.budgetSpent) >= Number(updated.budgetLimit)
        ) {
          await db.discount.updateMany({
            where: { id: entry.discountId, budgetStoppedAt: null },
            data: { budgetStoppedAt: new Date() },
          });
          this.logger.log(
            `Kampanya bütçesi doldu, durduruldu: ${entry.discountId}`,
          );
        }
      } catch (error) {
        // Bütçe muhasebesi ticareti durdurmaz; sapma raporda görünür.
        this.logger.warn(
          `bütçe düşümü başarısız (${entry.discountId}): ${error}`,
        );
      }
    }
  }

  /** Ödenmeyen/iptal edilen siparişte tutulan bütçeyi geri verir. */
  async releaseBudget(
    entries: { discountId: string; amount: number }[],
    client?: any,
  ): Promise<void> {
    const db = client ?? this.prisma;
    for (const entry of entries) {
      if (!(entry.amount > 0)) continue;
      try {
        const updated = await db.discount.update({
          where: { id: entry.discountId },
          data: { budgetSpent: { decrement: entry.amount } },
          select: { budgetLimit: true, budgetSpent: true },
        });
        // Yalnız bütçe GERÇEKTEN açıldıysa kampanya yeniden akar; aksi halde
        // tavanı dolu bir kampanyayı serbest bırakma sessizce diriltirdi.
        if (
          updated.budgetLimit != null &&
          Number(updated.budgetSpent) < Number(updated.budgetLimit)
        ) {
          await db.discount.updateMany({
            where: { id: entry.discountId, budgetStoppedAt: { not: null } },
            data: { budgetStoppedAt: null },
          });
        }
      } catch (error) {
        this.logger.warn(
          `bütçe iadesi başarısız (${entry.discountId}): ${error}`,
        );
      }
    }
  }
}
