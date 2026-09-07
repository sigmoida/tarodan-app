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
import { PrismaService } from "../../../prisma";
import { LedgerService } from "../../ledger/ledger.service";
import { istanbulDayStart } from "../../../common/helpers/tr-calendar";

/** Tutar eşlemesi toleransı (kuruş yuvarlamaları). Gün kartı farkı da bunu kullanır. */
export const MATCH_TOLERANCE_TL = 0.05;
/** Bir sorguda çekilecek satır (cursor döngüsü tümünü gezer). */
const MATCH_PAGE = 200;
/** Bir gecede en fazla denenecek satır — kalıcı karşılıksızlar büyüse de sınır. */
const MATCH_MAX_PER_RUN = 2000;
/** Kalıcı karşılıksız satır günde bir kez yeniden denenir. */
const RETRY_AFTER_MS = 24 * 60 * 60 * 1000;
/** Ters yön taramasının geriye bakış penceresi (statement pencersiyle hizalı + pay). */
const REVERSE_SWEEP_DAYS = 4;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Döküm satırının bizdeki karşılığı: sipariş/sepet/takas ödemesi ya da üyelik yenilemesi. */
export type StatementCounterpart =
  | { kind: "payment"; id: string; amount: unknown }
  | { kind: "membership"; id: string; amount: unknown };

/**
 * Bir ödemenin PayTR'de görünebileceği tüm oid'ler: güncel oid + yeniden başlatma
 * geçmişi (`metadata.merchantOidHistory`). Gün kartı ve ters yön taraması bu
 * çözümleyiciyi kullanır; eşleştiriciyle aynı gerçek. İki katman ayrışırsa aynı
 * kartta "eşleşti" + "dökümde yok" çıkar.
 */
export function paymentOids(payment: {
  providerConversationId: string | null;
  metadata?: unknown;
}): string[] {
  const oids: string[] = [];
  if (payment.providerConversationId) oids.push(payment.providerConversationId);
  const history =
    payment.metadata && typeof payment.metadata === "object"
      ? (payment.metadata as Record<string, unknown>).merchantOidHistory
      : undefined;
  if (Array.isArray(history)) {
    for (const h of history) if (typeof h === "string" && h) oids.push(h);
  }
  return oids;
}

