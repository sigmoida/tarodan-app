export interface Payment {
  id: string;
  amount: number;
  status: 'completed' | 'failed' | 'pending';
  method: string;
  description: string;
  createdAt: string;
  periodStart?: string;
  periodEnd?: string;
  invoiceUrl?: string;
  imageUrl?: string;
}
