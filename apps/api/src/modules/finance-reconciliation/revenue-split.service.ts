import { Injectable, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OrderOrigin, PaymentStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma";
import { OrderTaxPolicyService } from "../order/pricing/order-tax-policy.service";
import { TaxService } from "../tax/tax.service";
import {
  assembleRevenueSplit,
  type PhysicalSplit,
  type VatRates,
} from "./helpers/revenue-split.helper";
import type {
  ReconciliationDiagnostics,
  ReconciliationSection,
} from "./finance-reconciliation.types";

/** Tahsilat: tam iade edilen ödeme `refunded`a geçer; brüt ciro ikisini de sayar. */
export const COLLECTED_PAYMENT_STATUSES = [
  PaymentStatus.completed,
  PaymentStatus.refunded,
] as const;

export interface RevenueSplitResult {
  section: ReconciliationSection;
  diagnostics: ReconciliationDiagnostics;
  /** S3'ün başlangıç noktası (KDV hariç platform ücret geliri). */
  platformFeesNet: number;
  rates: VatRates;
}

/**
 * S1 — Ciro nereye gitti. Hem admin Finans Özeti hem gece defter denetimi
 * (REVENUE_SPLIT_DRIFT) bu hesabı kullanır; formül tek yerde durur.
 *
 * Fiziksel sipariş bölünmesi tek SQL: ödeme → sipariş (order_id ∪ checkout_group_id)
 * → hold. Sipariş anındaki snapshot kolonlarından okunur; defter (eksik hesaplar)
 * kullanılmaz. Diğer her şey Prisma aggregate.
 */
/** eLogo belgeleriyle aynı varsayılan standart KDV (env yoksa). */
const ELOGO_DEFAULT_VAT_RATE = 20;

@Injectable()
export class RevenueSplitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Optional() private readonly taxPolicy?: OrderTaxPolicyService,
    @Optional() private readonly taxService?: TaxService,
  ) {}

  async resolveRates(): Promise<VatRates> {
    let serviceVatRate = 0;
    if (this.taxPolicy) {
      const policy = await this.taxPolicy.resolve();
      serviceVatRate = this.taxPolicy.effectiveServiceVatRate(policy);
    }
    // Üyelik/öne çıkarma faturaları eLogo'da "standard" kaynağından kesilir
    // (bölge varsayılanı, yoksa ELOGO_VAT_RATE); gelir/KDV ayrımı faturayla
    // aynı orandan yapılır ki beyan ile özet ayrışmasın.
    let standardVatRate: number | null = null;
    try {
      const resolved = await this.taxService?.resolveTaxRate("TR", null, null);
      if (resolved && resolved.rate > 0) standardVatRate = resolved.rate;
    } catch {
      // vergi tabloları yok/okunamadı — env'e düş
    }
    if (standardVatRate === null) {
      const env = Number(this.config.get<string>("ELOGO_VAT_RATE"));
      // ElogoDocumentService.resolveVatRate ile aynı son basamak: 20.
      standardVatRate =
        Number.isFinite(env) && env > 0 ? env : ELOGO_DEFAULT_VAT_RATE;
    }
    return { serviceVatRate, standardVatRate };
  }

  private async physicalSplit(): Promise<PhysicalSplit> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        order_count: number;
        payment_count: number;
        total: Prisma.Decimal | null;
        seller_share: Prisma.Decimal | null;
        platform_fees: Prisma.Decimal | null;
        service_vat: Prisma.Decimal | null;
        shipping: Prisma.Decimal | null;
        withholding: Prisma.Decimal | null;
        shipping_deficit: Prisma.Decimal | null;
        product_tax: Prisma.Decimal | null;
        commission_total: Prisma.Decimal | null;
        orders_without_hold: number;
      }>
    >`
      WITH paid AS (
        SELECT id AS payment_id, order_id, checkout_group_id
        FROM payments
        WHERE status IN ('completed', 'refunded') AND trade_cash_payment_id IS NULL
      ),
      paid_orders AS (
        SELECT o.*, p.payment_id FROM orders o JOIN paid p ON p.order_id = o.id
        UNION ALL
        SELECT o.*, p.payment_id FROM orders o
          JOIN paid p ON p.checkout_group_id = o.checkout_group_id
        WHERE p.order_id IS NULL
      ),
      split AS (
        SELECT
          o.id, o.payment_id, o.total_amount, o.tax_amount, o.commission_amount,
          (o.commission_amount - o.platform_funded_discount)          AS platform_fees,
          (o.buyer_service_tax_amount + o.seller_service_tax_amount)  AS service_vat,
          CASE WHEN o.buyer_shipping_amount > 0 OR o.seller_shipping_amount > 0
               THEN o.buyer_shipping_amount + o.seller_shipping_amount
               ELSE o.shipping_cost END                               AS shipping,
          o.withholding_tax_amount                                    AS withholding,
          h.id                                                        AS hold_id,
          COALESCE(h.amount, 0)                                       AS hold_amount
        FROM paid_orders o
        LEFT JOIN payment_holds h ON h.order_id = o.id AND h.payment_id = o.payment_id
        WHERE o.origin <> 'platform_service'
      )
      SELECT
        COUNT(*)::int                                            AS order_count,
        COUNT(DISTINCT payment_id)::int                          AS payment_count,
        COALESCE(SUM(total_amount), 0)                           AS total,
        COALESCE(SUM(hold_amount), 0)                            AS seller_share,
        COALESCE(SUM(platform_fees), 0)                          AS platform_fees,
        COALESCE(SUM(service_vat), 0)                            AS service_vat,
        COALESCE(SUM(shipping), 0)                               AS shipping,
        COALESCE(SUM(withholding), 0)                            AS withholding,
        -- hold ham değeri = total − ücret − KDV − kargo − stopaj; negatifse createHold
        -- 0'a kırpıp farkı kargo açığı borcu yazar; S1 aynı farkı negatif satır yapar.
        COALESCE(SUM(GREATEST(0,
          -(total_amount - platform_fees - service_vat - shipping - withholding))), 0)
                                                                 AS shipping_deficit,
        COALESCE(SUM(tax_amount), 0)                             AS product_tax,
        COALESCE(SUM(commission_amount), 0)                      AS commission_total,
        COUNT(*) FILTER (WHERE hold_id IS NULL)::int             AS orders_without_hold
      FROM split
    `;
    const r = rows[0];
    const n = (v: Prisma.Decimal | number | null | undefined) =>
      v == null ? 0 : Number(v);
    return {
      orderCount: n(r?.order_count),
      paymentCount: n(r?.payment_count),
      total: n(r?.total),
      sellerShare: n(r?.seller_share),
      platformFees: n(r?.platform_fees),
      serviceVat: n(r?.service_vat),
      shipping: n(r?.shipping),
      withholding: n(r?.withholding),
      shippingDeficit: n(r?.shipping_deficit),
      productTax: n(r?.product_tax),
      commissionTotal: n(r?.commission_total),
      ordersWithoutHold: n(r?.orders_without_hold),
    };
  }

  async compute(): Promise<RevenueSplitResult> {
    const paidStatuses = [...COLLECTED_PAYMENT_STATUSES];
    const [
      rates,
      physical,
      payments,
      renewals,
      trade,
      virtualOrders,
      commissionLedger,
    ] = await Promise.all([
      this.resolveRates(),
      this.physicalSplit(),
      this.prisma.payment.aggregate({
        where: { status: { in: paidStatuses } },
        _sum: { amount: true },
        _count: { id: true },
      }),
      // MEM- siparişi hem Payment hem MembershipPayment üretir; yalnız yenilemeler
      // (order_id NULL) Payment tablosunun dışındadır.
      this.prisma.membershipPayment.aggregate({
        where: { status: { in: paidStatuses }, orderId: null },
        _sum: { amount: true },
        _count: { id: true },
      }),
      this.prisma.tradeCashPayment.aggregate({
        where: { payment: { status: { in: paidStatuses } } },
        _sum: {
          amount: true,
          tradeFeeAmount: true,
          shippingAmount: true,
          commission: true,
          commissionTaxAmount: true,
          totalAmount: true,
        },
        _count: { id: true },
      }),
      this.prisma.order.aggregate({
        where: {
          origin: OrderOrigin.platform_service,
          payment: { status: { in: paidStatuses } },
        },
        _sum: { totalAmount: true },
        _count: { id: true },
      }),
      this.prisma.commissionLedger.aggregate({
        _sum: { sellerCommission: true, buyerFee: true },
      }),
    ]);

    const num = (v: unknown) => (v == null ? 0 : Number(v));
    const assembled = assembleRevenueSplit(
      {
        collectedTotal: num(payments._sum.amount) + num(renewals._sum.amount),
        collectedCount: payments._count.id + renewals._count.id,
        physical,
        trade: {
          count: trade._count.id,
          total: num(trade._sum.totalAmount),
          counterpart: num(trade._sum.amount),
          tradeFeeGross: num(trade._sum.tradeFeeAmount),
          legacyCommission: num(trade._sum.commission),
          legacyCommissionTax: num(trade._sum.commissionTaxAmount),
          shipping: num(trade._sum.shippingAmount),
        },
        virtualOrders: {
          count: virtualOrders._count.id,
          gross: num(virtualOrders._sum.totalAmount),
        },
        membershipRenewals: {
          count: renewals._count.id,
          gross: num(renewals._sum.amount),
        },
        commissionLedgerTotal:
          num(commissionLedger._sum.sellerCommission) +
          num(commissionLedger._sum.buyerFee),
      },
      rates,
    );
    return { ...assembled, rates };
  }
}
