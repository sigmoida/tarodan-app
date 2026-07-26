import {
  Injectable,
  NotFoundException,
  BadRequestException,
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
  ) {}

  // Shipping cost defaults (overridden by PlatformSetting)
  private readonly DEFAULT_SHIPPING_COST = 29.99;
  private readonly DEFAULT_FREE_THRESHOLD = 500;
  private shippingSettingsCache: {
    baseCost: number;
    freeThreshold: number;
    cachedAt: number;
  } | null = null;

  /**
   * Load shipping cost settings from PlatformSetting (cached for 5 minutes).
   */
  private async getShippingSettings(): Promise<{
    baseCost: number;
    freeThreshold: number;
  }> {
    const now = Date.now();
    if (
      this.shippingSettingsCache &&
      now - this.shippingSettingsCache.cachedAt < 5 * 60 * 1000
    ) {
      return this.shippingSettingsCache;
    }

    const [baseSetting, thresholdSetting] = await Promise.all([
      this.prisma.platformSetting.findUnique({
        where: { settingKey: "shipping_base_cost" },
      }),
      this.prisma.platformSetting.findUnique({
        where: { settingKey: "free_shipping_threshold" },
      }),
    ]);

    const baseCost = baseSetting
      ? parseFloat(baseSetting.settingValue)
      : this.DEFAULT_SHIPPING_COST;
    const freeThreshold = thresholdSetting
      ? parseFloat(thresholdSetting.settingValue)
      : this.DEFAULT_FREE_THRESHOLD;

    this.shippingSettingsCache = { baseCost, freeThreshold, cachedAt: now };
    return { baseCost, freeThreshold };
  }

  /**
   * Calculate shipping cost based on order amount.
   * Reads from PlatformSetting (admin-configurable), falls back to defaults.
   */
  async calculateShippingCost(orderAmount: number): Promise<number> {
    const { baseCost, freeThreshold } = await this.getShippingSettings();
    if (orderAmount >= freeThreshold) {
      return 0;
    }
    return baseCost;
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
    const { baseCost, freeThreshold } = await this.getShippingSettings();
    const out = new Map<string, number>();
    for (const [sellerId, subtotal] of sellerSubtotals) {
      out.set(sellerId, subtotal >= freeThreshold ? 0 : baseCost);
    }
    return out;
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
    const { baseCost, freeThreshold } = await this.getShippingSettings();
    const shippingCost = orderAmount >= freeThreshold ? 0 : baseCost;
    return {
      isFreeShipping: shippingCost === 0,
      shippingCost,
      threshold: freeThreshold,
      amountToFreeShipping: Math.max(0, freeThreshold - orderAmount),
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

      const productPrice = Number(product.price);
      const unitPrice = productPrice;
      const lineSubtotal = unitPrice * quantity;

      const commissionResult = await this.calculateCommission(
        lineSubtotal,
        product.sellerId,
        product.categoryId,
      );

      const lineBuyerFee = commissionResult.buyerFeeAmount;
      const lineSellerFee = commissionResult.sellerFeeAmount;
      const lineSellerNet = lineSubtotal - lineSellerFee;

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
          ? this.taxService.calculateTaxAmount(lineSubtotal, resolved)
          : 0;
      }

      itemsSubtotal += lineSubtotal;
      totalBuyerFee += lineBuyerFee;
      totalSellerFee += lineSellerFee;
      totalTax += lineTax;
      sellerSubtotals.set(
        product.sellerId,
        (sellerSubtotals.get(product.sellerId) ?? 0) + lineSubtotal,
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
    const shippingBySeller = [...shippingMap.entries()].map(
      ([sellerId, shippingCost]) => ({ sellerId, shippingCost }),
    );
    const shippingAmount = shippingBySeller.reduce(
      (sum, s) => sum + s.shippingCost,
      0,
    );
    const commissionAmount = totalBuyerFee + totalSellerFee;
    const totalAmount =
      itemsSubtotal + shippingAmount + totalBuyerFee + totalTax;
    const sellerNetAmount = Math.max(0, itemsSubtotal - totalSellerFee);

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
      totalAmount,
      sellerNetAmount,
      items: quoteItems,
      shippingBySeller,
      pricing,
    };
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
          include: {
            tier: {
              select: { type: true },
            },
          },
        },
      },
    });

    // Map User.sellerType to CommissionSellerType (membership axis)
    const commissionSellerType = mapSellerTypeForCommission(
      seller?.sellerType ?? null,
      seller?.membership?.tier?.type ?? null,
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
      this.logger.warn(
        "No matching commission rule found; applying 0 commission fallback",
      );
      return result;
    }

    this.logger.log(
      `Commission: amount=${amount} sellerFee=${result.sellerFeeAmount} buyerFee=${result.buyerFeeAmount} (primaryRule=${result.ruleId})`,
    );

    return result;
  }
}
