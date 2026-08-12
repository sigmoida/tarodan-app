import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
  Logger,
  Optional,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { i18nMessage } from "../i18n";
import { CheckoutQuoteDto } from "./dto";
import {
  CommissionRuleSetStatus,
  ProductKind,
  ProductStatus,
  ShippingPackageTierCode,
} from "@prisma/client";
import {
  calculateCommissionFromRules,
  CommissionCalculationResult,
  CommissionRuleMatchError,
  CommissionSellerConfigurationError,
  CorporateSellingSuspendedError,
  roundCommissionMatchAmount,
  resolveCommissionSellerType,
} from "./order-commission.helper";
import { TaxService } from "../tax/tax.service";
import {
  canSellFromMembership,
  effectiveMembershipTierType,
} from "../membership/membership.util";
import { ShippingTariffService } from "../shipping/shipping-tariff.service";
import {
  calculatePackageDesi,
  outboundPackageShipping,
  resolvePackageShippingDecision,
  ShippingPackageTiersNotConfiguredError,
  type OutboundTariffLike,
  type ShippingBuyerShareByTier,
} from "../shipping/shipping-tariff.helper";
import { billableDesiForTier } from "../shipping/shipping-package-tier";
import { DiscountService } from "../discount/discount.service";
import { createHash } from "crypto";
import { calculateServiceTax } from "./order-service-tax.helper";
import { buyerTotalOf } from "./order-total.helper";
import { sellerNetAmountOf } from "./order-net.helper";
import { resolveSalePrice } from "../product/helpers/product-sale-window";
import { OrderTaxPolicyService } from "./order-tax-policy.service";
import { OrderFeeDiscountService } from "./order-fee-discount.service";
import type {
  AppliedFeeDiscount,
  FeeDiscountCandidate,
} from "../discount/fee-discount.engine";
import { remainingDiscountAllowanceFor } from "../discount/fee-discount.engine";
import {
  summarizeFeeDiscounts,
  sumFeeDiscounts,
} from "../discount/fee-discount-summary";

/**
 * Commission calculation result interface
 * Contains full details about the applied commission rule
 */
export type CommissionResult = CommissionCalculationResult;

export interface ShippingTariffSnapshot {
  tariffId: string;
  tariffVersion: number;
  tariff: OutboundTariffLike;
}

export interface CommissionRuleSetSnapshot {
  id: string;
  version: number;
}

export type CheckoutQuoteUnavailableItem = {
  productId: string;
  sellerId?: string;
  code: "PRODUCT_NOT_FOUND" | "PRODUCT_NOT_ACTIVE" | "SELLER_SALES_SUSPENDED";
  message: string;
};

/**
 * Checkout'ta gösterilecek ETKİN alıcı ücreti oranı (%).
 *
 * Oran sabit yazılamaz: kural setine göre değişir ve sepette farklı kategoriler
 * (dolayısıyla farklı oranlar) bulunabilir. Tek bir kuralın oranını göstermek
 * yanıltıcı olacağından tahsil edilen ücretin alt-toplama bölümü kullanılır —
 * gösterilen oran her zaman gösterilen tutarla tutarlı olur.
 *
 * Fee'nin hesaplandığı bazla aynı baz verilmelidir (kupon uygulanmışsa indirimli
 * alt-toplam), aksi halde alıcıya olduğundan küçük bir oran görünür.
 */
export function effectiveBuyerFeeRate(
  buyerFeeAmount: number,
  feeBasisSubtotal: number,
): number {
  if (!(feeBasisSubtotal > 0) || !(buyerFeeAmount > 0)) return 0;
  return Math.round((buyerFeeAmount / feeBasisSubtotal) * 100 * 100) / 100;
}

/**
 * Fiyatlandırma hesapları (kargo ücreti, komisyon, checkout quote) —
 * OrderService'ten birebir taşındı. OrderService aynı imzalarla buraya delege eder.
 */
@Injectable()
export class OrderPricingService {
  private readonly logger = new Logger(OrderPricingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly taxService: TaxService,
    private readonly shippingTariffs: ShippingTariffService,
    private readonly discountService: DiscountService,
    private readonly taxPolicy: OrderTaxPolicyService,
    @Optional()
    private readonly feeDiscounts?: OrderFeeDiscountService,
  ) {}

  /**
   * Calculate shipping cost for one package/order subtotal from the ACTIVE shipping
   * tariff (the single source of truth; replaces the old PlatformSetting keys). Free
   * over the tariff's threshold, else the flat per-package fee.
   */
  async calculateShippingCost(
    orderAmount: number,
    snapshotTariff?: OutboundTariffLike,
    billableDesi = 1,
  ): Promise<number> {
    const tariff =
      snapshotTariff ?? (await this.shippingTariffs.getActiveOutboundTariff());
    return this.shippingAmount(tariff, orderAmount, billableDesi);
  }

  /**
   * Satıcı-BAŞINA kargo: her satıcının kargosu KENDİ ürün alt-toplamına göre hesaplanır
   * (serbest-kargo eşiği satıcı bazında değerlendirilir), toplam = Σ. Sepette 2 satıcı
   * varsa 2 kargo, 3 değil.
   *
   * TEK KAYNAK (DRY): hem checkout QUOTE (önizleme) hem sipariş CREATE bu yardımcıyı
   * çağırır. Eskiden quote birleşik alt-toplamda TEK kargo, create satıcı-başına
   * hesaplıyordu → çoklu-satıcı sepette alıcıya AZ gösterilip FAZLA tahsil ediliyordu.
   * Ayarlar tek kez okunur (N satıcı için N sorgu yerine 1).
   */
  async calculateShippingBySeller(
    sellerSubtotals: Map<string, number>,
    snapshotTariff?: OutboundTariffLike,
    sellerDesi?: Map<string, number>,
  ): Promise<Map<string, number>> {
    const tariff =
      snapshotTariff ?? (await this.shippingTariffs.getActiveOutboundTariff());
    const out = new Map<string, number>();
    for (const [sellerId, subtotal] of sellerSubtotals) {
      out.set(
        sellerId,
        this.shippingAmount(tariff, subtotal, sellerDesi?.get(sellerId) ?? 1),
      );
    }
    return out;
  }

