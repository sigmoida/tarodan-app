import {
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHash } from "crypto";
import { PrismaService } from "../../../prisma";
import { generateUniqueReference } from "../../../common/helpers/generate-reference";
import { REFERENCE_PREFIX } from "../../../common/helpers/code-prefixes";
import { Prisma } from "@prisma/client";
import { SuratCargoService } from "../../surat-cargo/surat-cargo.service";
import { TaxService } from "../../tax/tax.service";
import {
  CommissionResult,
  OrderPricingService,
} from "../pricing/order-pricing.service";
import { OrderFeeDiscountService } from "../pricing/order-fee-discount.service";
import type { AppliedFeeDiscount } from "../../discount/engine/fee-discount.engine";
import { remainingDiscountAllowanceFor } from "../../discount/engine/fee-discount.engine";
import {
  splitShippingByBuyerShare,
  type OutboundTariffLike,
} from "../../shipping/helpers/shipping-tariff.helper";
import {
  calculateServiceTax,
  type ServiceTaxBreakdown,
} from "../helpers/order-service-tax.helper";
import { buyerTotalOf } from "../helpers/order-total.helper";
import { OrderTaxPolicyService } from "../pricing/order-tax-policy.service";

/**
 * Sipariş oluşturma primitifleri (Sürat gönderi fail-fast, kurumsal-satıcı KDV,
 * benzersiz sipariş no, komisyon anlık görüntüsü, Sürat idempotency anahtarı) —
 * OrderCheckoutService'ten birebir taşındı. Direct/group/guest alt servisleri
 * buraya delege eder (product-common.service.ts'teki paylaşılan Common deseniyle
 * aynı). Leaf: prisma, suratCargoService, taxService (döngü yok).
 */
@Injectable()
export class OrderCheckoutCommonService {
  private readonly logger = new Logger(OrderCheckoutCommonService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly suratCargoService: SuratCargoService,
    private readonly taxService: TaxService,
    private readonly orderPricing: OrderPricingService,
    private readonly taxPolicy: OrderTaxPolicyService,
    @Optional()
    private readonly feeDiscounts?: OrderFeeDiscountService,
  ) {}

