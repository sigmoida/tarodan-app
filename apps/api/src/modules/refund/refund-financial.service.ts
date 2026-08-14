import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import {
  ElogoInvoiceType,
  OrderStatus,
  PaymentHoldStatus,
  Prisma,
  RefundFaultParty,
  RefundReason,
  RefundRequestStatus,
  SellerAdjustmentType,
  SellerType,
  ShippingPackageTierCode,
} from "@prisma/client";
import { PrismaService } from "../../prisma";
import { couponSurvivesFault } from "../discount/helpers/coupon-restore-policy";
import type { CouponFaultParty } from "../discount/helpers/coupon-restore-policy";
import { DiscountService } from "../discount/discount.service";
import { isShipmentHandedToCarrier } from "../shipping/helpers/shipment-handover";
import { NotificationService } from "../notification/notification.service";
import { i18nMessage } from "../i18n";
import { ShippingTariffService } from "../shipping/tariff/shipping-tariff.service";
import {
  resolvePackageTier,
  shippingAmountForDesi,
} from "../shipping/helpers/shipping-tariff.helper";
import { storedProductBaseOf } from "../order/helpers/order-charged-base.helper";
import { readInvoiceLineItems } from "../elogo/invoice/invoice-lines";
import {
  calculateRefundFinancials,
  RefundFinancialResult,
  RefundPolicyDecision,
} from "./helpers/refund-financial-policy";
import {
  calculateRefundFinancialsV2,
  type RefundFinancialComponentV2,
  type RefundFinancialResultV2,
  type RefundFaultPartyV2,
} from "./helpers/refund-financial-policy-v2";

export type RefundFinancialPersistenceData = Pick<
  Prisma.RefundRequestUncheckedCreateInput,
  | "policyCode"
  | "financialPolicySnapshot"
  | "returnBillableDesi"
  | "returnShippingAmount"
  | "refundedProductAmount"
  | "refundedOutboundShippingAmount"
  | "refundedBuyerProtectionAmount"
  | "refundedSellerFeeAmount"
  | "retainedSellerPlatformFeeAmount"
  | "returnShippingChargeToBuyer"
  | "returnShippingChargeToSeller"
  | "sellerShippingCompensationAmount"
  | "outboundShippingChargeToSeller"
  | "requiresAdminReview"
  | "penaltyReviewRequired"
  | "refundProductAmount"
  | "refundShippingFee"
  | "refundBuyerFee"
  | "refundSellerCommission"
  | "returnShippingPayer"
>;

/**
 * İade parasının hesabı ve kalıcılaştırılması — RefundService'in finansal
 * çekirdeği birebir taşındı. Burada yaşayanlar tek bir soruyu cevaplar:
 * "bu iade kime ne kadar para hareketi doğurur?" — talebin yaşam döngüsü,
 * kargo bacağının fiziksel akışı ve bildirimler dışarıda kalır.
 *
 * Aynı hesap üç yoldan çağrılır (admin kararı, anlık iade, cayma) ve
 * `previewRefundDecision` ile admin ekranında ÖNCEDEN gösterilir; önizleme ile
 * yazılan tutarın aynı fonksiyondan gelmesi bu servisin var oluş sebebidir.
 * PaymentHold kilit yardımcıları da burada: kilit, para hareketinin escrow
 * tarafındaki karşılığıdır.
 */
@Injectable()
export class RefundFinancialService {
  private readonly logger = new Logger(RefundFinancialService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    @Optional()
    private readonly shippingTariffService?: ShippingTariffService,
    @Optional()
    private readonly discountService?: DiscountService,
  ) {}

  /**
   * Bileşen bazlı v2 iade matematiği ANLAŞILAN davranıştır ve VARSAYILAN
   * AÇIKTIR (müşteri dokümanları v2'yi anlatır: komisyon iade edilir, platform
   * ücreti kusur tarafında kalır). Env yalnız acil geri dönüş içindir:
   * REFUND_POLICY_V2_ENABLED=false v1'e düşürür.
   */
  refundPolicyV2Enabled(): boolean {
    const configured =
      process.env.REFUND_POLICY_V2_ENABLED?.trim().toLowerCase();
    if (configured != null && configured !== "") {
      return configured === "true" || configured === "1";
    }
    return true;
  }