  private shippingAmount(
    tariff: OutboundTariffLike,
    subtotal: number,
    billableDesi: number,
  ): number {
    return this.guardTierConfig(() =>
      outboundPackageShipping(tariff, subtotal, billableDesi).toNumber(),
    );
  }

  /**
   * Bir satıcı paketinin kargo kararı (kademe → pay → bölüşüm) — ortak yardımcıyı
   * çağırır, yapılandırma hatasını HTTP'ye çevirir. Quote ve create yolları aynı
   * kararı bu tek noktadan alır.
   */
  resolveShippingDecision(params: {
    tariff: OutboundTariffLike;
    subtotal: number;
    billableDesi: number;
    lineShares: Array<ShippingBuyerShareByTier | null | undefined>;
    /** Ücretsiz kargo eşiği için KUPON ÖNCESİ tutar; verilmezse subtotal. */
    thresholdSubtotal?: number;
  }): ReturnType<typeof resolvePackageShippingDecision> {
    return this.guardTierConfig(() => resolvePackageShippingDecision(params));
  }

  /** Kademesiz tarife yapılandırma hatasıdır: fail-closed 503. */
  private guardTierConfig<T>(compute: () => T): T {
    try {
      return compute();
    } catch (error) {
      if (error instanceof ShippingPackageTiersNotConfiguredError) {
        throw new ServiceUnavailableException({
          code: "SHIPPING_PACKAGE_TIERS_NOT_CONFIGURED",
          message:
            "Aktif kargo tarifesinde paket boyutu fiyatları tanımlı değil.",
        });
      }
      throw error;
    }
  }

  /**
   * Resolve one immutable tariff snapshot for an entire checkout request. Every
   * shipping amount and OrderPackage snapshot in that request must use this object.
   */
  async resolveShippingTariffSnapshot(
    expectedVersion?: number | null,
    requireExpectedVersion = false,
  ): Promise<ShippingTariffSnapshot> {
    const snapshot = await this.shippingTariffs.getActiveTariffSnapshot();
    if (
      (requireExpectedVersion && expectedVersion == null) ||
      (expectedVersion != null && snapshot.tariffVersion !== expectedVersion)
    ) {
      throw new ConflictException(
        i18nMessage("server.shipping.pricingChanged"),
      );
    }
    return snapshot;
  }

  /**
   * Get free shipping info for frontend display
   */
  async getFreeShippingInfo(orderAmount: number): Promise<{
    isFreeShipping: boolean;
    shippingCost: number;
    threshold: number;
    amountToFreeShipping: number;
  }> {
    const tariff = await this.shippingTariffs.getActiveOutboundTariff();
    const shippingCost = outboundPackageShipping(
      tariff,
      orderAmount,
    ).toNumber();
    const threshold = Number(tariff.freeShippingThreshold);
    return {
      isFreeShipping: shippingCost === 0,
      shippingCost,
      threshold,
      amountToFreeShipping: tariff.freeShippingEnabled
        ? Math.max(0, threshold - orderAmount)
        : 0,
    };
  }

