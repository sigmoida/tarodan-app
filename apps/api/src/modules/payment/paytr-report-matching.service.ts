import { Injectable, Logger, Optional } from "@nestjs/common";
import {
  LedgerAccount,
  LedgerDirection,
  LedgerEventType,
  PaytrMatchStatus,
  PaytrStatementLineType,
  PaymentStatus,
  RefundAttemptStatus,
} from "@prisma/client";
import { PrismaService } from "../../prisma";
import { LedgerService } from "../ledger/ledger.service";

/** Tutar eşlemesi toleransı (kuruş yuvarlamaları). */
const MATCH_TOLERANCE_TL = 0.05;
/** Bir turda eşlenecek en fazla satır. */
const MATCH_BATCH = 200;
/** Ters yön taramasının geriye bakış penceresi (statement pencersiyle hizalı + pay). */
const REVERSE_SWEEP_DAYS = 4;
/** PayTR rapor günleri İstanbul saatiyledir; TR 2016'dan beri sabit UTC+3 (DST yok). */
const ISTANBUL_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

/**
 * Faz 3 — PSP mutabakat fark motoru. Rapor sync'inin (Faz 2) doldurduğu yerel
 * tablolar üzerinde çalışır; PayTR'ye istek ATMAZ:
 *
 *  - İleri yön: her `PaytrStatementLine` bir Payment (satış) ya da RefundAttempt
 *    (iade) ile eşleşmeli. Oid eşleşip tutar tutmazsa `amount_mismatch`; hiç
 *    karşılık yoksa `unmatched` kalır — admin mutabakat ekranı bu iki durumu listeler.
 *  - Ters yön: dökümü OLAN günlerde bizde `completed/refunded` görünüp PayTR
 *    dökümünde OLMAYAN ödeme → para gerçekte gelmemiş olabilir; en kritik alarm.
 *    Dökümü olmayan gün taranmaz (rapor yetkisi yokken her ödeme alarma dönmesin).
 *  - Hakediş doğrulaması: sales - returns = net (PayTR iç tutarlılığı) ve kalem
 *    toplamı ↔ satış toplamı; kalemlerin Payment bağı da burada doldurulur.
 */
@Injectable()
export class PaytrReportMatchingService {
  private readonly logger = new Logger(PaytrReportMatchingService.name);

  constructor(
    private readonly prisma: PrismaService,
    // Faz 5: PayTR kesintisinin psp_fee gider kaydı. @Optional + best-effort —
    // defter hatası mutabakatı BOZMAZ (fulfillment-finalizer ile aynı kalıp).
    @Optional()
    private readonly ledger?: LedgerService,
  ) {}

  /** Oid → Payment: önce güncel oid (providerConversationId), sonra oid geçmişi (Y8). */
  private async findPaymentByOid(
    oid: string,
  ): Promise<{ id: string; amount: unknown } | null> {
    const direct = await this.prisma.payment.findFirst({
      where: { providerConversationId: oid },
      select: { id: true, amount: true },
    });
    if (direct) return direct;
    return this.prisma.payment.findFirst({
      where: {
        metadata: { path: ["merchantOidHistory"], array_contains: oid },
      },
      select: { id: true, amount: true },
    });
  }

  private amountsAgree(a: unknown, b: unknown): boolean {
    return Math.abs(Number(a) - Number(b)) <= MATCH_TOLERANCE_TL;
  }

