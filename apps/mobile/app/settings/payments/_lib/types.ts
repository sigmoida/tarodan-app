export interface Payment {
  id: string;
  orderId: string;
  orderNumber?: string;
  amount: number;
  currency?: string;
  provider: string;
  status: string;
  failureReason?: string;
  product?: { id: string; title: string };
  createdAt: string;
  paidAt?: string;
}