  /**
   * Get checkout quote (preview) for given items. Reuses same shipping and commission logic as order create.
   * Does not create any order; for display only. Final amounts are confirmed at order create.
   */
  async getCheckoutQuote(
    dto: CheckoutQuoteDto,
    userId: string | null = null,
  ): Promise<{
    itemsSubtotal: number;
    shippingAmount: number;
    buyerFeeAmount: number;
    sellerFeeAmount: number;
    commissionAmount: number;
    taxAmount: number;
    couponDiscount: number;
    /**
     * Platformun bu sepette verdiği BEDEL indirimleri — kalem bazında toplanmış
     * hâliyle. Alıcı tarafındaki satırlar ödenecek tutarı düşürür, satıcı
     * tarafındakiler satıcının hak edişini yükseltir; ekran ikisini de kaynağıyla
     * birlikte gösterebilsin diye ayrı taşınır.
     */
    feeDiscounts: Array<{
      target: string;
      name: string;
      code: string | null;
      amount: number;
      side: "buyer" | "seller";
    }>;
    buyerFeeDiscountTotal: number;
    sellerFeeDiscountTotal: number;
    totalAmount: number;
    sellerNetAmount: number;
    items: Array<{
      productId: string;
      sellerId: string;
      quantity: number;
      unitPrice: number;
      subtotal: number;
      buyerFeeAmount: number;
      sellerFeeAmount: number;
      sellerNetAmount: number;
      taxAmount: number;
      title?: string;
    }>;
    unavailableItems: CheckoutQuoteUnavailableItem[];
    // Satıcı-başına kargo kırılımı (sepetteki her satıcı için tek kargo). UI "çatı"
    // görünümü ve doğru toplam için; `shippingAmount` bunların toplamıdır.
    shippingBySeller: Array<{
      sellerId: string;
      shippingCost: number;
      billableDesi: number;
      /** Paketin çözülmüş boyutu — UI "Orta Paket" gibi gösterebilir. */
      packageTier: ShippingPackageTierCode;
    }>;
    // Aktif tarife sürümü — istemci order-create'e geri gönderir; sürüm değiştiyse
    // create 409 PRICING_CHANGED döner. Aktif tarife yoksa quote fail-closed davranır.
    shippingTariffVersion: number;
    commissionRuleSetId: string;
    commissionRuleSetVersion: number;
    // Birim fiyat bazının (efektif fiyatlar) stabil hash'i — istemci create'e geri
    // gönderir; ürün fiyatı/kampanya değiştiyse create 409 PRICING_CHANGED döner (F1.3).
    pricingHash: string;
    pricing: {
      subtotal: number;
      shippingAmount: number;
      buyerFeeAmount: number;
      /** Etkin alıcı ücreti oranı (%) — checkout etiketinde gösterilir. */
      buyerFeeRate: number;
      sellerFeeAmount: number;
      commissionAmount: number;
      taxAmount: number;
      buyerServiceTaxAmount: number;
      sellerServiceTaxAmount: number;
      serviceVatRate: number;
      totalAmount: number;
      sellerNetAmount: number;
      /** Sepet/checkout özetinin satırları, KDV DAHİL. */
      summary: {
        productAmount: number;
        shippingAmount: number;
        serviceFeeAmount: number;
        total: number;
        /**
         * Platformun bu sepette alıcıya verdiği bedel indirimleri. Ürün/kargo/
         * hizmet satırları ZATEN indirimli tutarı gösterir; bu satırlar
         * kazancın kaynağını ("komisyon indirimi", "kargo kampanyası") ayrıca
         * söyler, aksi halde indirim görünmeden erirdi.
         */
        feeDiscounts: Array<{
          target: string;
          name: string;
          code: string | null;
          amount: number;
        }>;
        feeDiscountTotal: number;
      };
    };
  }> {
    if (!dto.items?.length) {
      throw new BadRequestException(
        i18nMessage("server.order.atLeastOneProductRequired"),
      );
    }
    const shippingTariff = await this.resolveShippingTariffSnapshot();

    let itemsSubtotal = 0;
    let totalBuyerFee = 0;
    let totalSellerFee = 0;
    const quoteItems: Array<{
      productId: string;
      sellerId: string;
      quantity: number;
      unitPrice: number;
      subtotal: number;
      buyerFeeAmount: number;
      sellerFeeAmount: number;
      sellerNetAmount: number;
      taxAmount: number;
      title?: string;
    }> = [];
    const unavailableItems: CheckoutQuoteUnavailableItem[] = [];
    // Satıcı-başına kargo alt-toplamı (create ile aynı mantık — calculateShippingBySeller).
    const sellerSubtotals = new Map<string, number>();
    const sellerDesiLines = new Map<
      string,
      Array<{ shippingDesi: number; quantity: number }>
    >();
    // Kargo payı: satıcının kuralındaki alıcı payı (%). Create yolu ile aynı
    // bölüşüm; önizleme toplamı oluşan siparişle birebir eşleşsin.
    const sellerShippingShareLines = new Map<
      string,
      ShippingBuyerShareByTier[]
    >();
    /** Satıcı başına hizmet KDV matrahları (dört ücret kalemi). */
    const sellerFeeBases = new Map<
      string,
      {
        buyerCommissionAmount: number;
        buyerServiceFeeAmount: number;
        sellerCommissionAmount: number;
        sellerPlatformFeeAmount: number;
      }
    >();

    // Pass 1: ürünleri çöz + EFEKTİF (kampanya) birim fiyat + satır toplamı (F1.4).
    const lines: Array<{
      product: {
        id: string;
        title: string | null;
        sellerId: string;
        categoryId: string | null;
        shippingDesi: number;
        seller: {
          businessStatus: string | null;
          companyName: string | null;
          taxId: string | null;
          membership: {
            status: string;
            currentPeriodEnd: Date | null;
            tier: { type: string; isActive: boolean };
          } | null;
        } | null;
      };
      quantity: number;
      unitPrice: number;
      lineSubtotal: number;
      couponDiscount: number;
    }> = [];
    for (const { productId, quantity = 1 } of dto.items) {
      const product = await this.prisma.product.findUnique({
        where: { id: productId },
        select: {
          id: true,
          title: true,
          price: true,
          sellerId: true,
          categoryId: true,
          shippingDesi: true,
          kind: true,
          status: true,
          seller: {
            select: {
              businessStatus: true,
              companyName: true,
              taxId: true,
              membership: {
                select: {
                  status: true,
                  currentPeriodEnd: true,
                  tier: { select: { type: true, isActive: true } },
                },
              },
            },
          },
        },
      });

      if (!product || product.kind !== ProductKind.listing) {
        unavailableItems.push({
          productId,
          code: "PRODUCT_NOT_FOUND",
          message: `Ürün bulunamadı: ${productId}`,
        });
        continue;
      }
      if (product.status !== ProductStatus.active) {
        unavailableItems.push({
          productId,
          sellerId: product.sellerId,
          code: "PRODUCT_NOT_ACTIVE",
          message: `Ürün satışta değil: ${product.title || productId}`,
        });
        continue;
      }
      if (!canSellFromMembership(product.seller?.membership, product.seller)) {
        unavailableItems.push({
          productId,
          sellerId: product.sellerId,
          code: "SELLER_SALES_SUSPENDED",
          message:
            "Satıcının kurumsal üyeliği geçerli olmadığı için bu ürün şu anda satın alınamıyor.",
        });
        continue;
      }

      // Quote, checkout ile AYNI fiyat kuralını kullanmalı: indirim penceresi
      // dışındaysa taban indirim öncesi fiyattır. Ayrışırsa pricing hash'i
      // tutmaz ve alıcı 409 PRICING_CHANGED alır.
      const basePrice = resolveSalePrice(product).price;
      const campaignPrice = await this.discountService.getEffectiveDisplayPrice(
        product.id,
        product.sellerId,
        product.categoryId ?? "",
        basePrice,
      );
      const unitPrice = campaignPrice ?? basePrice;
      lines.push({
        product: {
          id: product.id,
          title: product.title,
          sellerId: product.sellerId,
          categoryId: product.categoryId,
          shippingDesi: product.shippingDesi,
          seller: product.seller,
        },
        quantity,
        unitPrice,
        lineSubtotal: unitPrice * quantity,
        couponDiscount: 0,
      });
    }

    // F1.1: kuponu quote'ta da uygula — YALNIZ uygun satırlara dağıt; fee/tax/kargo
    // İNDİRİMLİ baz üzerinden hesaplanır (create ile aynı) → önizleme = tahsilat.
    let couponDiscountTotal = 0;
    // Bedel hedefli kupon ürün tabanına dokunmaz; motora aday olarak geçer.
    let couponFeeCandidate: FeeDiscountCandidate | null = null;
    let couponEligibleIds = new Set<string>();
    if (dto.couponCode && lines.length > 0) {
      const validation = await this.discountService.validateCoupon(
        {
          code: dto.couponCode,
          cartItems: lines.map((l) => ({
            productId: l.product.id,
            quantity: l.quantity,
          })),
        },
        userId,
      );
      if (!validation.isValid) {
        throw new BadRequestException(
          validation.error || i18nMessage("server.order.invalidCouponCode"),
        );
      }
      if (validation.discount) {
        couponFeeCandidate =
          this.feeDiscounts?.couponCandidate(validation.discount) ?? null;
        const total = validation.discount.estimatedDiscount;
        const eligibleIds = new Set(validation.discount.eligibleProductIds);
        couponEligibleIds = eligibleIds;
        const eligibleLines = lines.filter((l) =>
          eligibleIds.has(l.product.id),
        );
        const eligiblePriceSum = eligibleLines.reduce(
          (s, l) => s + l.lineSubtotal,
          0,
        );
        if (eligiblePriceSum > 0) {
          let allocated = 0;
          eligibleLines.forEach((l, idx) => {
            if (idx === eligibleLines.length - 1) {
              l.couponDiscount = Math.round((total - allocated) * 100) / 100;
            } else {
              l.couponDiscount =
                Math.round(
                  ((total * l.lineSubtotal) / eligiblePriceSum) * 100,
                ) / 100;
              allocated += l.couponDiscount;
            }
          });
          couponDiscountTotal = total;
        }
      }
    }

    // Tek quote içindeki tüm satırlar aynı yayınlanmış setten fiyatlanır.
    const commissionRuleSet = await this.resolveCommissionRuleSetSnapshot();
    const pinnedRuleSetId = commissionRuleSet.id;

    // Bedel kampanyaları TEK kez yüklenir (satır başına sorgu yok) ve önizleme
    // tahsilatla aynı listeyi görür.
    const feeCampaigns = (await this.feeDiscounts?.preload()) ?? [];
    const appliedFeeDiscounts: AppliedFeeDiscount[] = [];
    const sellerLeadProduct = new Map<string, string>();
    const sellerLeadCategory = new Map<string, string | null>();
    // Toplam indirim tavanı: satır adımının kullanmadığı pay, aynı satıcının
    // paket (kargo) adımına devreder — kupon + tüm bedel kampanyaları birlikte
    // tavanı aşamaz.
    const sellerAllowanceLeft = new Map<string, number>();
    // Kupon ÖNCESİ satıcı alt-toplamları — yalnız ücretsiz kargo eşiği için.
    const sellerListSubtotals = new Map<string, number>();
    const buyerTier =
      (await this.feeDiscounts?.resolveBuyerTier(userId)) ?? null;

    // Pass 2: satır ücretleri İNDİRİMLİ baz üzerinden (create yolu ile birebir).
    for (const line of lines) {
      const { product, quantity, unitPrice, lineSubtotal } = line;
      const discountedLine = Math.max(0, lineSubtotal - line.couponDiscount);

      const rawCommissionResult = await this.calculateCommission(
        discountedLine,
        product.sellerId,
        product.categoryId,
        pinnedRuleSetId,
        quantity > 0 ? discountedLine / quantity : discountedLine,
        product.id,
      );
      // Komisyon/hizmet bedeli kampanyaları satır bazında; kargo kampanyası
      // aşağıda PAKET kararından sonra uygulanır (kargo satırın değil paketin).
      const lineAllowance = remainingDiscountAllowanceFor({
        lineBase: lineSubtotal,
        couponDiscount: line.couponDiscount,
      });
      const lineFeeResult = await this.feeDiscounts?.apply({
        context: {
          productId: product.id,
          categoryId: product.categoryId,
          sellerId: product.sellerId,
          buyerId: userId,
          buyerTier,
          quantity,
        },
        commission: rawCommissionResult,
        buyerShippingAmount: 0,
        sellerShippingAmount: 0,
        remainingAllowance: lineAllowance,
        preloaded: feeCampaigns,
        couponCandidates:
          couponFeeCandidate && couponEligibleIds.has(product.id)
            ? [couponFeeCandidate]
            : [],
      });
      appliedFeeDiscounts.push(...(lineFeeResult?.applied ?? []));
      sellerAllowanceLeft.set(
        product.sellerId,
        (sellerAllowanceLeft.get(product.sellerId) ?? 0) +
          Math.max(
            0,
            lineAllowance -
              ((lineFeeResult?.buyerTotal ?? 0) +
                (lineFeeResult?.sellerTotal ?? 0)),
          ),
      );
      const commissionResult = lineFeeResult?.commission ?? rawCommissionResult;

      // Paket payı satır sırasından BAĞIMSIZ olmalı ve paketin KADEMESİNE göre
      // seçilmeli: satırın üç kademelik pay haritasını topla, kademe çözüldükten
      // sonra ortak karar (resolvePackageShippingDecision) indirgemeyi yapsın.
      sellerShippingShareLines.set(product.sellerId, [
        ...(sellerShippingShareLines.get(product.sellerId) ?? []),
        commissionResult.shippingBuyerShares,
      ]);
      // Hizmet KDV'si matrahı satıcı (yani oluşacak sipariş) bazında toplanır:
      // KDV her siparişte kalem bazında yuvarlandığı için quote da aynı
      // gruplamayı kullanmalı, aksi halde kuruş sapar.
      const feeBases = sellerFeeBases.get(product.sellerId) ?? {
        buyerCommissionAmount: 0,
        buyerServiceFeeAmount: 0,
        sellerCommissionAmount: 0,
        sellerPlatformFeeAmount: 0,
      };
      feeBases.buyerCommissionAmount += commissionResult.buyerCommissionAmount;
      feeBases.buyerServiceFeeAmount += commissionResult.buyerServiceFeeAmount;
      feeBases.sellerCommissionAmount +=
        commissionResult.sellerCommissionAmount;
      feeBases.sellerPlatformFeeAmount +=
        commissionResult.sellerPlatformFeeAmount;
      sellerFeeBases.set(product.sellerId, feeBases);

      const lineBuyerFee = commissionResult.buyerFeeAmount;
      const lineSellerFee = commissionResult.sellerFeeAmount;
      const lineSellerNet = discountedLine - lineSellerFee;

      itemsSubtotal += lineSubtotal;
      totalBuyerFee += lineBuyerFee;
      totalSellerFee += lineSellerFee;
      sellerSubtotals.set(
        product.sellerId,
        (sellerSubtotals.get(product.sellerId) ?? 0) + discountedLine,
      );
      // Ücretsiz kargo eşiği kupon ÖNCESİ tutardan denetlenir (İ14): kupon,
      // kazanılmış ücretsiz kargoyu geri alamaz.
      sellerListSubtotals.set(
        product.sellerId,
        (sellerListSubtotals.get(product.sellerId) ?? 0) + lineSubtotal,
      );
      const desiLines = sellerDesiLines.get(product.sellerId) ?? [];
      desiLines.push({ shippingDesi: product.shippingDesi, quantity });
      sellerDesiLines.set(product.sellerId, desiLines);
      // Kargo kampanyasının kapsam eşleşmesi paketin İLK satırından okunur:
      // koli tek bedel taşır, satır bazında kargo indirimi anlamsızdır.
      if (!sellerLeadProduct.has(product.sellerId)) {
        sellerLeadProduct.set(product.sellerId, product.id);
        sellerLeadCategory.set(product.sellerId, product.categoryId ?? null);
      }

      quoteItems.push({
        productId: product.id,
        sellerId: product.sellerId,
        quantity,
        unitPrice,
        subtotal: lineSubtotal,
        buyerFeeAmount: lineBuyerFee,
        sellerFeeAmount: lineSellerFee,
        sellerNetAmount: Math.max(0, lineSellerNet),
        taxAmount: 0,
        title: product.title ?? undefined,
      });
    }

    // Satıcı-BAŞINA kargo: paket desisi → kademe → o kademenin payı → bölüşüm.
    // Create yolları ile ORTAK karar (resolvePackageShippingDecision) kullanılır ki
    // önizleme ile tahsilat birebir kalsın.
    const sellerDesi = new Map(
      [...sellerDesiLines.entries()].map(([sellerId, packageLines]) => [
        sellerId,
        calculatePackageDesi(packageLines),
      ]),
    );
    const shippingBySeller = await Promise.all(
      [...sellerSubtotals.entries()].map(async ([sellerId, subtotal]) => {
        const billableDesi = sellerDesi.get(sellerId) ?? 1;
        const decision = this.resolveShippingDecision({
          tariff: shippingTariff.tariff,
          subtotal,
          billableDesi,
          lineShares: sellerShippingShareLines.get(sellerId) ?? [],
          thresholdSubtotal: sellerListSubtotals.get(sellerId) ?? subtotal,
        });
        // Kargo kampanyası PAKET kararından sonra uygulanır: kargo satırın değil
        // kolinin bedelidir (ücretsiz kargo eşiği de aynı kararın parçasıdır).
        const shippingDiscounted = (await this.feeDiscounts?.applyShipping({
          context: {
            productId: sellerLeadProduct.get(sellerId) ?? "",
            categoryId: sellerLeadCategory.get(sellerId) ?? null,
            sellerId,
            buyerId: userId,
            buyerTier,
          },
          buyerShippingAmount: decision.buyer,
          sellerShippingAmount: decision.seller,
          remainingAllowance: sellerAllowanceLeft.get(sellerId) ?? 0,
          preloaded: feeCampaigns,
          couponCandidates:
            couponFeeCandidate &&
            couponEligibleIds.has(sellerLeadProduct.get(sellerId) ?? "")
              ? [couponFeeCandidate]
              : [],
        })) ?? {
          buyerShippingAmount: decision.buyer,
          sellerShippingAmount: decision.seller,
          applied: [] as AppliedFeeDiscount[],
        };
        appliedFeeDiscounts.push(...(shippingDiscounted.applied ?? []));
        return {
          sellerId,
          // Alıcı yalnız kendi payını öder; kalanı satıcı üstlenir.
          shippingCost: shippingDiscounted.buyerShippingAmount,
          sellerShippingCost: shippingDiscounted.sellerShippingAmount,
          billableDesi,
          packageTier: decision.tierCode,
        };
      }),
    );
    const shippingAmount = shippingBySeller.reduce(
      (sum, s) => sum + s.shippingCost,
      0,
    );
    const commissionAmount = totalBuyerFee + totalSellerFee;

    // Hizmet KDV'si: satıcı başına (= oluşacak sipariş başına) hesaplanır ve
    // toplanır. Quote bunu ATLARSA ekranda görülen tutar tahsil edilenden
    // düşük kalır — checkout ile create'in ayrıştığı yer tam burasıydı.
    const serviceVatRate = this.taxPolicy.effectiveServiceVatRate(
      await this.taxPolicy.resolve(),
    );
    let totalBuyerServiceTax = 0;
    let totalSellerServiceTax = 0;
    for (const seller of shippingBySeller) {
      const bases = sellerFeeBases.get(seller.sellerId);
      if (!bases) continue;
      const { buyerServiceTaxAmount, sellerServiceTaxAmount } =
        calculateServiceTax(
          {
            ...bases,
            buyerShippingAmount: seller.shippingCost,
            sellerShippingAmount: seller.sellerShippingCost,
          },
          serviceVatRate,
        );
      totalBuyerServiceTax += buyerServiceTaxAmount;
      totalSellerServiceTax += sellerServiceTaxAmount;
    }
    totalBuyerServiceTax = Math.round(totalBuyerServiceTax * 100) / 100;
    totalSellerServiceTax = Math.round(totalSellerServiceTax * 100) / 100;

    // Toplam ORTAK formülden gelir (order-total.helper.ts) — quote kendi
    // aritmetiğini yazmaz.
    const totalAmount = buyerTotalOf({
      subtotal: itemsSubtotal - couponDiscountTotal,
      buyerShippingAmount: shippingAmount,
      buyerFeeAmount: totalBuyerFee,
      buyerServiceTaxAmount: totalBuyerServiceTax,
    });
    const sellerNetAmount = Math.max(
      0,
      itemsSubtotal - couponDiscountTotal - totalSellerFee,
    );
    const pricingHash = this.computePricingHash(
      lines.map((l) => ({
        productId: l.product.id,
        unitPrice: l.unitPrice,
        quantity: l.quantity,
        shippingDesi: l.product.shippingDesi,
      })),
    );

    const pricing = {
      subtotal: itemsSubtotal,
      shippingAmount,
      buyerFeeAmount: totalBuyerFee,
      // Fee, kupon sonrası indirimli baz üzerinden hesaplandı → oran da o bazla.
      buyerFeeRate: effectiveBuyerFeeRate(
        totalBuyerFee,
        itemsSubtotal - couponDiscountTotal,
      ),
      sellerFeeAmount: totalSellerFee,
      commissionAmount,
      // Ürün KDV'si kaldırıldı — alan geriye-uyum için 0 döner.
      taxAmount: 0,
      // Alıcıdan tahsil edilen hizmet KDV'si + uygulanan oran. Checkout ekranı
      // kalemleri KDV DAHİL gösterebilsin diye döner: satırların toplamı
      // ödenecek tutarı birebir vermeli.
      buyerServiceTaxAmount: totalBuyerServiceTax,
      sellerServiceTaxAmount: totalSellerServiceTax,
      serviceVatRate,
      totalAmount,
      sellerNetAmount,
      // Ekranın GÖSTERDİĞİ satırlar — sepet ve checkout bunları olduğu gibi
      // basar, kendileri hesap yapmaz. Üç satırın toplamı totalAmount'a eşittir.
      //
      // Kargo satırı TARİFEDEN gelen sabit tutardır (alıcının payı), KDV'siz.
      // Hizmet KDV'sinin TAMAMI — kargonunki dahil — hizmet bedeli satırına
      // yazılır: alıcı için kargo pazarlık edilen sabit bir kalem, vergi ise
      // platformun hizmetine ait tek bir kalemdir.
      summary: {
        feeDiscounts: summarizeFeeDiscounts(appliedFeeDiscounts)
          .filter((line) => line.side === "buyer")
          .map(({ target, name, code, amount }) => ({
            target,
            name,
            code,
            amount,
          })),
        feeDiscountTotal: sumFeeDiscounts(appliedFeeDiscounts, "buyer"),
        productAmount:
          Math.round((itemsSubtotal - couponDiscountTotal) * 100) / 100,
        shippingAmount: Math.round(shippingAmount * 100) / 100,
        serviceFeeAmount:
          Math.round((totalBuyerFee + totalBuyerServiceTax) * 100) / 100,
        total: totalAmount,
      },
    };

    return {
      itemsSubtotal,
      shippingAmount,
      buyerFeeAmount: totalBuyerFee,
      sellerFeeAmount: totalSellerFee,
      commissionAmount,
      // Ürün KDV'si kaldırıldı — alan geriye-uyum için 0 döner.
      taxAmount: 0,
      couponDiscount: couponDiscountTotal,
      // Aynı kampanya birden çok satıra indiği için kalem+kampanya bazında
      // toplanır: ekran "komisyon indirimi −36 TL" gibi TEK satır gösterir.
      feeDiscounts: summarizeFeeDiscounts(appliedFeeDiscounts),
      buyerFeeDiscountTotal: sumFeeDiscounts(appliedFeeDiscounts, "buyer"),
      sellerFeeDiscountTotal: sumFeeDiscounts(appliedFeeDiscounts, "seller"),
      totalAmount,
      sellerNetAmount,
      items: quoteItems,
      unavailableItems,
      shippingBySeller,
      shippingTariffVersion: shippingTariff.tariffVersion,
      commissionRuleSetId: commissionRuleSet.id,
      commissionRuleSetVersion: commissionRuleSet.version,
      pricingHash,
      pricing,
    };
  }