  /**
   * Product prices on platform-owned sales are VAT-inclusive. Order.taxAmount
   * intentionally remains zero because the marketplace does not add product
   * VAT at checkout; the platform-sale eLogo invoice is the authoritative
   * disclosure snapshot. A refund component therefore has to reconstruct the
   * included tax from that original product line, not from Order.taxAmount.
   *
   * The product line is first by the documented buildPlatformSaleLines
   * contract. For a delivered platform sale, missing/invalid invoice lines are
   * a financial-review error: silently emitting 0% would create a return
   * invoice incompatible with the original document. Before shipment there is
   * no issued sale document to reverse, so the order split remains sufficient.
   */
  private async productTaxAmountForV2Refund(order: {
    id: string;
    status: OrderStatus;
    taxAmount: Prisma.Decimal;
    productGrossAmount: number;
    // Nullable on the user, and only ever compared against `platform` here — a
    // seller with no type takes the same branch any non-platform seller does.
    sellerType: SellerType | null;
  }): Promise<number> {
    if (order.sellerType !== SellerType.platform) {
      return Number(order.taxAmount ?? 0);
    }

    const invoice = await this.prisma.elogoInvoice.findUnique({
      where: {
        type_sourceId: {
          type: ElogoInvoiceType.platform_sale,
          sourceId: order.id,
        },
      },
      select: { lineItems: true },
    });
    const productLine = readInvoiceLineItems(invoice?.lineItems)[0];
    if (productLine) {
      const rate = Math.max(0, productLine.vatRate);
      if (rate === 0) return 0;
      return (
        Math.round(
          (order.productGrossAmount -
            order.productGrossAmount / (1 + rate / 100) +
            Number.EPSILON) *
            100,
        ) / 100
      );
    }

    const invoicedStatuses: OrderStatus[] = [
      OrderStatus.delivered,
      OrderStatus.awaiting_buyer_confirmation,
      OrderStatus.completed,
    ];
    const documentShouldExist = invoicedStatuses.includes(order.status);
    if (documentShouldExist) {
      throw new BadRequestException(
        i18nMessage("server.refund.vatSnapshotMissing"),
      );
    }
    return Number(order.taxAmount ?? 0);
  }

