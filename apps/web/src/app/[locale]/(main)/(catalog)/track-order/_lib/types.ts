export interface GuestOrderDetail {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  product: { id: string; title: string; image?: string };
  seller: { id: string; displayName: string; isVerified?: boolean };
  shippingAddress?: Record<string, string>;
  shipment?: {
    provider: string;
    trackingNumber: string | null;
    trackingUrl: string | null;
    status: string;
    estimatedDelivery?: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
}