  /**
   * Teklif bazlı bir siparişin TÜM bedelleri: komisyon, kargo (alıcı/satıcı payı),
   * KDV, stopaj ve tahsil edilecek toplam.
   *
   * Tek kaynak olması kritik: teklif kabul edilirken sipariş `OfferService` içinde
   * oluşturuluyor ve orada yalnız komisyon hesaplanıyordu — KDV, stopaj ve kargo
   * sıfır kalıyordu (kurumsal satıcıda KDV tahsil edilmemesi + kargonun bedava
   * verilmesi). Klasik `POST /orders` teklif yolu ise aynı hesabı kendi içinde
   * tekrar yazıyordu. İkisi de artık burayı çağırır.
   */
  async resolveOfferOrderPricing(params: {
    amount: number;
    productId?: string;
    sellerId: string;
    categoryId: string | null;
    shippingDesi: number;
    shippingTariff?: OutboundTariffLike;
    commissionRuleSetId?: string;
    /** Bedel kampanyalarının hedef kitlesi için — misafirde null. */
    buyerId?: string | null;
    buyerTier?: string | null;
  }): Promise<{
    commission: CommissionResult;
    fullShippingAmount: number;
    buyerShippingAmount: number;
    sellerShippingAmount: number;
    feeDiscounts: AppliedFeeDiscount[];
    buyerFeeDiscountAmount: number;
    sellerFeeDiscountAmount: number;
    taxAmount: number;
    withholdingTaxAmount: number;
    buyerServiceTaxAmount: number;
    sellerServiceTaxAmount: number;
    /** Uygulanan hizmet KDV oranı (%) — siparişe snapshot'lanır. */
    serviceVatRate: number;
    totalAmount: number;
  }> {
    const {
      amount,
      productId,
      sellerId,
      categoryId,
      shippingDesi,
      shippingTariff,
      commissionRuleSetId,
    } = params;

    const pinnedCommissionRuleSetId =
      commissionRuleSetId ??
      (await this.orderPricing.resolveCommissionRuleSetSnapshot()).id;
    const rawCommission = await this.orderPricing.calculateCommission(
      amount,
      sellerId,
      categoryId,
      pinnedCommissionRuleSetId,
      amount,
      productId,
    );
    // Kargo kararı (quote/checkout ile ORTAK): kademe → o kademenin payı → bölüşüm.
    const {
      fullShipping: fullShippingAmount,
      buyer: rawBuyerShippingAmount,
      seller: rawSellerShippingAmount,
    } = this.orderPricing.resolveShippingDecision({
      tariff:
        shippingTariff ??
        (await this.orderPricing.resolveShippingTariffSnapshot()).tariff,
      subtotal: amount,
      billableDesi: shippingDesi,
      lineShares: [rawCommission.shippingBuyerShares],
    });
    // Bedel indirimleri KDV'DEN ÖNCE uygulanır: bir bedel inince matrahı da iner.
    const discounted = (await this.feeDiscounts?.apply({
      context: {
        productId: productId ?? "",
        categoryId,
        sellerId,
        buyerId: params.buyerId ?? null,
        buyerTier: params.buyerTier ?? null,
      },
      commission: rawCommission,
      buyerShippingAmount: rawBuyerShippingAmount,
      sellerShippingAmount: rawSellerShippingAmount,
      // Teklif siparişinde kupon yoktur; tavanın tamamı bedel kampanyalarına açık.
      remainingAllowance: remainingDiscountAllowanceFor({ lineBase: amount }),
    })) ?? {
      commission: rawCommission,
      buyerShippingAmount: rawBuyerShippingAmount,
      sellerShippingAmount: rawSellerShippingAmount,
      applied: [],
      buyerTotal: 0,
      sellerTotal: 0,
    };
    const commission = discounted.commission;
    const buyerShippingAmount = discounted.buyerShippingAmount;
    const sellerShippingAmount = discounted.sellerShippingAmount;

    const {
      taxAmount,
      withholdingTaxAmount,
      buyerServiceTaxAmount,
      sellerServiceTaxAmount,
      serviceVatRate,
    } = await this.resolveOrderTaxes({
      sellerId,
      categoryId,
      subtotal: amount,
      fees: {
        buyerCommissionAmount: commission.buyerCommissionAmount,
        buyerServiceFeeAmount: commission.buyerServiceFeeAmount,
        buyerShippingAmount,
        sellerCommissionAmount: commission.sellerCommissionAmount,
        sellerPlatformFeeAmount: commission.sellerPlatformFeeAmount,
        sellerShippingAmount,
      },
    });

    // Alıcıdan tahsil edilen: ürün + kargo payı + alıcı ücreti + alıcıya verilen
    // hizmetlerin KDV'si. Ürün KDV'si BU TOPLAMA GİRMEZ — vitrin fiyatı KDV
    // dahil kabul edilir ve `taxAmount` hep 0'dır (bkz. resolveOrderTaxes).
    // (Stopaj ve satıcı hizmet KDV'si satıcı payout'undan kesilir, alıcıya
    // yansıtılmaz.)
    const totalAmount = buyerTotalOf({
      subtotal: amount,
      buyerShippingAmount,
      buyerFeeAmount: commission.buyerFeeAmount,
      buyerServiceTaxAmount,
    });

    return {
      commission,
      fullShippingAmount,
      buyerShippingAmount,
      sellerShippingAmount,
      feeDiscounts: discounted.applied,
      buyerFeeDiscountAmount: discounted.buyerTotal,
      sellerFeeDiscountAmount: discounted.sellerTotal,
      taxAmount,
      withholdingTaxAmount,
      buyerServiceTaxAmount,
      sellerServiceTaxAmount,
      serviceVatRate,
      totalAmount,
    };
  }

  buildSuratIdempotencyKey(parts: string[]): string {
    return createHash("sha256")
      .update(parts.filter((p) => p.length > 0).join("|"))
      .digest("hex");
  }

