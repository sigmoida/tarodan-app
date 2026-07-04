import { col } from '@/components/table';
import { vatOverrideRowMenu } from './rowActions';
import type { VatOverride, WithholdingReport, TaxReport } from './types';

type WhRow = WithholdingReport['rows'][number];
type ReportRow = TaxReport['breakdown'][number];

export function vatColumns(onDelete: (o: VatOverride) => void) {
  return [
    col.text<VatOverride>('Kategori', (o) => o.categoryName),
    col.muted<VatOverride>('KDV %', (o) => `%${o.rate}`),
    col.rowMenu<VatOverride>(vatOverrideRowMenu(onDelete)),
  ];
}

export const withholdingColumns = [
  col.text<WhRow>('Satıcı', (r) => r.sellerName),
  col.muted<WhRow>('VKN / TCKN', (r) => r.taxId || '–'),
  col.muted<WhRow>('E-posta', (r) => r.email || '–'),
  col.number<WhRow>('Transfer', (r) => r.transferCount),
  col.money<WhRow>('Brüt', (r) => r.grossAmount),
  col.money<WhRow>('Stopaj', (r) => r.withholdingTax),
];

export const taxReportColumns = [
  col.text<ReportRow>('Dönem', (r) => r.period),
  col.money<ReportRow>('Vergi', (r) => r.taxCollected),
  col.money<ReportRow>('Ciro', (r) => r.revenue),
  col.number<ReportRow>('Adet', (r) => r.count),
];
