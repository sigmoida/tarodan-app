import { Injectable } from "@nestjs/common";
import {
  CommissionLedgerStatus,
  LedgerAccount,
  LedgerDirection,
  OrderStatus,
  PaymentHoldStatus,
  PaymentStatus,
  PayoutStatus,
  SellerAdjustmentStatus,
} from "@prisma/client";
import { PrismaService } from "../../prisma";
import { ledgerNetRevenue } from "../commission/ledger-net";
import { ELOGO_MAX_SEND_ATTEMPTS } from "../elogo/elogo-retry-policy";

/**
 * Finans ÖZETİ — admin'in "para nerede?" sorusuna tek bakışta cevap.
 *
 * Üç finans listesi (payments/payouts/invoices) üç ayrı tabloyu gösteriyordu;
 * para AKIŞI hiçbir yerde anlatılmıyordu. Bu servis akışın hunisini
 * (Tahsilat → Escrow → Transfer → Platform geliri) ve sağlık sayaçlarını
 * (başarısız transfer, süresi geçmiş hold, faturasız teslimat, tükenmiş eLogo
 * denemesi, açık satıcı borcu) tek uçta toplar. Sayıların çoğu zaten
 * üretiliyordu ama yalnız cron log'larına düşüyordu.
 */
@Injectable()
export class AdminFinanceService {
  constructor(private readonly prisma: PrismaService) {}

  /** Faturasız teslimat alarmıyla (order-scheduler) AYNI eşik. */
  private invoiceDeadlineDays(): number {
    return Number(process.env.INVOICE_DEADLINE_DAYS ?? "5") || 5;
  }

  private startOfMonth(now = new Date()): Date {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }

