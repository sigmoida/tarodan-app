/** @format */

import type { TradeItem } from "../../_lib/types";

/** A product row in the counter-offer pickers. */
export interface CounterProduct {
  id: string;
  title: string;
  price: number;
  originalPrice?: number | null;
  salePrice?: number | null;
  isOnSale?: boolean;
  images?: Array<
    { url?: string; cardUrl?: string; detailUrl?: string } | string
  >;
  isTradeEnabled?: boolean;
  status?: string;
}

/** A product row built from an item already in the trade. */
function fromTradeItem(item: TradeItem): CounterProduct {
  return {
    id: item.productId,
    title: item.productTitle,
    // Value at trade time, not the current price.
    price: item.valueAtTrade,
    images: item.productImages?.length
      ? item.productImages
      : item.productImage
        ? [{ cardUrl: item.productImage, detailUrl: item.productImage }]
        : [],
    // In a trade, so reserved; and necessarily trade-enabled.
    status: "reserved",
    isTradeEnabled: true,
  };
}

/**
 * The picker list: the items already in the trade first (they stay pickable
 * whatever their status), then the loaded pages minus those items and minus
 * `excludeId`.
 */
export function mergeTradeItems(
  tradeItems: TradeItem[],
  loaded: CounterProduct[],
  excludeId?: string,
): CounterProduct[] {
  const inTrade = new Set(tradeItems.map((i) => i.productId));
  return [
    ...tradeItems.map(fromTradeItem),
    ...loaded.filter((p) => !inTrade.has(p.id) && p.id !== excludeId),
  ];
}
