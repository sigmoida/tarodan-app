import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  CommissionLedgerStatus,
  LedgerAccount,
  LedgerDirection,
  OrderOrigin,
  PaymentHoldStatus,
  PaymentStatus,
  PayoutStatus,
  PaytrStatementLineType,
  RefundAttemptStatus,
  RefundFinancialTreatment,
  RefundRequestStatus,
} from "@prisma/client";
import { PrismaService } from "../../prisma";
import { paytrReportSyncEnabled } from "../../config/paytr";
import { istanbulDayStart } from "../../common/helpers/tr-calendar";
import {
  COLLECTED_PAYMENT_STATUSES,
  RevenueSplitService,
} from "./revenue-split.service";
import { splitGrossByVat } from "./helpers/revenue-split.helper";
import {
  balancedAmount,
  round2,
  type ComparisonRow,
  type ComparisonSection,
  type ReconciliationDiagnostics,
  type ReconciliationLine,
  type ReconciliationSection,
} from "./finance-reconciliation.types";

export interface FinanceReconciliation {
  syncEnabled: boolean;
  sections: ReconciliationSection[];
  comparison: ComparisonSection;
  diagnostics: ReconciliationDiagnostics;
}

const num = (v: unknown): number => (v == null ? 0 : Number(v));
const sum = (lines: ReconciliationLine[]) =>
  lines.reduce((s, l) => s + l.amount, 0);

/**
 * Finans Özeti v2 — S2..S4. S1 (ciro bölünmesi) RevenueSplitService'te; burada
 * satıcı hakedişinin nerede olduğu, takas karşı taraf parası, platform gelirinden
 * Tarodan hak edişine şelale, alıcı iadeleri kırılımı ve PayTR karşılaştırması.
 * Snapshot kolonlarından okur; defter yalnız PSP kesintisi için kullanılır.
 */
