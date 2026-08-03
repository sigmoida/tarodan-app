import { PaymentStatus } from "@prisma/client";
import type { TradeQuote } from "./trade-quote.service";

/**
 * Takas ödeme satırları (v2) — teklif → tahsil edilecek satırlar.
 *
 * Kabul anında iki satır yazılır (taraf başına bir tane) ve tutarlar
 * SNAPSHOT'lanır: kural ya da kargo tarifesi sonradan değişse bile kabul
 * edilmiş takasın fiyatı sabit kalır — siparişte komisyonun snapshot'lanmasıyla
 * aynı ilke.
 *
 * Satırların üretimi ayrı bir saf yardımcıdır ki "kabulde ne yazılıyor" sorusu
 * transaction gövdesini okumadan test edilebilsin.
 */

export interface TradeCashPaymentRow {
  tradeId: string;
  payerId: string;
  /** Farkın gideceği taraf — yalnız fark taşıyan satırda dolu. */
  recipientId: string | null;
  /** Nakit fark (fark ödemeyen tarafta 0). */
  amount: number;
  tradeFeeAmount: number;
  shippingAmount: number;
  /** PayTR'den tahsil edilecek toplam. */
  totalAmount: number;
  /** LEGACY (v1) — v2'de komisyon alınmaz. */
  commission: number;
  commissionTaxAmount: number;
  provider: string;
  status: PaymentStatus;
}

export function buildTradeCashPaymentRows(
  tradeId: string,
  quote: TradeQuote,
): TradeCashPaymentRow[] {
  return [quote.initiator, quote.receiver].map((party) => {
    const counterparty =
      party.side === "initiator" ? quote.receiver : quote.initiator;
    return {
      tradeId,
      payerId: party.userId,
      // Ücret ve kargo platformda kalır (alıcısı yok); yalnız nakit farkının
      // bir alıcısı vardır — o da karşı taraftır.
      recipientId: party.cashDifference > 0 ? counterparty.userId : null,
      amount: party.cashDifference,
      tradeFeeAmount: party.serviceFee,
      shippingAmount: party.shipping,
      totalAmount: party.total,
      commission: 0,
      commissionTaxAmount: 0,
      provider: "pending",
      status: PaymentStatus.pending,
    };
  });
}

/**
 * Takasın ödemesi TAMAM mı? Depo süreci ancak İKİ taraf da ödeyince başlar —
 * tek taraflı ödeme ürünleri kargoya çıkarmaz.
 *
 * Satır yoksa `false`: ödeme beklenen bir takas, satırı yazılmadıysa ödenmiş
 * sayılamaz (fail-closed).
 */
export function isTradeFullyPaid(
  payments: Array<{ status: PaymentStatus }>,
): boolean {
  if (payments.length === 0) return false;
  return payments.every((p) => p.status === PaymentStatus.completed);
}
