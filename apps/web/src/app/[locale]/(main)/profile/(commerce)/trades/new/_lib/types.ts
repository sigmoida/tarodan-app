/** @format */

export interface TradeProduct {
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
  sellerId?: string;
  seller?: { id: string };
}

const PLACEHOLDER = "https://placehold.co/200x200/f3f4f6/9ca3af?text=Ürün";

export const getTradeProductImage = (product: TradeProduct): string => {
  const first = product.images?.[0];
  if (!first) return PLACEHOLDER;
  if (typeof first === "string") return first;
  return first.cardUrl ?? first.detailUrl ?? first.url ?? PLACEHOLDER;
};

export const getSellerId = (product: TradeProduct): string | undefined =>
  product.sellerId ?? product.seller?.id;
