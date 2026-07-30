import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHash } from "crypto";
import { PrismaService } from "../../prisma";
import { generateUniqueReference } from "../../common/helpers/generate-reference";
import { Prisma } from "@prisma/client";
import { SuratCargoService } from "../surat-cargo/surat-cargo.service";
import { TaxService } from "../tax/tax.service";
import { CommissionResult, OrderPricingService } from "./order-pricing.service";
import {
  splitShippingByBuyerShare,
  type OutboundTariffLike,
} from "../shipping/shipping-tariff.helper";

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
    sellerId: string;
    categoryId: string | null;
    shippingDesi: number;
    shippingTariff?: OutboundTariffLike;
  }): Promise<{
    commission: CommissionResult;
    fullShippingAmount: number;
    buyerShippingAmount: number;
    sellerShippingAmount: number;
    taxAmount: number;
    withholdingTaxAmount: number;
    totalAmount: number;
  }> {
    const { amount, sellerId, categoryId, shippingDesi, shippingTariff } =
      params;

    const commission = await this.orderPricing.calculateCommission(
      amount,
      sellerId,
      categoryId,
    );
    // Kargo kararı (quote/checkout ile ORTAK): kademe → o kademenin payı → bölüşüm.
    const {
      fullShipping: fullShippingAmount,
      buyer: buyerShippingAmount,
      seller: sellerShippingAmount,
    } = this.orderPricing.resolveShippingDecision({
      tariff:
        shippingTariff ??
        (await this.orderPricing.resolveShippingTariffSnapshot()).tariff,
      subtotal: amount,
      billableDesi: shippingDesi,
      lineShares: [commission.shippingBuyerShares],
    });
    const { taxAmount, withholdingTaxAmount } = await this.resolveSellerTaxes(
      sellerId,
      categoryId,
      amount,
    );

    // Alıcıdan tahsil edilen: ürün + kargo payı + alıcı ücreti + KDV.
    // (Stopaj satıcı payout'undan kesilir, alıcıya yansıtılmaz.)
    const totalAmount =
      Math.round(
        (amount + buyerShippingAmount + commission.buyerFeeAmount + taxAmount) *
          100,
      ) / 100;

    return {
      commission,
      fullShippingAmount,
      buyerShippingAmount,
      sellerShippingAmount,
      taxAmount,
      withholdingTaxAmount,
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
    totalAmount: number;
  }): Prisma.InputJsonObject {
    return {
      version: 1,
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
        ruleId: params.commission.ruleId,
        ruleName: params.commission.ruleName,
        ruleType: params.commission.ruleType
          ? String(params.commission.ruleType)
          : null,
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
      },
    };
  }

  /** E-ticaret stopaj oranı (%) — PlatformSetting 'withholding_tax_rate', varsayılan %1 (9284 sayılı CK). */
  private async getWithholdingTaxRate(): Promise<number> {
    const row = await this.prisma.platformSetting.findUnique({
      where: { settingKey: "withholding_tax_rate" },
    });
    const rate = Number(row?.settingValue ?? "1");
    return Number.isFinite(rate) && rate >= 0 ? rate : 1;
  }

  /**
   * KDV + stopaj: yalnızca kurumsal satıcıda (businessStatus=approved + taxId dolu).
   * KDV ürün fiyatına eklenir (alıcı öder); stopaj (GVK 94/19) KDV hariç ürün bedeli
   * üzerinden hesaplanır ve satıcı payout'undan kesilir. Bireysel satıcı ikisinde de
   * kapsam dışıdır (stopaj: 330 Seri No'lu GV Genel Tebliği — mükellef olmayana tevkifat yok).
   * Matrah kargo ve alıcı hizmet bedelini içermez (komisyonla aynı baz).
   */
  async resolveSellerTaxes(
    sellerId: string,
    categoryId: string | null,
    subtotal: number,
  ): Promise<{ taxAmount: number; withholdingTaxAmount: number }> {
    const seller = await this.prisma.user.findUnique({
      where: { id: sellerId },
      select: { businessStatus: true, taxId: true },
    });
    if (seller?.businessStatus !== "approved" || !seller?.taxId) {
      return { taxAmount: 0, withholdingTaxAmount: 0 };
    }
    const resolved = await this.taxService.resolveTaxRate(
      "TR",
      null,
      categoryId,
    );
    if (!resolved) {
      this.logger.error(
        `No active tax rule for taxable seller=${sellerId} category=${categoryId}. Failing closed.`,
      );
      throw new ServiceUnavailableException({
        code: "TAX_CONFIGURATION_MISSING",
        message:
          "Vergi mükellefi satıcı için geçerli bir vergi kuralı bulunamadı.",
      });
    }
    const taxAmount = this.taxService.calculateTaxAmount(subtotal, resolved);
    const withholdingRate = await this.getWithholdingTaxRate();
    const withholdingTaxAmount =
      withholdingRate > 0 ? Math.round(subtotal * withholdingRate) / 100 : 0;
    return { taxAmount, withholdingTaxAmount };
  }

  /**
   * Generate a non-guessable, unique order number (e.g. "ORD-K7X9M2QF3N").
   * Random by design so the value leaks no sequence/order-count information and
   * cannot be enumerated. The `order_number` column's @unique constraint is the
   * final guard against the (negligible) chance of a collision.
   */
  async generateOrderNumber(): Promise<string> {
    return generateUniqueReference(
      "ORD",
      async (code) =>
        (await this.prisma.order.count({ where: { orderNumber: code } })) > 0,
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
