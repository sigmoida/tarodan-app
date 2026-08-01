import { Injectable } from "@nestjs/common";
import {
  PaytrMatchStatus,
  PaytrStatementLineType,
  PaymentStatus,
  RefundAttemptStatus,
} from "@prisma/client";
import { PrismaService } from "../../prisma";

/** Gün anahtarı: UTC ISO gün (rapor tabloları gün hassasiyetinde saklar). */
const dayKey = (d: Date): string => d.toISOString().slice(0, 10);

/** PayTR rapor günleri İstanbul saatiyledir; TR 2016'dan beri sabit UTC+3 (DST yok). */
const ISTANBUL_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;
/**
 * Gerçek bir UTC anını İSTANBUL gününe diler — PayTR döküm günleriyle aynı
 * eksende. paidAt'i UTC gününe dilemek 21:00-24:00 UTC ödemelerini bir önceki
 * güne düşürüyor, gün kartlarında sahte fark + "dökümde yok" üretiyordu.
 */
const istanbulDayKey = (d: Date): string =>
  dayKey(new Date(d.getTime() + ISTANBUL_UTC_OFFSET_MS));

export interface DayCard {
  date: string;
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
  ours: { salesCount: number; salesTotal: number; refundTotal: number };
  match: { matched: number; mismatched: number; unmatched: number };
  missingInPaytr: number;
  /** Bizim satış − PayTR satış; 0 dışı ekranda kırmızı. */
  salesDiff: number;
  refundDiff: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Admin PSP mutabakat okuma modeli (Faz 4). PayTR'ye canlı istek ATMAZ —
 * gece sync'inin (Faz 2) doldurduğu ve fark motorunun (Faz 3) işaretlediği
 * yerel tablolardan okur:
 *  - gün kartları: PayTR dökümü ↔ bizim kayıtlar, fark ve eşleşme sayıları,
 *  - problem satırları: matched dışındaki döküm satırları (ekranın iş listesi),
 *  - hakedişler: gerçekleşen + future_payments projeksiyonları.
 */
@Injectable()
export class AdminPspReconciliationService {
  constructor(private readonly prisma: PrismaService) {}

  async getReconciliationSummary(days = 7): Promise<{ days: DayCard[] }> {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - (days - 1));

    const [lines, payments, refunds] = await Promise.all([
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
        },
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
        },
      }),
      this.prisma.refundAttempt.findMany({
        where: {
          provider: "paytr",
          status: {
            in: [RefundAttemptStatus.succeeded, RefundAttemptStatus.finalized],
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
          paytrCovered: false,
          paytr: {
            salesCount: 0,
            salesTotal: 0,
            refundCount: 0,
            refundTotal: 0,
            feeTotal: 0,
            netTotal: 0,
          },
          ours: { salesCount: 0, salesTotal: 0, refundTotal: 0 },
          match: { matched: 0, mismatched: 0, unmatched: 0 },
          missingInPaytr: 0,
          salesDiff: 0,
          refundDiff: 0,
        };
        cards.set(date, card);
      }
      return card;
    };

    // PayTR tarafı + pencere-GLOBAL satış oid kümesi (ters yön için).
    // Set gün-lokal DEĞİL: gün sınırındaki ödemenin döküm satırı komşu günde
    // olabilir; gün-lokal set sahte "dökümde yok" üretir.
    const windowSaleOids = new Set<string>();
    for (const line of lines) {
      const date = dayKey(line.transactionDate);
      const card = cardOf(date);
      card.paytrCovered = true;
      if (line.type === PaytrStatementLineType.sale) {
        card.paytr.salesCount++;
        card.paytr.salesTotal = round2(
          card.paytr.salesTotal + Number(line.amount),
        );
        windowSaleOids.add(line.merchantOid);
      } else {
        card.paytr.refundCount++;
        card.paytr.refundTotal = round2(
          card.paytr.refundTotal + Number(line.amount),
        );
      }
      card.paytr.feeTotal = round2(card.paytr.feeTotal + Number(line.fee ?? 0));
      card.paytr.netTotal = round2(card.paytr.netTotal + Number(line.net ?? 0));
      if (line.matchStatus === PaytrMatchStatus.matched) card.match.matched++;
      else if (line.matchStatus === PaytrMatchStatus.amount_mismatch)
        card.match.mismatched++;
      else card.match.unmatched++;
    }

    // Bizim taraf — İSTANBUL gününe dilinir (PayTR döküm günleriyle aynı eksen)
    // + ters yön (yalnız dökümü olan günlerde, pencere-global sete karşı).
    for (const payment of payments) {
      if (!payment.paidAt) continue;
      const date = istanbulDayKey(payment.paidAt);
      const card = cardOf(date);
      card.ours.salesCount++;
      card.ours.salesTotal = round2(
        card.ours.salesTotal + Number(payment.amount),
      );
      if (
        card.paytrCovered &&
        payment.providerConversationId &&
        !windowSaleOids.has(payment.providerConversationId)
      ) {
        card.missingInPaytr++;
      }
    }
    for (const refund of refunds) {
      if (!refund.providerSucceededAt) continue;
      const card = cardOf(istanbulDayKey(refund.providerSucceededAt));
      card.ours.refundTotal = round2(
        card.ours.refundTotal + Number(refund.amount),
      );
    }

    const result = [...cards.values()]
      .map((card) => ({
        ...card,
        salesDiff: round2(card.ours.salesTotal - card.paytr.salesTotal),
        refundDiff: round2(card.ours.refundTotal - card.paytr.refundTotal),
      }))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    return { days: result };
  }

  async getStatementLines(params: {
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: unknown[]; meta: { total: number } }> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 50));
    const statuses = Object.values(PaytrMatchStatus) as string[];
    const where =
      params.status === "all"
        ? {}
        : params.status && statuses.includes(params.status)
          ? { matchStatus: params.status as PaytrMatchStatus }
          : // Varsayılan: ekranın iş listesi — problem satırları.
            { matchStatus: { not: PaytrMatchStatus.matched } };

    const [rows, total] = await Promise.all([
      this.prisma.paytrStatementLine.findMany({
        where,
        orderBy: { transactionDate: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.paytrStatementLine.count({ where }),
    ]);

    // Yumuşak Payment bağını sipariş/grup numarasıyla zenginleştir.
    const paymentIds = [
      ...new Set(rows.map((r) => r.paymentId).filter(Boolean)),
    ] as string[];
    const payments = paymentIds.length
      ? await this.prisma.payment.findMany({
          where: { id: { in: paymentIds } },
          select: {
            id: true,
            amount: true,
            order: { select: { orderNumber: true } },
            checkoutGroup: { select: { groupNumber: true } },
          },
        })
      : [];
    const paymentById = new Map(payments.map((p) => [p.id, p]));

    return {
      data: rows.map((row) => {
        const payment = row.paymentId
          ? paymentById.get(row.paymentId)
          : undefined;
        return {
          ...row,
          payment: payment
            ? {
                id: payment.id,
                amount: payment.amount,
                orderNumber: payment.order?.orderNumber ?? null,
                groupNumber: payment.checkoutGroup?.groupNumber ?? null,
              }
            : null,
        };
      }),
      meta: { total },
    };
  }

  async getSettlements(limit = 60): Promise<{ data: unknown[] }> {
    const settlements = await this.prisma.paytrSettlement.findMany({
      orderBy: [{ isProjection: "asc" }, { datePaid: "desc" }],
      take: limit,
      include: { _count: { select: { items: true } } },
    });
    return {
      data: settlements.map(({ _count, ...settlement }) => ({
        ...settlement,
        itemCount: _count.items,
      })),
    };
  }
}
