/** @format */

import { publicNameOf } from "@/lib/public-name";
import { imagePlaceholder } from "@/lib/placeholder";

export interface TradeItem {
  id: string;
  productId: string;
  productTitle: string;
  productImage?: string;
  productImages?: { cardUrl?: string; detailUrl?: string }[];
  side: string;
  quantity: number;
  valueAtTrade: number;
}

export interface Trade {
  id: string;
  tradeNumber: string;
  status: string;
  initiatorId: string;
  receiverId: string;
  initiatorName?: string;
  receiverName?: string;
  initiator?: { id: string; publicName?: string; displayName?: string };
  receiver?: { id: string; publicName?: string; displayName?: string };
  initiatorItems: TradeItem[];
  receiverItems: TradeItem[];
  cashAmount?: number;
  /** Nakit farkı ödeyecek taraf (initiatorId | receiverId). null/absent = eşit takas. */
  cashPayerId?: string | null;
  createdAt: string;
  responseDeadline: string;
}

/** Nakit farkını ödeyen tarafın görünen adı (cashPayerId → initiator/receiver eşlemesi). */
export const cashPayerName = (trade: Trade): string | null => {
  if (!trade.cashPayerId) return null;
  return trade.cashPayerId === trade.initiatorId
    ? (trade.initiatorName ?? publicNameOf(trade.initiator) ?? null)
    : (trade.receiverName ?? publicNameOf(trade.receiver) ?? null);
};

const PLACEHOLDER = imagePlaceholder("120x120");

export const getItemImage = (item: TradeItem): string =>
  item.productImages?.[0]?.cardUrl ??
  item.productImages?.[0]?.detailUrl ??
  item.productImage ??
  PLACEHOLDER;

export const calculateTotalValue = (items: TradeItem[]): number =>
  items.reduce((sum, item) => sum + item.valueAtTrade * item.quantity, 0);
