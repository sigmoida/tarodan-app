import type { StatusConfig } from '@tarodan/ui';

export interface Invoice {
  id: string;
  type: string;
  typeLabel: string;
  isReturn: boolean;
  status: string;
  documentType: string;
  documentTypeLabel: string;
  invoiceNumber: string | null;
  ettn: string | null;
  recipientName: string | null;
  recipientVknTckn: string | null;
  netAmount: number;
  taxAmount: number;
  total: number;
  vatRate: number;
  billingReference: string | null;
  hasPdf: boolean;
  emailSentAt: string | null;
  resultMsg: string | null;
  issuedAt: string | null;
  createdAt: string;
}

export interface SellerInvoice {
  id: string;
  fileName: string;
  fileSize: number | null;
  uploadedAt: string;
  replacedAt: string | null;
  emailSentAt: string | null;
  orderId: string | null;
  orderNumber: string | null;
  orderTotal: number | null;
  sellerName: string;
  buyerName: string;
  buyerEmail: string | null;
}

export const INVOICE_TABS = [
  { key: 'elogo', label: 'eLogo Faturaları' },
  { key: 'seller', label: 'Satıcı Faturaları' },
];

export const invoiceStatusConfig: Record<string, StatusConfig> = {
  pending: { label: 'Bekliyor', variant: 'warning' },
  sent: { label: 'Kesildi', variant: 'success' },
  signed: { label: 'İmzalandı', variant: 'info' },
  failed: { label: 'Başarısız', variant: 'danger' },
  cancelled: { label: 'İptal', variant: 'secondary' },
};

export const typeFilterOptions = [
  { value: 'all', label: 'Tüm Türler' },
  { value: 'commission', label: 'Komisyon' },
  { value: 'service_fee', label: 'Hizmet Bedeli' },
  { value: 'membership', label: 'Üyelik' },
  { value: 'boost', label: 'Öne Çıkarma' },
  { value: 'trade_commission', label: 'Takas Komisyonu' },
  { value: 'platform_sale', label: 'Platform Satışı' },
  { value: 'return_invoice', label: 'İade Faturası' },
];

export const statusFilterOptions = [
  { value: 'all', label: 'Tüm Durumlar' },
  { value: 'sent', label: 'Kesildi' },
  { value: 'signed', label: 'İmzalandı' },
  { value: 'pending', label: 'Bekliyor' },
  { value: 'failed', label: 'Başarısız' },
  { value: 'cancelled', label: 'İptal' },
];

export const documentTypeFilterOptions = [
  { value: 'all', label: 'Tüm Belgeler' },
  { value: 'EARCHIVE', label: 'e-Arşiv' },
  { value: 'EINVOICE', label: 'e-Fatura' },
];

export function mapInvoices(raw: any[]): Invoice[] {
  return (raw || []).map((r: any) => ({
    id: r.id,
    type: r.type,
    typeLabel: r.typeLabel,
    isReturn: !!r.isReturn,
    status: r.status,
    documentType: r.documentType,
    documentTypeLabel: r.documentTypeLabel,
    invoiceNumber: r.invoiceNumber,
    ettn: r.ettn,
    recipientName: r.recipientName,
    recipientVknTckn: r.recipientVknTckn,
    netAmount: Number(r.netAmount || 0),
    taxAmount: Number(r.taxAmount || 0),
    total: Number(r.total || 0),
    vatRate: Number(r.vatRate || 0),
    billingReference: r.billingReference,
    hasPdf: !!r.hasPdf,
    emailSentAt: r.emailSentAt,
    resultMsg: r.resultMsg,
    issuedAt: r.issuedAt,
    createdAt: r.createdAt,
  }));
}

export function mapSellerInvoices(raw: any[]): SellerInvoice[] {
  return (raw || []).map((r: any) => ({
    id: r.id,
    fileName: r.fileName,
    fileSize: r.fileSize != null ? Number(r.fileSize) : null,
    uploadedAt: r.uploadedAt,
    replacedAt: r.replacedAt,
    emailSentAt: r.emailSentAt,
    orderId: r.orderId,
    orderNumber: r.orderNumber,
    orderTotal: r.orderTotal != null ? Number(r.orderTotal) : null,
    sellerName: r.sellerName,
    buyerName: r.buyerName,
    buyerEmail: r.buyerEmail,
  }));
}