@Injectable()
export class FinanceReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly revenueSplit: RevenueSplitService,
  ) {}

  async build(): Promise<FinanceReconciliation> {
    const syncEnabled = paytrReportSyncEnabled(this.config);
    const s1 = await this.revenueSplit.compute();
    const [
      sellerShare,
      tradeCounterpart,
      platformNet,
      buyerRefunds,
      comparison,
    ] = await Promise.all([
      this.sellerShareSection(),
      this.tradeCounterpartSection(),
      this.platformNetSection(s1.platformFeesNet, s1.rates.serviceVatRate),
      this.buyerRefundsSection(),
      this.pspComparison(syncEnabled),
    ]);
    return {
      syncEnabled,
      sections: [
        s1.section,
        sellerShare,
        tradeCounterpart,
        platformNet,
        buyerRefunds,
      ],
      comparison,
      diagnostics: s1.diagnostics,
    };
  }

  /** S2 — Satıcı hakedişi nerede (anlık): Σ hold.amount = escrow + yolda + ödendi + mahsup + iade. */
  private async sellerShareSection(): Promise<ReconciliationSection> {
    const [all, held, inTransit, paid, refundedOnLive, cancelled] =
      await Promise.all([
        this.prisma.paymentHold.aggregate({
          _sum: { amount: true },
          _count: { id: true },
        }),
        this.prisma.paymentHold.aggregate({
          where: { status: PaymentHoldStatus.held },
          _sum: { amount: true, refundedAmount: true },
          _count: { id: true },
        }),
        // Serbest bırakılmış ama transfer tamamlanmamış (payout yok / pending /
        // processing / retry / failed / returned): para platformda, satıcıda değil.
        this.prisma.paymentHold.aggregate({
          where: {
            status: PaymentHoldStatus.released,
            OR: [
              { payoutTransfer: null },
              { payoutTransfer: { status: { not: PayoutStatus.completed } } },
            ],
          },
          _sum: { amount: true, refundedAmount: true },
          _count: { id: true },
        }),
        this.prisma.payoutTransfer.aggregate({
          where: {
            status: PayoutStatus.completed,
            paymentHoldId: { not: null },
          },
          _sum: { netAmount: true, adjustmentDeduction: true },
          _count: { id: true },
        }),
        // İade edilen satıcı payı: canlı hold'larda refundedAmount; iptal (cancelled)
        // hold'da tamamı (iade yolunda refundedAmount=amount, süre dolumunda 0 —
        // ikisi de "satıcıya gitmedi" demektir).
        this.prisma.paymentHold.aggregate({
          where: { status: { not: PaymentHoldStatus.cancelled } },
          _sum: { refundedAmount: true },
        }),
        this.prisma.paymentHold.aggregate({
          where: { status: PaymentHoldStatus.cancelled },
          _sum: { amount: true },
          _count: { id: true },
        }),
      ]);

    const components: ReconciliationLine[] = [
      {
        key: "escrowHeld",
        amount: round2(num(held._sum.amount) - num(held._sum.refundedAmount)),
        count: held._count.id,
        href: "/finance/payouts?tab=escrow",
      },
      {
        key: "inTransit",
        amount: round2(
          num(inTransit._sum.amount) - num(inTransit._sum.refundedAmount),
        ),
        count: inTransit._count.id,
        href: "/finance/payouts?tab=transfers",
      },
      {
        key: "paidNet",
        amount: round2(num(paid._sum.netAmount)),
        count: paid._count.id,
        href: "/finance/payouts?tab=transfers&status=completed",
      },
      {
        key: "adjustmentDeducted",
        amount: round2(num(paid._sum.adjustmentDeduction)),
        href: "/finance/payouts?tab=adjustments",
      },
      {
        key: "refundedToBuyer",
        amount: round2(
          num(refundedOnLive._sum.refundedAmount) + num(cancelled._sum.amount),
        ),
        count: cancelled._count.id,
        href: "/finance/payments/refund-reconciliation",
      },
    ];
    const total = round2(num(all._sum.amount));
    const difference = round2(total - sum(components));
    return {
      key: "sellerShare",
      kind: "identity",
      scope: "instant",
      total: { key: "holdsCreated", amount: total, count: all._count.id },
      components,
      difference,
      balanced: balancedAmount(difference),
    };
  }

  /** S2b — Takas karşı taraf parası: Σ TCP.amount = release bekleyen + yolda + ödendi + iade. */
  private async tradeCounterpartSection(): Promise<ReconciliationSection> {
    const rows = await this.prisma.tradeCashPayment.findMany({
      where: { payment: { status: { in: [...COLLECTED_PAYMENT_STATUSES] } } },
      select: {
        amount: true,
        status: true,
        releasedAt: true,
        payoutTransfers: {
          select: { status: true, netAmount: true, adjustmentDeduction: true },
        },
      },
    });
    let total = 0;
    let awaiting = 0;
    let inTransit = 0;
    let paid = 0;
    let deducted = 0;
    let refunded = 0;
    let awaitingCount = 0;
    let paidCount = 0;
    for (const r of rows) {
      const amount = num(r.amount);
      total += amount;
      if (r.status === PaymentStatus.refunded) {
        refunded += amount;
        continue;
      }
      const completed = r.payoutTransfers.find(
        (p) => p.status === PayoutStatus.completed,
      );
      if (completed) {
        paid += num(completed.netAmount);
        deducted += num(completed.adjustmentDeduction);
        paidCount++;
      } else if (r.releasedAt) {
        inTransit += amount;
      } else {
        awaiting += amount;
        awaitingCount++;
      }
    }
    const components: ReconciliationLine[] = [
      {
        key: "awaitingRelease",
        amount: round2(awaiting),
        count: awaitingCount,
      },
      { key: "inTransit", amount: round2(inTransit) },
      {
        key: "paidNet",
        amount: round2(paid),
        count: paidCount,
        href: "/finance/payouts?tab=transfers",
      },
      { key: "adjustmentDeducted", amount: round2(deducted) },
      { key: "refunded", amount: round2(refunded) },
    ];
    const difference = round2(round2(total) - sum(components));
    return {
      key: "tradeCounterpart",
      kind: "identity",
      scope: "instant",
      total: {
        key: "tradeCounterpart",
        amount: round2(total),
        count: rows.length,
        href: "/operations/trades",
      },
      components,
      difference,
      balanced: balancedAmount(difference),
    };
  }

  /** S3 — Platform ücret geliri → Tarodan hak edişi (şelale). */
  private async platformNetSection(
    platformFeesNet: number,
    serviceVatRate: number,
  ): Promise<ReconciliationSection> {
    const [
      refundedFees,
      waived,
      tradeReversed,
      virtualRefunded,
      absorbed,
      pspFee,
    ] = await Promise.all([
      this.prisma.commissionLedger.aggregate({
        where: { status: { not: CommissionLedgerStatus.waived } },
        _sum: { refundedSellerCommission: true, refundedBuyerFee: true },
      }),
      // Feragat: status waived, refunded* sıfır kalır — ayrı satır.
      this.prisma.commissionLedger.aggregate({
        where: { status: CommissionLedgerStatus.waived },
        _sum: { sellerCommission: true, buyerFee: true },
        _count: { id: true },
      }),
      // Takas tam iade: ücret de geri döner (S1'de gelir sayılmıştı).
      this.prisma.tradeCashPayment.aggregate({
        where: {
          status: PaymentStatus.refunded,
          fullRefundEntitled: true,
          payment: { status: PaymentStatus.refunded },
        },
        _sum: { tradeFeeAmount: true, commission: true },
      }),
      // Sanal sipariş (üyelik/öne çıkarma) tam iadesi.
      this.prisma.order.aggregate({
        where: {
          origin: OrderOrigin.platform_service,
          payment: { status: PaymentStatus.refunded },
        },
        _sum: { totalAmount: true },
      }),
      // Platformun karşıladığı iade kalemleri (ör. iade kargosu) — gider.
      this.prisma.refundFinancialComponent.aggregate({
        where: {
          treatment: RefundFinancialTreatment.platform_absorb,
          refundRequest: { status: RefundRequestStatus.refunded },
        },
        _sum: { netAmount: true },
      }),
      this.prisma.ledgerEntry.aggregate({
        where: {
          account: LedgerAccount.psp_fee,
          direction: LedgerDirection.debit,
        },
        _sum: { amount: true },
      }),
    ]);

    const tradeFeeNet = splitGrossByVat(
      num(tradeReversed._sum.tradeFeeAmount),
      serviceVatRate,
    ).net;
    const virtualNet = splitGrossByVat(
      num(virtualRefunded._sum.totalAmount),
      serviceVatRate,
    ).net;
    const components: ReconciliationLine[] = [
      {
        key: "refundedFees",
        amount: round2(
          -(
            num(refundedFees._sum.refundedSellerCommission) +
            num(refundedFees._sum.refundedBuyerFee)
          ),
        ),
        href: "/finance/commission",
      },
      {
        key: "waivedFees",
        amount: round2(
          -(num(waived._sum.sellerCommission) + num(waived._sum.buyerFee)),
        ),
        count: waived._count.id,
      },
      {
        key: "tradeFeeReversed",
        amount: round2(-(tradeFeeNet + num(tradeReversed._sum.commission))),
      },
      { key: "virtualRefundsNet", amount: round2(-virtualNet) },
      {
        key: "platformAbsorbed",
        amount: round2(-num(absorbed._sum.netAmount)),
        href: "/finance/payments/refund-reconciliation",
      },
      {
        key: "pspFee",
        amount: round2(-num(pspFee._sum.amount)),
        syncDependent: true,
        href: "/finance/psp",
      },
    ];
    const total = round2(platformFeesNet);
    const result = round2(total + sum(components));
    return {
      key: "platformNet",
      kind: "waterfall",
      scope: "allTime",
      total: {
        key: "platformFeesNet",
        amount: total,
        href: "/finance/commission",
      },
      components,
      difference: 0,
      balanced: true,
      result: { key: "tarodanNet", amount: result, syncDependent: true },
    };
  }

  /** S3-bilgi — Alıcıya iade edilen para, bileşenlerine göre (v1/elle olanlar "ayrıştırılamayan"). */
  private async buyerRefundsSection(): Promise<ReconciliationSection> {
    const [attempts, requests] = await Promise.all([
      this.prisma.refundAttempt.aggregate({
        where: {
          status: {
            in: [RefundAttemptStatus.succeeded, RefundAttemptStatus.finalized],
          },
        },
        _sum: { amount: true },
        _count: { id: true },
      }),
      this.prisma.refundRequest.aggregate({
        where: { status: RefundRequestStatus.refunded },
        _sum: {
          refundedProductAmount: true,
          refundedOutboundShippingAmount: true,
          refundedBuyerProtectionAmount: true,
          refundedBuyerServiceTaxAmount: true,
          returnShippingChargeToBuyer: true,
        },
        _count: { id: true },
      }),
    ]);
    const known: ReconciliationLine[] = [
      {
        key: "product",
        amount: round2(num(requests._sum.refundedProductAmount)),
      },
      {
        key: "outboundShipping",
        amount: round2(num(requests._sum.refundedOutboundShippingAmount)),
      },
      {
        key: "buyerFees",
        amount: round2(num(requests._sum.refundedBuyerProtectionAmount)),
      },
      {
        key: "buyerVat",
        amount: round2(num(requests._sum.refundedBuyerServiceTaxAmount)),
      },
      {
        key: "returnShippingCharged",
        amount: round2(-num(requests._sum.returnShippingChargeToBuyer)),
      },
    ];
    const total = round2(num(attempts._sum.amount));
    const unclassified = round2(total - sum(known));
    return {
      key: "buyerRefunds",
      kind: "breakdown",
      scope: "allTime",
      total: {
        key: "buyerRefunds",
        amount: total,
        count: attempts._count.id,
        href: "/finance/payments/refund-reconciliation",
      },
      components: [...known, { key: "unclassified", amount: unclassified }],
      difference: 0,
      balanced: true,
    };
  }

  /**
   * S4 — PayTR ile karşılaştırma. "Bizim" taraf PayTR dökümünün kapsadığı ilk
   * günden itibaren sayılır (senkron başlamadan önceki tarih farkı sahte kırmızı
   * üretmesin). Payout satırı senkrondan bağımsızdır.
   */
  private async pspComparison(
    syncEnabled: boolean,
  ): Promise<ComparisonSection> {
    const first = await this.prisma.paytrStatementLine.findFirst({
      orderBy: { transactionDate: "asc" },
      select: { transactionDate: true },
    });
    const coverageFrom = first
      ? first.transactionDate.toISOString().slice(0, 10)
      : null;
    const from = coverageFrom ? istanbulDayStart(coverageFrom) : null;
    const paid = [...COLLECTED_PAYMENT_STATUSES];

    const [
      theirSales,
      theirRefunds,
      settlements,
      ourPayments,
      ourRenewals,
      ourRefunds,
      ourPspFee,
      payoutsSubmitted,
      payoutsCompleted,
      payoutsReturned,
      payoutsAwaiting,
    ] = await Promise.all([
      this.prisma.paytrStatementLine.aggregate({
        where: { type: PaytrStatementLineType.sale },
        _sum: { amount: true, fee: true },
      }),
      this.prisma.paytrStatementLine.aggregate({
        where: { type: PaytrStatementLineType.refund },
        _sum: { amount: true },
      }),
      this.prisma.paytrSettlement.aggregate({
        where: { isProjection: false },
        _sum: { netTotal: true },
      }),
      this.prisma.payment.aggregate({
        where: {
          provider: "paytr",
          status: { in: paid },
          ...(from ? { paidAt: { gte: from } } : {}),
        },
        _sum: { amount: true },
      }),
      this.prisma.membershipPayment.aggregate({
        where: {
          provider: "paytr",
          orderId: null,
          status: { in: paid },
          ...(from ? { createdAt: { gte: from } } : {}),
        },
        _sum: { amount: true },
      }),
      this.prisma.refundAttempt.aggregate({
        where: {
          provider: "paytr",
          status: {
            in: [RefundAttemptStatus.succeeded, RefundAttemptStatus.finalized],
          },
          ...(from ? { providerSucceededAt: { gte: from } } : {}),
        },
        _sum: { amount: true },
      }),
      this.prisma.ledgerEntry.aggregate({
        where: {
          account: LedgerAccount.psp_fee,
          direction: LedgerDirection.debit,
        },
        _sum: { amount: true },
      }),
      this.prisma.payoutTransfer.aggregate({
        where: { submittedAt: { not: null } },
        _sum: { submittedAmount: true },
        _count: { id: true },
      }),
      this.prisma.payoutTransfer.aggregate({
        where: { submittedAt: { not: null }, status: PayoutStatus.completed },
        _sum: { submittedAmount: true },
        _count: { id: true },
      }),
      this.prisma.payoutTransfer.aggregate({
        where: { submittedAt: { not: null }, status: PayoutStatus.returned },
        _sum: { submittedAmount: true },
        _count: { id: true },
      }),
      this.prisma.payoutTransfer.aggregate({
        where: { submittedAt: { not: null }, status: PayoutStatus.processing },
        _sum: { submittedAmount: true },
        _count: { id: true },
      }),
    ]);

    const row = (
      key: ComparisonRow["key"],
      ours: number,
      theirs: number,
      extra: Partial<ComparisonRow> = {},
    ): ComparisonRow => {
      const difference = round2(ours - theirs);
      return {
        key,
        ours: round2(ours),
        theirs: round2(theirs),
        difference,
        balanced: balancedAmount(difference),
        ...extra,
      };
    };

    const ourSales =
      num(ourPayments._sum.amount) + num(ourRenewals._sum.amount);
    const ourRefundTotal = num(ourRefunds._sum.amount);
    const ourFee = num(ourPspFee._sum.amount);
    const awaiting = num(payoutsAwaiting._sum.submittedAmount);
    const rows: ComparisonRow[] = [
      row("sales", ourSales, num(theirSales._sum.amount)),
      row("refunds", ourRefundTotal, num(theirRefunds._sum.amount)),
      row("pspFee", ourFee, num(theirSales._sum.fee)),
      // Hakediş net = satış − iade − kesinti (satıcı payı dahil, merchant hesabına
      // giren TÜM para); Tarodan hak edişiyle KARŞILAŞTIRILMAZ. Valör farkı olur.
      row(
        "settlementNet",
        ourSales - ourRefundTotal - ourFee,
        num(settlements._sum.netTotal),
      ),
      // PayTR transfer sonuç listesi yok: tamamlanan (callback) + geri dönen (liste)
      // ne kadarını açıklıyorsa "onlar"; kalan sonucu bekleyen talimat.
      {
        ...row(
          "payouts",
          num(payoutsSubmitted._sum.submittedAmount),
          num(payoutsCompleted._sum.submittedAmount) +
            num(payoutsReturned._sum.submittedAmount),
        ),
        balanced: payoutsAwaiting._count.id === 0,
        count: payoutsAwaiting._count.id,
        difference: round2(awaiting),
      },
    ];
    return { key: "psp", syncEnabled, coverageFrom, rows };
  }
}