  /**
   * Stable, user-INDEPENDENT hash of the charged unit prices (effective/campaign
   * prices) — the basis a quote was built on. The client echoes it into order-create;
   * if a product price or campaign moved since the quote, the recomputed hash differs
   * and create returns 409 PRICING_CHANGED (never a silent different charge). Excludes
   * the coupon (user-dependent — the @Public quote can't know the user) and fees
   * (config-derived, recomputed identically on both sides).
   */
  computePricingHash(
    items: Array<{
      productId: string;
      unitPrice: number;
      quantity: number;
      shippingDesi?: number;
    }>,
  ): string {
    const basis = items
      .map(
        (i) =>
          `${i.productId}:${i.unitPrice.toFixed(2)}:${i.quantity}:${i.shippingDesi ?? 1}`,
      )
      .sort()
      .join("|");
    return createHash("sha256").update(basis).digest("hex").slice(0, 16);
  }

  /**
   * 409 PRICING_CHANGED guard generalized beyond shipping (F1.3). If the client passed
   * the pricing hash its quote was built on and the current charged unit prices no
   * longer hash to it (a product price / campaign moved), refuse create so the buyer
   * re-confirms. A missing hash is also rejected: order creation cannot bypass quote
   * confirmation by omitting the field.
   */
  assertPricingUnchanged(
    expectedHash: string | undefined | null,
    items: Array<{
      productId: string;
      unitPrice: number;
      quantity: number;
      shippingDesi?: number;
    }>,
  ): void {
    if (!expectedHash || this.computePricingHash(items) !== expectedHash) {
      throw new ConflictException(
        i18nMessage("server.shipping.pricingChanged"),
      );
    }
  }

