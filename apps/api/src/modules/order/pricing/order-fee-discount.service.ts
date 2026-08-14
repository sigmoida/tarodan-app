import { Injectable, Logger, Optional } from "@nestjs/common";
import { DiscountTarget } from "@prisma/client";
import { PrismaService } from "../../../prisma";
import { effectiveMembershipTierType } from "../../membership/membership.util";
import { FeeDiscountResolver } from "../../discount/fee-discount.resolver";
import {
  applyFeeDiscounts,
  automaticBudgetEntriesOf,
} from "../../discount/fee-discount.engine";
import type {
  AppliedFeeDiscount,
  FeeDiscountCandidate,
} from "../../discount/fee-discount.engine";
import type { CommissionResult } from "./order-pricing.service";

/**
 * Platformun BEDEL indirimlerini bir siparişin kesinti kalemlerine uygular.
 *
 * Neden burada: indirim kesinti kalemlerinin KENDİSİNE yazılır (komisyon kolonu
 * indirim sonrası tutarı taşır). Böylece escrow, iade, e-fatura ve raporlar ek
 * bir terim öğrenmeden doğru sayıyı okur. Uygulama noktası kritik: komisyon ve
 * kargo bölüşümü hesaplandıktan SONRA, KDV'den ÖNCE — bedel inince matrahı da
 * inmelidir.
 */
export interface OrderFeeDiscountContext {
  productId: string;
  categoryId: string | null;
  sellerId: string;
  buyerId?: string | null;
  buyerTier?: string | null;
  sellerTier?: string | null;
  quantity?: number;
}

export interface ApplyOrderFeeDiscountsInput {
  context: OrderFeeDiscountContext;
  commission: CommissionResult;
  buyerShippingAmount: number;
  sellerShippingAmount: number;
  /** Toplam indirim tavanından bu satıra kalan pay; null = tavan yok. */
  remainingAllowance?: number | null;
  /** Sepet döngüsünde tek sorgu için önceden yüklenmiş kampanya listesi. */
  preloaded?: unknown[];
  /** Kodla gelen (kupon) bedel indirimleri — otomatik olanlarla birlikte yarışır. */
  couponCandidates?: FeeDiscountCandidate[];
}

export interface ApplyOrderFeeDiscountsResult {
  commission: CommissionResult;
  buyerShippingAmount: number;
  sellerShippingAmount: number;
  applied: AppliedFeeDiscount[];
  buyerTotal: number;
  sellerTotal: number;
}

const round2 = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

@Injectable()
export class OrderFeeDiscountService {
  private readonly logger = new Logger(OrderFeeDiscountService.name);

