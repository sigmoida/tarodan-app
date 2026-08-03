/** @format */

import type { Trade, TradeCashPayment, TradeQuote } from "./types";

/**
 * TAKAS ÖDEME PANELLERİ — ekranın TEK türetim yeri.
 *
 * v2'de her taraf kendi ödemesini yapar, dolayısıyla ekran iki panel gösterir.
 * Panellerin kaynağı takasın hangi aşamada olduğuna göre değişir:
 *
 *  - Kabulden ÖNCE ödeme satırı yoktur → fiyat teklifi (quote) gösterilir.
 *  - Kabulden SONRA satırlar snapshot'lanmıştır → tutarlar satırlardan okunur
 *    (kural/tarife sonradan değişse bile ekran tahsil edilen tutarı gösterir).
 *
 * İki kaynağı tek şekle indirgemek bu dosyanın işidir; bileşen yalnız render
 * eder.
 */

export interface TradePaymentPanel {
  userId: string;
  name: string;
  isViewer: boolean;
  /** v2 takas hizmet bedeli (KDV dahil). */
  serviceFee: number;
  /** 2 bacaklık kargo. */
  shipping: number;
  /** LEGACY (v1) aracılık komisyonu — v2'de 0. */
  commission: number;
  cashDifference: number;
  total: number;
  /**
   * Ödeme satırının durumu; `null` ise satır henüz yok (kabul edilmemiş teklif)
   * — tutarlar tahmindir, tahsil edilmemiştir.
   */
  status: string | null;
}

const num = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const nameOf = (trade: Trade, userId: string): string =>
  userId === trade.initiatorId ? trade.initiatorName : trade.receiverName;

const fromPaymentRow = (
  trade: Trade,
  row: TradeCashPayment,
  viewerId?: string,
): TradePaymentPanel => ({
  userId: row.payerId,
  name: nameOf(trade, row.payerId),
  isViewer: !!viewerId && row.payerId === viewerId,
  serviceFee: num(row.tradeFeeAmount),
  shipping: num(row.shippingAmount),
  commission: num(row.commission),
  cashDifference: num(row.amount),
  total: num(row.totalAmount),
  status: row.status ?? null,
});

/** Ödeme satırları — v2 dizisi, yoksa LEGACY tek alan. */
export function paymentRowsOf(trade: Trade | null): TradeCashPayment[] {
  if (!trade) return [];
  if (trade.cashPayments?.length) return trade.cashPayments;
  return trade.cashPayment ? [trade.cashPayment] : [];
}

/**
 * Ekranda gösterilecek paneller — İZLEYEN ÖNCE. Ne satır ne teklif varsa boş
 * dizi döner (ödemesiz takas ya da v1 kafa kafaya takas → kart hiç çıkmaz).
 */
export function buildTradePaymentPanels(
  trade: Trade | null,
  quote: TradeQuote | null,
  viewerId?: string,
): TradePaymentPanel[] {
  if (!trade) return [];

  const rows = paymentRowsOf(trade);
  const panels: TradePaymentPanel[] = rows.length
    ? rows.map((row) => fromPaymentRow(trade, row, viewerId))
    : quote
      ? [quote.initiator, quote.receiver].map((party) => ({
          userId: party.userId,
          name: nameOf(trade, party.userId),
          isViewer: !!viewerId && party.userId === viewerId,
          serviceFee: num(party.serviceFee),
          shipping: num(party.shipping),
          commission: 0,
          cashDifference: num(party.cashDifference),
          total: num(party.total),
          status: null,
        }))
      : [];

  // İzleyenin paneli önce: kendi ödemesi ekranın birincil işidir.
  return panels.sort((a, b) => Number(b.isViewer) - Number(a.isViewer));
}

export interface TradePaymentProgress {
  /** Tahsil edilmiş satır sayısı. */
  paid: number;
  /** Beklenen ödeme sayısı (v2'de 2). */
  total: number;
  /** Hepsi ödendi mi — depo sürecinin kapısı. */
  allPaid: boolean;
}

export function tradePaymentProgress(
  trade: Trade | null,
): TradePaymentProgress {
  const rows = paymentRowsOf(trade);
  const paid = rows.filter((row) => row.status === "completed").length;
  return {
    paid,
    total: rows.length,
    allPaid: rows.length > 0 && paid === rows.length,
  };
}

/** İzleyenin kendi ödeme satırı (yoksa null). */
export function viewerPaymentRow(
  trade: Trade | null,
  viewerId?: string,
): TradeCashPayment | null {
  if (!viewerId) return null;
  return paymentRowsOf(trade).find((row) => row.payerId === viewerId) ?? null;
}
