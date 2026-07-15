/** @format */

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
  initiator?: { id: string; displayName?: string };
  receiver?: { id: string; displayName?: string };
  initiatorItems: TradeItem[];
  receiverItems: TradeItem[];
  cashAmount?: number;
  createdAt: string;
  responseDeadline: string;
}

const PLACEHOLDER = "https://placehold.co/120x120/f3f4f6/9ca3af?text=Ürün";

export const getItemImage = (item: TradeItem): string =>
  item.productImages?.[0]?.cardUrl ??
  item.productImages?.[0]?.detailUrl ??
  item.productImage ??
  PLACEHOLDER;

export const calculateTotalValue = (items: TradeItem[]): number =>
  items.reduce((sum, item) => sum + item.valueAtTrade * item.quantity, 0);