  constructor(
    @Optional() private readonly resolver?: FeeDiscountResolver,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  /**
   * Alıcının geçerli üyelik katmanı — üyelik hedefli kampanyalar için. Misafirde
   * (kimlik yok) null döner ve üyelik hedefli kampanya uygulanmaz.
   *
   * Tek doğruluk kaynağı `effectiveMembershipTierType`: hakkı geçerli olmayan
   * (süresi dolmuş, tier'ı pasif, KYC'siz business) alıcı "free" sayılır;
   * iptal edilmiş ama dönemi süren üye tier avantajını dönem sonuna kadar korur.
   * (Eski `status === "active"` kontrolü süresi dolmuşa tier indirimi veriyor,
   * iptal-dönem-içi üyeyi ise haksız yere dışarıda bırakıyordu.)
   */
  async resolveBuyerTier(buyerId?: string | null): Promise<string | null> {
    if (!buyerId || !this.prisma) return null;
    try {
      const membership = await this.prisma.userMembership.findUnique({
        where: { userId: buyerId },
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
      });
      return effectiveMembershipTierType(membership, membership?.user);
    } catch (error) {
      this.logger.warn(`alıcı üyelik katmanı okunamadı: ${error}`);
      return null;
    }
  }

  /** Sepet döngüsünde N+1'i önlemek için kampanyaları bir kez yükler. */
  async preload(now: Date = new Date()): Promise<unknown[]> {
    if (!this.resolver) return [];
    try {
      return await this.resolver.loadActive(now);
    } catch (error) {
      this.logger.warn(`bedel kampanyaları yüklenemedi: ${error}`);
      return [];
    }
  }

  async apply(
    input: ApplyOrderFeeDiscountsInput,
  ): Promise<ApplyOrderFeeDiscountsResult> {
    const unchanged: ApplyOrderFeeDiscountsResult = {
      commission: input.commission,
      buyerShippingAmount: input.buyerShippingAmount,
      sellerShippingAmount: input.sellerShippingAmount,
      applied: [],
      buyerTotal: 0,
      sellerTotal: 0,
    };

    const candidates: FeeDiscountCandidate[] = [
      ...(input.couponCandidates ?? []),
    ];
    if (this.resolver) {
      try {
        const buyerTier =
          input.context.buyerTier !== undefined
            ? input.context.buyerTier
            : await this.resolveBuyerTier(input.context.buyerId);
        const rows =
          (input.preloaded as any[]) ?? (await this.resolver.loadActive());
        candidates.push(
          ...this.resolver.selectFor(rows as any, {
            ...input.context,
            buyerTier,
            // Satıcının katmanı komisyon sonucundan gelir; ayrı sorgu gerekmez.
            sellerTier:
              input.context.sellerTier ??
              (input.commission.effectiveMembershipTier as string | null) ??
              null,
          }),
        );
      } catch (error) {
        // İndirim çözülemezse sipariş indirimsiz akar; ticaret durmaz.
        this.logger.warn(`bedel kampanyası çözülemedi: ${error}`);
      }
    }
    if (!candidates.length) return unchanged;

    const result = applyFeeDiscounts({
      candidates,
      quantity: input.context.quantity,
      remainingDiscountAllowance: input.remainingAllowance ?? null,
      amounts: {
        [DiscountTarget.buyer_commission]:
          input.commission.buyerCommissionAmount,
        [DiscountTarget.buyer_service_fee]:
          input.commission.buyerServiceFeeAmount,
        [DiscountTarget.buyer_shipping]: input.buyerShippingAmount,
        [DiscountTarget.seller_commission]:
          input.commission.sellerCommissionAmount,
        [DiscountTarget.seller_platform_fee]:
          input.commission.sellerPlatformFeeAmount,
        [DiscountTarget.seller_shipping]: input.sellerShippingAmount,
      },
    });
    if (!result.applied.length) return unchanged;

    const buyerCommissionAmount =
      result.amounts[DiscountTarget.buyer_commission] ?? 0;
    const buyerServiceFeeAmount =
      result.amounts[DiscountTarget.buyer_service_fee] ?? 0;
    const sellerCommissionAmount =
      result.amounts[DiscountTarget.seller_commission] ?? 0;
    const sellerPlatformFeeAmount =
      result.amounts[DiscountTarget.seller_platform_fee] ?? 0;

    // Türetilmiş toplamlar yeniden kurulur; aksi halde kırılım ile toplam
    // birbirini tutmaz ve payout/fatura eski tutarı okur.
    const buyerFeeAmount = round2(
      buyerCommissionAmount + buyerServiceFeeAmount,
    );
    const sellerFeeAmount = round2(
      sellerCommissionAmount + sellerPlatformFeeAmount,
    );

    return {
      commission: {
        ...input.commission,
        buyerCommissionAmount,
        buyerServiceFeeAmount,
        sellerCommissionAmount,
        sellerPlatformFeeAmount,
        buyerFeeAmount,
        sellerFeeAmount,
        commissionAmount: round2(buyerFeeAmount + sellerFeeAmount),
      },
      buyerShippingAmount: result.amounts[DiscountTarget.buyer_shipping] ?? 0,
      sellerShippingAmount: result.amounts[DiscountTarget.seller_shipping] ?? 0,
      applied: result.applied,
      buyerTotal: result.buyerTotal,
      sellerTotal: result.sellerTotal,
    };
  }

  /**
   * YALNIZ kargo payı kampanyaları. Kargo, satırların değil PAKETİN kararıdır
   * (kademe → pay → bölüşüm), bu yüzden çok satırlı sepette komisyondan ayrı bir
   * adımda uygulanır. Tekil satın almada iki adım aynı anda çalışır.
   */
  async applyShipping(input: {
    context: OrderFeeDiscountContext;
    buyerShippingAmount: number;
    sellerShippingAmount: number;
    remainingAllowance?: number | null;
    preloaded?: unknown[];
    couponCandidates?: FeeDiscountCandidate[];
  }): Promise<{
    buyerShippingAmount: number;
    sellerShippingAmount: number;
    applied: AppliedFeeDiscount[];
    buyerTotal: number;
    sellerTotal: number;
  }> {
    const unchanged = {
      buyerShippingAmount: input.buyerShippingAmount,
      sellerShippingAmount: input.sellerShippingAmount,
      applied: [] as AppliedFeeDiscount[],
      buyerTotal: 0,
      sellerTotal: 0,
    };
    // Kupon adayı, otomatik kampanyalar çözülemese bile yaşamalıdır: alıcı kodu
    // yazdı ve kabul edildi.
    let candidates: FeeDiscountCandidate[] = [
      ...(input.couponCandidates ?? []),
    ];
    try {
      if (!this.resolver) throw new Error("resolver yok");
      const buyerTier =
        input.context.buyerTier !== undefined
          ? input.context.buyerTier
          : await this.resolveBuyerTier(input.context.buyerId);
      const rows =
        (input.preloaded as any[]) ?? (await this.resolver.loadActive());
      candidates.push(
        ...this.resolver.selectFor(rows as any, {
          ...input.context,
          buyerTier,
        }),
      );
    } catch (error) {
      if (this.resolver) {
        this.logger.warn(`kargo kampanyası çözülemedi: ${error}`);
      }
    }
    candidates = candidates.filter(
      (candidate) =>
        candidate.target === DiscountTarget.buyer_shipping ||
        candidate.target === DiscountTarget.seller_shipping,
    );
    if (!candidates.length) return unchanged;

    const result = applyFeeDiscounts({
      candidates,
      quantity: input.context.quantity,
      remainingDiscountAllowance: input.remainingAllowance ?? null,
      amounts: {
        [DiscountTarget.buyer_shipping]: input.buyerShippingAmount,
        [DiscountTarget.seller_shipping]: input.sellerShippingAmount,
      },
    });

    return {
      buyerShippingAmount: result.amounts[DiscountTarget.buyer_shipping] ?? 0,
      sellerShippingAmount: result.amounts[DiscountTarget.seller_shipping] ?? 0,
      applied: result.applied,
      buyerTotal: result.buyerTotal,
      sellerTotal: result.sellerTotal,
    };
  }

  /**
   * Kodsuz (otomatik) kampanyaların verdiği indirimi kampanya bütçesine yazar.
   * Sipariş OLUŞURKEN, aynı transaction içinde çağrılır — kupon satırları hariç
   * tutulur çünkü kuponun bütçesi rezervasyon adımında zaten harcanmıştır.
   * Ödenmeyen sipariş kapanırken `releaseReservedUsageForOrders` bütçeyi geri verir.
   */
  async spendBudgets(
    applied: AppliedFeeDiscount[] | null | undefined,
    client?: unknown,
  ): Promise<void> {
    if (!this.resolver || !applied?.length) return;
    const entries = automaticBudgetEntriesOf(applied);
    if (!entries.length) return;
    await this.resolver.spendBudget(entries, client);
  }

  /**
   * Doğrulanmış bir kuponu motor adayına çevirir. Ürün fiyatı hedefli kuponda
   * null döner: o kupon ürün tabanını düşürür, bedellere dokunmaz.
   */
  couponCandidate(
    validated:
      | {
          id: string;
          name: string;
          code?: string | null;
          type: string;
          value: number;
          target?: DiscountTarget | null;
          maxDiscountAmount?: number | null;
          budgetRemaining?: number | null;
        }
      | null
      | undefined,
  ): FeeDiscountCandidate | null {
    const target = validated?.target;
    if (!validated || !target || target === DiscountTarget.product_price) {
      return null;
    }
    return {
      id: validated.id,
      name: validated.name,
      code: validated.code ?? null,
      target,
      type: validated.type as FeeDiscountCandidate["type"],
      value: validated.value,
      maxDiscountAmount: validated.maxDiscountAmount ?? null,
      budgetRemaining: validated.budgetRemaining ?? null,
    };
  }
}
