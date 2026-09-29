import type { Prisma } from "@prisma/client";
import {
  LIST_LINE_SELECT,
  LIST_PRODUCT_SELECT,
  PARTY_SELECT,
} from "./order-list-select";

/**
 * İptaller sekmesinin `select`'leri. Sipariş kalemi, siparişler ekranının
 * kalem seçimini AYNEN taşır (satır eşlemesi `mapCartRow`'u yeniden kullanır)
 * ve üstüne iptalin neden / para alanlarını ekler.
 */

export const CANCELLATION_LINE_SELECT = {
  ...LIST_LINE_SELECT,
  cancelledAt: true,
  cancelReason: true,
  cancellationReasonCode: true,
  payment: { select: { status: true } },
  checkoutGroup: {
    select: { payment: { select: { status: true } } },
  },
  refundAttempts: { select: { status: true } },
} as const satisfies Prisma.OrderSelect;

export type CancellationLine = Prisma.OrderGetPayload<{
  select: typeof CANCELLATION_LINE_SELECT;
}>;

export const CANCELLATION_TRADE_SELECT = {
  id: true,
  tradeNumber: true,
  status: true,
  isTest: true,
  createdAt: true,
  cancelledAt: true,
  cancelledBy: true,
  cancelReason: true,
  refundFailureAt: true,
  initiator: { select: PARTY_SELECT },
  receiver: { select: PARTY_SELECT },
  items: {
    orderBy: [{ side: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      side: true,
      quantity: true,
      valueAtTrade: true,
      product: { select: LIST_PRODUCT_SELECT },
    },
  },
  cashPayments: {
    select: {
      status: true,
      refundedAt: true,
      totalAmount: true,
      commission: true,
      tradeFeeAmount: true,
    },
  },
} as const satisfies Prisma.TradeSelect;

export type CancellationTrade = Prisma.TradeGetPayload<{
  select: typeof CANCELLATION_TRADE_SELECT;
}>;