  /**
   * Commission preview for listing create/edit. Given a price amount and optional category, returns estimated fees.
   * Used when product does not exist yet (e.g. seller entering price on create form). Reuses same logic as order/quote.
   */
  /** E-ticaret stopaj oranı (%) — PlatformSetting 'withholding_tax_rate', varsayılan %1 (9284 sayılı CK). */
  private async getWithholdingTaxRate(): Promise<number> {
    const row = await this.prisma.platformSetting.findUnique({
      where: { settingKey: "withholding_tax_rate" },
    });
    const rate = Number(row?.settingValue ?? "1");
    return Number.isFinite(rate) && rate >= 0 ? rate : 1;
  }

  async getCommissionPreview(
    amount: number,
    sellerId: string,
    categoryId?: string | null,
    shippingDesi = 1,
    pinnedRuleSetId?: string,
  ): Promise<{
    sellerFeeAmount: number;
    buyerFeeAmount: number;
    commissionAmount: number;
    withholdingTaxAmount: number;
    fullShippingAmount: number;
    buyerShippingAmount: number;
    sellerShippingAmount: number;
    shippingAmount: number;
    sellerNetAmount: number;
    /** Satıcıya verilen hizmetlerin KDV'si — payout'tan kesilir. */
    sellerServiceTaxAmount: number;
    /** Alıcıya verilen hizmetlerin KDV'si — alıcının ödediğine eklenir. */
    buyerServiceTaxAmount: number;
    shippingDesi: number;
    /** Desiden çözülen paket boyutu — UI "Orta Paket" gibi gösterebilir. */
    packageTier: ShippingPackageTierCode;
  }> {
    const [result, seller, tariff] = await Promise.all([
      this.calculateCommission(amount, sellerId, categoryId, pinnedRuleSetId),
      this.prisma.user.findUnique({
        where: { id: sellerId },
        select: { businessStatus: true, taxId: true },
      }),
      this.shippingTariffs.getActiveOutboundTariff(),
    ]);
    // Kargo kararı checkout yollarıyla ORTAK: kademe desiden çözülür, pay O
    // kademenin payıdır. Eskiden burada kuralın tek `shippingBuyerShare` değeri
    // (ilk kademenin payı) kullanılıyordu — kademe bazlı pay yapılandırıldığında
    // orta/büyük paketli ilanın önizlemesi tahsilattan sapıyordu.
    const decision = this.resolveShippingDecision({
      tariff,
      subtotal: amount,
      billableDesi: shippingDesi,
      lineShares: [result.shippingBuyerShares],
    });
    const {
      fullShipping: fullShippingAmount,
      buyer: buyerShippingAmount,
      seller: sellerShippingAmount,
    } = decision;
    // Stopaj + hizmet KDV'si önizlemede de düşülür ki gerçek payout ile eşleşsin.
    const policy = await this.taxPolicy.resolve();
    const isCorporate =
      seller?.businessStatus === "approved" && !!seller?.taxId;
    const withholdingRate = this.taxPolicy.withholdingRateFor(policy, {
      isCorporate,
    });
    const withholdingTaxAmount =
      withholdingRate > 0 ? Math.round(amount * withholdingRate) / 100 : 0;
    const { sellerServiceTaxAmount, buyerServiceTaxAmount } =
      calculateServiceTax(
        {
          buyerCommissionAmount: result.buyerCommissionAmount,
          buyerServiceFeeAmount: result.buyerServiceFeeAmount,
          buyerShippingAmount,
          sellerCommissionAmount: result.sellerCommissionAmount,
          sellerPlatformFeeAmount: result.sellerPlatformFeeAmount,
          sellerShippingAmount,
        },
        this.taxPolicy.effectiveServiceVatRate(policy),
      );
    const sellerNetAmount = sellerNetAmountOf({
      subtotal: amount,
      // Ürün KDV'si önizlemede modellenmiyor (varsayılan kapalı); açıldığında
      // checkout tarafı hesaplar ve net'e aktarır.
      productTaxAmount: 0,
      sellerFeeAmount: result.sellerFeeAmount,
      withholdingTaxAmount,
      sellerShippingAmount,
      sellerServiceTaxAmount,
    });
    return {
      sellerFeeAmount: result.sellerFeeAmount,
      buyerFeeAmount: result.buyerFeeAmount,
      commissionAmount: result.commissionAmount,
      withholdingTaxAmount,
      fullShippingAmount,
      buyerShippingAmount,
      sellerShippingAmount,
      // Listing UI compatibility: this line is the shipping deducted from seller.
      shippingAmount: sellerShippingAmount,
      sellerNetAmount,
      // Hizmet KDV'si — ilan formu "kesintiler" dökümünde gösterilir.
      sellerServiceTaxAmount,
      buyerServiceTaxAmount,
      shippingDesi,
      packageTier: decision.tierCode,
    };
  }