/**
 * Faz 3 — PSP mutabakat fark motoru. Rapor sync'inin (Faz 2) doldurduğu yerel
 * tablolar üzerinde çalışır; PayTR'ye istek ATMAZ:
 *
 *  - İleri yön: her `PaytrStatementLine` bir Payment (satış), RefundAttempt (iade)
 *    ya da MembershipPayment (üyelik yenilemesi) ile eşleşmeli. Oid eşleşip tutar
 *    tutmazsa `amount_mismatch`; hiç karşılık yoksa `unmatched` kalır — admin
 *    mutabakat ekranı bu iki durumu listeler, çözümleyebilir, yeniden eşletebilir.
 *  - Ters yön: dökümü OLAN günlerde bizde `completed/refunded` görünüp PayTR
 *    dökümünde OLMAYAN ödeme → para gerçekte gelmemiş olabilir; en kritik alarm.
 *  - Hakediş doğrulaması: sales - returns = net ve kalem toplamı ↔ satış toplamı.
 *
 * Tıkanma koruması: kalıcı karşılıksız satırlar (yabancı trafik, eski kayıtlar)
 * `lastMatchAttemptAt` ile günde bir denenir; yeni satırlar (damgasız) önce gelir.
 * Eski kod `unmatched` + `take 200` ile en eski 200'ü her gece yeniden seçiyor,
 * kalıcı backlog 200'ü aşınca YENİ satırları hiç işlemiyordu.
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

  /** Oid → Payment (güncel oid, sonra oid geçmişi) → yoksa MembershipPayment (yenileme). */
  async findCounterpartByOid(
    oid: string,
  ): Promise<StatementCounterpart | null> {
    const direct = await this.prisma.payment.findFirst({
      where: { providerConversationId: oid },
      select: { id: true, amount: true },
    });
    if (direct) return { kind: "payment", ...direct };
    const historical = await this.prisma.payment.findFirst({
      where: {
        metadata: { path: ["merchantOidHistory"], array_contains: oid },
      },
      select: { id: true, amount: true },
    });
    if (historical) return { kind: "payment", ...historical };
    const membership = await this.prisma.membershipPayment.findFirst({
      where: { merchantOid: oid },
      select: { id: true, amount: true },
    });
    return membership ? { kind: "membership", ...membership } : null;
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
    const retryBefore = new Date(Date.now() - RETRY_AFTER_MS);
    let matched = 0;
    let mismatched = 0;
    let unmatched = 0;
    let processed = 0;
    let cursor: string | undefined;

    while (processed < MATCH_MAX_PER_RUN) {
      const lines = await this.prisma.paytrStatementLine.findMany({
        where: {
          matchStatus: PaytrMatchStatus.unmatched,
          resolvedAt: null,
          OR: [
            { lastMatchAttemptAt: null },
            { lastMatchAttemptAt: { lt: retryBefore } },
          ],
        },
        // Hiç denenmemiş (yeni) satırlar önce; sonra en uzun süredir bekleyenler.
        orderBy: [
          { lastMatchAttemptAt: { sort: "asc", nulls: "first" } },
          { transactionDate: "asc" },
          { id: "asc" },
        ],
        take: MATCH_PAGE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (lines.length === 0) break;

      for (const line of lines) {
        const outcome = await this.matchLine(line);
        processed++;
        if (outcome === "matched") matched++;
        else if (outcome === "mismatched") mismatched++;
        else unmatched++;
      }
      cursor = lines[lines.length - 1].id;
      if (lines.length < MATCH_PAGE) break;
    }

    const missingInPaytr = await this.sweepMissingPayments();

    if (mismatched > 0 || missingInPaytr > 0) {
      this.logger.warn(
        `PayTR mutabakat: ${matched} eşleşti, ${mismatched} tutar farkı, ` +
          `${unmatched} karşılıksız satır, ${missingInPaytr} dökümde olmayan ödeme`,
      );
    }
    return { processed, matched, mismatched, unmatched, missingInPaytr };
  }

  /** Tek satırı yeniden eşle (admin "yeniden dene"). Çözümlenmiş satır da yeniden açılır. */
  async rematchLine(
    lineId: string,
  ): Promise<"matched" | "mismatched" | "unmatched"> {
    const line = await this.prisma.paytrStatementLine.findUniqueOrThrow({
      where: { id: lineId },
    });
    await this.prisma.paytrStatementLine.update({
      where: { id: lineId },
      data: {
        matchStatus: PaytrMatchStatus.unmatched,
        paymentId: null,
        refundAttemptId: null,
        membershipPaymentId: null,
        resolvedAt: null,
        resolvedById: null,
        resolutionNote: null,
      },
    });
    return this.matchLine(line);
  }

  /**
   * Tek satırın eşleştirilmesi. Her denemede `lastMatchAttemptAt` damgalanır.
   * Tüketilmiş karşılık koruması: aynı Payment/RefundAttempt'e ikinci bir satır
   * bağlanamaz — çift tahsilat/çift iade `unmatched` kalır ve PAYTR_DUPLICATE_LINE
   * ile loglanır (eski kod ikisini de "matched" sayıp çiftleri görünmez kılıyordu).
   */
  private async matchLine(line: {
    id: string;
    merchantOid: string;
    type: PaytrStatementLineType;
    amount: unknown;
  }): Promise<"matched" | "mismatched" | "unmatched"> {
    const now = new Date();
    const stamp = { lastMatchAttemptAt: now };

    if (line.type === PaytrStatementLineType.sale) {
      const counterpart = await this.findCounterpartByOid(line.merchantOid);
      if (!counterpart) {
        await this.prisma.paytrStatementLine.update({
          where: { id: line.id },
          data: stamp,
        });
        return "unmatched";
      }
      const linkField =
        counterpart.kind === "payment" ? "paymentId" : "membershipPaymentId";
      const alreadyLinked = await this.prisma.paytrStatementLine.findFirst({
        where: {
          [linkField]: counterpart.id,
          type: PaytrStatementLineType.sale,
          id: { not: line.id },
          matchStatus: { not: PaytrMatchStatus.unmatched },
        },
        select: { id: true },
      });
      if (alreadyLinked) {
        this.logger.error(
          `PAYTR_DUPLICATE_LINE: satış satırı ${line.id} oid=${line.merchantOid} ` +
            `zaten ${alreadyLinked.id} ile eşleşmiş ${counterpart.kind} ${counterpart.id}'a bağlanmak istiyor — çift tahsilat olabilir`,
        );
        await this.prisma.paytrStatementLine.update({
          where: { id: line.id },
          data: stamp,
        });
        return "unmatched";
      }
      const ok = this.amountsAgree(counterpart.amount, line.amount);
      await this.prisma.paytrStatementLine.update({
        where: { id: line.id },
        data: {
          ...stamp,
          matchStatus: ok
            ? PaytrMatchStatus.matched
            : PaytrMatchStatus.amount_mismatch,
          [linkField]: counterpart.id,
        },
      });
      if (!ok) {
        this.logger.error(
          `PAYTR_STATEMENT_MISMATCH: satış satırı ${line.id} oid=${line.merchantOid} ` +
            `PayTR=${line.amount} bizde=${counterpart.amount} — tutarlar uyuşmuyor (manuel inceleme)`,
        );
      }
      return ok ? "matched" : "mismatched";
    }

    // İade satırı: dökümde reference_no yok — providerReference (oid) + tutar
    // üzerinden eşlenir. Yalnız sağlayıcıda GERÇEKLEŞMİŞ ve henüz başka bir
    // döküm satırına bağlanmamış denemeler aday.
    const consumed = await this.prisma.paytrStatementLine.findMany({
      where: {
        type: PaytrStatementLineType.refund,
        id: { not: line.id },
        refundAttemptId: { not: null },
        matchStatus: { not: PaytrMatchStatus.unmatched },
      },
      select: { refundAttemptId: true },
    });
    const consumedIds = consumed
      .map((c) => c.refundAttemptId)
      .filter((id): id is string => !!id);
    const candidates = await this.prisma.refundAttempt.findMany({
      where: {
        providerReference: line.merchantOid,
        status: {
          in: [RefundAttemptStatus.succeeded, RefundAttemptStatus.finalized],
        },
        ...(consumedIds.length ? { id: { notIn: consumedIds } } : {}),
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
          ...stamp,
          matchStatus: PaytrMatchStatus.matched,
          refundAttemptId: attempt.id,
          paymentId: attempt.paymentId,
        },
      });
      return "matched";
    }
    if (candidates.length > 0) {
      await this.prisma.paytrStatementLine.update({
        where: { id: line.id },
        data: {
          ...stamp,
          matchStatus: PaytrMatchStatus.amount_mismatch,
          refundAttemptId: candidates[0].id,
          paymentId: candidates[0].paymentId,
        },
      });
      this.logger.error(
        `PAYTR_STATEMENT_MISMATCH: iade satırı ${line.id} oid=${line.merchantOid} ` +
          `PayTR=${line.amount} — aynı oid'li iade denemeleriyle tutar uyuşmuyor`,
      );
      return "mismatched";
    }
    // Üyelik iadesi RefundAttempt üretmez: iade edilmiş üyelik ödemesi + tutar.
    const membership = await this.prisma.membershipPayment.findFirst({
      where: {
        merchantOid: line.merchantOid,
        status: PaymentStatus.refunded,
      },
      select: { id: true, amount: true },
    });
    if (membership && this.amountsAgree(membership.amount, line.amount)) {
      await this.prisma.paytrStatementLine.update({
        where: { id: line.id },
        data: {
          ...stamp,
          matchStatus: PaytrMatchStatus.matched,
          membershipPaymentId: membership.id,
        },
      });
      return "matched";
    }
    await this.prisma.paytrStatementLine.update({
      where: { id: line.id },
      data: stamp,
    });
    return "unmatched";
  }

  /**
   * Ters yön: dökümü olan her gün için bizde o gün tamamlanmış ama PayTR
   * dökümünde görünmeyen ödemeleri bul (sipariş/sepet/takas + üyelik yenilemesi).
   * Otomatik aksiyon YOK — yüksek öncelikli alarm (para PayTR'ye hiç düşmemiş
   * olabilir; manuel doğrulama gerekir). Ekrandaki liste aynı hesabı
   * admin-psp-reconciliation.service `getMissingPayments` ile üretir.
   */
  private async sweepMissingPayments(): Promise<number> {
    const cutoff = new Date(Date.now() - REVERSE_SWEEP_DAYS * DAY_MS);
    const coveredDays = await this.prisma.paytrStatementLine.findMany({
      where: { transactionDate: { gte: cutoff } },
      distinct: ["transactionDate"],
      select: { transactionDate: true },
    });
    if (coveredDays.length === 0) return 0;

    // Oid üyeliği PENCERE-GLOBAL sete karşı kontrol edilir, gün-lokal sete değil:
    // gün sınırındaki bir ödemenin döküm satırı komşu (İstanbul) günde olabilir.
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
      // transactionDate İstanbul gününün 00:00'ını UTC-gece-yarısı olarak taşır;
      // gerçek pencere İstanbul gün başından başlar.
      const dayStart = istanbulDayStart(
        transactionDate.toISOString().slice(0, 10),
      );
      const dayEnd = new Date(dayStart.getTime() + DAY_MS);
      const [payments, renewals] = await Promise.all([
        this.prisma.payment.findMany({
          where: {
            provider: "paytr",
            status: { in: [PaymentStatus.completed, PaymentStatus.refunded] },
            paidAt: { gte: dayStart, lt: dayEnd },
          },
          select: {
            id: true,
            amount: true,
            providerConversationId: true,
            metadata: true,
          },
        }),
        this.prisma.membershipPayment.findMany({
          where: {
            provider: "paytr",
            orderId: null,
            status: { in: [PaymentStatus.completed, PaymentStatus.refunded] },
            createdAt: { gte: dayStart, lt: dayEnd },
          },
          select: { id: true, amount: true, merchantOid: true },
        }),
      ]);
      for (const payment of payments) {
        const oids = paymentOids(payment);
        if (oids.length === 0 || oids.some((o) => paytrOids.has(o))) continue;
        missing++;
        this.logger.error(
          `PAYTR_MISSING_TRANSACTION (manuel inceleme gerekir): payment ${payment.id} ` +
            `oid=${oids[0]} tutar=${payment.amount} bizde tamamlanmış görünüyor ama ` +
            `${dayStart.toISOString().slice(0, 10)} işlem dökümünde YOK — para PayTR'ye ` +
            `düşmemiş olabilir.`,
        );
      }
      for (const renewal of renewals) {
        if (!renewal.merchantOid || paytrOids.has(renewal.merchantOid))
          continue;
        missing++;
        this.logger.error(
          `PAYTR_MISSING_TRANSACTION (manuel inceleme gerekir): üyelik ödemesi ${renewal.id} ` +
            `oid=${renewal.merchantOid} tutar=${renewal.amount} dökümde YOK.`,
        );
      }
    }
    return missing;
  }

  /**
   * Faz 5: eşleşmiş satış satırlarının PayTR kesintisini (kesinti_tutari)
   * deftere psp_fee gideri olarak yazar (sipariş ödemeleri ve üyelik yenilemeleri).
   *
   * Dengeli grup: debit psp_fee / credit buyer_payment. İdempotens: satır
   * `ledgerRecordedAt` ile damgalanır; ledger hatasında damga yazılmaz.
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
      take: MATCH_PAGE,
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
          idempotencyKey: `psp-fee:statement-line:${line.id}`,
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
            membershipPaymentId: line.membershipPaymentId ?? null,
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

  /** PayTR iç tutarlılığı: sales − returns = net ve kalem toplamı = sales. */
  static settlementConsistency(s: {
    salesTotal: unknown;
    returnTotal: unknown;
    netTotal: unknown;
    itemSum?: number | null;
  }): { consistent: boolean; itemsConsistent: boolean | null } {
    const sales = Number(s.salesTotal);
    const returns = Number(s.returnTotal);
    const net = Number(s.netTotal);
    const consistent = Math.abs(sales - returns - net) <= MATCH_TOLERANCE_TL;
    const itemsConsistent =
      s.itemSum == null
        ? null
        : Math.abs(s.itemSum - sales) <= MATCH_TOLERANCE_TL;
    return { consistent, itemsConsistent };
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
      const items = await this.prisma.paytrSettlementItem.findMany({
        where: { settlementId: settlement.id },
      });
      const itemSum =
        items.length > 0
          ? items.reduce((sum, i) => sum + Number(i.amount), 0)
          : null;
      const { consistent, itemsConsistent } =
        PaytrReportMatchingService.settlementConsistency({
          ...settlement,
          itemSum,
        });
      const day = settlement.datePaid.toISOString().slice(0, 10);
      if (!consistent) {
        mismatches++;
        this.logger.error(
          `PAYTR_SETTLEMENT_MISMATCH: hakediş ${settlement.id} (${day}) ` +
            `sales(${settlement.salesTotal}) - returns(${settlement.returnTotal}) ≠ net(${settlement.netTotal})`,
        );
      }
      if (itemsConsistent === false) {
        mismatches++;
        this.logger.error(
          `PAYTR_SETTLEMENT_MISMATCH: hakediş ${settlement.id} kalem toplamı ` +
            `(${Math.round((itemSum ?? 0) * 100) / 100}) satış toplamından (${settlement.salesTotal}) sapıyor`,
        );
      }

      // Kalem → Payment bağı (ekranda "bu sipariş hangi hakedişte ödendi" için).
      for (const item of items) {
        if (item.paymentId) continue;
        const counterpart = await this.findCounterpartByOid(item.merchantOid);
        if (!counterpart || counterpart.kind !== "payment") continue;
        await this.prisma.paytrSettlementItem.update({
          where: { id: item.id },
          data: { paymentId: counterpart.id },
        });
      }
    }

    return { checked: settlements.length, mismatches };
  }
}