  async matchStatementLines(): Promise<{
    processed: number;
    matched: number;
    mismatched: number;
    unmatched: number;
    missingInPaytr: number;
  }> {
    const lines = await this.prisma.paytrStatementLine.findMany({
      where: { matchStatus: PaytrMatchStatus.unmatched },
      orderBy: { transactionDate: "asc" },
      take: MATCH_BATCH,
    });

    let matched = 0;
    let mismatched = 0;
    let unmatched = 0;

    for (const line of lines) {
      if (line.type === PaytrStatementLineType.sale) {
        const payment = await this.findPaymentByOid(line.merchantOid);
        if (!payment) {
          unmatched++;
          continue;
        }
        const ok = this.amountsAgree(payment.amount, line.amount);
        await this.prisma.paytrStatementLine.update({
          where: { id: line.id },
          data: {
            matchStatus: ok
              ? PaytrMatchStatus.matched
              : PaytrMatchStatus.amount_mismatch,
            paymentId: payment.id,
          },
        });
        if (ok) matched++;
        else {
          mismatched++;
          this.logger.error(
            `PAYTR_STATEMENT_MISMATCH: satış satırı ${line.id} oid=${line.merchantOid} ` +
              `PayTR=${line.amount} bizde=${payment.amount} — tutarlar uyuşmuyor (manuel inceleme)`,
          );
        }
      } else {
        // İade satırı: işlem dökümünde reference_no yok — providerReference (oid)
        // + tutar üzerinden eşlenir. Yalnız sağlayıcıda GERÇEKLEŞMİŞ denemeler aday.
        const candidates = await this.prisma.refundAttempt.findMany({
          where: {
            providerReference: line.merchantOid,
            status: {
              in: [
                RefundAttemptStatus.succeeded,
                RefundAttemptStatus.finalized,
              ],
            },
          },
          select: { id: true, paymentId: true, amount: true },
        });
        const attempt = candidates.find((c) =>
          this.amountsAgree(c.amount, line.amount),
        );
        if (attempt) {
          await this.prisma.paytrStatementLine.update({
            where: { id: line.id },
            data: {
              matchStatus: PaytrMatchStatus.matched,
              refundAttemptId: attempt.id,
              paymentId: attempt.paymentId,
            },
          });
          matched++;
        } else if (candidates.length > 0) {
          await this.prisma.paytrStatementLine.update({
            where: { id: line.id },
            data: {
              matchStatus: PaytrMatchStatus.amount_mismatch,
              refundAttemptId: candidates[0].id,
              paymentId: candidates[0].paymentId,
            },
          });
          mismatched++;
          this.logger.error(
            `PAYTR_STATEMENT_MISMATCH: iade satırı ${line.id} oid=${line.merchantOid} ` +
              `PayTR=${line.amount} — aynı oid'li iade denemeleriyle tutar uyuşmuyor`,
          );
        } else {
          unmatched++;
        }
      }
    }

    const missingInPaytr = await this.sweepMissingPayments();

    if (mismatched > 0 || missingInPaytr > 0) {
      this.logger.warn(
        `PayTR mutabakat: ${matched} eşleşti, ${mismatched} tutar farkı, ` +
          `${unmatched} karşılıksız satır, ${missingInPaytr} dökümde olmayan ödeme`,
      );
    }
    return {
      processed: lines.length,
      matched,
      mismatched,
      unmatched,
      missingInPaytr,
    };
  }

  /**
   * Ters yön: dökümü olan her gün için bizde o gün tamamlanmış ama PayTR
   * dökümünde görünmeyen ödemeleri bul. Otomatik aksiyon YOK — yüksek öncelikli
   * alarm (para PayTR'ye hiç düşmemiş olabilir; manuel doğrulama gerekir).
   */
  private async sweepMissingPayments(): Promise<number> {
    const cutoff = new Date(
      Date.now() - REVERSE_SWEEP_DAYS * 24 * 60 * 60 * 1000,
    );
    const coveredDays = await this.prisma.paytrStatementLine.findMany({
      where: { transactionDate: { gte: cutoff } },
      distinct: ["transactionDate"],
      select: { transactionDate: true },
    });
    if (coveredDays.length === 0) return 0;

    // Oid üyeliği PENCERE-GLOBAL sete karşı kontrol edilir, gün-lokal sete değil:
    // gün sınırındaki bir ödemenin döküm satırı komşu (İstanbul) günde olabilir;
    // gün-lokal set bunu sahte "dökümde yok" alarmına çevirir.
    const windowSaleLines = await this.prisma.paytrStatementLine.findMany({
      where: {
        transactionDate: { gte: cutoff },
        type: PaytrStatementLineType.sale,
      },
      select: { merchantOid: true },
    });
    const paytrOids = new Set(windowSaleLines.map((l) => l.merchantOid));

    let missing = 0;
    for (const { transactionDate } of coveredDays) {
      // PayTR günleri İSTANBUL'dur (UTC+3, 2016'dan beri sabit — DST yok).
      // transactionDate İstanbul gününün 00:00'ını UTC-gece-yarısı olarak taşır;
      // gerçek pencere UTC'de 3 saat geriden başlar. UTC pencere kullanmak
      // 21:00-24:00 UTC ödemelerini yanlış güne düşürüyordu.
      const dayStart = new Date(
        transactionDate.getTime() - ISTANBUL_UTC_OFFSET_MS,
      );
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

      const payments = await this.prisma.payment.findMany({
        where: {
          provider: "paytr",
          status: { in: [PaymentStatus.completed, PaymentStatus.refunded] },
          paidAt: { gte: dayStart, lt: dayEnd },
        },
        select: { id: true, amount: true, providerConversationId: true },
      });
      for (const payment of payments) {
        const oid = payment.providerConversationId;
        if (!oid || paytrOids.has(oid)) continue;
        missing++;
        this.logger.error(
          `PAYTR_MISSING_TRANSACTION (manuel inceleme gerekir): payment ${payment.id} ` +
            `oid=${oid} tutar=${payment.amount} bizde tamamlanmış görünüyor ama ` +
            `${dayStart.toISOString().slice(0, 10)} işlem dökümünde YOK — para PayTR'ye ` +
            `düşmemiş olabilir.`,
        );
      }
    }
    return missing;
  }