  async previewRefundDecision(
    refundRequestId: string,
    resolvedReason: RefundReason,
    faultParty: RefundFaultPartyV2,
    allowNonReview = false,
  ): Promise<{
    calculationToken: string;
    resolvedReason: RefundReason;
    faultParty: RefundFaultPartyV2;
    outboundPackageTier: ShippingPackageTierCode;
    outboundFullShippingAmount: number;
    serviceVatRate: number;
    returnTariff: {
      id: string;
      version: number;
      tier: ShippingPackageTierCode;
      amount: number;
    } | null;
    financials: RefundFinancialResultV2;
  }> {
    const rr = await this.prisma.refundRequest.findUnique({
      where: { id: refundRequestId },
      include: {
        order: {
          include: {
            shipment: true,
            product: {
              select: {
                shippingPackageTier: true,
                shippingDesi: true,
              },
            },
            seller: { select: { sellerType: true } },
            package: true,
          },
        },
      },
    });
    if (!rr) throw new NotFoundException(i18nMessage("server.refund.notFound"));
    if (
      !allowNonReview &&
      rr.status !== RefundRequestStatus.pending_review &&
      !rr.financialReviewRequired
    ) {
      throw new BadRequestException(
        i18nMessage("server.refund.previewStateInvalid"),
      );
    }
    if (rr.policyFinalizedAt) {
      throw new ConflictException(
        i18nMessage("server.refund.policyAlreadyFinal"),
      );
    }
    if (!this.shippingTariffService) {
      throw new BadRequestException(
        i18nMessage("server.refund.tariffServiceUnavailable"),
      );
    }

    const order = rr.order;
    const originalTariff = order.package?.shippingTariffId
      ? await this.shippingTariffService.getById(order.package.shippingTariffId)
      : null;
    const outboundTier = originalTariff
      ? resolvePackageTier(
          originalTariff,
          order.package?.billableDesi ?? order.product.shippingDesi ?? 1,
        ).code
      : order.product.shippingPackageTier;

    // Kargo hizmeti fiilen tüketildi mi — iptal kapılarıyla AYNI tanım.
    const hasShipped = isShipmentHandedToCarrier(order.shipment);
    const activeReturnTariff = hasShipped
      ? await this.shippingTariffService.getActiveOutboundTariff("surat")
      : null;
    // O5: dönüş fiyatı TEK kaynaktan — fiziksel dönüş kolisinin desisi aktif
    // tarifede hangi kademeye düşüyorsa o. Sürat dönüş etiketi de aynı desiyle
    // kesilir (openReturnShipment → returnBillableDesi), böylece faturalanan
    // kademe ile taşınan koli ayrışamaz. (Eskiden orijinal GİDİŞ kolisinin
    // kademesi kullanılıyordu — kısmi iadede küçük koliye büyük koli fiyatı
    // yazılıyordu.)
    const returnBillableDesi = Math.max(
      1,
      (order.product.shippingDesi ?? 1) * rr.refundQuantity,
    );
    const returnTier = activeReturnTariff
      ? resolvePackageTier(activeReturnTariff, returnBillableDesi)
      : null;

    const outboundAlreadySettled = order.packageId
      ? Boolean(
          await this.prisma.packageShippingSettlement.findFirst({
            where: { packageId: order.packageId, leg: "outbound" },
            select: { id: true },
          }),
        )
      : false;
    const productGrossAmount = storedProductBaseOf(order);
    /**
     * Shipping settlement is package-scoped, so its money source must be the
     * package snapshot too. Group checkout writes order-level shares only on
     * the seller's first Order, while OrderPackage holds the canonical totals;
     * sibling Order rows may therefore contain zero. Reading an arbitrary order
     * here could consume the one-shot settlement with zero amounts and
     * permanently prevent the actual shares from being settled later.
     */
    const buyerShippingAmount = Number(
      order.package?.buyerShippingAmount ??
        order.buyerShippingAmount ??
        order.shippingCost ??
        0,
    );
    const sellerShippingAmount = Number(
      order.package?.sellerShippingAmount ?? order.sellerShippingAmount ?? 0,
    );
    const outboundFullShippingAmount = Number(
      order.package?.fullShippingAmount ??
        buyerShippingAmount + sellerShippingAmount,
    );
    const productTaxAmount = await this.productTaxAmountForV2Refund({
      id: order.id,
      status: order.status,
      taxAmount: order.taxAmount,
      productGrossAmount,
      sellerType: order.seller.sellerType,
    });
    // K7: gidiş kargosu yalnız satırı TAMAMLAYAN iadede işlenir. Art arda
    // kısmi iadelerde (1/3 sonra 2/3) son talep tek başına "tam" olmadığı için
    // önceki iade edilmiş adetler de sayılır — aksi halde her şeyini iki
    // adımda iade eden alıcı kargo iadesini sonsuza dek kaybederdi.
    const priorRefundedRows = await this.prisma.refundRequest.findMany({
      where: {
        orderId: order.id,
        id: { not: rr.id },
        status: RefundRequestStatus.refunded,
      },
      select: { refundQuantity: true },
    });
    const priorRefundedQuantity = priorRefundedRows.reduce(
      (sum, row) => sum + (row.refundQuantity ?? 0),
      0,
    );
    const completesLine =
      priorRefundedQuantity + rr.refundQuantity >= (order.quantity ?? 1);
    /**
     * Kargo bedeli PAKET başınadır (escrow hold'u da tam kargoyu paketten bir
     * kez düşer), bu yüzden satırın tamamlanması tek başına yetmez: koli hâlâ
     * kardeş satırlar için yola çıkacaksa kargo iade EDİLMEZ. Aksi halde aynı
     * satıcıdan iki satırlık sepette her satır iptalinde aynı koli bedeli
     * yeniden iade ediliyordu (grup iptali satır satır döndüğü için birebir
     * bu senaryo). Paketi KAPATAN son iade kargoyu bir kez iade eder.
     */
    const packageStillShipping = order.packageId
      ? (await this.prisma.order.count({
          where: {
            packageId: order.packageId,
            id: { not: order.id },
            status: {
              notIn: [OrderStatus.cancelled, OrderStatus.refunded],
            },
          },
        })) > 0
      : false;
    const closesPackageShipping = completesLine && !packageStillShipping;
    const financials = calculateRefundFinancialsV2({
      productGrossAmount,
      productTaxAmount,
      buyerShippingAmount,
      sellerShippingAmount,
      outboundFullShippingAmount,
      buyerCommissionAmount: Number(order.buyerCommissionAmount ?? 0),
      buyerPlatformFeeAmount: Number(order.buyerServiceFeeAmount ?? 0),
      sellerCommissionAmount: Number(order.sellerCommissionAmount ?? 0),
      sellerPlatformFeeAmount: Number(order.sellerPlatformFeeAmount ?? 0),
      serviceVatRate: Number(order.serviceVatRate ?? 0),
      returnShippingAmount: Number(returnTier?.amount ?? 0),
      orderQuantity: order.quantity ?? 1,
      refundQuantity: rr.refundQuantity,
      faultParty,
      hasShipped,
      outboundAlreadySettled,
      completesLine,
      closesPackageShipping,
    });
    const returnTariff = activeReturnTariff
      ? {
          id: activeReturnTariff.id,
          version: activeReturnTariff.version,
          tier: returnTier!.code,
          desi: returnBillableDesi,
          amount: Number(returnTier!.amount),
        }
      : null;
    const tokenPayload = {
      refundRequestId: rr.id,
      refundUpdatedAt: rr.updatedAt.toISOString(),
      orderId: order.id,
      orderVersion: order.version,
      resolvedReason,
      faultParty,
      outboundTier,
      outboundFullShippingAmount,
      serviceVatRate: Number(order.serviceVatRate ?? 0),
      outboundAlreadySettled,
      completesLine,
      closesPackageShipping,
      returnTariff,
      financials,
    };
    const calculationToken = createHash("sha256")
      .update(JSON.stringify(tokenPayload))
      .digest("hex");

    return {
      calculationToken,
      resolvedReason,
      faultParty,
      outboundPackageTier: outboundTier,
      outboundFullShippingAmount,
      serviceVatRate: Number(order.serviceVatRate ?? 0),
      returnTariff,
      financials,
    };
  }

