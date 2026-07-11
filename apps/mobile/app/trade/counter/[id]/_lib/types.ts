export interface TradeItem {
  id: string;
  productId: string;
  product?: {
    id: string;
    title: string;
    price: number;
    images?: Array<{ url?: string; cardUrl?: string }> | string[];
  };
  quantity: number;
}

export interface Trade {
  id: string;
  status: string;
  cashAmount?: number;
  cashPayerId?: string | null;
  message?: string;
  initiatorId: string;
  receiverId: string;
  initiatorName?: string;
  receiverName?: string;
  initiator?: { id: string; displayName: string };
  receiver?: { id: string; displayName: string };
  initiatorItems?: TradeItem[];
  receiverItems?: TradeItem[];
}

export const itemId = (p: any) => p?.productId ?? p?.id;

// Teklifin değişip değişmediğini saptamak için imza (ürün setleri + nakit yön/tutar).
export function offerSignature(mine: any[], theirs: any[], dir: string, cash: string): string {
  const cashVal = parseFloat(cash) || 0;
  const m = mine.map(itemId).filter(Boolean).sort().join(',');
  const t = theirs.map(itemId).filter(Boolean).sort().join(',');
  return `${m}|${t}|${dir}:${cashVal}`;
}