  /**
   * Faz 5: eşleşmiş satış satırlarının PayTR kesintisini (kesinti_tutari)
   * deftere psp_fee gideri olarak yazar.
   *
   * Dengeli grup: debit psp_fee / credit buyer_payment — capture'da tamamı
   * buyer_payment'a yazılan tahsilatın kesinti kadarı bize hiç ulaşmaz; bu
   * kayıt "PayTR raporu vs ledger" (Faz 6.5) ücret mutabakatını mümkün kılar.
   *
   * İdempotens: satır `ledgerRecordedAt` ile damgalanır ve damgalı satır
   * sorguya hiç girmez. Ledger hatasında damga YAZILMAZ (sonraki tur dener)
   * ve tur kırılmaz — yalnız o satır atlanır.
   */
  async accruePspFees(): Promise<{ recorded: number; failed: number }> {
    if (!this.ledger) return { recorded: 0, failed: 0 };

    const lines = await this.prisma.paytrStatementLine.findMany({
      where: {
        type: PaytrStatementLineType.sale,
        matchStatus: PaytrMatchStatus.matched,
        ledgerRecordedAt: null,
        fee: { gt: 0 },
      },
      orderBy: { transactionDate: "asc" },
      take: MATCH_BATCH,
    });

    let recorded = 0;
    let failed = 0;
    for (const line of lines) {
      const fee = Number(line.fee);
      if (!(fee > 0)) continue;
      try {
        await this.ledger.record(this.prisma, {
          eventType: LedgerEventType.psp_fee_accrued,
          currency: line.currency,
          entries: [
            {
              account: LedgerAccount.psp_fee,
              direction: LedgerDirection.debit,
              amount: fee,
            },
            {
              account: LedgerAccount.buyer_payment,
              direction: LedgerDirection.credit,
              amount: fee,
            },
          ],
          refs: { paymentId: line.paymentId },
          metadata: {
            statementLineId: line.id,
            merchantOid: line.merchantOid,
            transactionDate: line.transactionDate.toISOString().slice(0, 10),
          },
        });
        await this.prisma.paytrStatementLine.update({
          where: { id: line.id },
          data: { ledgerRecordedAt: new Date() },
        });
        recorded++;
      } catch (error: any) {
        failed++;
        this.logger.warn(
          `psp_fee ledger kaydı başarısız (satır ${line.id}): ${error?.message}`,
        );
      }
    }

    if (recorded > 0) {
      this.logger.log(`PayTR kesintisi deftere yazıldı: ${recorded} satır`);
    }
    return { recorded, failed };
  }

  /**
   * Hakediş doğrulaması + kalemlerin Payment bağının doldurulması.
   * Yalnız gerçekleşmiş (isProjection=false) hakedişler denetlenir.
   */
  async verifySettlements(): Promise<{ checked: number; mismatches: number }> {
    const settlements = await this.prisma.paytrSettlement.findMany({
      where: { isProjection: false },
      orderBy: { datePaid: "desc" },
      take: 40,
    });

    let mismatches = 0;
    for (const settlement of settlements) {
      const sales = Number(settlement.salesTotal);
      const returns = Number(settlement.returnTotal);
      const net = Number(settlement.netTotal);

      // PayTR iç tutarlılığı: sales - returns = net.
      if (Math.abs(sales - returns - net) > MATCH_TOLERANCE_TL) {
        mismatches++;
        this.logger.error(
          `PAYTR_SETTLEMENT_MISMATCH: hakediş ${settlement.id} ` +
            `(${settlement.datePaid.toISOString().slice(0, 10)}) ` +
            `sales(${sales}) - returns(${returns}) ≠ net(${net})`,
        );
      }

      const items = await this.prisma.paytrSettlementItem.findMany({
        where: { settlementId: settlement.id },
      });
      if (items.length > 0) {
        const itemSum = items.reduce((sum, i) => sum + Number(i.amount), 0);
        if (Math.abs(itemSum - sales) > MATCH_TOLERANCE_TL) {
          mismatches++;
          this.logger.error(
            `PAYTR_SETTLEMENT_MISMATCH: hakediş ${settlement.id} kalem toplamı ` +
              `(${Math.round(itemSum * 100) / 100}) satış toplamından (${sales}) sapıyor`,
          );
        }
      }

      // Kalem → Payment bağı (ekranda "bu sipariş hangi hakedişte ödendi" için).
      for (const item of items) {
        if (item.paymentId) continue;
        const payment = await this.findPaymentByOid(item.merchantOid);
        if (!payment) continue;
        await this.prisma.paytrSettlementItem.update({
          where: { id: item.id },
          data: { paymentId: payment.id },
        });
      }
    }

    return { checked: settlements.length, mismatches };
  }
}