  private componentTotal(
    components: RefundFinancialComponentV2[],
    code: RefundFinancialComponentV2["componentCode"],
    treatment: RefundFinancialComponentV2["treatment"],
    field: "netAmount" | "grossAmount" = "grossAmount",
  ): number {
    return components
      .filter(
        (component) =>
          component.componentCode === code && component.treatment === treatment,
      )
      .reduce((sum, component) => sum + component[field], 0);
  }

  /**
   * v1 (bileşensiz) satırlarda defter ters kaydı için NET alıcı ücreti.
   * `refundedBuyerProtectionAmount` BRÜT saklanır; CommissionLedger.buyerFee
   * ise NET'tir — brütü beslemek kısmi iadede KDV kadar fazla ters kayıt
   * üretir. Önce snapshot'taki kesin net alan okunur; bu alandan önce yazılmış
   * eski kayıtlar için brütten KDV arındırılmış yaklaşık değer kullanılır
   * (ledger zaten orijinale clamp'ler).
   */
  legacyBuyerFeeNetOf(rr: {
    refundedBuyerProtectionAmount: Prisma.Decimal | number;
    financialPolicySnapshot?: Prisma.JsonValue;
    order?: Record<string, unknown> | null;
  }): number {
    const snap = rr.financialPolicySnapshot as any;
    const fromSnapshot =
      snap?.financials?.buyerProtectionNetRefundAmount ??
      snap?.legacyProvisionalCalculation?.financials
        ?.buyerProtectionNetRefundAmount;
    if (typeof fromSnapshot === "number") return fromSnapshot;
    const gross = Number(rr.refundedBuyerProtectionAmount);
    const rate = Number((rr.order as any)?.serviceVatRate ?? 0);
    return rate > 0
      ? Math.round((gross / (1 + rate / 100)) * 100) / 100
      : gross;
  }

  feeSettlementFromComponents(
    components:
      | Array<{
          componentCode: string;
          treatment: string;
          netAmount: Prisma.Decimal | number;
        }>
      | null
      | undefined,
    legacy: { sellerFeeAmount: number; buyerFeeAmount: number },
  ) {
    if (!components?.length) {
      return {
        sellerFeeRefundAmount: legacy.sellerFeeAmount,
        buyerFeeRefundAmount: legacy.buyerFeeAmount,
      };
    }
    const amount = (code: string, treatment: string) =>
      components
        .filter(
          (component) =>
            component.componentCode === code &&
            component.treatment === treatment,
        )
        .reduce((sum, component) => sum + Number(component.netAmount), 0);
    const buyerCommissionRefundAmount = amount(
      "buyer_commission",
      "buyer_refund",
    );
    const buyerPlatformFeeRefundAmount = amount(
      "buyer_platform_fee",
      "buyer_refund",
    );
    const sellerCommissionRefundAmount = amount(
      "seller_commission",
      "seller_refund",
    );
    const sellerPlatformFeeRefundAmount = amount(
      "seller_platform_fee",
      "seller_refund",
    );
    return {
      buyerCommissionRefundAmount,
      buyerPlatformFeeRefundAmount,
      sellerCommissionRefundAmount,
      sellerPlatformFeeRefundAmount,
      buyerFeeRefundAmount:
        buyerCommissionRefundAmount + buyerPlatformFeeRefundAmount,
      sellerFeeRefundAmount:
        sellerCommissionRefundAmount + sellerPlatformFeeRefundAmount,
    };
  }

