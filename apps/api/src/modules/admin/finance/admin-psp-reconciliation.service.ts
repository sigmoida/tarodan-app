import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  PaytrMatchStatus,
  PaytrStatementLineType,
  PaymentStatus,
  Prisma,
  RefundAttemptStatus,
} from "@prisma/client";
import { PrismaService } from "../../../prisma";
import {
  istanbulDayStart,
  trCalendarDate,
} from "../../../common/helpers/tr-calendar";
import {
  MATCH_TOLERANCE_TL,
  PaytrReportMatchingService,
  paymentOids,
} from "../../../modules/payment/reconciliation/paytr-report-matching.service";
import {
  PaytrSyncStateService,
  type PaytrSyncState,
} from "../../../modules/payment/reconciliation/paytr-sync-state.service";
import { AdminAuditService } from "../ops/admin-audit.service";
import { round2 } from "../../finance-reconciliation/finance-reconciliation.types";
import { i18nMessage } from "../../i18n";
import type {
  PspLineFilter,
  PspStatementLinesQueryDto,
} from "./dto/psp-reconciliation.dto";

const DAY_MS = 24 * 60 * 60 * 1000;
/** `YYYY-MM-DD` gününün kendisi ve ±1 komşusu (oid kayması toleransı). */
const neighbourDays = (day: string): string[] =>
  [-1, 0, 1].map((k) =>
    new Date(Date.parse(`${day}T00:00:00Z`) + k * DAY_MS)
      .toISOString()
      .slice(0, 10),
  );

export interface DayCard {
  date: string;
  /** Bugün: döküm 05:00'te gelir, kart geçicidir. */
  provisional: boolean;
  /** O gün için PayTR dökümü var mı? Yoksa missingInPaytr hesaplanmaz. */
  paytrCovered: boolean;
  paytr: {
    salesCount: number;
    salesTotal: number;
    refundCount: number;
    refundTotal: number;
    feeTotal: number;
    netTotal: number;
  };
  ours: {
    salesCount: number;
    salesTotal: number;
    refundTotal: number;
    /** Deftere psp_fee olarak yazılmış kesinti (eşleşmiş satırlardan). */
    feeBooked: number;
  };
  match: { matched: number; mismatched: number; unmatched: number };
  missingInPaytr: number;
  /** Bizim satış − PayTR satış; |fark| > tolerans ise ekranda kırmızı. */
  salesDiff: number;
  refundDiff: number;
  /** Eşleştiriciyle aynı tolerans (kuruş yuvarlaması). */
  tolerance: number;
}

/**
 * Admin PSP mutabakat okuma modeli (Faz 4). PayTR'ye canlı istek ATMAZ —
 * gece sync'inin doldurduğu ve fark motorunun işaretlediği yerel tablolardan okur:
 *  - senkron durumu: bayrak / son çalışma / bayatlık (ekranın üst şeridi),
 *  - gün kartları: PayTR dökümü ↔ bizim kayıtlar (sipariş + üyelik), fark ve
 *    eşleşme sayıları, dökümde olmayan ödemeler (listelenebilir),
 *  - problem satırları: iş listesi; çözümlenebilir / yeniden eşlenebilir,
 *  - hakedişler: gerçekleşen + projeksiyon, iç tutarlılık rozeti.
 */
