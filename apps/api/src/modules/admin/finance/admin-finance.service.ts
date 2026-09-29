import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../prisma";
import { trMonthStart } from "../../../common/helpers/tr-calendar";
import { FinanceReconciliationService } from "../../finance-reconciliation/finance-reconciliation.service";
import {
  exhaustedInvoicesWhere,
  failedTransfersWhere,
  openAdjustmentsWhere,
  overdueHoldsWhere,
  retryableFailedInvoicesWhere,
  uninvoicedDeliveredWhere,
} from "./finance-health.where";

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

  /**
   * Finans Özeti — SAĞLAMALI bölümler + sağlık şeridi. Bölümler
   * FinanceReconciliationService'ten gelir (ciro bölünmesi, satıcı hakedişi,
   * takas karşı taraf, platform geliri → hak ediş, alıcı iadeleri, PayTR
   * karşılaştırması); her bölüm kendi farkını taşır. Tüm zaman, dönem yok —
   * aylık kırılım dashboard/analiz ekranlarının işi. Sağlık sayaçları anlıktır.
   *
   * Sağlık kümelerinin where cümleleri `finance-health.where.ts`te; dashboard'un
   * "Para işlemleri" / "Belgeler" kuyrukları aynı tanımları okur.
   */
  async getFinanceOverview() {
    const now = new Date();

    const [
      reconciliation,
      failedTransfers,
      overdueHolds,
      uninvoicedDelivered,
      exhaustedInvoices,
      openAdjustments,
    ] = await Promise.all([
      this.reconciliation.build(),
      this.prisma.payoutTransfer.count({ where: failedTransfersWhere }),
      this.prisma.paymentHold.count({ where: overdueHoldsWhere(now) }),
      this.prisma.order.count({ where: uninvoicedDeliveredWhere(now) }),
      this.prisma.elogoInvoice.count({ where: exhaustedInvoicesWhere }),
      this.prisma.sellerAccountAdjustment.aggregate({
        where: openAdjustmentsWhere,
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
        this.prisma.elogoInvoice.count({ where: retryableFailedInvoicesWhere }),
        this.prisma.elogoInvoice.count({ where: exhaustedInvoicesWhere }),
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