  async finalizeV2RefundDecision(
    refundRequestId: string,
    adminId: string,
    decision: {
      resolvedReason: RefundReason;
      faultParty: RefundFaultPartyV2;
      calculationToken: string;
    },
    options: {
      allowNonReview?: boolean;
      /**
       * An already-open physical return keeps its lifecycle status while the
       * admin finalizes only the financial snapshot. Requiring the quarantine
       * marker prevents this escape hatch from being used on ordinary records.
       */
      requireFinancialReview?: boolean;
    } = {},
  ) {
    const preview = await this.previewRefundDecision(
      refundRequestId,
      decision.resolvedReason,
      decision.faultParty,
      options.allowNonReview === true,
    );
    if (preview.calculationToken !== decision.calculationToken) {
      throw new ConflictException(i18nMessage("server.refund.previewStale"));
    }
    const finalizedAt = new Date();
    const components = preview.financials.components;

    // Bildirim tx İÇİNDE atılmaz: commit sonrası gönderilecek kupon iadeleri
    // burada biriktirilir.
    let restoredCoupons: { userId: string; code: string }[] = [];

    const finalized = await this.prisma.$transaction(async (tx) => {
      const current = await tx.refundRequest.findUnique({
        where: { id: refundRequestId },
        select: {
          id: true,
          status: true,
          policyFinalizedAt: true,
          policyCode: true,
          financialPolicySnapshot: true,
          financialReviewRequired: true,
          orderId: true,
          order: { select: { packageId: true } },
        },
      });
      if (!current) {
        throw new NotFoundException(i18nMessage("server.refund.notFound"));
      }
      if (
        (!options.allowNonReview &&
          current.status !== RefundRequestStatus.pending_review) ||
        current.policyFinalizedAt ||
        (options.requireFinancialReview && !current.financialReviewRequired)
      ) {
        throw new ConflictException(
          i18nMessage("server.refund.decisionRaceLost"),
        );
      }

      const claimed = await tx.refundRequest.updateMany({
        where: {
          id: current.id,
          policyFinalizedAt: null,
          ...(!options.allowNonReview
            ? { status: RefundRequestStatus.pending_review }
            : {}),
          ...(options.requireFinancialReview
            ? { financialReviewRequired: true }
            : {}),
        },
        data: {
          policyFinalizedBy: adminId,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException(
          i18nMessage("server.refund.decisionRaceLost"),
        );
      }

      // Kusursuz alıcının kuponu geri verilir (kusur satıcıda/kargoda/platformda).
      // Alıcı kaynaklı iadede hak harcanmış sayılır. KISMİ iadede kupon
      // KULLANILMIŞ sayılır: sipariş kısmen ayakta ve indirimi hâlâ taşıyorken
      // kuponu da geri vermek çifte fayda olurdu — hak yalnız TAM iadede döner.
      if (
        couponSurvivesFault(decision.faultParty as CouponFaultParty) &&
        preview.financials.quantityPortion >= 1
      ) {
        const revoked = await this.discountService
          ?.revokeUsageForOrders(
            [current.orderId],
            `refund:${decision.resolvedReason}:${decision.faultParty}`,
            tx,
          )
          .catch((error) => {
            this.logger.warn(`kupon iadesi başarısız: ${error}`);
            return null;
          });
        restoredCoupons = revoked?.restoredCoupons ?? [];
      }

      await tx.refundFinancialComponent.createMany({
        data: components.map((component) => ({
          refundRequestId: current.id,
          componentCode: component.componentCode,
          treatment: component.treatment,
          netAmount: component.netAmount,
          taxAmount: component.taxAmount,
          grossAmount: component.grossAmount,
          sourceAmount: component.sourceAmount,
          quantityPortion: component.quantityPortion,
          metadata: component.metadata as Prisma.InputJsonValue | undefined,
        })),
      });

      if (
        preview.financials.outboundSettlementRequired &&
        current.order.packageId
      ) {
        const outboundNet = preview.outboundFullShippingAmount;
        const outboundTax =
          Math.round(
            outboundNet * (Math.max(0, preview.serviceVatRate) / 100) * 100,
          ) / 100;
        await tx.packageShippingSettlement.create({
          data: {
            packageId: current.order.packageId,
            refundRequestId: current.id,
            leg: "outbound",
            payer: decision.faultParty as RefundFaultParty,
            netAmount: outboundNet,
            taxAmount: outboundTax,
            grossAmount: outboundNet + outboundTax,
            sourceKey: `package-outbound:${current.order.packageId}`,
          },
        });
      }
      const returnSettlement = components.find(
        (component) => component.componentCode === "return_shipping",
      );
      if (returnSettlement) {
        await tx.packageShippingSettlement.create({
          data: {
            packageId: current.order.packageId,
            refundRequestId: current.id,
            leg: "return",
            payer: decision.faultParty as RefundFaultParty,
            netAmount: returnSettlement.netAmount,
            taxAmount: returnSettlement.taxAmount,
            grossAmount: returnSettlement.grossAmount,
            sourceKey: `refund-return:${current.id}`,
          },
        });
      }

      const sellerFeeRefund =
        this.componentTotal(
          components,
          "seller_commission",
          "seller_refund",
          "netAmount",
        ) +
        this.componentTotal(
          components,
          "seller_platform_fee",
          "seller_refund",
          "netAmount",
        );
      const buyerFeeRefund =
        this.componentTotal(
          components,
          "buyer_commission",
          "buyer_refund",
          "grossAmount",
        ) +
        this.componentTotal(
          components,
          "buyer_platform_fee",
          "buyer_refund",
          "grossAmount",
        );
      const retainedSellerPlatformFee = this.componentTotal(
        components,
        "seller_platform_fee",
        "platform_retain",
        "netAmount",
      );
      const oldSnapshot = current.financialPolicySnapshot;
      const snapshot = {
        version: 2,
        resolvedReason: decision.resolvedReason,
        faultParty: decision.faultParty,
        calculationToken: preview.calculationToken,
        finalizedAt: finalizedAt.toISOString(),
        finalizedBy: adminId,
        outboundPackageTier: preview.outboundPackageTier,
        outboundFullShippingAmount: preview.outboundFullShippingAmount,
        returnTariff: preview.returnTariff,
        financials: preview.financials,
        ...(oldSnapshot ? { legacySnapshot: oldSnapshot } : {}),
      } as unknown as Prisma.InputJsonValue;
      const suffix = current.policyCode.endsWith("_cancellation")
        ? "cancellation"
        : "return";

      return tx.refundRequest.update({
        where: { id: current.id },
        data: {
          resolvedReason: decision.resolvedReason,
          faultParty: decision.faultParty as RefundFaultParty,
          policyVersion: 2,
          policyFinalizedAt: finalizedAt,
          policyFinalizedBy: adminId,
          policyCode: `v2_${decision.faultParty}_${suffix}`,
          financialReviewRequired: false,
          financialPolicySnapshot: snapshot,
          amount: preview.financials.buyerRefundAmount,
          outboundPackageTier: preview.outboundPackageTier,
          outboundFullShippingAmount: preview.outboundFullShippingAmount,
          returnShippingAmount: preview.returnTariff?.amount ?? 0,
          refundedProductAmount: this.componentTotal(
            components,
            "product",
            "buyer_refund",
          ),
          refundedOutboundShippingAmount: this.componentTotal(
            components,
            "outbound_shipping",
            "buyer_refund",
          ),
          refundedBuyerProtectionAmount: buyerFeeRefund,
          refundedSellerFeeAmount: sellerFeeRefund,
          retainedSellerPlatformFeeAmount: retainedSellerPlatformFee,
          refundedBuyerServiceTaxAmount:
            preview.financials.refundedBuyerServiceTaxAmount,
          refundedSellerServiceTaxAmount:
            preview.financials.refundedSellerServiceTaxAmount,
          retainedBuyerServiceTaxAmount:
            preview.financials.retainedBuyerServiceTaxAmount,
          retainedSellerServiceTaxAmount:
            preview.financials.retainedSellerServiceTaxAmount,
          returnShippingChargeToBuyer: this.componentTotal(
            components,
            "return_shipping",
            "buyer_charge",
          ),
          returnShippingChargeToSeller: this.componentTotal(
            components,
            "return_shipping",
            "seller_charge",
          ),
          sellerShippingCompensationAmount: this.componentTotal(
            components,
            "outbound_shipping",
            "seller_refund",
          ),
          outboundShippingChargeToSeller: this.componentTotal(
            components,
            "outbound_shipping",
            "seller_charge",
          ),
          carrierClaimRequired: preview.financials.carrierClaimRequired,
          returnShippingPayer:
            decision.faultParty === "buyer"
              ? "buyer"
              : decision.faultParty === "seller"
                ? "seller"
                : "platform",
          refundShippingFee:
            this.componentTotal(
              components,
              "outbound_shipping",
              "buyer_refund",
            ) > 0,
          refundBuyerFee: buyerFeeRefund > 0,
          refundSellerCommission: sellerFeeRefund > 0,
        },
        include: { financialComponents: true },
      });
    });

    // Commit başarılı: "kuponunuz geri verildi" haberi ancak şimdi doğru.
    for (const coupon of restoredCoupons) {
      await this.notificationService
        ?.notifyCouponReturned(coupon.userId, coupon.code)
        .catch((error) =>
          this.logger.warn(`kupon iade bildirimi başarısız: ${error}`),
        );
    }

    return finalized;
  }

  async finalizeAutomaticV2RefundDecision(
    refundRequestId: string,
    resolvedReason: RefundReason,
    faultParty: RefundFaultPartyV2,
  ) {
    const preview = await this.previewRefundDecision(
      refundRequestId,
      resolvedReason,
      faultParty,
      true,
    );
    return this.finalizeV2RefundDecision(
      refundRequestId,
      "system",
      {
        resolvedReason,
        faultParty,
        calculationToken: preview.calculationToken,
      },
      { allowNonReview: true },
    );
  }

  async buildFinancialPolicySnapshot(
    order: {
      totalAmount: Prisma.Decimal;
      quantity?: number;
      shippingCost?: Prisma.Decimal;
      buyerShippingAmount?: Prisma.Decimal;
      buyerFeeAmount?: Prisma.Decimal;
      buyerServiceFeeAmount?: Prisma.Decimal;
      buyerServiceTaxAmount?: Prisma.Decimal;
      serviceVatRate?: Prisma.Decimal;
      sellerFeeAmount?: Prisma.Decimal;
      sellerCommissionAmount?: Prisma.Decimal;
      sellerPlatformFeeAmount?: Prisma.Decimal;
      sellerShippingAmount?: Prisma.Decimal;
      package?: {
        shippingTariffId: string | null;
        shippingTariffVersion: number | null;
      } | null;
      product?: { shippingDesi: number } | null;
    },
    policy: RefundPolicyDecision,
    reason: string,
    refundQuantity: number,
    includeReturnShipping: boolean,
  ): Promise<{
    financials: RefundFinancialResult;
    returnBillableDesi: number;
    snapshot: Prisma.InputJsonValue;
  }> {
    const returnBillableDesi = Math.max(
      1,
      (order.product?.shippingDesi ?? 1) * refundQuantity,
    );
    let returnShippingAmount = 0;
    let tariffSnapshot: Record<string, unknown> | null = null;

    if (includeReturnShipping && this.shippingTariffService) {
      const tariff = order.package?.shippingTariffId
        ? await this.shippingTariffService.getById(
            order.package.shippingTariffId,
          )
        : await this.shippingTariffService.getActiveOutboundTariff("surat");
      returnShippingAmount = shippingAmountForDesi(
        tariff,
        returnBillableDesi,
      ).toNumber();
      tariffSnapshot = {
        tariffId: tariff.id,
        tariffVersion: tariff.version,
        provider: tariff.provider,
        desi: returnBillableDesi,
        amount: returnShippingAmount,
      };
    }

    const financials = calculateRefundFinancials(policy, {
      totalAmount: Number(order.totalAmount),
      buyerShippingAmount: Number(
        order.buyerShippingAmount ?? order.shippingCost ?? 0,
      ),
      buyerFeeAmount: Number(order.buyerFeeAmount ?? 0),
      buyerServiceFeeAmount: Number(order.buyerServiceFeeAmount ?? 0),
      buyerServiceTaxAmount: Number(order.buyerServiceTaxAmount ?? 0),
      serviceVatRate: Number(order.serviceVatRate ?? 0),
      sellerFeeAmount: Number(order.sellerFeeAmount ?? 0),
      sellerCommissionAmount: Number(order.sellerCommissionAmount ?? 0),
      sellerPlatformFeeAmount: Number(order.sellerPlatformFeeAmount ?? 0),
      returnShippingAmount,
      sellerShippingAmount: Number(order.sellerShippingAmount ?? 0),
      orderQuantity: order.quantity ?? 1,
      refundQuantity,
    });

    return {
      financials,
      returnBillableDesi,
      snapshot: {
        version: 1,
        reason,
        policy,
        financials,
        returnTariff: tariffSnapshot,
        createdAt: new Date().toISOString(),
      } as unknown as Prisma.InputJsonValue,
    };
  }

  /**
   * İadenin KARGO bacağının settlement karşılığı — üç iade yolunun TEK kaynağı.
   *
   * Escrow hold TAM kargoyu düştüğü için satıcı kendi payını peşin ödemiş sayılır:
   * kusur alıcıdaysa (ya da gönderi hiç taşınmadıysa) bu pay hold'da satıcıya
   * bırakılır. Ters yönde, satıcı kusurunda alıcıya geri ödenen gidiş kargosu ve
   * dönüş kargosu satıcıya borç yazılır (Sürat faturası platforma gelir).
   */
  shippingSettlement(
    refundRequestId: string,
    financials: {
      sellerShippingCompensationAmount: number;
      outboundShippingChargeToSeller: number;
      returnShippingChargeToSeller: number;
    },
  ): {
    holdRetainedAmount: number;
    sellerAdjustments: Array<{
      sourceKey: string;
      amount: number;
      type: SellerAdjustmentType;
      refundRequestId: string;
    }>;
  } {
    return {
      holdRetainedAmount: financials.sellerShippingCompensationAmount,
      sellerAdjustments: [
        {
          sourceKey: `refund-return-shipping:${refundRequestId}`,
          amount: financials.returnShippingChargeToSeller,
          type: SellerAdjustmentType.return_shipping,
          refundRequestId,
        },
        {
          sourceKey: `refund-outbound-shipping:${refundRequestId}`,
          amount: financials.outboundShippingChargeToSeller,
          type: SellerAdjustmentType.outbound_shipping,
          refundRequestId,
        },
      ].filter((adjustment) => adjustment.amount > 0),
    };
  }

  refundFinancialData(
    policy: RefundPolicyDecision,
    result: Awaited<
      ReturnType<RefundFinancialService["buildFinancialPolicySnapshot"]>
    >,
  ): RefundFinancialPersistenceData {
    const { financials } = result;
    return {
      policyCode: policy.policyCode,
      financialPolicySnapshot: result.snapshot,
      returnBillableDesi: result.returnBillableDesi,
      returnShippingAmount: financials.returnShippingAmount,
      refundedProductAmount: financials.productRefundAmount,
      refundedOutboundShippingAmount: financials.outboundShippingRefundAmount,
      refundedBuyerProtectionAmount: financials.buyerProtectionRefundAmount,
      refundedSellerFeeAmount: financials.sellerFeeRefundAmount,
      retainedSellerPlatformFeeAmount:
        financials.sellerPlatformFeeRetainedAmount,
      returnShippingChargeToBuyer: financials.returnShippingChargeToBuyer,
      returnShippingChargeToSeller: financials.returnShippingChargeToSeller,
      sellerShippingCompensationAmount:
        financials.sellerShippingCompensationAmount,
      outboundShippingChargeToSeller: financials.outboundShippingChargeToSeller,
      requiresAdminReview: policy.requiresAdminReview,
      penaltyReviewRequired: policy.penaltyReviewRequired,
      refundProductAmount: true,
      refundShippingFee: policy.refundOutboundShipping,
      refundBuyerFee: policy.refundBuyerProtectionFee,
      refundSellerCommission: financials.sellerFeeRefundAmount > 0,
      returnShippingPayer: policy.returnShippingPayer ?? null,
    };
  }

  // ── PaymentHold kilit yardımcıları (escrow ↔ iade çakışmasını önler) ──

  /**
   * İade açıldığında satıcı PaymentHold'unu kilitle: hiçbir release yolu
   * frozenByRefundId dolu bir hold'u serbest bırakamaz (releaseHoldsDue hem
   * dueHolds filtresinde hem atomik updateMany guard'ında kontrol eder). Bu,
   * "14. günün son saniyesinde iade + payout çoktan gitti" yarışını kapatır.
   */
  async freezeHoldForRefund(
    orderId: string,
    refundRequestId: string,
  ): Promise<void> {
    await this.prisma.paymentHold.updateMany({
      where: { orderId, status: PaymentHoldStatus.held },
      data: { frozenByRefundId: refundRequestId },
    });
  }

  /** İade reddedilir/iptal edilirse hold kilidini kaldır → normal escrow akışına döner. */
  async unfreezeHoldForRefund(orderId: string): Promise<void> {
    await this.prisma.paymentHold.updateMany({
      where: {
        orderId,
        status: PaymentHoldStatus.held,
        NOT: { frozenByRefundId: null },
      },
      data: { frozenByRefundId: null },
    });
  }
}