  buildFinancialSnapshot(params: {
    pricingHash: string;
    productId: string;
    quantity: number;
    unitPrice: number;
    originalUnitPrice: number;
    subtotal: number;
    discountAmount: number;
    discountCode?: string | null;
    platformFundedDiscount: number;
    shipping: {
      tariffId: string;
      tariffVersion: number;
      fullAmount: number;
      buyerAmount: number;
      sellerAmount: number;
    };
    commission: CommissionResult;
    taxAmount: number;
    withholdingTaxAmount: number;
    buyerServiceTaxAmount?: number;
    sellerServiceTaxAmount?: number;
    totalAmount: number;
  }): Prisma.InputJsonObject {
    return {
      version: 2,
      confirmedAt: new Date().toISOString(),
      pricing: {
        hash: params.pricingHash,
        productId: params.productId,
        quantity: params.quantity,
        unitPrice: params.unitPrice,
        originalUnitPrice: params.originalUnitPrice,
        subtotal: params.subtotal,
        discountAmount: params.discountAmount,
        totalAmount: params.totalAmount,
      },
      discount: {
        code: params.discountCode ?? null,
        amount: params.discountAmount,
        platformFundedAmount: params.platformFundedDiscount,
      },
      shipping: {
        tariffId: params.shipping.tariffId,
        tariffVersion: params.shipping.tariffVersion,
        fullAmount: params.shipping.fullAmount,
        buyerAmount: params.shipping.buyerAmount,
        sellerAmount: params.shipping.sellerAmount,
      },
      commission: {
        ruleSetId: params.commission.ruleSetId,
        ruleId: params.commission.ruleId,
        ruleName: params.commission.ruleName,
        matchedCategoryId: params.commission.matchedCategoryId,
        matchedSellerType: params.commission.matchedSellerType,
        matchedAmount: params.commission.matchedAmount,
        effectiveMembershipTier:
          params.commission.effectiveMembershipTier ?? null,
        taxpayerType: params.commission.taxpayerType ?? null,
        buyerFeeAmount: params.commission.buyerFeeAmount,
        sellerFeeAmount: params.commission.sellerFeeAmount,
        buyerCommissionAmount: params.commission.buyerCommissionAmount,
        buyerServiceFeeAmount: params.commission.buyerServiceFeeAmount,
        sellerCommissionAmount: params.commission.sellerCommissionAmount,
        sellerPlatformFeeAmount: params.commission.sellerPlatformFeeAmount,
      },
      tax: {
        amount: params.taxAmount,
        withholdingAmount: params.withholdingTaxAmount,
        // Hizmet bedeli KDV'si — alıcıya EKLENEN ve satıcıdan KESİLEN taraflar.
        buyerServiceAmount: params.buyerServiceTaxAmount ?? 0,
        sellerServiceAmount: params.sellerServiceTaxAmount ?? 0,
      },
    };
  }

  /**
   * Geriye-uyum sarmalayıcı: yalnız ürün KDV'si + stopaj döner (hizmet KDV'si
   * matrah gerektirdiği için burada hesaplanamaz). Yeni kod `resolveOrderTaxes`
   * çağırmalı.
   */
  async resolveSellerTaxes(
    sellerId: string,
    categoryId: string | null,
    subtotal: number,
  ): Promise<{ taxAmount: number; withholdingTaxAmount: number }> {
    const { taxAmount, withholdingTaxAmount } = await this.resolveOrderTaxes({
      sellerId,
      categoryId,
      subtotal,
    });
    return { taxAmount, withholdingTaxAmount };
  }

  /**
   * Bir sipariş satırının TÜM vergileri — tek çağrı, tek politika okuması.
   *
   *   taxAmount              ürün KDV'si   → alıcıdan tahsil, satıcıya aktarılır
   *                                          (ARTIK HEP 0 — ürün KDV'si yok)
   *   buyerServiceTaxAmount  hizmet KDV'si → alıcının ödediğine EKLENİR
   *   sellerServiceTaxAmount hizmet KDV'si → satıcı payout'undan KESİLİR
   *   withholdingTaxAmount   stopaj        → satıcı payout'undan KESİLİR
   *
   * `fees` verilmezse hizmet KDV'si hesaplanmaz (yalnız ürün KDV'si + stopaj
   * isteyen eski çağrılar için).
   */
  async resolveOrderTaxes(params: {
    sellerId: string;
    categoryId: string | null;
    subtotal: number;
    fees?: ServiceTaxBreakdown;
  }): Promise<{
    taxAmount: number;
    withholdingTaxAmount: number;
    buyerServiceTaxAmount: number;
    sellerServiceTaxAmount: number;
    /** Uygulanan hizmet KDV oranı (%) — siparişe snapshot'lanır. */
    serviceVatRate: number;
  }> {
    const { sellerId, categoryId, subtotal, fees } = params;
    const [policy, seller] = await Promise.all([
      this.taxPolicy.resolve(),
      this.prisma.user.findUnique({
        where: { id: sellerId },
        select: { businessStatus: true, taxId: true },
      }),
    ]);
    // Vergi mükellefi = onaylı kurumsal hesap + VKN. Stopaj yalnız bu
    // satıcılarda doğar.
    const isCorporate =
      seller?.businessStatus === "approved" && !!seller?.taxId;

    // ── Ürün KDV'si ──────────────────────────────────────────────────────────
    // YOK. Vitrin fiyatı KDV dahil kabul edilir ve ürün bedelinin beyanı
    // satıcıya aittir; platform ürün üzerinden KDV tahsil etmez. KDV yalnız
    // platformun kendi hizmetlerinden (komisyon, kargo payı, hizmet bedeli)
    // doğar — bkz. order-service-tax.helper.ts.
    const taxAmount = 0;

    // ── Hizmet KDV'si ────────────────────────────────────────────────────────
    // Satıcının mükellefiyetinden BAĞIMSIZ: bu KDV platformun kendi hizmetinin
    // vergisidir, tarafların statüsüne bakmaz.
    const serviceVatRate = this.taxPolicy.effectiveServiceVatRate(policy);
    const { buyerServiceTaxAmount, sellerServiceTaxAmount } = fees
      ? calculateServiceTax(fees, serviceVatRate)
      : { buyerServiceTaxAmount: 0, sellerServiceTaxAmount: 0 };

    // ── Stopaj (GVK 94/19) ───────────────────────────────────────────────────
    const withholdingRate = this.taxPolicy.withholdingRateFor(policy, {
      isCorporate,
    });
    const withholdingTaxAmount =
      withholdingRate > 0 ? Math.round(subtotal * withholdingRate) / 100 : 0;

    return {
      taxAmount,
      withholdingTaxAmount,
      buyerServiceTaxAmount,
      sellerServiceTaxAmount,
      // Ücret kırılımı verilmediyse KDV hiç hesaplanmamıştır; oranı 0 yazmak
      // ekranın "KDV uygulanmadı" ile "oran bilinmiyor" ayrımını korur.
      serviceVatRate: fees ? serviceVatRate : 0,
    };
  }