@Injectable()
export class AdminPspReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matching: PaytrReportMatchingService,
    private readonly syncState: PaytrSyncStateService,
    private readonly audit: AdminAuditService,
  ) {}

  /** Pencere: bugün dahil son `days` İstanbul günü; başlangıç İstanbul gün başı. */
  private windowStart(days: number, now = new Date()): Date {
    const todayStart = istanbulDayStart(trCalendarDate(now));
    return new Date(todayStart.getTime() - (days - 1) * DAY_MS);
  }

  async getReconciliationSummary(
    days = 7,
  ): Promise<{ days: DayCard[]; sync: PaytrSyncState }> {
    const now = new Date();
    const today = trCalendarDate(now);
    const since = this.windowStart(days, now);

    const [sync, lines, priorDaySales, payments, renewals, refunds] =
      await Promise.all([
        this.syncState.getState(),
        this.prisma.paytrStatementLine.findMany({
          where: { transactionDate: { gte: since } },
          select: {
            merchantOid: true,
            type: true,
            amount: true,
            fee: true,
            net: true,
            transactionDate: true,
            matchStatus: true,
            ledgerRecordedAt: true,
            resolvedAt: true,
          },
        }),
        // Pencereden bir önceki günün satış oid'leri: ilk günün ödemesinin döküm
        // satırı komşu güne kaymış olabilir (yalnız oid kümesi için; karta işlenmez).
        this.prisma.paytrStatementLine.findMany({
          where: {
            type: PaytrStatementLineType.sale,
            transactionDate: {
              gte: new Date(since.getTime() - DAY_MS),
              lt: since,
            },
          },
          select: { merchantOid: true, transactionDate: true },
        }),
        this.prisma.payment.findMany({
          where: {
            provider: "paytr",
            status: { in: [PaymentStatus.completed, PaymentStatus.refunded] },
            paidAt: { gte: since },
          },
          select: {
            id: true,
            amount: true,
            paidAt: true,
            providerConversationId: true,
            metadata: true,
          },
        }),
        // Üyelik yenilemeleri Payment tablosunda değildir; ciroda ve dökümde vardır.
        this.prisma.membershipPayment.findMany({
          where: {
            provider: "paytr",
            orderId: null,
            status: { in: [PaymentStatus.completed, PaymentStatus.refunded] },
            createdAt: { gte: since },
          },
          select: {
            id: true,
            amount: true,
            createdAt: true,
            merchantOid: true,
          },
        }),
        this.prisma.refundAttempt.findMany({
          where: {
            provider: "paytr",
            status: {
              in: [
                RefundAttemptStatus.succeeded,
                RefundAttemptStatus.finalized,
              ],
            },
            providerSucceededAt: { gte: since },
          },
          select: { amount: true, providerSucceededAt: true },
        }),
      ]);

    const cards = new Map<string, DayCard>();
    const cardOf = (date: string): DayCard => {
      let card = cards.get(date);
      if (!card) {
        card = {
          date,
          provisional: date === today,
          paytrCovered: false,
          paytr: {
            salesCount: 0,
            salesTotal: 0,
            refundCount: 0,
            refundTotal: 0,
            feeTotal: 0,
            netTotal: 0,
          },
          ours: { salesCount: 0, salesTotal: 0, refundTotal: 0, feeBooked: 0 },
          match: { matched: 0, mismatched: 0, unmatched: 0 },
          missingInPaytr: 0,
          salesDiff: 0,
          refundDiff: 0,
          tolerance: MATCH_TOLERANCE_TL,
        };
        cards.set(date, card);
      }
      return card;
    };

    // PayTR tarafı + gün-bazlı satış oid kümesi (ters yön için). Bir ödeme,
    // kendi gününün ±1 komşusundaki dökümde görünüyorsa "yok" sayılmaz —
    // getMissingPayments ile aynı kural.
    const saleOidsByDay = new Map<string, Set<string>>();
    const seenInPaytr = (day: string, oids: string[]): boolean =>
      neighbourDays(day).some((d) => {
        const set = saleOidsByDay.get(d);
        return !!set && oids.some((o) => set.has(o));
      });
    const addSaleOid = (day: string, oid: string) => {
      let set = saleOidsByDay.get(day);
      if (!set) saleOidsByDay.set(day, (set = new Set()));
      set.add(oid);
    };
    for (const line of priorDaySales) {
      addSaleOid(
        line.transactionDate.toISOString().slice(0, 10),
        line.merchantOid,
      );
    }
    for (const line of lines) {
      const day = line.transactionDate.toISOString().slice(0, 10);
      if (line.type === PaytrStatementLineType.sale) {
        addSaleOid(day, line.merchantOid);
      }
      const card = cardOf(day);
      card.paytrCovered = true;
      const amount = Number(line.amount);
      if (line.type === PaytrStatementLineType.sale) {
        card.paytr.salesCount++;
        card.paytr.salesTotal += amount;
        if (line.ledgerRecordedAt) card.ours.feeBooked += Number(line.fee ?? 0);
      } else {
        card.paytr.refundCount++;
        card.paytr.refundTotal += amount;
      }
      card.paytr.feeTotal += Number(line.fee ?? 0);
      card.paytr.netTotal += Number(line.net ?? 0);
      if (line.matchStatus === PaytrMatchStatus.matched) card.match.matched++;
      else if (line.resolvedAt) {
        // Çözümlenmiş problem satırı iş listesinden düştü; sayılmaz.
      } else if (line.matchStatus === PaytrMatchStatus.amount_mismatch)
        card.match.mismatched++;
      else card.match.unmatched++;
    }

    // Bizim taraf — İSTANBUL gününe dilinir + ters yön (yalnız dökümü olan günlerde).
    for (const payment of payments) {
      if (!payment.paidAt) continue;
      const day = trCalendarDate(payment.paidAt);
      const card = cardOf(day);
      card.ours.salesCount++;
      card.ours.salesTotal += Number(payment.amount);
      const oids = paymentOids(payment);
      if (card.paytrCovered && oids.length > 0 && !seenInPaytr(day, oids)) {
        card.missingInPaytr++;
      }
    }
    for (const renewal of renewals) {
      const day = trCalendarDate(renewal.createdAt);
      const card = cardOf(day);
      card.ours.salesCount++;
      card.ours.salesTotal += Number(renewal.amount);
      if (
        card.paytrCovered &&
        renewal.merchantOid &&
        !seenInPaytr(day, [renewal.merchantOid])
      ) {
        card.missingInPaytr++;
      }
    }
    for (const refund of refunds) {
      if (!refund.providerSucceededAt) continue;
      const card = cardOf(trCalendarDate(refund.providerSucceededAt));
      card.ours.refundTotal += Number(refund.amount);
    }

    const result = [...cards.values()]
      .map((card) => ({
        ...card,
        paytr: {
          ...card.paytr,
          salesTotal: round2(card.paytr.salesTotal),
          refundTotal: round2(card.paytr.refundTotal),
          feeTotal: round2(card.paytr.feeTotal),
          netTotal: round2(card.paytr.netTotal),
        },
        ours: {
          ...card.ours,
          salesTotal: round2(card.ours.salesTotal),
          refundTotal: round2(card.ours.refundTotal),
          feeBooked: round2(card.ours.feeBooked),
        },
        salesDiff: round2(card.ours.salesTotal - card.paytr.salesTotal),
        refundDiff: round2(card.ours.refundTotal - card.paytr.refundTotal),
      }))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    return { days: result, sync };
  }

  /**
   * Gün kartındaki "dökümde yok" sayacının listesi: o İstanbul günü bizde
   * tamamlanmış ama PayTR dökümünde hiçbir oid'i görünmeyen ödemeler. Kartla
   * aynı kural (±1 komşu günün oid kümesi: gün sınırına kayan satır "yok" sayılmaz).
   */
  async getMissingPayments(date: string): Promise<{
    date: string;
    paytrCovered: boolean;
    items: Array<{
      kind: "payment" | "membership";
      id: string;
      amount: number;
      merchantOid: string | null;
      paidAt: string;
      reference: string | null;
    }>;
  }> {
    const dayStart = istanbulDayStart(date);
    if (Number.isNaN(dayStart.getTime())) {
      throw new BadRequestException(
        i18nMessage("server.admin.psp.invalidDate"),
      );
    }
    const dayEnd = new Date(dayStart.getTime() + DAY_MS);
    // Komşu günlerin dökümü de oid kümesine girer (gün sınırı kayması).
    const oidWindowStart = new Date(dayStart.getTime() - DAY_MS);
    const oidWindowEnd = new Date(dayEnd.getTime() + DAY_MS);

    const [coverage, saleLines, payments, renewals] = await Promise.all([
      this.prisma.paytrStatementLine.count({
        where: {
          transactionDate: { gte: dayStart, lt: dayEnd },
        },
      }),
      this.prisma.paytrStatementLine.findMany({
        where: {
          type: PaytrStatementLineType.sale,
          transactionDate: { gte: oidWindowStart, lt: oidWindowEnd },
        },
        select: { merchantOid: true },
      }),
      this.prisma.payment.findMany({
        where: {
          provider: "paytr",
          status: { in: [PaymentStatus.completed, PaymentStatus.refunded] },
          paidAt: { gte: dayStart, lt: dayEnd },
        },
        select: {
          id: true,
          amount: true,
          paidAt: true,
          providerConversationId: true,
          metadata: true,
          order: { select: { orderNumber: true } },
          checkoutGroup: { select: { groupNumber: true } },
          tradeCashPayment: {
            select: { trade: { select: { tradeNumber: true } } },
          },
        },
      }),
      this.prisma.membershipPayment.findMany({
        where: {
          provider: "paytr",
          orderId: null,
          status: { in: [PaymentStatus.completed, PaymentStatus.refunded] },
          createdAt: { gte: dayStart, lt: dayEnd },
        },
        select: { id: true, amount: true, createdAt: true, merchantOid: true },
      }),
    ]);
    const paytrOids = new Set(saleLines.map((l) => l.merchantOid));
    const paytrCovered = coverage > 0;
    if (!paytrCovered) return { date, paytrCovered, items: [] };

    const items: Awaited<
      ReturnType<AdminPspReconciliationService["getMissingPayments"]>
    >["items"] = [];
    for (const p of payments) {
      if (!p.paidAt) continue;
      const oids = paymentOids(p);
      if (oids.length === 0 || oids.some((o) => paytrOids.has(o))) continue;
      items.push({
        kind: "payment",
        id: p.id,
        amount: Number(p.amount),
        merchantOid: oids[0] ?? null,
        paidAt: p.paidAt.toISOString(),
        reference:
          p.order?.orderNumber ??
          p.checkoutGroup?.groupNumber ??
          p.tradeCashPayment?.trade?.tradeNumber ??
          null,
      });
    }
    for (const r of renewals) {
      if (!r.merchantOid || paytrOids.has(r.merchantOid)) continue;
      items.push({
        kind: "membership",
        id: r.id,
        amount: Number(r.amount),
        merchantOid: r.merchantOid,
        paidAt: r.createdAt.toISOString(),
        reference: null,
      });
    }
    return { date, paytrCovered, items };
  }

  private lineFilterWhere(
    status: PspLineFilter | undefined,
    includeResolved: boolean,
  ): Prisma.PaytrStatementLineWhereInput {
    const resolvedClause = includeResolved ? {} : { resolvedAt: null };
    if (status === "all") return resolvedClause;
    if (status && status !== "problem") {
      return { matchStatus: status, ...resolvedClause };
    }
    // Varsayılan: ekranın iş listesi — çözümlenmemiş problem satırları.
    return {
      matchStatus: { not: PaytrMatchStatus.matched },
      ...resolvedClause,
    };
  }

  async getStatementLines(
    params: PspStatementLinesQueryDto,
  ): Promise<{ data: unknown[]; meta: { total: number } }> {
    const page = params.page ?? 1;
    const limit = params.limit ?? 50;
    const where = this.lineFilterWhere(
      params.status,
      params.includeResolved ?? false,
    );

    const [rows, total] = await Promise.all([
      this.prisma.paytrStatementLine.findMany({
        where,
        // transactionDate gün hassasiyetinde: id ile kırılmazsa sayfalar arası
        // satır tekrar/atlanabilir.
        orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.paytrStatementLine.count({ where }),
    ]);

    const paymentIds = [
      ...new Set(rows.map((r) => r.paymentId).filter(Boolean)),
    ] as string[];
    const membershipIds = [
      ...new Set(rows.map((r) => r.membershipPaymentId).filter(Boolean)),
    ] as string[];
    const [payments, memberships] = await Promise.all([
      paymentIds.length
        ? this.prisma.payment.findMany({
            where: { id: { in: paymentIds } },
            select: {
              id: true,
              amount: true,
              order: { select: { orderNumber: true } },
              checkoutGroup: { select: { groupNumber: true } },
              tradeCashPayment: {
                select: { trade: { select: { tradeNumber: true } } },
              },
            },
          })
        : [],
      membershipIds.length
        ? this.prisma.membershipPayment.findMany({
            where: { id: { in: membershipIds } },
            select: {
              id: true,
              amount: true,
              membership: { select: { userId: true } },
            },
          })
        : [],
    ]);
    const paymentById = new Map(payments.map((p) => [p.id, p]));
    const membershipById = new Map(memberships.map((m) => [m.id, m]));

    return {
      data: rows.map((row) => {
        const payment = row.paymentId
          ? paymentById.get(row.paymentId)
          : undefined;
        const membership = row.membershipPaymentId
          ? membershipById.get(row.membershipPaymentId)
          : undefined;
        return {
          ...row,
          payment: payment
            ? {
                id: payment.id,
                amount: payment.amount,
                orderNumber: payment.order?.orderNumber ?? null,
                groupNumber: payment.checkoutGroup?.groupNumber ?? null,
                tradeNumber:
                  payment.tradeCashPayment?.trade?.tradeNumber ?? null,
              }
            : null,
          membershipPayment: membership
            ? {
                id: membership.id,
                amount: membership.amount,
                userId: membership.membership.userId,
              }
            : null,
        };
      }),
      meta: { total },
    };
  }

  /** Admin satırı inceledi ve kapattı: iş listesinden düşer, gün kartında sayılmaz. */
  async resolveStatementLine(adminId: string, lineId: string, note: string) {
    const line = await this.prisma.paytrStatementLine.findUnique({
      where: { id: lineId },
    });
    if (!line) {
      throw new NotFoundException(i18nMessage("server.admin.psp.lineNotFound"));
    }
    if (line.matchStatus === PaytrMatchStatus.matched) {
      throw new BadRequestException(
        i18nMessage("server.admin.psp.lineAlreadyMatched"),
      );
    }
    const updated = await this.prisma.paytrStatementLine.update({
      where: { id: lineId },
      data: {
        resolvedAt: new Date(),
        resolvedById: adminId,
        resolutionNote: note,
      },
    });
    await this.audit.createRequiredAuditLog(
      adminId,
      "psp_line_resolve",
      "PaytrStatementLine",
      lineId,
      { matchStatus: line.matchStatus, resolvedAt: line.resolvedAt },
      { resolvedAt: updated.resolvedAt, note },
    );
    return { success: true, lineId, resolvedAt: updated.resolvedAt };
  }

  /** Satırı tek başına yeniden eşle (yeni kayıt geldiyse / oid düzeltildiyse). */
  async rematchStatementLine(adminId: string, lineId: string) {
    const exists = await this.prisma.paytrStatementLine.findUnique({
      where: { id: lineId },
      select: { id: true, matchStatus: true },
    });
    if (!exists) {
      throw new NotFoundException(i18nMessage("server.admin.psp.lineNotFound"));
    }
    const outcome = await this.matching.rematchLine(lineId);
    await this.audit.createRequiredAuditLog(
      adminId,
      "psp_line_rematch",
      "PaytrStatementLine",
      lineId,
      { matchStatus: exists.matchStatus },
      { outcome },
    );
    return { success: true, lineId, outcome };
  }

  async getSettlements(params: {
    limit?: number;
    days?: number;
  }): Promise<{ data: unknown[] }> {
    const limit = params.limit ?? 60;
    const where: Prisma.PaytrSettlementWhereInput = params.days
      ? { datePaid: { gte: this.windowStart(params.days) } }
      : {};
    const settlements = await this.prisma.paytrSettlement.findMany({
      where,
      orderBy: [{ isProjection: "asc" }, { datePaid: "desc" }],
      take: limit,
    });
    // Kalem toplamı/sayısı DB'de gruplanır; satır satır çekilmez.
    const itemGroups = settlements.length
      ? await this.prisma.paytrSettlementItem.groupBy({
          by: ["settlementId"],
          where: { settlementId: { in: settlements.map((s) => s.id) } },
          _sum: { amount: true },
          _count: { _all: true },
        })
      : [];
    const itemsBySettlement = new Map(
      itemGroups.map((g) => [
        g.settlementId,
        { sum: Number(g._sum.amount ?? 0), count: g._count._all },
      ]),
    );
    return {
      data: settlements.map((settlement) => {
        const items = itemsBySettlement.get(settlement.id);
        const itemSum = items ? items.sum : null;
        const check = settlement.isProjection
          ? { consistent: null, itemsConsistent: null }
          : PaytrReportMatchingService.settlementConsistency({
              ...settlement,
              itemSum,
            });
        return {
          ...settlement,
          itemCount: items?.count ?? 0,
          itemsSynced: settlement.itemsSyncedAt != null,
          ...check,
        };
      }),
    };
  }
}
