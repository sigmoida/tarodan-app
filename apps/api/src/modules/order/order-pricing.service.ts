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
  resolvePackageShippingBuyerShare,
  resolveTaxpayerType,
  splitShippingByBuyerShare,
} from "./order-commission.helper";
import { TaxService } from "../tax/tax.service";
import { isPremiumEntitled } from "../membership/membership.util";
import { ShippingTariffService } from "../shipping/shipping-tariff.service";
import {
  calculatePackageDesi,
  outboundPackageShipping,
  ShippingDesiRateNotFoundError,
  type OutboundTariffLike,
} from "../shipping/shipping-tariff.helper";
import { DiscountService } from "../discount/discount.service";
import { createHash } from "crypto";

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
    try {
      return outboundPackageShipping(tariff, subtotal, billableDesi).toNumber();
    } catch (error) {
      if (error instanceof ShippingDesiRateNotFoundError) {
        throw new ServiceUnavailableException({
          code: "SHIPPING_DESI_RATE_NOT_CONFIGURED",
          message: `Kargo tarifesinde ${billableDesi} desi için fiyat tanımlı değil.`,
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
    shippingBySeller: Array<{
      sellerId: string;
      shippingCost: number;
      billableDesi: number;
    }>;
    // Aktif tarife sürümü — istemci order-create'e geri gönderir; sürüm değiştiyse
    // create 409 PRICING_CHANGED döner. Aktif tarife yoksa quote fail-closed davranır.
    shippingTariffVersion: number;
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
    const shippingTariff = await this.resolveShippingTariffSnapshot();

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
    const sellerDesiLines = new Map<
      string,
      Array<{ shippingDesi: number; quantity: number }>
    >();
    // Kargo payı: satıcının kuralındaki alıcı payı (%). Create yolu ile aynı
    // bölüşüm; önizleme toplamı oluşan siparişle birebir eşleşsin.
    const sellerShippingShareLines = new Map<string, number[]>();

    // Pass 1: ürünleri çöz + EFEKTİF (kampanya) birim fiyat + satır toplamı (F1.4).
    const lines: Array<{
      product: {
        id: string;
        title: string | null;
        sellerId: string;
        categoryId: string | null;
        shippingDesi: number;
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
          shippingDesi: true,
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
    if (dto.couponCode) {
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

      // Paket payı satır sırasından bağımsız olmalı: satırın payını topla,
      // indirgemeyi ortak yardımcı yapsın (`map.set` ile son satır kazanmasın).
      sellerShippingShareLines.set(product.sellerId, [
        ...(sellerShippingShareLines.get(product.sellerId) ?? []),
        commissionResult.shippingBuyerShare,
      ]);
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
        if (!resolved) {
          this.logger.error(
            `No active tax rule for taxable seller=${product.sellerId} category=${product.categoryId}. Quote failed closed.`,
          );
          throw new ServiceUnavailableException({
            code: "TAX_CONFIGURATION_MISSING",
            message:
              "Vergi mükellefi satıcı için geçerli bir vergi kuralı bulunamadı.",
          });
        }
        lineTax = this.taxService.calculateTaxAmount(discountedLine, resolved);
      }

      itemsSubtotal += lineSubtotal;
      totalBuyerFee += lineBuyerFee;
      totalSellerFee += lineSellerFee;
      totalTax += lineTax;
      sellerSubtotals.set(
        product.sellerId,
        (sellerSubtotals.get(product.sellerId) ?? 0) + discountedLine,
      );
      const desiLines = sellerDesiLines.get(product.sellerId) ?? [];
      desiLines.push({ shippingDesi: product.shippingDesi, quantity });
      sellerDesiLines.set(product.sellerId, desiLines);

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
    const sellerDesi = new Map(
      [...sellerDesiLines.entries()].map(([sellerId, packageLines]) => [
        sellerId,
        calculatePackageDesi(packageLines),
      ]),
    );
    const shippingMap = await this.calculateShippingBySeller(
      sellerSubtotals,
      shippingTariff.tariff,
      sellerDesi,
    );
    // Alıcı yalnız kendi kargo payını öder (create yolundaki yuvarlamayla birebir).
    // buyerShare=100 → tam kargo (mevcut davranış korunur).
    const shippingBySeller = [...shippingMap.entries()].map(
      ([sellerId, fullShipping]) => {
        const share = resolvePackageShippingBuyerShare(
          sellerShippingShareLines.get(sellerId) ?? [],
        );
        const { buyer: buyerShipping } = splitShippingByBuyerShare(
          fullShipping,
          share,
        );
        return {
          sellerId,
          shippingCost: buyerShipping,
          billableDesi: sellerDesi.get(sellerId) ?? 1,
        };
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
      shippingTariffVersion: shippingTariff.tariffVersion,
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
    shippingDesi: number;
  }> {
    const [result, seller, fullShippingAmount] = await Promise.all([
      this.calculateCommission(amount, sellerId, categoryId),
      this.prisma.user.findUnique({
        where: { id: sellerId },
        select: { businessStatus: true, taxId: true },
      }),
      this.calculateShippingCost(amount, undefined, shippingDesi),
    ]);
    const { buyer: buyerShippingAmount, seller: sellerShippingAmount } =
      splitShippingByBuyerShare(fullShippingAmount, result.shippingBuyerShare);
    // Kurumsal satıcıda stopaj da kesileceğinden önizleme neti gerçek payout ile eşleşsin.
    let withholdingTaxAmount = 0;
    if (seller?.businessStatus === "approved" && seller?.taxId) {
      const rate = await this.getWithholdingTaxRate();
      withholdingTaxAmount = rate > 0 ? Math.round(amount * rate) / 100 : 0;
    }
    const sellerNetAmount = Math.max(
      0,
      amount -
        result.sellerFeeAmount -
        withholdingTaxAmount -
        sellerShippingAmount,
    );
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
      shippingDesi,
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

    // Paid-tier commission (PREMIUM/BUSINESS) applies only to an ENTITLED membership.
    // A past_due / expired row (e.g. an unpaid upgrade) must NOT unlock the cheaper
    // paid-tier commission — gate the tier type through isPremiumEntitled first.
    const effectiveTierType = isPremiumEntitled(
      seller?.membership ?? null,
      seller,
    )
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

    // Fail closed: a missing commission rule is a configuration error, not a
    // reason to silently apply 0 commission — that would zero platform revenue
    // AND undercharge the buyer fee. Abort so no order is ever created at the
    // wrong price; ops is alerted by the error log. In normal operation a
    // catch-all default rule always matches, so this never fires.
    //
    // The SELLER side must match specifically: `ruleId` is `sellerMatch ??
    // buyerMatch`, so a gap in seller-side rules that leaves only a global buyer
    // fee rule matching would otherwise pass this guard and silently book
    // `sellerFeeAmount = 0`. A genuinely commission-free category must be
    // configured as an explicit SELLER/BOTH rule with rate 0, never as a missing
    // rule.
    if (!result.sellerRuleId) {
      this.logger.error(
        `No matching seller-side commission rule (amount=${amount} category=${categoryId} sellerType=${commissionSellerType} taxpayer=${taxpayerType} buyerRule=${result.buyerRuleId ?? "none"}). Configure a catch-all commission rule with appliesTo=BOTH. Failing closed.`,
      );
      throw new ServiceUnavailableException(
        i18nMessage("server.commission.noRuleConfigured"),
      );
    }

    this.logger.log(
      `Commission: amount=${amount} sellerFee=${result.sellerFeeAmount} buyerFee=${result.buyerFeeAmount} (primaryRule=${result.ruleId})`,
    );

    return {
      ...result,
      effectiveMembershipTier: effectiveTierType,
      taxpayerType,
    };
  }
}
