import type { StatusConfig } from '@tarodan/ui';

export interface Payment {
  id: string;
  orderId: string;
  orderNumber: string;
  amount: number;
  currency: string;
  provider: string;
  status: string;
  failureReason?: string;
  providerPaymentId?: string;
  buyer: { id: string; displayName: string; email: string };
  seller: { id: string; displayName: string; email: string };
  product: { id: string; title: string };
  createdAt: string;
  updatedAt: string;
  paidAt?: string;
}

export const paymentStatusConfig: Record<string, StatusConfig> = {
  pending: { label: 'Bekliyor', variant: 'warning' },
  processing: { label: 'İşleniyor', variant: 'info' },
  completed: { label: 'Tamamlandı', variant: 'success' },
  failed: { label: 'Başarısız', variant: 'danger' },
  refunded: { label: 'İade Edildi', variant: 'secondary' },
};

export const paymentStatusFilterOptions = [
  { value: 'all', label: 'Tüm Durumlar' },
  { value: 'pending', label: 'Bekliyor' },
  { value: 'processing', label: 'İşleniyor' },
  { value: 'completed', label: 'Tamamlandı' },
  { value: 'failed', label: 'Başarısız' },
  { value: 'refunded', label: 'İade Edildi' },
];

export const providerFilterOptions = [
  { value: 'all', label: 'Tüm Sağlayıcılar' },
  { value: 'paytr', label: 'PayTR' },
];

export function mapPayments(raw: any[]): Payment[] {
  return (raw || []).map((p: any) => ({
    id: p.id,
    orderId: p.orderId,
    orderNumber: p.orderNumber,
    amount: Number(p.amount || 0),
    currency: p.currency,
    provider: p.provider,
    status: p.status,
    failureReason: p.failureReason,
    providerPaymentId: p.providerPaymentId,
    buyer: p.buyer || { id: '', displayName: '', email: '' },
    seller: p.seller || { id: '', displayName: '', email: '' },
    product: p.product || { id: '', title: '' },
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    paidAt: p.paidAt,
  }));
}