  /**
   * Batch commission preview for multiple (amount, categoryId, packageTier)
   * tuples. Same order as input. Paket boyutu verilmeyen kalem küçük paket
   * sayılır — desi tek preview ucundakiyle AYNI haritadan türetilir ki liste
   * görünümü ile ilan formu aynı sonucu göstersin.
   */
  async getCommissionPreviewBatch(
    sellerId: string,
    items: Array<{
      amount: number;
      categoryId?: string | null;
      packageTier?: ShippingPackageTierCode | null;
    }>,
  ): Promise<{
    results: Array<{ sellerFeeAmount: number; sellerNetAmount: number }>;
  }> {
    const pinnedRuleSetId = await this.getActiveCommissionRuleSetId();
    const results = await Promise.all(
      items.map(async (item) => {
        const amount = Number(item.amount);
        if (Number.isNaN(amount) || amount < 0) {
          return { sellerFeeAmount: 0, sellerNetAmount: amount };
        }
        const preview = await this.getCommissionPreview(
          amount,
          sellerId,
          item.categoryId ?? null,
          billableDesiForTier(
            item.packageTier ?? ShippingPackageTierCode.small,
          ),
          pinnedRuleSetId,
        );
        return {
          sellerFeeAmount: preview.sellerFeeAmount,
          sellerNetAmount: preview.sellerNetAmount,
        };
      }),
    );
    return { results };
  }

