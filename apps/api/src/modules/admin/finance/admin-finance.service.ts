import { Injectable } from "@nestjs/common";
import {
  OrderStatus,
  PaymentHoldStatus,
  PayoutStatus,
  SellerAdjustmentStatus,
} from "@prisma/client";
import { PrismaService } from "../../../prisma";
import { trMonthStart } from "../../../common/helpers/tr-calendar";
import { ELOGO_MAX_SEND_ATTEMPTS } from "../../elogo/helpers/elogo-retry-policy";
import { FinanceReconciliationService } from "../../finance-reconciliation/finance-reconciliation.service";

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly reconciliation: FinanceReconciliationService,
  ) {}

  /** Faturasız teslimat alarmıyla (order-scheduler) AYNI eşik. */
  private invoiceDeadlineDays(): number {
    return Number(process.env.INVOICE_DEADLINE_DAYS ?? "5") || 5;
  }

  /**
   * Finans Özeti — SAĞLAMALI bölümler + sağlık şeridi. Bölümler
   * FinanceReconciliationService'ten gelir (ciro bölünmesi, satıcı hakedişi,
   * takas karşı taraf, platform geliri → hak ediş, alıcı iadeleri, PayTR
   * karşılaştırması); her bölüm kendi farkını taşır. Tüm zaman, dönem yok —
   * aylık kırılım dashboard/analiz ekranlarının işi. Sağlık sayaçları anlıktır.
   */
  async getFinanceOverview() {
    const now = new Date();
    const uninvoicedBefore = new Date(
      now.getTime() - this.invoiceDeadlineDays() * 24 * 60 * 60 * 1000,
    );

    const [
      reconciliation,
      failedTransfers,
      overdueHolds,
      uninvoicedDelivered,
      exhaustedInvoices,
      openAdjustments,
    ] = await Promise.all([
      this.reconciliation.build(),
      this.prisma.payoutTransfer.count({
        where: {
          status: { in: [PayoutStatus.failed, PayoutStatus.returned] },
        },
      }),
      // Süresi geçmiş ama hâlâ held: releaseAt dolmuş, serbest bırakılmamış
      // (iade kilidi dahil — admin bakmalı).
      this.prisma.paymentHold.count({
        where: {
          payment: { isTest: false },
          status: PaymentHoldStatus.held,
          releaseAt: { not: null, lte: now },
        },
      }),
      // order-scheduler'ın ORDERS_DELIVERED_UNINVOICED alarmıyla aynı küme.
      this.prisma.order.count({
        where: {
          isTest: false,
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
    ]);

    return {
      ...reconciliation,
      health: {
        failedTransfers,
        overdueHolds,
        uninvoicedDelivered,
        exhaustedInvoices,
        openAdjustmentsTotal:
          Math.round(Number(openAdjustments._sum.remainingAmount ?? 0) * 100) /
          100,
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
    // Ay sınırı Türkiye takvimine göre (süreç UTC'de koşar).
    const monthStart = trMonthStart(now);

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
