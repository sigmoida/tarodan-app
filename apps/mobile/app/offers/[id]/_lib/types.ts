// Teklif detay ekranının kendi DTO'su — liste ekranının offers/_lib/types Offer'ından
// farklı alanlar (counterAmount, buyerMustAccept, product.seller) içerdiği için
// route-local tutuldu (kör birleştirme statü/aksiyon davranışını değiştirebilirdi).
export interface Offer {
  id: string;
  productId: string;
  amount: number;
  message?: string;
  status: string;
  createdAt: string;
  expiresAt?: string;
  buyerId?: string;
  sellerId?: string;
  product?: {
    id: string;
    title: string;
    price: number;
    images?: Array<{ url?: string; cardUrl?: string }> | string[];
    seller?: { id: string };
  };
  buyer?: { id: string; displayName: string };
  seller?: { id: string; displayName: string };
  counterAmount?: number;
  buyerMustAccept?: boolean;
}