  /**
   * Generate a non-guessable, unique order number (e.g. "ORD-K7X9M2QF3N").
   * Random by design so the value leaks no sequence/order-count information and
   * cannot be enumerated. The `order_number` column's @unique constraint is the
   * final guard against the (negligible) chance of a collision.
   */
  async generateOrderNumber(): Promise<string> {
    return generateUniqueReference(
      REFERENCE_PREFIX.order,
      async (code) =>
        (await this.prisma.order.count({ where: { orderNumber: code } })) > 0,
    );
  }

  /**
   * Koli numarası (ör. "PKG-3QF7N2K9XM") — bir satıcı paketi = bir fiziksel
   * gönderi. Sürat'a `OzelKargoTakipNo` olarak BU gider ve müşteri kargosunu
   * bununla sorgular; sipariş numarasından bağımsızdır, çünkü referansı paketin
   * sipariş kümesinden türetmek küme değişince kayar ve mükerrer gönderi açar.
   */
  async generatePackageNumber(): Promise<string> {
    return generateUniqueReference(
      REFERENCE_PREFIX.orderPackage,
      async (code) =>
        (await this.prisma.orderPackage.count({
          where: { packageNumber: code },
        })) > 0,
    );
  }

  /**
   * Record commission data to analytics snapshot
   * Requirement: Store commission snapshot (3.3)
   */
  async recordCommissionSnapshot(
    orderId: string,
    orderNumber: string,
    commissionAmount: number,
    totalAmount: number,
    result: CommissionResult,
  ): Promise<void> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Try to update existing daily snapshot or create new one
      await this.prisma.analyticsSnapshot.upsert({
        where: {
          snapshotType_snapshotDate: {
            snapshotType: "daily_commission",
            snapshotDate: today,
          },
        },
        update: {
          totalRevenue: {
            increment: commissionAmount,
          },
          newOrders: {
            increment: 1,
          },
          data: {
            // Note: In production, you'd merge this with existing data
            lastOrderId: orderId,
            lastOrderNumber: orderNumber,
            lastCommission: commissionAmount,
            lastRuleId: result.ruleId,
            lastRuleName: result.ruleName,
            lastAppliedRate: result.appliedRate,
          },
        },
        create: {
          snapshotType: "daily_commission",
          snapshotDate: today,
          totalRevenue: commissionAmount,
          newOrders: 1,
          data: {
            orders: [
              {
                orderId,
                orderNumber,
                totalAmount,
                commissionAmount,
                ruleId: result.ruleId,
                ruleName: result.ruleName,
                appliedRate: result.appliedRate,
                wasMinApplied: result.wasMinApplied,
                wasMaxApplied: result.wasMaxApplied,
                timestamp: new Date().toISOString(),
              },
            ],
          },
        },
      });

      this.logger.debug(
        `Commission snapshot recorded for order ${orderNumber}`,
      );
    } catch (error) {
      // Don't fail the order if snapshot fails
      this.logger.error(`Failed to record commission snapshot: ${error}`);
    }
  }
}
