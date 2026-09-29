import {
  OrderStatus,
  PaymentHoldStatus,
  PayoutStatus,
  Prisma,
  SellerAdjustmentStatus,
} from "@prisma/client";
import { ELOGO_MAX_SEND_ATTEMPTS } from "../../elogo/helpers/elogo-retry-policy";
import {
  LIVE_ORDER,
  LIVE_PAYMENT,
  LIVE_PAYOUT_TRANSFER,
} from "../../account-lane/live-lane.where";
import {
  invoiceDeadlineDays,
  type ThresholdConfigReader,
} from "../../../config/alert-thresholds";

/**
 * Finans sağlık şeridinin KÜME TANIMLARI — tek kaynak.
 *
 * Aynı beş soru ("başarısız transfer, süresi geçmiş hold, faturasız teslimat,
 * tükenmiş belge, açık satıcı borcu") hem Finans Özeti'nde hem dashboard'un
 * bekleyen işler kuyruğunda sorulur. İki ekranın aynı sayıyı göstermesi ancak
 * where cümlesi tek yerde durursa garanti edilebilir.
 *
 * Test şeridi hiçbir kümeye girmez (bkz. account-lane/live-lane.where): test
 * hold'u payout'ta bilinçli atlanır, test siparişine belge kesilmez — sayılırsa
 * hiçbir zaman kapanmayan sahte iş üretir.
 */

/** Transfer talimatı PayTR'de başarısız olmuş / geri dönmüş. */
export const failedTransfersWhere: Prisma.PayoutTransferWhereInput = {
  ...LIVE_PAYOUT_TRANSFER,
  status: { in: [PayoutStatus.failed, PayoutStatus.returned] },
};

/**
 * Süresi dolmuş ama hâlâ tutulan escrow (iade kilidi dahil — admin bakmalı).
 * Test şeridi hold'ları payout'ta bilinçli atlanır (asla serbest kalmaz), bu
 * yüzden sayılırsa kalıcı sahte alarm üretir.
 */
export function overdueHoldsWhere(now: Date): Prisma.PaymentHoldWhereInput {
  return {
    payment: LIVE_PAYMENT,
    status: PaymentHoldStatus.held,
    releaseAt: { not: null, lte: now },
  };
}

/** Deneme bütçesi tükenmiş e-belgeler — yasal süre işliyor, elle müdahale şart. */
export const exhaustedInvoicesWhere: Prisma.ElogoInvoiceWhereInput = {
  status: "failed",
  attemptCount: { gte: ELOGO_MAX_SEND_ATTEMPTS },
};

/** Denemesi süren başarısız belgeler (tükenmişlerden ayrı sayılır). */
export const retryableFailedInvoicesWhere: Prisma.ElogoInvoiceWhereInput = {
  status: "failed",
  attemptCount: { lt: ELOGO_MAX_SEND_ATTEMPTS },
};

/** Açık satıcı borcu (payout mahsubu bekleyen). */
export const openAdjustmentsWhere: Prisma.SellerAccountAdjustmentWhereInput = {
  status: SellerAdjustmentStatus.open,
};

/**
 * Teslim edilmiş, komisyon defteri yazılmış, ama gelir faturası hâlâ kesilmemiş
 * siparişler. order-scheduler'ın ORDERS_DELIVERED_UNINVOICED alarmıyla AYNI küme.
 * Test şeridi siparişine eLogo belgesi hiç kesilmez — kümeye girmemeli.
 */
export function uninvoicedDeliveredWhere(
  now: Date,
  config?: ThresholdConfigReader,
): Prisma.OrderWhereInput {
  const cutoff = new Date(
    now.getTime() - invoiceDeadlineDays(config) * 24 * 60 * 60 * 1000,
  );
  return {
    ...LIVE_ORDER,
    status: { in: [OrderStatus.delivered, OrderStatus.completed] },
    commissionLedger: { isNot: null },
    revenueInvoicedAt: null,
    deliveredAt: { lt: cutoff },
  };
}
