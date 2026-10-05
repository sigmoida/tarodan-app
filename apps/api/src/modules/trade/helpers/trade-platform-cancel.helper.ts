import { PaymentStatus, Prisma } from "@prisma/client";
import { defaultLocale, type Locale } from "@tarodan/i18n";
import {
  ADMIN_CANCEL_REASON_I18N_KEYS,
  type AdminCancelReasonCode,
  type AdminTradeCancelRefundLine,
} from "@tarodan/types";
import { translateMessage } from "../../i18n/translate";
import { tradePaymentRefundableAmountFor } from "./trade-refund-policy";

/**
 * PLATFORM (ADMIN) TAKAS İPTALİ — saf yardımcılar. Para kuralı burada YOK:
 * tutar iade yolunun kullandığı `tradePaymentRefundableAmountFor`'dan gelir;
 * bu dosya yalnız platform iptalinin kusur kararını (iki taraf da kusursuz)
 * o fonksiyona verir ve sonucu taraf başına satıra çevirir.
 */

/** Uygunluk kuralı + önizleme için okunan takas alanları. */
export const TRADE_PLATFORM_CANCEL_SELECT = {
  id: true,
  tradeNumber: true,
  status: true,
  initiatorId: true,
  receiverId: true,
  firstWarehouseArrivalAt: true,
  cancelLockedAt: true,
  cancelledBy: true,
  adminCancelReasonCode: true,
} as const satisfies Prisma.TradeSelect;

/** Ortak devir kuralının (`isTradeParcelHandedToCarrier`) okuduğu bacak alanları. */
export const TRADE_HANDOVER_SHIPMENT_SELECT = {
  leg: true,
  status: true,
  shippedAt: true,
  deliveredAt: true,
} as const satisfies Prisma.TradeShipmentSelect;

/** İade satırı için okunan ödeme alanları (iade yolunun okuduklarının aynısı). */
export const TRADE_PLATFORM_CANCEL_PAYMENT_SELECT = {
  payerId: true,
  status: true,
  totalAmount: true,
  shippingAmount: true,
  tradeFeeAmount: true,
  commission: true,
  commissionTaxAmount: true,
  releasedAt: true,
  refundedAt: true,
  payment: { select: { status: true, provider: true } },
} as const satisfies Prisma.TradeCashPaymentSelect;

export type TradePlatformCancelPayment = Prisma.TradeCashPaymentGetPayload<{
  select: typeof TRADE_PLATFORM_CANCEL_PAYMENT_SELECT;
}>;

/**
 * Taraf başına (initiator, receiver) platform iptalinin iade satırı.
 *
 * Kusur: platform iptali hiçbir tarafın kusuru değildir → her ödeme
 * `fullRefundEntitled` (çekirdek `faultless: "all"` ile satıra da yazar).
 * Kargo eşiği: uygunluk kuralı yalnız hiçbir kolinin taşıyıcıya geçmediği
 * takası kabul eder → `handedToCargo: false`. (Kusursuz satırda eşik zaten
 * tutarı değiştirmez.) Böylece önizleme, iptalin kaydettiği tutar ve iade
 * yolunun ödediği tutar aynı fonksiyondan çıkar.
 */
export function platformCancelRefundLines(
  trade: { initiatorId: string; receiverId: string },
  payments: readonly TradePlatformCancelPayment[],
): AdminTradeCancelRefundLine[] {
  const lineFor = (
    userId: string,
    side: AdminTradeCancelRefundLine["side"],
  ): AdminTradeCancelRefundLine => {
    const own = payments.filter((payment) => payment.payerId === userId);
    const refundAmount = own.reduce(
      (sum, payment) =>
        sum +
        tradePaymentRefundableAmountFor(
          {
            paymentStatus: payment.payment?.status ?? "",
            provider: payment.payment?.provider ?? "",
            releasedAt: payment.releasedAt,
            refundedAt: payment.refundedAt,
            totalAmount: payment.totalAmount,
            shippingAmount: payment.shippingAmount,
            tradeFeeAmount: payment.tradeFeeAmount,
            commissionAmount: payment.commission,
            commissionTaxAmount: payment.commissionTaxAmount,
            fullRefundEntitled: true,
          },
          { handedToCargo: false },
        ),
      0,
    );
    return {
      userId,
      side,
      paid: own.some((payment) => payment.status === PaymentStatus.completed),
      refundAmount: Math.round(refundAmount * 100) / 100,
    };
  };
  return [
    lineFor(trade.initiatorId, "initiator"),
    lineFor(trade.receiverId, "receiver"),
  ];
}

/** Kodun katalog etiketi (taraflara giden tek gerekçe metni). */
export function adminCancelReasonLabel(
  reasonCode: AdminCancelReasonCode,
  locale: Locale = defaultLocale,
): string {
  return translateMessage(ADMIN_CANCEL_REASON_I18N_KEYS[reasonCode], locale);
}

/**
 * `Trade.cancelReason` metni: taraf ekranları (web, mobil) bu kolonu "Neden"
 * olarak aynen gösterir — bu yüzden YALNIZ kodun etiketini taşır, adminin iç
 * notunu asla. Diğer iptal gerekçeleri gibi varsayılan dilde saklanır.
 */
export function platformCancelReasonText(
  reasonCode: AdminCancelReasonCode,
): string {
  return translateMessage(
    "server.trade.platformCancelledReason",
    defaultLocale,
    {
      reason: adminCancelReasonLabel(reasonCode),
    },
  );
}
