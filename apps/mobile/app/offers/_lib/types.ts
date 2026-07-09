// Teklifler ekranının route-local DTO tipleri.

export type TabType = 'received' | 'sent';

export type OfferStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'countered'
  | 'cancelled'
  | 'expired'
  | 'payment_expired';

export interface Offer {
  id: string;
  amount: number;
  status: OfferStatus;
  orderId?: string | null;
  orderStatus?: string | null;
  message?: string;
  expiresAt: string;
  createdAt: string;
  /** Karşı teklif sonrası alıcı onayı bekleniyor mu (web ile parite). */
  buyerMustAccept?: boolean;
  product: {
    id: string;
    title: string;
    price: number;
    imageUrl?: string;
    images?: { cardUrl?: string }[];
    categoryId?: string | null;
  };
  buyer?: { id: string; displayName: string; avatarUrl?: string };
  seller?: { id: string; displayName: string; avatarUrl?: string };
}
