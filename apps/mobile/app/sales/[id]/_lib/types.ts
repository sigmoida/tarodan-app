export interface Order {
  id: string;
  orderNumber?: string;
  status: string;
  // Kargo öncesi iptalde status 'refunded' olur ama 'iptal' → "İptal Edildi" göster.
  cancellationType?: string | null;
  totalAmount?: number;
  subtotal?: number;
  shippingCost?: number;
  commission?: number;
  netAmount?: number;
  createdAt: string;
  buyer?: {
    id: string;
    displayName: string;
    email?: string;
    phone?: string;
  };
  shippingAddress?: {
    fullName: string;
    phone: string;
    city: string;
    district: string;
    address: string;
    zipCode?: string;
  };
  pricing?: {
    subtotal?: number;
    shippingAmount?: number;
    commissionAmount?: number;
    withholdingTaxAmount?: number;
    sellerNetAmount?: number;
    totalAmount?: number;
  };
  items?: Array<{
    id: string;
    price: number;
    quantity: number;
    product?: {
      id: string;
      title: string;
      imageUrl?: string;
    };
  }>;
  shipment?: {
    carrier?: string;
    provider?: string;
    trackingNumber?: string;
    status?: string;
    shippedAt?: string;
    trackingUrl?: string;
  };
}
