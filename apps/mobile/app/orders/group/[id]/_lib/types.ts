import type { UiOrderStatus } from '@/utils/orderStatus';

export interface GroupOrder {
  id: string;
  orderNumber: string;
  status: UiOrderStatus;
  totalAmount: number;
  product: {
    id: string;
    title: string;
    images?: Array<{ url: string }>;
    imageUrl?: string;
  };
  seller: { id: string; displayName: string };
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  cancellationType?: 'iptal' | 'iade' | null;
  activeRefundRequest?: { id: string; status: string } | null;
  shipment?: {
    provider?: string;
    trackingNumber?: string | null;
    status?: string;
  } | null;
}

export interface GroupDetail {
  id: string;
  groupNumber: string;
  totalAmount: number;
  status: string;
  createdAt: string;
  payment?: { status: string; amount: number } | null;
  orders: GroupOrder[];
}