  /** Aktif seti tek bir fiyatlandırma isteği boyunca sabitler ve stale quote'u reddeder. */
  async resolveCommissionRuleSetSnapshot(
    expectedId?: string | null,
    expectedVersion?: number | null,
    requireExpected = false,
  ): Promise<CommissionRuleSetSnapshot> {
    const active = await this.prisma.commissionRuleSet.findFirst({
      where: { status: CommissionRuleSetStatus.ACTIVE },
      select: { id: true, version: true },
    });
    if (!active) {
      this.logger.error("No active commission rule set. Failing closed.");
      throw new ServiceUnavailableException(
        i18nMessage("server.commission.noRuleConfigured"),
      );
    }
    if (
      (requireExpected && (expectedId == null || expectedVersion == null)) ||
      (expectedId != null && active.id !== expectedId) ||
      (expectedVersion != null && active.version !== expectedVersion)
    ) {
      throw new ConflictException({
        code: "COMMISSION_PRICING_CHANGED",
        message: i18nMessage("server.commission.pricingChanged"),
      });
    }
    return active;
  }

  async getActiveCommissionRuleSetId(): Promise<string> {
    return (await this.resolveCommissionRuleSetSnapshot()).id;
  }

  /** Exact category + seller type + half-open price band; no fallback. */
  async calculateCommission(
    amount: number,
    sellerId: string,
    categoryId?: string | null,
    pinnedRuleSetId?: string,
    matchAmount = amount,
    productId?: string,
  ): Promise<CommissionResult> {
    if (!categoryId) {
      this.logger.error(
        `Commission category is required (amount=${amount} seller=${sellerId}). Failing closed.`,
      );
      throw new ServiceUnavailableException(
        i18nMessage("server.commission.noRuleConfigured"),
      );
    }

    // Get seller info including membership tier
    const seller = await this.prisma.user.findUnique({
      where: { id: sellerId },
      select: {
        sellerType: true,
        businessStatus: true,
        companyName: true,
        taxId: true,
        membership: {
          select: {
            status: true,
            currentPeriodEnd: true,
            tier: {
              select: { type: true, isActive: true },
            },
          },
        },
      },
    });

    if (!seller) {
      throw new ServiceUnavailableException(
        i18nMessage("server.commission.noRuleConfigured"),
      );
    }

    if (!canSellFromMembership(seller.membership, seller)) {
      this.logger.warn(
        `Selling suspended seller=${sellerId}: corporate sale requirements are not active`,
      );
      throw new ConflictException({
        code: "SELLER_SALES_SUSPENDED",
        productId,
        sellerId,
        message: i18nMessage("server.commission.sellerSalesSuspended"),
      });
    }

    const effectiveTierType = effectiveMembershipTierType(
      seller.membership,
      seller,
    );
    let commissionSellerType;
    try {
      commissionSellerType = resolveCommissionSellerType({
        userSellerType: seller.sellerType,
        membershipTier: effectiveTierType,
        configuredMembershipTier: seller.membership?.tier.type,
        businessStatus: seller.businessStatus,
        companyName: seller.companyName,
        taxId: seller.taxId,
      });
    } catch (error) {
      if (error instanceof CorporateSellingSuspendedError) {
        this.logger.warn(
          `Corporate selling suspended seller=${sellerId}: BUSINESS entitlement is not active`,
        );
        throw new ConflictException({
          code: "SELLER_SALES_SUSPENDED",
          productId,
          sellerId,
          message: i18nMessage("server.commission.sellerSalesSuspended"),
        });
      }
      if (error instanceof CommissionSellerConfigurationError) {
        this.logger.error(
          `Invalid seller commission state seller=${sellerId}: ${error.message}`,
        );
        throw new ServiceUnavailableException(
          i18nMessage("server.commission.noRuleConfigured"),
        );
      }
      throw error;
    }

    const ruleSetId =
      pinnedRuleSetId ?? (await this.getActiveCommissionRuleSetId());
    const normalizedMatchAmount = roundCommissionMatchAmount(matchAmount);
    const matchingRules = await this.prisma.commissionRule.findMany({
      where: {
        ruleSetId,
        categoryId,
        sellerType: commissionSellerType,
        minAmount: { lte: normalizedMatchAmount },
        OR: [{ maxAmount: null }, { maxAmount: { gt: normalizedMatchAmount } }],
      },
      include: { shippingShares: true },
    });

    let result: CommissionCalculationResult;
    try {
      result = calculateCommissionFromRules(
        amount,
        matchingRules,
        {
          categoryId,
          sellerType: commissionSellerType,
          amount: normalizedMatchAmount,
        },
        this.logger,
      );
    } catch (error) {
      if (!(error instanceof CommissionRuleMatchError)) throw error;
      this.logger.error(
        `Strict commission rule invariant failed set=${ruleSetId}: ${error.message}`,
      );
      throw new ServiceUnavailableException(
        i18nMessage("server.commission.noRuleConfigured"),
      );
    }

    this.logger.log(
      `Commission: set=${ruleSetId} rule=${result.ruleId} amount=${amount} ` +
        `sellerFee=${result.sellerFeeAmount} buyerFee=${result.buyerFeeAmount}`,
    );

    return {
      ...result,
      effectiveMembershipTier: effectiveTierType,
      taxpayerType:
        seller.businessStatus === "approved" && seller.taxId
          ? "corporate"
          : "individual",
    };
  }
}
