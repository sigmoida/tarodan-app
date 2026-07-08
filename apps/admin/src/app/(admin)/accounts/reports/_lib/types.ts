import type { StatusConfig } from '@tarodan/ui';

export type ReportStatus = 'pending' | 'under_review' | 'resolved' | 'dismissed';
export type ReportType = 'product' | 'user' | 'collection' | 'message';

export interface Report {
  id: string;
  type: ReportType;
  targetId: string;
  reason: string;
  description?: string;
  status: ReportStatus;
  createdAt: string;
  resolvedAt?: string;
  adminNote?: string;
  reporter?: { id: string; displayName: string; email: string };
}

export const reportStatusConfig: Record<string, StatusConfig> = {
  pending: { label: 'Bekliyor', variant: 'warning' },
  under_review: { label: 'İncelemede', variant: 'info' },
  resolved: { label: 'Çözüldü', variant: 'success' },
  dismissed: { label: 'Reddedildi', variant: 'default' },
};

export const reportTypeLabels: Record<string, string> = {
  product: 'Ürün',
  user: 'Kullanıcı',
  collection: 'Koleksiyon',
  message: 'Mesaj',
};

export const reportReasonLabels: Record<string, string> = {
  spam: 'Spam',
  inappropriate_content: 'Uygunsuz İçerik',
  fake_product: 'Sahte/Yanıltıcı Ürün',
  scam: 'Dolandırıcılık',
  harassment: 'Taciz',
  hate_speech: 'Nefret Söylemi',
  counterfeit: 'Taklit Ürün',
  wrong_category: 'Yanlış Kategori',
  misleading_info: 'Yanıltıcı Bilgi',
  other: 'Diğer',
};

export const reportTypeOptions = [
  { value: 'all', label: 'Tüm Türler' },
  { value: 'product', label: 'Ürün' },
  { value: 'user', label: 'Kullanıcı' },
  { value: 'collection', label: 'Koleksiyon' },
  { value: 'message', label: 'Mesaj' },
];

export const reportStatusOptions = [
  { value: 'all', label: 'Tüm Durumlar' },
  { value: 'pending', label: 'Bekliyor' },
  { value: 'under_review', label: 'İncelemede' },
  { value: 'resolved', label: 'Çözüldü' },
  { value: 'dismissed', label: 'Reddedildi' },
];
