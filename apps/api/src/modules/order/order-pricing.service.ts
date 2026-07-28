import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { i18nMessage } from "../i18n";
import { CheckoutQuoteDto } from "./dto";
import { ProductStatus } from "@prisma/client";
import {
  calculateCommissionFromRules,
  CommissionCalculationResult,
  mapSellerTypeForCommission,
  resolveTaxpayerType,
} from "./order-commission.helper";
import { TaxService } from "../tax/tax.service";
import { isPremiumEntitled } from "../membership/membership.util";
import { ShippingTariffService } from "../shipping/shipping-tariff.service";
import { outboundPackageShipping } from "../shipping/shipping-tariff.helper";
import { DiscountService } from "../discount/discount.service";
import { createHash } from "crypto";

/**
 * Commission calculation result interface
 * Contains full details about the applied commission rule
 */
export type CommissionResult = CommissionCalculationResult;

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
  ) {}

  /**
   * Calculate shipping cost for one package/order subtotal from the ACTIVE shipping
   * tariff (the single source of truth; replaces the old PlatformSetting keys). Free
   * over the tariff's threshold, else the flat per-package fee.
   */
  async calculateShippingCost(orderAmount: number): Promise<number> {
    const tariff = await this.shippingTariffs.getActiveOutboundTariff();
    return outboundPackageShipping(tariff, orderAmount).toNumber();
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
  ): Promise<Map<string, number>> {
    const tariff = await this.shippingTariffs.getActiveOutboundTariff();
    const out = new Map<string, number>();
    for (const [sellerId, subtotal] of sellerSubtotals) {
      out.set(sellerId, outboundPackageShipping(tariff, subtotal).toNumber());
    }
    return out;
  }

  /**
   * Active shipping-tariff snapshot metadata (id/version) to stamp onto the
   * OrderPackage at order-create, so the charged shipping can be tied to the exact
   * tariff version and audited/re-quoted (409) even after the tariff changes.
   */
  async getShippingTariffMeta(): Promise<{
    tariffId: string | null;
    tariffVersion: number | null;
  }> {
    const s = await this.shippingTariffs.getActiveTariffSnapshot();
    return { tariffId: s.tariffId, tariffVersion: s.tariffVersion };
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
  async getCheckoutQuote(dto: CheckoutQuoteDto): Promise<{
    itemsSubtotal: number;
    shippingAmount: number;
    buyerFeeAmount: number;
    sellerFeeAmount: number;
    commissionAmount: number;
    taxAmount: number;
    couponDiscount: number;
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
    // Satıcı-başına kargo kırılımı (sepetteki her satıcı için tek kargo). UI "çatı"
    // görünümü ve doğru toplam için; `shippingAmount` bunların toplamıdır.
    shippingBySeller: Array<{ sellerId: string; shippingCost: number }>;
    // Aktif tarife sürümü — istemci order-create'e geri gönderir; sürüm değiştiyse
    // create 409 PRICING_CHANGED döner (sessiz farklı tahsil yok). Aktif tarife yoksa null.
    shippingTariffVersion: number | null;
    // Birim fiyat bazının (efektif fiyatlar) stabil hash'i — istemci create'e geri
    // gönderir; ürün fiyatı/kampanya değiştiyse create 409 PRICING_CHANGED döner (F1.3).
    pricingHash: string;
    pricing: {
      subtotal: number;
      shippingAmount: number;
      buyerFeeAmount: number;
      sellerFeeAmount: number;
      commissionAmount: number;
      taxAmount: number;
      totalAmount: number;
      sellerNetAmount: number;
    };
  }> {
    if (!dto.items?.length) {
      throw new BadRequestException(
        i18nMessage("server.order.atLeastOneProductRequired"),
      );
    }

    let itemsSubtotal = 0;
    let totalBuyerFee = 0;
    let totalSellerFee = 0;
    let totalTax = 0;
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
    // Satıcı-başına kargo alt-toplamı (create ile aynı mantık — calculateShippingBySeller).
    const sellerSubtotals = new Map<string, number>();
    // Kargo payı: satıcının kuralındaki alıcı payı (%). Create yolu ile aynı
    // bölüşüm; önizleme toplamı oluşan siparişle birebir eşleşsin.
    const sellerShippingShare = new Map<string, number>();

    // Pass 1: ürünleri çöz + EFEKTİF (kampanya) birim fiyat + satır toplamı (F1.4).
    const lines: Array<{
      product: {
        id: string;
        title: string | null;
        sellerId: string;
        categoryId: string | null;
        seller: { businessStatus: string | null; taxId: string | null } | null;
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
          status: true,
          seller: { select: { businessStatus: true, taxId: true } },
        },
      });

      if (!product) {
        throw new NotFoundException(
          i18nMessage("server.order.productNotFoundById", { productId }),
        );
      }
      if (product.status !== ProductStatus.active) {
        throw new BadRequestException(
          i18nMessage("server.order.productNotActiveByTitle", {
            title: product.title || productId,
          }),
        );
      }

      const basePrice = Number(product.price);
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
    // userId=null (quote @Public'tir): per-user limitli kupon burada atlanır, checkout
    // uygular (önizleme fazla gösterir — güvenli yön, fazla tahsil değil).
    let couponDiscountTotal = 0;
    if (dto.couponCode) {
      const validation = await this.discountService.validateCoupon(
        {
          code: dto.couponCode,
          cartItems: lines.map((l) => ({
            productId: l.product.id,
            quantity: l.quantity,
          })),
        },
        null,
      );
      if (validation.isValid && validation.discount) {
        const total = validation.discount.estimatedDiscount;
        const eligibleIds = new Set(validation.discount.eligibleProductIds);
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

    // Pass 2: satır ücretleri İNDİRİMLİ baz üzerinden (create yolu ile birebir).
    for (const line of lines) {
      const { product, quantity, unitPrice, lineSubtotal } = line;
      const discountedLine = Math.max(0, lineSubtotal - line.couponDiscount);

      const commissionResult = await this.calculateCommission(
        discountedLine,
        product.sellerId,
        product.categoryId,
      );

      sellerShippingShare.set(
        product.sellerId,
        commissionResult.shippingBuyerShare,
      );
      const lineBuyerFee = commissionResult.buyerFeeAmount;
      const lineSellerFee = commissionResult.sellerFeeAmount;
      const lineSellerNet = discountedLine - lineSellerFee;

      // KDV: sadece kurumsal satıcılar (businessStatus=approved ve taxId dolu)
      const isCorporate =
        product.seller?.businessStatus === "approved" &&
        !!product.seller?.taxId;
      let lineTax = 0;
      if (isCorporate) {
        const resolved = await this.taxService.resolveTaxRate(
          "TR",
          null,
          product.categoryId,
        );
        lineTax = resolved
          ? this.taxService.calculateTaxAmount(discountedLine, resolved)
          : 0;
      }

      itemsSubtotal += lineSubtotal;
      totalBuyerFee += lineBuyerFee;
      totalSellerFee += lineSellerFee;
      totalTax += lineTax;
      sellerSubtotals.set(
        product.sellerId,
        (sellerSubtotals.get(product.sellerId) ?? 0) + discountedLine,
      );

      quoteItems.push({
        productId: product.id,
        sellerId: product.sellerId,
        quantity,
        unitPrice,
        subtotal: lineSubtotal,
        buyerFeeAmount: lineBuyerFee,
        sellerFeeAmount: lineSellerFee,
        sellerNetAmount: Math.max(0, lineSellerNet),
        taxAmount: lineTax,
        title: product.title ?? undefined,
      });
    }

    // Satıcı-BAŞINA kargo (create ile ortak yardımcı) → çoklu-satıcı sepette doğru toplam.
    const shippingMap = await this.calculateShippingBySeller(sellerSubtotals);
    // Alıcı yalnız kendi kargo payını öder (create yolundaki yuvarlamayla birebir).
    // buyerShare=100 → tam kargo (mevcut davranış korunur).
    const shippingBySeller = [...shippingMap.entries()].map(
      ([sellerId, fullShipping]) => {
        const share = sellerShippingShare.get(sellerId) ?? 100;
        const buyerShipping =
          Math.round(fullShipping * (share / 100) * 100) / 100;
        return { sellerId, shippingCost: buyerShipping };
      },
    );
    const shippingAmount = shippingBySeller.reduce(
      (sum, s) => sum + s.shippingCost,
      0,
    );
    const commissionAmount = totalBuyerFee + totalSellerFee;
    // Toplam = brüt ürün toplamı − kupon + kargo + alıcı ücreti + vergi (create ile
    // birebir; fee/tax zaten indirimli baz üzerinden hesaplandı).
    const totalAmount =
      itemsSubtotal -
      couponDiscountTotal +
      shippingAmount +
      totalBuyerFee +
      totalTax;
    const sellerNetAmount = Math.max(
      0,
      itemsSubtotal - couponDiscountTotal - totalSellerFee,
    );
    const { tariffVersion } = await this.getShippingTariffMeta();
    const pricingHash = this.computePricingHash(
      lines.map((l) => ({
        productId: l.product.id,
        unitPrice: l.unitPrice,
        quantity: l.quantity,
      })),
    );

    const pricing = {
      subtotal: itemsSubtotal,
      shippingAmount,
      buyerFeeAmount: totalBuyerFee,
      sellerFeeAmount: totalSellerFee,
      commissionAmount,
      taxAmount: totalTax,
      totalAmount,
      sellerNetAmount,
    };

    return {
      itemsSubtotal,
      shippingAmount,
      buyerFeeAmount: totalBuyerFee,
      sellerFeeAmount: totalSellerFee,
      commissionAmount,
      taxAmount: totalTax,
      couponDiscount: couponDiscountTotal,
      totalAmount,
      sellerNetAmount,
      items: quoteItems,
      shippingBySeller,
      shippingTariffVersion: tariffVersion,
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
    items: Array<{ productId: string; unitPrice: number; quantity: number }>,
  ): string {
    const basis = items
      .map((i) => `${i.productId}:${i.unitPrice.toFixed(2)}:${i.quantity}`)
      .sort()
      .join("|");
    return createHash("sha256").update(basis).digest("hex").slice(0, 16);
  }

  /**
   * 409 PRICING_CHANGED guard generalized beyond shipping (F1.3). If the client passed
   * the pricing hash its quote was built on and the current charged unit prices no
   * longer hash to it (a product price / campaign moved), refuse create so the buyer
   * re-confirms. No expected hash → skipped (backward compatible).
   */
  assertPricingUnchanged(
    expectedHash: string | undefined | null,
    items: Array<{ productId: string; unitPrice: number; quantity: number }>,
  ): void {
    if (!expectedHash) return;
    if (this.computePricingHash(items) !== expectedHash) {
      throw new ConflictException(
        i18nMessage("server.shipping.pricingChanged"),
      );
    }
  }

  /**
   * Pricing-change guard (409 PRICING_CHANGED). If the client passed the tariff
   * version its quote was built on and the active tariff has since moved, order
   * creation is refused so the buyer re-fetches the quote and confirms the new
   * amount — never a silent different charge. No expected version → skipped.
   */
  async assertShippingTariffUnchanged(
    expectedVersion?: number | null,
  ): Promise<void> {
    if (expectedVersion == null) return;
    const { tariffVersion } = await this.getShippingTariffMeta();
    if (tariffVersion != null && tariffVersion !== expectedVersion) {
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
  ): Promise<{
    sellerFeeAmount: number;
    buyerFeeAmount: number;
    commissionAmount: number;
    withholdingTaxAmount: number;
    shippingAmount: number;
    sellerNetAmount: number;
  }> {
    const [result, seller, shippingAmount] = await Promise.all([
      this.calculateCommission(amount, sellerId, categoryId),
      this.prisma.user.findUnique({
        where: { id: sellerId },
        select: { businessStatus: true, taxId: true },
      }),
      // Buyer-paid, informational only: shown on the seller listing form so they
      // see the shipping the buyer covers. Does NOT reduce sellerNetAmount.
      this.calculateShippingCost(amount),
    ]);
    // Kurumsal satıcıda stopaj da kesileceğinden önizleme neti gerçek payout ile eşleşsin.
    let withholdingTaxAmount = 0;
    if (seller?.businessStatus === "approved" && seller?.taxId) {
      const rate = await this.getWithholdingTaxRate();
      withholdingTaxAmount = rate > 0 ? Math.round(amount * rate) / 100 : 0;
    }
    const sellerNetAmount = Math.max(
      0,
      amount - result.sellerFeeAmount - withholdingTaxAmount,
    );
    return {
      sellerFeeAmount: result.sellerFeeAmount,
      buyerFeeAmount: result.buyerFeeAmount,
      commissionAmount: result.commissionAmount,
      withholdingTaxAmount,
      shippingAmount,
      sellerNetAmount,
    };
  }

  /**
   * Batch commission preview for multiple (amount, categoryId) pairs. Same order as input.
   */
  async getCommissionPreviewBatch(
    sellerId: string,
    items: Array<{ amount: number; categoryId?: string | null }>,
  ): Promise<{
    results: Array<{ sellerFeeAmount: number; sellerNetAmount: number }>;
  }> {
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
        );
        return {
          sellerFeeAmount: preview.sellerFeeAmount,
          sellerNetAmount: preview.sellerNetAmount,
        };
      }),
    );
    return { results };
  }

  /**
   * Calculate commission based on rules with priority matching
   * Requirement: Admin Commission Calculation (3.3)
   *
   * Matching hierarchy (by priority descending):
   * 1. Exact match: categoryId + sellerType
   * 2. Category match: categoryId only
   * 3. Seller type match: sellerType only
   * 4. Default rule: ruleType = 'default'
   *
   * Applies min/max limits after calculation
   */
  async calculateCommission(
    amount: number,
    sellerId: string,
    categoryId?: string | null,
  ): Promise<CommissionResult> {
    // Get seller info including membership tier
    const seller = await this.prisma.user.findUnique({
      where: { id: sellerId },
      select: {
        sellerType: true,
        businessStatus: true,
        taxId: true,
        membership: {
          select: {
            status: true,
            currentPeriodEnd: true,
            tier: {
              select: { type: true },
            },
          },
        },
      },
    });

    // Paid-tier commission (PREMIUM/BUSINESS) applies only to an ENTITLED membership.
    // A past_due / expired row (e.g. an unpaid upgrade) must NOT unlock the cheaper
    // paid-tier commission — gate the tier type through isPremiumEntitled first.
    const effectiveTierType = isPremiumEntitled(seller?.membership ?? null)
      ? (seller?.membership?.tier?.type ?? null)
      : null;

    // Map User.sellerType to CommissionSellerType (membership axis)
    const commissionSellerType = mapSellerTypeForCommission(
      seller?.sellerType ?? null,
      effectiveTierType,
    );
    // v2 taxpayer axis (individual/corporate) — same test as VAT/withholding.
    const taxpayerType = resolveTaxpayerType({
      businessStatus: seller?.businessStatus,
      taxId: seller?.taxId,
    });

    // Tüm aktif kuralları çek (Faz 5.1)
    const allActive = await this.prisma.commissionRule.findMany({
      where: { isActive: true },
      include: { category: true },
    });

    this.logger.debug(`Found ${allActive.length} active commission rules`);

    const result = calculateCommissionFromRules(
      amount,
      allActive,
      { categoryId, sellerType: commissionSellerType, taxpayerType, amount },
      undefined,
      this.logger,
    );

    if (!result.ruleId) {
      // Fail closed: a missing commission rule is a configuration error, not a
      // reason to silently apply 0 commission — that would zero platform revenue
      // AND undercharge the buyer fee. Abort so no order is ever created at the
      // wrong price; ops is alerted by the error log. In normal operation a
      // catch-all default rule always matches, so this never fires.
      this.logger.error(
        `No matching commission rule (amount=${amount} category=${categoryId} sellerType=${commissionSellerType} taxpayer=${taxpayerType}). Configure a default commission rule. Failing closed.`,
      );
      throw new ServiceUnavailableException(
        i18nMessage("server.commission.noRuleConfigured"),
      );
    }

    this.logger.log(
      `Commission: amount=${amount} sellerFee=${result.sellerFeeAmount} buyerFee=${result.buyerFeeAmount} (primaryRule=${result.ruleId})`,
    );

    return result;
  }
}