  async getFinanceOverview() {
    const now = new Date();
    const periodStart = this.startOfMonth(now);
    const createdAt = { gte: periodStart, lte: now };
    const uninvoicedBefore = new Date(
      now.getTime() - this.invoiceDeadlineDays() * 24 * 60 * 60 * 1000,
    );

    const [
      collected,
      escrowHeld,
      transferred,
      ledgerSums,
      failedTransfers,
      overdueHolds,
      uninvoicedDelivered,
      exhaustedInvoices,
      openAdjustments,
      pspFees,
    ] = await Promise.all([
      // Tahsilat (dönem): tamamlanan ödemelerin brüt toplamı = ciro. Platform
      // geliri DEĞİLDİR — o ledger'dan gelir (aşağıda).
      this.prisma.payment.aggregate({
        where: { status: PaymentStatus.completed, createdAt },
        _sum: { amount: true },
        _count: { id: true },
      }),
      // Escrow'da bekleyen (anlık stok): held hold'lar.
      this.prisma.paymentHold.aggregate({
        where: { status: PaymentHoldStatus.held },
        _sum: { amount: true },
        _count: { id: true },
      }),
      // Satıcıya gerçekten TRANSFER edilen (dönem): completed transferlerin
      // NET tutarı (borç mahsupları düşülmüş hali).
      this.prisma.payoutTransfer.aggregate({
        where: { status: PayoutStatus.completed, createdAt },
        _sum: { netAmount: true },
        _count: { id: true },
      }),
      // Platform NET geliri (dönem): ledger formülü (ledgerNetRevenue).
      this.prisma.commissionLedger.aggregate({
        where: {
          createdAt,
          status: { not: CommissionLedgerStatus.waived },
        },
        _sum: {
          sellerCommission: true,
          refundedSellerCommission: true,
          buyerFee: true,
          refundedBuyerFee: true,
        },
      }),
      this.prisma.payoutTransfer.count({
        where: {
          status: { in: [PayoutStatus.failed, PayoutStatus.returned] },
        },
      }),
      // Süresi geçmiş ama hâlâ held: releaseAt dolmuş, serbest bırakılmamış
      // (iade kilidi dahil — admin bakmalı).
      this.prisma.paymentHold.count({
        where: {
          status: PaymentHoldStatus.held,
          releaseAt: { not: null, lte: now },
        },
      }),
      // order-scheduler'ın ORDERS_DELIVERED_UNINVOICED alarmıyla aynı küme.
      this.prisma.order.count({
        where: {
          status: { in: [OrderStatus.delivered, OrderStatus.completed] },
          commissionLedger: { isNot: null },
          revenueInvoicedAt: null,
          deliveredAt: { lt: uninvoicedBefore },
        },
      }),
      // Deneme bütçesi tükenmiş eLogo belgeleri (yasal süre işliyor).
      this.prisma.elogoInvoice.count({
        where: {
          status: "failed",
          attemptCount: { gte: ELOGO_MAX_SEND_ATTEMPTS },
        },
      }),
      this.prisma.sellerAccountAdjustment.aggregate({
        where: { status: SellerAdjustmentStatus.open },
        _sum: { remainingAmount: true },
        _count: { id: true },
      }),
      // PSP (PayTR) kesintisi (dönem): defterdeki `psp_fee` DEBIT toplamı.
      // GERÇEK tutardır — PayTR ekstresi eşleştirilirken yazılır (tahmini oran
      // yalnız sipariş/kural ekranlarında kullanılır). Komisyon gelirinin
      // İÇİNDEN çıkar: hak ediş = ledger net gelir − PSP kesintisi.
      this.prisma.ledgerEntry.aggregate({
        where: {
          account: LedgerAccount.psp_fee,
          direction: LedgerDirection.debit,
          createdAt,
        },
        _sum: { amount: true },
      }),
    ]);

    const round2 = (n: number) => Math.round(n * 100) / 100;

    return {
      period: { start: periodStart, end: now },
      funnel: {
        collectedTotal: round2(Number(collected._sum.amount ?? 0)),
        collectedCount: collected._count.id,
        escrowHeldTotal: round2(Number(escrowHeld._sum.amount ?? 0)),
        escrowHeldCount: escrowHeld._count.id,
        transferredTotal: round2(Number(transferred._sum.netAmount ?? 0)),
        transferredCount: transferred._count.id,
        platformRevenueNet: round2(ledgerNetRevenue(ledgerSums._sum)),
        pspFeeTotal: round2(Number(pspFees._sum.amount ?? 0)),
        platformNetAfterPsp: round2(
          ledgerNetRevenue(ledgerSums._sum) - Number(pspFees._sum.amount ?? 0),
        ),
      },
      health: {
        failedTransfers,
        overdueHolds,
        uninvoicedDelivered,
        exhaustedInvoices,
        openAdjustmentsTotal: round2(
          Number(openAdjustments._sum.remainingAmount ?? 0),
        ),
        openAdjustmentsCount: openAdjustments._count.id,
      },
    };
  }

  /**
   * Fatura sayfası özet şeridi: bu ay kesilen (sent/signed) adet+brüt tutar,
   * bekleyen, başarısız ve TÜKENMİŞ (deneme bütçesi bitmiş) belge sayıları.
   */
  async getInvoicesSummary() {
    const now = new Date();
    const monthStart = this.startOfMonth(now);

    const [issued, pendingCount, failedCount, exhaustedCount] =
      await Promise.all([
        this.prisma.elogoInvoice.aggregate({
          where: {
            status: { in: ["sent", "signed"] },
            createdAt: { gte: monthStart, lte: now },
          },
          _sum: { total: true },
          _count: { id: true },
        }),
        this.prisma.elogoInvoice.count({
          where: { status: { in: ["pending", "processing"] } },
        }),
        this.prisma.elogoInvoice.count({
          where: {
            status: "failed",
            attemptCount: { lt: ELOGO_MAX_SEND_ATTEMPTS },
          },
        }),
        this.prisma.elogoInvoice.count({
          where: {
            status: "failed",
            attemptCount: { gte: ELOGO_MAX_SEND_ATTEMPTS },
          },
        }),
      ]);

    return {
      monthIssuedCount: issued._count.id,
      monthIssuedTotal: Math.round(Number(issued._sum.total ?? 0) * 100) / 100,
      pendingCount,
      failedCount,
      exhaustedCount,
    };
  }
}
