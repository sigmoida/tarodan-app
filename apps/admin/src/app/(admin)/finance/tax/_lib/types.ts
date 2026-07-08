import { CalculatorIcon, ReceiptPercentIcon, ChartBarIcon } from '@heroicons/react/24/outline';

export interface VatOverride {
  ruleId: string;
  categoryId: string;
  categoryName: string;
  rate: number;
}

export interface Category {
  id: string;
  name: string;
}

export interface VatConfig {
  defaultRate: number;
  overrides: VatOverride[];
}

export interface WithholdingReport {
  period: string;
  summary: {
    totalWithholding: number;
    sellerCount: number;
    transferCount: number;
    pendingWithholding: number;
    pendingTransferCount: number;
  };
  rows: Array<{
    sellerId: string;
    sellerName: string;
    taxId: string | null;
    email: string | null;
    transferCount: number;
    grossAmount: number;
    withholdingTax: number;
  }>;
}

export interface TaxReport {
  summary: {
    fromDate: string;
    toDate: string;
    totalTaxCollected: number;
    totalRevenue: number;
    invoiceCount: number;
  };
  breakdown: Array<{
    period: string;
    taxCollected: number;
    revenue: number;
    count: number;
  }>;
}

export const TAX_TABS = [
  { key: 'kdv', label: 'KDV', icon: CalculatorIcon },
  { key: 'withholding', label: 'Stopaj', icon: ReceiptPercentIcon },
  { key: 'report', label: 'Vergi Raporu', icon: ChartBarIcon },
];

export const MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

export const groupByOptions = [
  { value: 'day', label: 'Günlük' },
  { value: 'month', label: 'Aylık' },
  { value: 'year', label: 'Yıllık' },
];
