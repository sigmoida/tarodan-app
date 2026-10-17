import { PaymentStatus, Prisma, TradeStatus } from "@prisma/client";
import type { TimingRuleId } from "@tarodan/types";

/**
 * Takas yanıt / ödeme süresinin extend_once uzatması — saf kurallar.
 *
 * İki aşama, her biri KENDİ süresi ve KENDİ "bir kez" damgasıyla:
 *   - response: `pending` takas, `responseDeadline`, `responseExtendedAt`
 *     (süre: tradeResponseHours). Sırası gelen: alıcı (receiver).
 *   - payment: `awaiting_payment` takas, `paymentDeadline`, `paymentExtendedAt`
 *     (süre: tradePaymentHours). Sırası gelen: ödemesi tamamlanmamış taraflar.
 * Diğer aşamalar (kargo, onay, bekletme) bu pakette uzatılmaz.
 */
export type TradeExtensionStage = "response" | "payment";

export const TRADE_EXTENSION_STAGE_RULE = {
  response: "tradeResponseHours",
  payment: "tradePaymentHours",
} as const satisfies Record<TradeExtensionStage, TimingRuleId>;

/** İptal döngüsündeki takasın hangi uzatma aşamasına denk geldiği (yoksa null). */
export function tradeExtensionStageOf(
  status: TradeStatus,
): TradeExtensionStage | null {
  if (status === TradeStatus.pending) return "response";
  if (status === TradeStatus.awaiting_payment) return "payment";
  return null;
}

/** Aşamanın damgalı son tarihi (taze satırdan okunur). */
export function tradeStageDeadline(
  trade: { responseDeadline: Date; paymentDeadline: Date | null },
  stage: TradeExtensionStage,
): Date | null {
  return stage === "response" ? trade.responseDeadline : trade.paymentDeadline;
}

/** Aşamanın "hak kullanıldı" damgası. */
export function tradeStageExtendedAt(
  trade: {
    responseExtendedAt: Date | null;
    paymentExtendedAt: Date | null;
  },
  stage: TradeExtensionStage,
): Date | null {
  return stage === "response"
    ? trade.responseExtendedAt
    : trade.paymentExtendedAt;
}

/**
 * Yeni son tarih: ŞİMDİ + aşamanın o anki süresi — "bir tam süre". (Eski son
 * tarihe eklemek, cron gecikmesinde süreyi yutardı; taraf tam süre alır.)
 * Damgalama yolundaki `setHours` ile aynı yöntem.
 */
export function tradeExtendedDeadline(now: Date, hours: number): Date {
  const deadline = new Date(now);
  deadline.setHours(deadline.getHours() + hours);
  return deadline;
}

/**
 * Koşullu-atomik hak talebinin where'i: hâlâ aynı statüde, son tarih hâlâ
 * geçmiş, hak hâlâ kullanılmamış. Eşzamanlı iki tur / kullanıcı hamlesi
 * (karşı teklif) bu koşulu bozarsa count 0 döner ve uzatma yapılmaz.
 */
export function tradeExtensionClaimWhere(
  tradeId: string,
  stage: TradeExtensionStage,
  now: Date,
): Prisma.TradeWhereInput {
  return stage === "response"
    ? {
        id: tradeId,
        status: TradeStatus.pending,
        responseDeadline: { lt: now },
        responseExtendedAt: null,
      }
    : {
        id: tradeId,
        status: TradeStatus.awaiting_payment,
        paymentDeadline: { lt: now },
        paymentExtendedAt: null,
      };
}

/**
 * Hak talebinin yazımı: yeni son tarih + kullanıldı damgası.
 *
 * `version` BİLEREK artırılmaz: ödeme tamamlanma yolu geçişi
 * `where: { version }` guard'ıyla yazar ve takası kilitlemeden okur; uzatma
 * araya girip sürümü oynatsaydı son ödemeyi alan callback geçişi KAYBEDER,
 * takas tamamen ödenmiş hâlde awaiting_payment'ta kalır ve sonraki süre
 * dolumunda iade edilirdi. Uzatma bir iş kuralı değiştirmez (yalnız tarih
 * ötelenir); eşzamanlılık claim where'indeki koşullarla ve satır kilidiyle
 * korunur.
 */
export function tradeExtensionClaimData(
  stage: TradeExtensionStage,
  deadline: Date,
  now: Date,
): Prisma.TradeUpdateManyMutationInput {
  return stage === "response"
    ? { responseDeadline: deadline, responseExtendedAt: now }
    : { paymentDeadline: deadline, paymentExtendedAt: now };
}

export interface TradePaymentRowLike {
  payerId: string;
  status: PaymentStatus;
}

export type PaymentExtensionBlocker =
  "noPaymentRows" | "refundedRow" | "nothingOutstanding";

/**
 * Ödeme aşaması uzatması GÜVENLİ mi — ve kime hatırlatılır?
 *
 * Uzatma yalnız süreyi öteler; rezervasyon, stok tutma ve alınmış ödemeler
 * olduğu gibi kalır (iptal gelirse mevcut yol hepsini zaten çözer). Yine de
 * uzatılMAZ:
 *   - `noPaymentRows`: tahsil edilecek satır yok — kimseden beklenen bir şey
 *     yok, durum tutarsız (admin bakar).
 *   - `refundedRow`: bir satır zaten iade edilmiş — para akışı kısmen
 *     çözülmüş; yeni süre tanımak bu yarım durumu uzatır.
 *   - `nothingOutstanding`: tüm satırlar tamamlanmış ama takas hâlâ ödeme
 *     bekliyor (geçiş takılmış) — beklenecek ödeme yok, uzatma hiçbir şeyi
 *     çözmez; mevcut iptal/iade yolu çalışır.
 * `processing` (PayTR oturumu açık) ve `failed` (yeniden denenebilir) satırlar
 * bekleyen sayılır: uzatma tam da onlara zaman tanır.
 */
export function evaluatePaymentExtension(
  rows: readonly TradePaymentRowLike[],
):
  | { blocker: PaymentExtensionBlocker; recipients: []; paidParties: [] }
  | { blocker: null; recipients: string[]; paidParties: string[] } {
  if (rows.length === 0) {
    return { blocker: "noPaymentRows", recipients: [], paidParties: [] };
  }
  if (rows.some((row) => row.status === PaymentStatus.refunded)) {
    return { blocker: "refundedRow", recipients: [], paidParties: [] };
  }
  const outstanding = rows.filter(
    (row) => row.status !== PaymentStatus.completed,
  );
  if (outstanding.length === 0) {
    return { blocker: "nothingOutstanding", recipients: [], paidParties: [] };
  }
  return {
    blocker: null,
    recipients: [...new Set(outstanding.map((row) => row.payerId))],
    // Ödemesini tamamlamış taraflar: parası ve ürünü yeni süre boyunca
    // bekler, bu yüzden onlar da yeni son tarihten haberdar edilir.
    paidParties: rows
      .filter((row) => row.status === PaymentStatus.completed)
      .map((row) => row.payerId),
  };
}
