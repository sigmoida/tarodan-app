import type { OfferRow } from "../../../_lib/offers";

export interface OfferChainEntry extends OfferRow {
  /** Karşı teklif satırını kim açtı (buyerMustAccept=true → satıcı). */
  actor: "buyer" | "seller";
  isCurrent: boolean;
}

/** GET /admin/offers/:id */
export interface AdminOfferDetail {
  offer: OfferRow;
  chain: OfferChainEntry[];
  siblings: OfferRow[];
  order: OfferRow["order"];
  competing: {
    acceptedOffers: number;
    pendingPaymentOrders: number;
    soldOrder: { id: string; orderNumber: string; status: string } | null;
  };
  product: {
    id: string;
    title: string;
    listPrice: number;
    status: string;
    quantity: number | null;
    reservedQuantity: number;
    sellerId: string;
    imageUrl: string | null;
  };
}
